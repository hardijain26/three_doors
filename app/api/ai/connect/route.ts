import { getProvider, isProviderId } from "@/lib/ai/registry.ts";
import { AIError } from "@/lib/ai/types.ts";
import { ok, fail, unauthorized } from "@/lib/http/respond.ts";
import { encryptSecret, keyHint } from "@/lib/security/crypto.ts";
import { requireUser } from "@/lib/supabase/server.ts";
import { track } from "@/lib/telemetry/track.ts";

// Validates an API key against the provider, then either stores it encrypted
// (server_vault) or stores nothing but a 4-character hint (browser_only).
export async function POST(req: Request) {
  const { sb, user } = await requireUser();
  if (!user) return unauthorized();
  let provider = "";
  try {
    const body = await req.json().catch(() => ({}));
    provider = body.provider; const storage = body.storage; const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!isProviderId(provider) || !["server_vault", "browser_only"].includes(storage) || apiKey.length < 20 || apiKey.length > 300 || /\s/.test(apiKey)) throw new AIError("bad_request", 400);
    const { data: allowed } = await sb.rpc("rate_ok", { p_bucket: "ai_connect", p_max: 10, p_window_seconds: 3600 });
    if (allowed === false) throw new AIError("rate_limited", 429);
    const p = getProvider(provider);
    const cred = { kind: "api_key" as const, apiKey };
    await p.validateConnection(cred);
    const models = await p.listAvailableModels(cred).catch(() => []);
    const model = p.pickDefaultModel(models);

    if (storage === "server_vault") {
      const enc = encryptSecret(apiKey, user.id, provider);
      const { error } = await sb.from("credentials").upsert({ user_id: user.id, provider, ...enc }, { onConflict: "user_id,provider" });
      if (error) throw error;
    } else {
      await sb.from("credentials").delete().eq("user_id", user.id).eq("provider", provider);
    }
    const { count } = await sb.from("provider_connections").select("provider", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true).neq("provider", provider);
    const { error } = await sb.from("provider_connections").upsert({
      user_id: user.id, provider, auth_method: "api_key", storage, key_hint: keyHint(apiKey), default_model: model,
      status: "connected", is_active: !count, validated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    if (error) throw error;
    track(sb, { event: "provider_connected", props: { provider, auth_method: "api_key", storage } });
    return ok({ ok: true, model, models });
  } catch (e) {
    if (e instanceof AIError && isProviderId(provider)) track(sb, { event: "provider_validation_failed", props: { provider, error_code: e.code } });
    return fail(e, "ai.connect");
  }
}
