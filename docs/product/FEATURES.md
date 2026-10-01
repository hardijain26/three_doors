# Features and Limits

This is a plain-language inventory of user-facing behavior found in the application. A feature appearing in the repository does not by itself confirm that its external services are configured in every deployment.

| Area | What it supports today |
|---|---|
| About and career path | Save professional background, experience, results, location, portfolio details, and career history. These details can inform AI-generated drafts and CV content. |
| Openings | Save job-board search pages, run searches, review matches against saved preferences, hide openings, and add jobs manually. Searches can also be scheduled daily or weekly in Settings. |
| Roles | Track target jobs, fit, application started/applied status, contacts, and follow-up steps. Roles can be archived and restored. |
| People | Review contacts across active roles, search and filter them, update outreach status, and keep notes. LinkedIn profile text can be pasted to help fill in details; LinkedIn does not provide the app with automatic access to profile pages. |
| Messages | Use editable connection and follow-up templates populated from saved profile details. The user reviews, copies, and sends messages outside Three Doors. |
| CV | Build a master prompt and resume, tailor a version to a selected job description, inspect keyword coverage and analysis, edit the result, and download PDF or Markdown. |
| Analytics | Review an outreach funnel, acceptance and reply rates, referral counts, and weekly activity. These figures are calculated from contact statuses recorded by the user. |
| Settings and privacy | Connect an AI provider, choose key storage, configure search preferences and schedules, manage break reminders, export data, delete data, and control anonymous product-event sharing. |

## Important Limits

- Opening searches check at most 30 enabled sources per run, enforce at least six hours between runs, and stop adding automatically found openings at 20 per day. Up to 1,000 sources can be saved. These limits are enforced or described in the current Openings interface.
- Searches are not guaranteed to read every job board. Pages that require JavaScript may not return listings; a user can try a filtered search page or add the job manually.
- LinkedIn profile details are not imported automatically. The user can paste profile text for the app to process; the People screen says that pasted text is not stored.
- CV tailoring requires the user to provide a job description. Generated material should be reviewed and corrected before use; keyword matches do not verify that a qualification is true.
- Analytics represent the statuses and history recorded in Three Doors, not independently verified LinkedIn activity or hiring outcomes.
- AI use requires a connected provider account and API key. Provider usage is billed by that provider, not by Three Doors. See [AI architecture](../ARCHITECTURE.md).
- **Account deletion needs product confirmation:** the Settings page says the account remains active after deletion, but the current deletion endpoint deletes the authentication account. Do not treat either behavior as the customer-facing promise until this discrepancy is resolved. See [the Settings copy](../../components/profile-settings.tsx) and [the deletion endpoint](../../app/api/account/delete/route.ts).

## Related Pages

- [Product overview](OVERVIEW.md)
- [Roadmap](ROADMAP.md)
- [Product decisions](DECISIONS.md)
- [Glossary](GLOSSARY.md)