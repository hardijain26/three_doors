import { resolveCredential } from "@/lib/ai/gateway.ts";
import { getProvider, isProviderId } from "@/lib/ai/registry.ts";
import { AIError } from "@/lib/ai/types.ts";
import { ok, fail, unauthorized, browserKey } from "@/lib/http/respond.ts";
import { requireUser } from "@/lib/supabase/server.ts";

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    if (!user) return unauthorized();
    const { provider } = await req.json().catch(() => ({}));
    if (!isProviderId(provider)) throw new AIError("bad_request", 400);
    const { data: allowed } = await sb.rpc("rate_ok", { p_bucket: "ai_models", p_max: 30, p_window_seconds: 600 });
    if (allowed === false) throw new AIError("rate_limited", 429);
    const { cred } = await resolveCredential(sb, user, provider, browserKey(req));
    return ok({ models: await getProvider(provider).listAvailableModels(cred) });
  } catch (e) { return fail(e, "ai.models"); }
}
