---
goal: Add contact-level decision history to the People experience
version: 1.0
date_created: 2026-10-01
last_updated: 2026-10-01
owner: Product and Engineering
status: In progress
tags: [feature, phase-2, people, decision-history]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

Add a role-scoped history view to each contact row in People so a job seeker can understand what has happened with that contact, in addition to seeing the current status. Reuse the existing decision-event table, triggers, history formatter, and drawer. Do not build a canonical cross-role person profile, CRM, new page, or navigation destination.

## 1. Requirements & Constraints

- **REQ-001**: Each contact row in `app/people/page.tsx` must provide a supporting `View history` action without restructuring the People table.
- **REQ-002**: A contact means one `public.contacts` row linked to one role by `role_id`; history must remain scoped to that contact-role relationship.
- **REQ-003**: The selected contact history must query and render only events where `role_id` matches the associated role, `source_type = 'contact'`, and `source_id` matches the selected contact ID.
- **REQ-004**: Display contact creation and meaningful status transitions in ascending `created_at` order, with deterministic `id` ordering for matching timestamps.
- **REQ-005**: Map event types and contact statuses to plain-language labels. Never display table names, event type constants, source IDs, or raw payloads.
- **REQ-006**: Suppress `OUTREACH_STARTED` and `OUTREACH_RESPONSE` rows when they duplicate a `STATUS_CHANGED` record for the same transition.
- **REQ-007**: Display only actions represented by persisted events. Do not claim an invite or message was sent or accepted unless the user recorded the corresponding status.
- **REQ-008**: Existing role-level history in Roles must continue to work after sharing/generalizing the drawer.
- **SEC-001**: Use the authenticated Supabase client and existing RLS. Do not create a service-role history endpoint or weaken `decision_events` policies.
- **SEC-002**: The contact-created event payload must contain only the contact type; do not copy a contact name, email, LinkedIn URL, notes, or message text into the event.
- **CON-001**: `contacts` has no canonical person identity. Do not merge duplicate people across roles in Phase 2.
- **CON-002**: People currently hides contacts whose role is archived. Do not change that filtering in this phase; history for those contacts remains available through the existing role flow when the role is shown.
- **CON-003**: Existing `status_history` is a mutable first-seen-per-status snapshot and cannot reconstruct a complete event sequence. Backfill only contact creation; do not invent historical status-transition events.
- **CON-004**: The current SQL event set has no contact-created decision event. Existing `contact_created` is product telemetry and is not a user-facing history record.
- **GUD-001**: Keep People table layout, filters, sorting, notes editing, existing Roles status stepper, and navigation unchanged.
- **GUD-002**: Preserve native-dialog keyboard dismissal, focus behavior, loading, empty, error, retry, and scroll-preservation behavior from the existing drawer.
- **PAT-001**: Follow `components/roles/DecisionHistoryDrawer.tsx`, `lib/client/decision-history.ts`, `components/ui`, `app/globals.css`, and existing Node test conventions.

## 2. Implementation Steps

### Implementation Phase 1: Lock Event Contract

- GOAL-001: Establish a deterministic event contract and scope before implementation work begins.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | Use the following Phase 2 event contract: introduce `CONTACT_ADDED` with `source_type='contact'`, `source_id=contacts.id`, role/user IDs from the inserted contact, payload `{contact_type}`, and event time equal to `contacts.created_at` for backfill. Preserve existing `STATUS_CHANGED`, `OUTREACH_STARTED`, and `OUTREACH_RESPONSE` triggers. History is per contact row within its role; no cross-role aggregation. This contract blocks TASK-002 through TASK-008. | ✅ | 2026-10-01 |

**Phase 1 execution:** Sequential. Complete TASK-001 before starting implementation tasks in later phases.

### Implementation Phase 2: Event Storage and Presentation Logic

