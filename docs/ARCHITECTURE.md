# Three Doors: BYOK + privacy-first architecture

> Your AI bill stays yours. Your data stays yours. We only collect the product telemetry required to make the product better.

## The three separated areas

```text
                           Three Doors (Next.js on Vercel)
                                      |
          +---------------------------+---------------------------+
          |                           |                           |
   AI connection                 User data                  Product telemetry
   lib/ai/*                      public.* tables            telemetry.events
          |                      (Supabase, RLS             (separate schema, not
          v                       owner-only)                exposed over the API,
   OpenAI / Anthropic / Gemini                               content-free by rule)
   billed to the user's own key
```

| Area | Where | Who can read it |
|---|---|---|
| AI credentials | `public.credentials` (ciphertext only) or the user's browser | Only the gateway, on the owner's request |
| User data (roles, contacts, notes, AI drafts, profile) | `public.*` tables | Only the owning user, enforced by Postgres row-level security |
| Telemetry | `telemetry.events` | Only you, in the Supabase dashboard. Users can't read it and it can't hold content |

## Request path

```text
Product feature (lib/features)      "draft a connection note from these fields"
        |  describes WHAT it needs; never names a provider
        v
AI gateway (lib/ai/gateway.ts)       resolves the user's active connection + credential,
        |                            runs the call, emits one content-free event
        v
Provider adapter (lib/ai/providers)  OpenAI | Anthropic | Gemini, one common interface
        v
Provider API                         billed to the key's owner
```

### Provider interface (`lib/ai/types.ts`)

```text
AIProvider
  id, displayName
  authMethods[]             what the provider officially supports (see below)
  validateConnection(cred)  cheapest authenticated call (list models)
  listAvailableModels(cred)
  pickDefaultModel(models)
  generate(cred, req)       -> { text, usage{inputTokens, outputTokens}, model }
  streamGenerate(cred, req) -> async stream of text chunks + final usage
```

Errors are normalised to codes (`invalid_key`, `rate_limited`, `quota_exceeded`, `model_not_found`, …). A provider's own error text is never passed through, because some providers echo part of the key in their messages.

`connectProvider` and `disconnectProvider` are app operations (`/api/ai/connect`, `/api/ai/disconnect`), because they involve storage, not the provider. `getUsageMetadata` is the `usage` field returned with every generation.

### Adding a provider

1. Write `lib/ai/providers/<name>.ts` implementing `AIProvider`.
2. Register it in `lib/ai/registry.ts`.
3. Add the id to the `provider` check constraints on `provider_connections` and `credentials`.

No product feature changes.

## Authentication per provider (checked against official docs, Sep 2026)

| Provider | Officially supported for third-party apps | What we built |
|---|---|---|
| OpenAI | API key only. "Sign in with ChatGPT" shares identity, not API billing. | API key |
| Anthropic | API key only. Anthropic forbids third-party apps from offering Claude.ai login or using Claude.ai plan credentials. A Pro or Max plan does not cover API use. | API key |
| Google Gemini | API key, **and** Google OAuth (the user's Google account; usage billed to a Google Cloud project named in `x-goog-user-project`). OAuth needs a verified Google OAuth app; unverified apps are capped at 100 users. | API key now. OAuth is modelled in the interface (`authMethods` has `{type:"oauth", enabled:false}`, `Credential` has an `oauth` variant, the Gemini adapter already sends `Authorization: Bearer` + `x-goog-user-project`). Switching it on needs a Google Cloud OAuth client and verification. |

The connect screen reads `authMethods` from the registry, so it only ever offers what a provider supports and labels an API key as an API key.

## Credential storage: the user chooses

| | Encrypted on our server (`server_vault`) | Only in this browser (`browser_only`) |
|---|---|---|
| Where the key lives | `public.credentials`: AES-256-GCM ciphertext, IV and tag. Master key in Vercel env `CREDENTIAL_MASTER_KEY`, never in the database | Browser IndexedDB, encrypted with a non-extractable WebCrypto key |
| What our server stores | Ciphertext | Last 4 characters only |
| When the key reaches our server | Decrypted in memory for each request | Sent in the `x-byok-key` header for each request, over HTTPS, then dropped |
| Works across devices | Yes | No, re-enter per browser |
| Background jobs possible | Yes | No |
| Worst case if our database leaks | Ciphertext only; useless without the Vercel secret | Nothing to leak |
| Worst case if our server is compromised | Attacker can decrypt all stored keys | Attacker can capture keys used during the compromise |
| Worst case if this site has an XSS bug | Keys can't be read from the browser, but the attacker can steal the session (Supabase session cookies are readable by script) and make requests as the user | Attacker script can decrypt the key and steal it, for example by navigating to another site with it in the URL. CSP `connect-src` stops `fetch` to other hosts but not navigation |
| Shared computer | Signing out ends access | Keys are stored per account and wiped on sign-out; the server also refuses a browser key whose last 4 characters don't match the connected key |

Why keys never go browser-to-provider directly: none of the three providers officially supports calling their API from a browser, and all three say not to put keys in client code. So even in `browser_only` mode the call goes through our gateway; we just don't keep the key.

## Telemetry

See `docs/TELEMETRY.md`.
