import { isProviderId } from "@/lib/ai/registry.ts";
import { AIError } from "@/lib/ai/types.ts";
import { ok, fail, unauthorized } from "@/lib/http/respond.ts";
import { requireUser } from "@/lib/supabase/server.ts";

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    if (!user) return unauthorized();
    const { provider, model, active } = await req.json().catch(() => ({}));
    if (!isProviderId(provider)) throw new AIError("bad_request", 400);
    if (typeof model === "string" && /^[A-Za-z0-9_.:\-\/]{1,100}$/.test(model))
      await sb.from("provider_connections").update({ default_model: model, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("provider", provider);
    if (active === true) {
      const { data: target } = await sb.from("provider_connections").select("provider").eq("user_id", user.id).eq("provider", provider).maybeSingle();
      if (!target) throw new AIError("not_connected", 400);
      await sb.from("provider_connections").update({ is_active: false }).eq("user_id", user.id);
      await sb.from("provider_connections").update({ is_active: true }).eq("user_id", user.id).eq("provider", provider);
    }
    return ok({ ok: true });
  } catch (e) { return fail(e, "ai.update"); }
}