- GOAL-002: Add contact-creation events and contact-scoped event formatting while preserving role history.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-002 | In `supabase/migrations/20261001120000_contact_decision_history.sql`, replace the `decision_events_event_type_check` constraint to add `CONTACT_ADDED`; add an `AFTER INSERT` contact trigger that writes one contact-added event with no personal content; add a partial unique index on `(role_id, source_id)` for `CONTACT_ADDED` contact-source events; and perform an idempotent backfill using each existing contact's `created_at`. Guard the backfill with `NOT EXISTS` on role ID, source type, source ID, and event type. Do not alter RLS. Depends on TASK-001. | ✅ | 2026-10-01 |
| TASK-003 | Update the `decision_events` event-type constraint, contact-added unique index, insert trigger function, and trigger declaration in `supabase/schema.sql` to match the schema objects created by TASK-002. Do not add data-backfill statements to the schema snapshot; backfill runs only in the migration. Depends on TASK-001 and runs in parallel with TASK-002 because it edits a separate file. | ✅ | 2026-10-01 |
| TASK-004 | Add `supabase/tests/decision_events_phase2.sql` to verify one `CONTACT_ADDED` event per contact, payload excludes personal fields, contact status transitions still emit the existing events, and rerunning the backfill does not create duplicates. The migration and equivalent assertions were executed successfully in an isolated in-memory PostgreSQL harness. The checked-in psql script still requires staging execution in TASK-011. Depends on TASK-002 and TASK-003. | ✅ | 2026-10-01 |
| TASK-005 | Extend `lib/client/decision-history.ts` with a contact-scope selector that filters by both role ID and contact source ID, adds the `CONTACT_ADDED` plain-language formatter, retains contact status labels, and suppresses duplicate outreach companion records. Add unit tests in `tests/decision-history.test.ts` for contact filtering, role isolation, event labels, duplicate suppression, chronological ordering, missing contact metadata, and unknown event types. Depends on TASK-001; run in parallel with TASK-002 and TASK-003. | ✅ | 2026-10-01 |

**Phase 2 execution:** TASK-002, TASK-003, and TASK-005 may run in parallel after TASK-001. TASK-004 is sequential after TASK-002 and TASK-003. The migration and snapshot must agree before database tests pass.

### Implementation Phase 3: Shared Drawer and People Integration

- GOAL-003: Reuse the history drawer for People contacts without changing existing People or Roles workflows.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-006 | Generalize `components/roles/DecisionHistoryDrawer.tsx` into `components/DecisionHistoryDrawer.tsx` with a discriminated selection scope for either `{kind:'role', role, contacts}` or `{kind:'contact', role, contact}`. For role scope, preserve the existing `role_id` query and role timeline. For contact scope, add `.eq('role_id', role.id)`, `.eq('source_type', 'contact')`, and `.eq('source_id', contact.id)`, then apply the same client-side scope filter before rendering. Update the Roles caller in `app/roles/page.tsx` to the role scope. Reuse the native dialog, labels, retry/error/empty states, and existing drawer styles in `app/globals.css`. Depends on TASK-005. | ✅ | 2026-10-01 |
| TASK-007 | In `app/people/page.tsx`, add a low-emphasis `View history` action for each existing People table row. Store only the selected contact and associated role for drawer context. Render `DecisionHistoryDrawer` with contact scope. Preserve existing filtering, row order, note editing, horizontal table scrolling, loading, and empty states. Depends on TASK-006; runs sequentially after the shared drawer API is fixed. | ✅ | 2026-10-01 |

**Phase 3 execution:** Sequential. Complete TASK-006 before TASK-007 so People and Roles integrate against one frozen drawer API.

### Implementation Phase 4: Integration Verification and Release Gate

- GOAL-004: Verify person-level history, preserve Phase 1 role history, and release only after database and UI checks pass.

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-008 | Run `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`, and the isolated PostgreSQL checks from TASK-004. Verify old Contacts backfill once, new contacts create once, repeated UI opens/refreshes perform reads only, role history remains unchanged, and People history never includes a different contact or role. Depends on TASK-004, TASK-005, TASK-006, and TASK-007. | ✅ | 2026-10-01 |
| TASK-009 | Perform an authenticated browser test at desktop and 768px widths. Verify long contact names/titles, no history, one contact-added event, multiple status events, missing/deleted contact metadata, loading and rejected-query states, retry, Escape/backdrop/close button, same scroll position after closing, and archived/restored role behavior. Confirm statuses and notes still work. Do not use production user data. Depends on TASK-008. | | |
| TASK-010 | Deploy the migration before the application bundle. Run TASK-009 in staging. Promote the application only if TASK-004, TASK-008, and TASK-009 pass; otherwise keep Phase 2 unreleased and fix the failing gate. | | |
| TASK-011 | Execute `supabase/tests/decision_events_phase2.sql` against the non-production staging database using `psql` and a staging-only test user. The current workspace has no `psql` binary or configured staging database URL, so this task remains blocked until those are available. Never target production. Depends on TASK-004 and must complete before TASK-010. | | |

**Phase 4 execution:** Sequential. TASK-008 gates TASK-009 and TASK-011; TASK-009 and TASK-011 gate TASK-010. Apply the database migration before deploying the application code.

## 3. Alternatives

