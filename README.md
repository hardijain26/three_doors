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
