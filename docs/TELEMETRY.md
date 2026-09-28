# Telemetry: what we collect and how content is kept out

## Separation

- Stored in `telemetry.events`, a separate Postgres schema that is not exposed over the Supabase API and grants nothing to app users.
- The only way in is `public.track_event(event, props)`, a security-definer function that:
  1. drops the call if the user isn't signed in or has opted out (`profiles.telemetry_opt_out`);
  2. rejects unknown event names;
  3. drops unknown property names;
  4. keeps a string value only if it matches `^[A-Za-z0-9_.:-]{1,64}$`. No spaces are allowed, so a sentence, note, name or prompt can't be stored even by mistake;
  5. refuses values shaped like credentials (`sk-`, `AIza`, `ya29`, `eyJ`, or 32+ key characters in a row);
  6. replaces the user id with `HMAC-SHA256(user_id, secret salt)`. That makes the data pseudonymous: no email or account id is stored, but whoever holds the salt could recompute a given user's hash. Treat it as personal data under GDPR and keep the salt restricted.

## Event catalogue (`lib/telemetry/events.ts`)

| Event | Properties |
|---|---|
| `provider_connected` | provider, auth_method, storage |
| `provider_disconnected` | provider |
| `provider_validation_failed` | provider, error_code |
| `ai_request_completed` | feature, provider, model, storage, duration_ms, input_tokens, output_tokens, success, error_code |
| `role_created` | none |
| `contact_created` | contact_type |
| `contact_status_changed` | to_status |

Example of what is stored:

```json
{ "event": "ai_request_completed", "props": { "feature": "common_ground", "provider": "gemini", "model": "gemini-2.5-flash", "storage": "server_vault", "duration_ms": 4200, "input_tokens": 1830, "output_tokens": 410, "success": true } }
```

## Adding an event

Add it to the TypeScript union, to `allowed_events` in `track_event`, and any new property names to `allowed_props`. Before adding a property, ask one question: could its value ever be something the user wrote? If yes, don't add it.

## Useful queries

```sql
-- Requests, success rate and median latency by provider and model, last 30 days
select props->>'provider' provider, props->>'model' model, count(*) n,
       round(100.0*avg((props->>'success')::boolean::int),1) success_pct,
       percentile_cont(0.5) within group (order by (props->>'duration_ms')::int) p50_ms
from telemetry.events where event='ai_request_completed' and created_at > now()-interval '30 days'
group by 1,2 order by n desc;

-- Weekly active users (hashed)
select date_trunc('week', created_at) wk, count(distinct anon_id) from telemetry.events group by 1 order by 1;
```