- **ALT-001**: Create a canonical `people` table and merge contacts across roles. Rejected because current `contacts` rows are explicitly role-scoped and Phase 2 excludes CRM/person identity redesign.
- **ALT-002**: Derive the timeline from `status_history`. Rejected because it stores only the first date for each status, lacks complete transition order, and is not an append-only audit log.
- **ALT-003**: Display `contact_created` telemetry as the first event. Rejected because telemetry is separate, pseudonymous product measurement, not user-facing decision history.
- **ALT-004**: Create a new People history page or navigation item. Rejected because the existing shared drawer meets the goal with less disruption.

## 4. Dependencies

- **DEP-001**: An authenticated disposable Supabase-compatible Postgres database with the current schema and migration chain for TASK-004.
- **DEP-002**: An authenticated staging account containing multiple roles, contact rows, statuses, and archived/restored roles for TASK-009.
- **DEP-003**: The shared drawer scope API from TASK-006 before People wiring in TASK-007.
- **DEP-004**: `decision_events` RLS remains enabled and grants authenticated users read access only to events for their own roles.

## 5. Files

- **FILE-001**: `supabase/migrations/20261001120000_contact_decision_history.sql` — event type, uniqueness guard, insert trigger, idempotent contact-created backfill.
- **FILE-002**: `supabase/schema.sql` — authoritative schema snapshot matching FILE-001.
- **FILE-003**: `supabase/tests/decision_events_phase2.sql` — database trigger, payload, RLS, and backfill idempotency checks.
- **FILE-004**: `lib/client/decision-history.ts` — contact-scope event filter, event formatter, and event types.
- **FILE-005**: `components/DecisionHistoryDrawer.tsx` — shared role/contact drawer.
- **FILE-006**: `components/roles/DecisionHistoryDrawer.tsx` — removed after migration to FILE-005; update existing imports in `app/roles/page.tsx`.
- **FILE-007**: `app/roles/page.tsx` — preserve Phase 1 role-history behavior using the shared drawer API.
- **FILE-008**: `app/people/page.tsx` — add contact history action and selected contact-role drawer state.
- **FILE-009**: `app/globals.css` — retain drawer styles and add only People-row action styling if required by existing tokens.
- **FILE-010**: `tests/decision-history.test.ts` — contact-scope event mapping and isolation tests.

## 6. Testing

- **TEST-001**: `decision_events_phase2.sql` verifies new-contact trigger payload, legacy contact backfill, backfill idempotency, and no unauthorized cross-user event reads using a disposable test database.
- **TEST-002**: `node --experimental-strip-types --test tests/decision-history.test.ts` verifies `CONTACT_ADDED`, contact status labels, duplicate outreach suppression, chronological ordering, selected contact and role filtering, unknown events, deleted contact metadata, and empty history.
- **TEST-003**: `npm test` verifies all existing unit and parity tests still pass, including Phase 1 application progress and role-history helpers.
- **TEST-004**: `npm run typecheck` verifies the shared drawer scope union and People/Role callers.
- **TEST-005**: `npm run build` verifies the production application and Next.js lint/type checks.
- **TEST-006**: Authenticated browser checks in TASK-009 verify People table preservation, contact-specific history, role isolation, loading/error/retry, status updates, and drawer close/scroll behavior at 1440px and 768px widths.

## 7. Risks & Assumptions

- **RISK-001**: Existing contact status snapshots cannot reconstruct every historical transition. Only new post-trigger transitions and a contact-added backfill will appear; do not fabricate missing events.
- **RISK-002**: Contact deletion leaves existing event rows because `source_id` is not a foreign key. The People page cannot open deleted contacts; current Phase 2 does not change deletion semantics or expose orphan events.
- **RISK-003**: The current People page excludes contacts on archived roles. This plan preserves that behavior; viewing an archived contact from People requires restoring its role first.
- **RISK-004**: If telemetry `contact_created` continues to emit and a new decision event is added, both records will coexist in different systems. The UI and code must use only `decision_events` for history.
- **ASSUMPTION-001**: A contact's stable history identity is `contacts.id` within its `role_id`; duplicate LinkedIn URLs across roles remain independent records.
- **ASSUMPTION-002**: Contact creation history should be backfilled from `contacts.created_at`, while status history should not be synthesized from `status_history`.
- **ASSUMPTION-003**: Follow-up draft edits and copy actions are not decision events because they do not prove an external message was sent.

## 8. Related Specifications / Further Reading

- [Phase 1 Roles release note](../docs/product/releases/2026-10-01-roles-application-history.md)
- [Product feature inventory](../docs/product/FEATURES.md)
- [Decision-event migration](../supabase/migrations/20260930120000_decision_events.sql)
- [Roles status and contact lifecycle](../app/roles/page.tsx)
- [People table](../app/people/page.tsx)
- [Contact type and status helpers](../lib/client/pipeline.ts)