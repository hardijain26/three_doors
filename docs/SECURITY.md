# Security

## Keys: rules the code enforces

- **Never in plaintext storage.** `server_vault` keys are AES-256-GCM encrypted (`lib/security/crypto.ts`) with associated data `user_id:provider:v<version>`, so a ciphertext copied to another user or provider fails to decrypt.
- **Master key outside the database.** `CREDENTIAL_MASTER_KEY` is a Vercel environment variable of type *sensitive*. The database never sees it.
- **Rotation.** Set `CREDENTIAL_KEY_VERSION=2` and the new key in `CREDENTIAL_MASTER_KEY`, keeping the old one as `CREDENTIAL_MASTER_KEY_V1`. New writes use v2 and old rows still decrypt. Re-encrypt old rows, then remove the old key.
- **Never returned.** No API route returns a key. The UI shows only the last 4 characters.
- **Never logged.** Server code logs only through `log.error` (`lib/security/redact.ts`), which masks key patterns (`sk-…`, `sk-ant-…`, `AIza…`, `ya29.…`, `Bearer …`, JWTs) and never logs request bodies or headers.
- **Never in errors.** Provider error bodies are mapped to codes; the provider's text is discarded.
- **Never in telemetry.** Telemetry gets no credential by design, and `track_event` also rejects any value shaped like one (`sk-`, `AIza`, `ya29`, `eyJ`, or any run of 32+ key characters). Model ids are only reported if they look like real model names.
- **Not in localStorage.** Browser-only keys live in IndexedDB encrypted with a non-extractable WebCrypto key.
- **Not in URLs.** Adapters send keys in headers (Gemini's `?key=` form is not used).

## Data isolation

- Every user table has row-level security: `user_id = auth.uid()` for select, insert, update and delete. Contacts can only attach to the user's own roles.
- The Supabase anon key in the browser can only reach rows the signed-in user owns.
- `credentials` is also owner-only. A user can read their own ciphertext, which is useless without the server's master key.

## Browser hardening (`next.config.mjs`)

- `Content-Security-Policy` with `connect-src 'self' <supabase>`: an injected script can't send data to another host with `fetch` or `XMLHttpRequest`, and `img-src` is limited to self and data URLs. This does **not** stop an injected script from navigating the page to another site, so CSP limits XSS damage but doesn't prevent key theft in browser-only mode.
- API writes (`POST` to `/api/*`) are refused unless they are JSON and same-origin (middleware).
- Per-user rate limits: 10 connect attempts an hour, 60 AI requests and 30 model listings per 10 minutes (`public.rate_ok`).
- Browser-only mode: keys are stored per account in the browser, wiped on sign-out, and the gateway only relays a key whose last 4 characters match the one the user connected, to the provider the user connected.
- `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `nosniff`, HSTS.

## Known gaps

1. `script-src` allows `'unsafe-inline'` because Next.js inlines bootstrap scripts. Moving to nonce-based CSP would close this.
2. Rate limits are per user only. A per-IP limit on sign-up and connect would slow down anyone creating many accounts to test stolen keys.
7. Supabase session cookies are readable by script (`@supabase/ssr` default), so an XSS could steal a session. Nonce-based CSP (gap 1) is the main defence.
3. Account deletion clears all data and keys but doesn't delete the auth user; that needs the service-role key in a server-only admin route.
4. Supabase's default email sender is rate-limited. Set up custom SMTP before inviting users.
5. The master key was generated during setup by the build assistant and passed to Vercel through its API. Rotate it (see above) once you've taken over the project.
6. Vercel's Hobby plan is for non-commercial use. Move to Pro before charging anyone.
