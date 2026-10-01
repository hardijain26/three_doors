alter table public.decision_events
  drop constraint if exists decision_events_event_type_check;

alter table public.decision_events
  add constraint decision_events_event_type_check check (event_type in (
    'ROLE_CONFIRMED', 'APPLICATION_STARTED', 'APPLICATION_SUBMITTED',
    'OUTREACH_STARTED', 'OUTREACH_RESPONSE', 'STATUS_CHANGED', 'ROLE_ARCHIVED',
    'CONTACT_ADDED'
  ));

create unique index if not exists decision_events_contact_added_once
  on public.decision_events (role_id, source_id)
  where event_type = 'CONTACT_ADDED' and source_type = 'contact';

create or replace function public.log_contact_added_decision_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload, created_at)
  values (new.user_id, new.role_id, 'CONTACT_ADDED', 'contact', new.id,
    jsonb_build_object('contact_type', new.type), new.created_at)
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.log_contact_added_decision_event() from public, anon, authenticated;

drop trigger if exists contact_decision_event_insert on public.contacts;
create trigger contact_decision_event_insert after insert on public.contacts
  for each row execute function public.log_contact_added_decision_event();

insert into public.decision_events (user_id, role_id, event_type, source_type, source_id, payload, created_at)
select c.user_id, c.role_id, 'CONTACT_ADDED', 'contact', c.id,
  jsonb_build_object('contact_type', c.type), c.created_at
from public.contacts c
where not exists (
  select 1 from public.decision_events e
  where e.role_id = c.role_id and e.source_type = 'contact' and e.source_id = c.id
    and e.event_type = 'CONTACT_ADDED'
)
on conflict do nothing;