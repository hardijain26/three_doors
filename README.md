# Three Doors

Job-search outreach tracker that runs on each user's own AI key (OpenAI, Claude or Gemini).

- `docs/ARCHITECTURE.md`: provider abstraction, gateway, auth per provider, key storage options
- `docs/SECURITY.md`: key handling rules, isolation, known gaps
- `docs/TELEMETRY.md`: event catalogue and how content is kept out

## Run locally
```
cp .env.example .env.local   # fill in values
npm install && npm run dev
npm test                     # unit tests (Node 22+)
```

## UI/UX design

The project uses a responsive, web-adapted Material 3 design system. See
[`design-system/three-doors/MASTER.md`](design-system/three-doors/MASTER.md) for
the source of truth for tokens, components, and accessibility rules.

UI UX Pro Max is installed as a project-local GitHub Copilot prompt. In Copilot
Chat, run `/ui-ux-pro-max` followed by the UI/UX task you want to work on. The
prompt's local search scripts require Python 3.
