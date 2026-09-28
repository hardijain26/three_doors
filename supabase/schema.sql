-- Three Doors database, current state (applied as migrations core_schema, lock_trigger_fn,
-- profile_about, review_fixes on project three-doors). Run on a fresh Supabase project to rebuild.

create extension if not exists pgcrypto with schema extensions;

-- ============ USER DATA (owner-only via RLS) ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  telemetry_opt_out boolean not null default false,
  first_name text, last_role text, last_company text, owned text, results text, background text,
  created_at timestamptz not null default now()
);

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic','gemini')),
  auth_method text not null check (auth_method in ('api_key','oauth')),
  storage text not null check (storage in ('server_vault','browser_only')),
  key_hint text check (key_hint ~ '^[A-Za-z0-9_-]{0,4}$'),
  default_model text constraint default_model_shape check (default_model is null or default_model ~ '^[A-Za-z0-9_.:/-]{1,100}$'),
  status text not null default 'connected' check (status in ('connected','invalid')),
  is_active boolean not null default false,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
create unique index provider_connections_one_active on public.provider_connections (user_id) where is_active;

-- Ciphertext only: AES-256-GCM, master key lives in the app server env, never here.
create table public.credentials (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic','gemini')),
  ciphertext text not null, iv text not null, auth_tag text not null,
  key_version int not null default 1,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company text not null, title text not null, location text, link text,
  fit text check (fit in ('Strong','Good','Stretch')), angle text, applied_on date,
  created_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  type text not null check (type in ('hm','rec','other')),
  dept text, name text, title text, linkedin_url text, email text, notes text,
  status text not null default 'Found',
  status_history jsonb not null default '{}'::jsonb,
  common jsonb, followup text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type <> 'other' or coalesce(length(trim(dept)),0) > 0)
);
create index on public.contacts(role_id);
create index on public.contacts(user_id);
create index on public.roles(user_id);

alter table public.profiles enable row level security;
alter table public.provider_connections enable row level security;
alter table public.credentials enable row level security;
alter table public.roles enable row level security;
alter table public.contacts enable row level security;

create policy "own profile" on public.profiles for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own connections" on public.provider_connections for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own credentials" on public.credentials for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own roles" on public.roles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own contacts" on public.contacts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (select 1 from public.roles r where r.id = role_id and r.user_id = (select auth.uid())));
revoke all on public.credentials from anon;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ RATE LIMITS (private schema) ============
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.rate_hits (user_id uuid not null, bucket text not null, at timestamptz not null default now());
create index on private.rate_hits (user_id, bucket, at);
create function public.rate_ok(p_bucket text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then return false; end if;
  delete from private.rate_hits where at < now() - interval '1 day';
  select count(*) into n from private.rate_hits where user_id = uid and bucket = p_bucket and at > now() - make_interval(secs => p_window_seconds);
  if n >= p_max then return false; end if;
  insert into private.rate_hits (user_id, bucket) values (uid, p_bucket);
  return true;
end $$;
revoke all on function public.rate_ok(text, int, int) from public, anon;
grant execute on function public.rate_ok(text, int, int) to authenticated;

-- ============ PRODUCT TELEMETRY (separate schema, not exposed, content-free) ============
create schema telemetry;
revoke all on schema telemetry from public, anon, authenticated;
create table telemetry.config (id int primary key default 1 check (id = 1), salt text not null);
insert into telemetry.config (salt) values (encode(extensions.gen_random_bytes(32), 'hex'));
create table telemetry.events (
  id bigint generated always as identity primary key,
  anon_id text not null, event text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on telemetry.events (event, created_at);

create function public.track_event(p_event text, p_props jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  allowed_events text[] := array['provider_connected','provider_disconnected','provider_validation_failed',
    'ai_request_completed','role_created','contact_created','contact_status_changed'];
  allowed_props text[] := array['provider','auth_method','storage','feature','model','duration_ms',
    'input_tokens','output_tokens','success','error_code','contact_type','to_status'];
  k text; v jsonb; s text; clean jsonb := '{}'::jsonb; salt text;
begin
  if uid is null then return; end if;
  if (select telemetry_opt_out from public.profiles where id = uid) then return; end if;
  if not (p_event = any(allowed_events)) then raise exception 'unknown event'; end if;
  for k, v in select * from jsonb_each(coalesce(p_props,'{}'::jsonb)) loop
    if not (k = any(allowed_props)) then continue; end if;
    if jsonb_typeof(v) in ('number','boolean') then clean := clean || jsonb_build_object(k, v);
    elsif jsonb_typeof(v) = 'string' then
      s := v #>> '{}';
      if s ~ '^[A-Za-z0-9_.:-]{1,64}$' and s !~* '^(sk-|aiza|ya29|eyj|key|bearer)' and s !~ '[A-Za-z0-9_-]{32,}' then
        clean := clean || jsonb_build_object(k, v);
      end if;
    end if;
  end loop;
  select c.salt into salt from telemetry.config c where c.id = 1;
  insert into telemetry.events (anon_id, event, props)
  values (encode(extensions.hmac(uid::text, salt, 'sha256'), 'hex'), p_event, clean);
end $$;
revoke all on function public.track_event(text, jsonb) from public, anon;
grant execute on function public.track_event(text, jsonb) to authenticated;
