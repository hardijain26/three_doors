import { isProviderId } from "@/lib/ai/registry.ts";
import { AIError } from "@/lib/ai/types.ts";
import { ok, fail, unauthorized } from "@/lib/http/respond.ts";
import { requireUser } from "@/lib/supabase/server.ts";
import { track } from "@/lib/telemetry/track.ts";

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    if (!user) return unauthorized();
    const { provider } = await req.json().catch(() => ({}));
    if (!isProviderId(provider)) throw new AIError("bad_request", 400);
    await sb.from("credentials").delete().eq("user_id", user.id).eq("provider", provider);
    const { data: was } = await sb.from("provider_connections").delete().eq("user_id", user.id).eq("provider", provider).select("is_active").maybeSingle();
    if (was?.is_active) {
      const { data: next } = await sb.from("provider_connections").select("provider").eq("user_id", user.id).limit(1).maybeSingle();
      if (next) await sb.from("provider_connections").update({ is_active: true }).eq("user_id", user.id).eq("provider", next.provider);
    }
    track(sb, { event: "provider_disconnected", props: { provider } });
    return ok({ ok: true });
  } catch (e) { return fail(e, "ai.disconnect"); }
}
