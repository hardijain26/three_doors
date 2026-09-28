import { providerCatalog } from "@/lib/ai/registry.ts";
import { ok, fail, unauthorized } from "@/lib/http/respond.ts";
import { requireUser } from "@/lib/supabase/server.ts";

export async function GET() {
  try {
    const { sb, user } = await requireUser();
    if (!user) return unauthorized();
    const { data } = await sb.from("provider_connections").select("provider, auth_method, storage, key_hint, default_model, status, is_active, validated_at").eq("user_id", user.id);
    return ok({ providers: providerCatalog(), connections: data ?? [] });
  } catch (e) { return fail(e, "ai.providers"); }
}
