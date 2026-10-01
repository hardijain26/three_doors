# Roles: Application Progress and Decision History

**Release note draft | October 1, 2026**

## Summary

The Roles experience now makes application progress easier to understand and gives job seekers a history of meaningful decisions for each role. The existing Roles page and cards remain in place; no new navigation destination was added.

**Release readiness:** Implementation and automated checks are complete. A signed-in browser smoke test remains pending because a test account was not available during QA.

## What Changed

### Application progress

Each Role card shows one of three distinct states:

- **Not started:** no application start or submission date is recorded.
- **Started:** an application start date is recorded, but no submission date is recorded.
- **Submitted:** a submission date is recorded.

Starting an application and marking it as applied remain separate actions. The progress display uses those two dates only; it does not infer submission from other role or contact details. Existing application actions, undo, archive, and restore remain available.

### Decision history

Each Role card now has a supporting **View history** action. It opens a right-side drawer for that role, showing available milestones in chronological order using plain-language labels. The drawer can be dismissed with its close button, Escape, or the backdrop; it does not navigate away from Roles.

The history can include a role being added, application start or submission, archive, and meaningful contact-status changes. Opening or refreshing history reads existing records; it does not create new events. Duplicate outreach records for the same contact-status change are not shown as separate timeline entries.

## User Impact

Job seekers can see where an application stands without interpreting dates themselves, and can review the sequence of recorded decisions for a specific role. Archived roles can still be viewed when shown in Roles, and restoring a role does not remove its existing history.

When no events are available, the drawer shows an empty state. If history cannot be loaded, it shows an error with a retry action. Missing event details do not prevent other history entries from rendering.

## Scope

This release keeps the existing Roles layout and navigation. It does not add a separate Events page, automate LinkedIn activity, combine history across roles, add Career Path aggregation, or introduce analytics.

## History Coverage

The drawer can only display events that were recorded by the existing event-capture system. Older actions that were not captured are not reconstructed, so a role may show no history even when the user remembers taking earlier actions. Opening the drawer and refreshing the page do not backfill missing events.

## QA and Release Readiness

- Unit tests: 34 passed, including application-state mapping, event labels, chronological ordering, duplicate suppression, empty history, and role isolation.
- Typecheck: passed.
- Production build: passed; Next.js build lint checks passed.
- Authenticated browser smoke test: pending. The local Roles route requires sign-in, and no test account was available to verify card actions, drawer dismissal, or desktop and tablet layouts in a live session.

Before calling this release fully verified, run a signed-in smoke test covering active, archived, and restored roles; no events; application-start-only and start-plus-submission; multiple history events; drawer loading and error states; long company and role names; and scroll position after closing the drawer.