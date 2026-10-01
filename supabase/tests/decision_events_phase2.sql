-- Run only against a disposable, non-production Supabase database as its owner:
-- psql "$PHASE2_STAGING_DB_URL" -v phase2_test_user_id="$PHASE2_TEST_USER_ID" -f supabase/tests/decision_events_phase2.sql
-- The supplied auth user must already exist. All test rows are rolled back.
\set ON_ERROR_STOP on

\if :{?phase2_test_user_id}
\else
\echo 'Set phase2_test_user_id to an existing non-production auth user UUID.'
\quit 2
\endif

begin;

select set_config('phase2.test_user_id', :'phase2_test_user_id', true);
select gen_random_uuid() as phase2_role_id \gset
select gen_random_uuid() as phase2_contact_id \gset
select set_config('phase2.role_id', :'phase2_role_id', true);
select set_config('phase2.contact_id', :'phase2_contact_id', true);

insert into public.roles (id, user_id, company, title)
values (:'phase2_role_id'::uuid, :'phase2_test_user_id'::uuid, 'Phase 2 QA', 'History test');

insert into public.contacts (id, user_id, role_id, type, dept, name, status, status_history)
values (:'phase2_contact_id'::uuid, :'phase2_test_user_id'::uuid, :'phase2_role_id'::uuid,
  'hm', null, 'Private Test Name', 'Not found', '{}'::jsonb);

do $$
declare
  test_role_id uuid := current_setting('phase2.role_id')::uuid;
  test_contact_id uuid := current_setting('phase2.contact_id')::uuid;
  event_count int;
begin
  select count(*) into event_count
  from public.decision_events
  where role_id = test_role_id and source_type = 'contact' and source_id = test_contact_id
    and event_type = 'CONTACT_ADDED';
  if event_count <> 1 then raise exception 'Expected contact insert trigger to create one event, got %', event_count; end if;
end $$;

-- Remove the trigger-created fixture event to simulate a contact created before deployment.
delete from public.decision_events
where role_id = :'phase2_role_id'::uuid and source_type = 'contact'
  and source_id = :'phase2_contact_id'::uuid and event_type = 'CONTACT_ADDED';

-- Repeat the migration backfill twice; the legacy contact must produce exactly one event.
insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload, created_at)
select c.user_id, c.role_id, 'CONTACT_ADDED', 'contact', c.id,
  jsonb_build_object('contact_type', c.type), c.created_at
from public.contacts c
where c.id = :'phase2_contact_id'::uuid
  and not exists (
    select 1 from public.decision_events e
    where e.role_id = c.role_id and e.source_type = 'contact' and e.source_id = c.id
      and e.event_type = 'CONTACT_ADDED'
  )
on conflict do nothing;

insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload, created_at)
select c.user_id, c.role_id, 'CONTACT_ADDED', 'contact', c.id,
  jsonb_build_object('contact_type', c.type), c.created_at
from public.contacts c
where c.id = :'phase2_contact_id'::uuid
  and not exists (
    select 1 from public.decision_events e
    where e.role_id = c.role_id and e.source_type = 'contact' and e.source_id = c.id
      and e.event_type = 'CONTACT_ADDED'
  )
on conflict do nothing;

do $$
declare
  test_role_id uuid := current_setting('phase2.role_id')::uuid;
  test_contact_id uuid := current_setting('phase2.contact_id')::uuid;
  event_count int;
  event_payload jsonb;
begin
  select count(*) into event_count
  from public.decision_events
  where role_id = test_role_id and source_type = 'contact' and source_id = test_contact_id
    and event_type = 'CONTACT_ADDED';
  if event_count <> 1 then raise exception 'Expected one CONTACT_ADDED event, got %', event_count; end if;

  select payload into event_payload
  from public.decision_events
  where role_id = test_role_id and source_type = 'contact' and source_id = test_contact_id
    and event_type = 'CONTACT_ADDED';
  if event_payload <> jsonb_build_object('contact_type', 'hm') then
    raise exception 'CONTACT_ADDED payload contains unexpected data: %', event_payload;
  end if;

  update public.contacts set status = 'Found', status_on = current_date,
    status_history = jsonb_build_object('Found', current_date::text) where id = test_contact_id;
  update public.contacts set status = 'Request sent', status_on = current_date,
    status_history = jsonb_build_object('Found', current_date::text, 'Request sent', current_date::text) where id = test_contact_id;
  update public.contacts set status = 'Accepted', status_on = current_date,
    status_history = jsonb_build_object('Found', current_date::text, 'Request sent', current_date::text, 'Accepted', current_date::text) where id = test_contact_id;

  select count(*) into event_count from public.decision_events
  where role_id = test_role_id and source_type = 'contact' and source_id = test_contact_id
    and event_type = 'STATUS_CHANGED';
  if event_count <> 3 then raise exception 'Expected three STATUS_CHANGED events, got %', event_count; end if;

  select count(*) into event_count from public.decision_events
  where role_id = test_role_id and source_type = 'contact' and source_id = test_contact_id
    and event_type = 'OUTREACH_STARTED';
  if event_count <> 1 then raise exception 'Expected one OUTREACH_STARTED event, got %', event_count; end if;

  select count(*) into event_count from public.decision_events
  where role_id = test_role_id and source_type = 'contact' and source_id = test_contact_id
    and event_type = 'OUTREACH_RESPONSE';
  if event_count <> 1 then raise exception 'Expected one OUTREACH_RESPONSE event, got %', event_count; end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'decision_events'
      and policyname = 'read own decision events'
  ) then raise exception 'Expected existing decision event RLS policy to remain installed'; end if;
end $$;

rollback;
