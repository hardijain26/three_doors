import type { SupabaseClient, User } from "@supabase/supabase-js";
import { decryptSecret, keyHint } from "../security/crypto.ts";
import { log } from "../security/redact.ts";
import { track } from "../telemetry/track.ts";
import { FEATURES, type FeatureId } from "../features/index.ts";
import { getProvider, isProviderId } from "./registry.ts";
import { AIError, type Credential, type ProviderId } from "./types.ts";

// The single entry point between product features and AI providers.
//   feature -> gateway -> provider adapter -> provider API
// It resolves the user's active connection and credential, runs the call, and emits
// one content-free telemetry event. It never returns or logs the credential.

export async function resolveCredential(sb: SupabaseClient, user: User, provider?: ProviderId, browserKey?: string | null) {
  let q = sb.from("provider_connections").select("provider, storage, default_model, auth_method, key_hint").eq("user_id", user.id);
  q = provider ? q.eq("provider", provider) : q.eq("is_active", true);
  const { data: conn } = await q.maybeSingle();
  if (!conn || !isProviderId(conn.provider)) throw new AIError("not_connected", 400);
  let cred: Credential;
  if (conn.storage === "browser_only") {
    // Only relay a browser-held key that matches the one this user connected.
    if (!browserKey || !conn.key_hint || keyHint(browserKey) !== conn.key_hint) throw new AIError("browser_key_missing", 400);
    cred = { kind: "api_key", apiKey: browserKey };
  } else {
    const { data: row } = await sb.from("credentials").select("ciphertext, iv, auth_tag, key_version").eq("user_id", user.id).eq("provider", conn.provider).maybeSingle();
    if (!row) throw new AIError("not_connected", 400);
    try { cred = { kind: "api_key", apiKey: decryptSecret(row, user.id, conn.provider) }; }
    catch (e) { log.error("gateway.decrypt", e); throw new AIError("not_connected", 400); }
  }
  return { conn: conn as { provider: ProviderId; storage: string; default_model: string | null; auth_method: string; key_hint: string | null }, cred };
}

// Model ids are only reported to telemetry when they look like a real model name.
const MODEL_SHAPE = /^(gpt-|o\d|chatgpt-|claude-|gemini-|gemma-)[a-z0-9.:\-]{1,50}$/i;
const telemetryModel = (m: string) => (MODEL_SHAPE.test(m) ? m : "other");

export async function runFeature(sb: SupabaseClient, user: User, featureId: FeatureId, rawInput: unknown, browserKey?: string | null, expectProvider?: string) {
  const feature = FEATURES[featureId];
  const input = feature.validate(rawInput);
  const { data: allowed } = await sb.rpc("rate_ok", { p_bucket: "ai_run", p_max: 60, p_window_seconds: 600 });
  if (allowed === false) throw new AIError("rate_limited", 429);
  const { conn, cred } = await resolveCredential(sb, user, undefined, browserKey);
  if (expectProvider && expectProvider !== conn.provider) throw new AIError("not_connected", 409);
  const provider = getProvider(conn.provider);
  const model = conn.default_model || "";
  if (!model) throw new AIError("model_not_found", 400);
  const { system, user: prompt } = feature.build(input);
  const t0 = Date.now();
  let usage = { inputTokens: null as number | null, outputTokens: null as number | null };
  try {
    const res = await provider.generate(cred, { model, system, messages: [{ role: "user", content: prompt }], json: feature.json, maxOutputTokens: feature.maxOutputTokens });
    usage = res.usage;
    const out = feature.parse(res.text);
    track(sb, { event: "ai_request_completed", props: { feature: featureId, provider: conn.provider, model: telemetryModel(model), storage: conn.storage, duration_ms: Date.now() - t0, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, success: true } });
    return out;
  } catch (e) {
    const code = e instanceof AIError ? e.code : "provider_unavailable";
    track(sb, { event: "ai_request_completed", props: { feature: featureId, provider: conn.provider, model: telemetryModel(model), storage: conn.storage, duration_ms: Date.now() - t0, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, success: false, error_code: code } });
    if (!(e instanceof AIError)) log.error("gateway.run", e);
    throw e instanceof AIError ? e : new AIError("provider_unavailable", 502);
  }
}
