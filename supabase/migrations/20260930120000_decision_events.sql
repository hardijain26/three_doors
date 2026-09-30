alter table public.roles add column if not exists archived_at timestamptz;
alter table public.roles add column if not exists application_started_at date;

drop policy if exists "own roles" on public.roles;
create policy "read own roles" on public.roles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "insert own roles" on public.roles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "update own roles" on public.roles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.decision_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  event_type text not null check (event_type in (
    'ROLE_CONFIRMED', 'APPLICATION_STARTED', 'APPLICATION_SUBMITTED',
    'OUTREACH_STARTED', 'OUTREACH_RESPONSE', 'STATUS_CHANGED', 'ROLE_ARCHIVED'
  )),
  source_type text,
  source_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);
create index decision_events_user_created on public.decision_events (user_id, created_at desc);
create index decision_events_role_created on public.decision_events (role_id, created_at desc);

alter table public.decision_events enable row level security;
create policy "read own decision events" on public.decision_events for select to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.roles r where r.id = decision_events.role_id and r.user_id = (select auth.uid())
  ));
revoke all on public.decision_events from public, anon, authenticated;
grant select on public.decision_events to authenticated;

create or replace function public.log_role_decision_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  opening_score int;
  opening_why text;
  opening_flag text;
begin
  if tg_op = 'INSERT' then
    if new.opening_id is not null then
      select o.score, o.why, o.flag into opening_score, opening_why, opening_flag
      from public.openings o where o.id = new.opening_id and o.user_id = new.user_id;
    end if;
    insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload)
    values (
      new.user_id, new.id, 'ROLE_CONFIRMED',
      case when new.opening_id is null then 'role' else 'opening' end,
      coalesce(new.opening_id, new.id),
      jsonb_strip_nulls(jsonb_build_object(
        'opening_id', new.opening_id, 'fit', new.fit, 'angle', nullif(new.angle, ''),
        'score', opening_score, 'why', opening_why, 'flag', opening_flag
      ))
    );
    return new;
  end if;

  if old.application_started_at is distinct from new.application_started_at and new.application_started_at is not null then
    insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload)
    values (new.user_id, new.id, 'APPLICATION_STARTED', 'role', new.id,
      jsonb_build_object('application_started_at', new.application_started_at));
  end if;

  if old.applied_on is distinct from new.applied_on and new.applied_on is not null then
    insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload)
    values (new.user_id, new.id, 'APPLICATION_SUBMITTED', 'role', new.id,
      jsonb_build_object('applied_on', new.applied_on));
  end if;

  if old.archived_at is null and new.archived_at is not null then
    insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload)
    values (new.user_id, new.id, 'ROLE_ARCHIVED', 'role', new.id,
      jsonb_build_object('archived_at', new.archived_at));
  end if;
  return new;
end $$;
revoke all on function public.log_role_decision_events() from public, anon, authenticated;
drop trigger if exists role_decision_event_insert on public.roles;
create trigger role_decision_event_insert after insert on public.roles
  for each row execute function public.log_role_decision_events();
drop trigger if exists role_decision_event_update on public.roles;
create trigger role_decision_event_update after update on public.roles
  for each row execute function public.log_role_decision_events();

create or replace function public.log_contact_decision_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status is not distinct from new.status then return new; end if;

  insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload)
  values (new.user_id, new.role_id, 'STATUS_CHANGED', 'contact', new.id,
    jsonb_build_object('contact_id', new.id, 'from', old.status, 'to', new.status, 'status_on', new.status_on));

  if new.status in ('Request sent', 'Messaged') then
    insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload)
    values (new.user_id, new.role_id, 'OUTREACH_STARTED', 'contact', new.id,
      jsonb_build_object('contact_id', new.id, 'status', new.status));
  elsif new.status in ('Accepted', 'Replied') then
    insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload)
    values (new.user_id, new.role_id, 'OUTREACH_RESPONSE', 'contact', new.id,
      jsonb_build_object('contact_id', new.id, 'status', new.status));
  end if;
  return new;
end $$;
revoke all on function public.log_contact_decision_events() from public, anon, authenticated;
drop trigger if exists contact_decision_event_update on public.contacts;
create trigger contact_decision_event_update after update on public.contacts
  for each row execute function public.log_contact_decision_events();

create or replace function public.confirm_opening_as_role(p_opening_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  opening public.openings%rowtype;
  role_id uuid;
  role_fit text;
  role_link text;
begin
  if uid is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtext('opening-role:' || uid::text || ':' || p_opening_id::text));
  select o.* into opening from public.openings o
    where o.id = p_opening_id and o.user_id = uid for update;
  if not found then raise exception 'opening not found'; end if;
  if opening.state = 'hidden' then raise exception 'hidden opening cannot be promoted'; end if;

  select r.id into role_id from public.roles r
    where r.user_id = uid and r.opening_id = opening.id limit 1;
  if role_id is null and opening.link like 'https://%' then
    perform pg_advisory_xact_lock(hashtext('role-link:' || uid::text || ':' || opening.link));
    select r.id into role_id from public.roles r
      where r.user_id = uid and r.link = opening.link limit 1;
  end if;

  if role_id is null then
    role_fit := case when coalesce(opening.score, 0) >= 70 then 'Strong'
      when coalesce(opening.score, 0) >= 50 then 'Good' else 'Stretch' end;
    role_link := case when opening.link like 'https://%' then opening.link else null end;
    insert into public.roles (user_id, company, title, location, link, fit, angle, opening_id, cid)
    values (uid, opening.company, opening.title, opening.location, role_link, role_fit,
      nullif(concat_ws(' ', opening.why, opening.flag), ''), opening.id, opening.cid)
    returning id into role_id;
  end if;

  update public.openings set state = 'added' where id = opening.id and user_id = uid;
  return role_id;
end $$;
revoke all on function public.confirm_opening_as_role(uuid) from public, anon;
grant execute on function public.confirm_opening_as_role(uuid) to authenticated;
