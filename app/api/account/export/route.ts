import { ok, fail, unauthorized } from "@/lib/http/respond.ts";
import { requireUser } from "@/lib/supabase/server.ts";

// Everything we hold about the user, minus encrypted keys (useless outside this app).
export async function GET() {
  try {
    const { sb, user } = await requireUser();
    if (!user) return unauthorized();
    const [profile, roles, contacts, conns] = await Promise.all([
      sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      sb.from("roles").select("*").eq("user_id", user.id),
      sb.from("contacts").select("*").eq("user_id", user.id),
      sb.from("provider_connections").select("provider, auth_method, storage, key_hint, default_model, status, validated_at").eq("user_id", user.id),
    ]);
    return new Response(JSON.stringify({ exported_at: new Date().toISOString(), email: user.email, profile: profile.data, roles: roles.data, contacts: contacts.data, ai_connections: conns.data }, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": "attachment; filename=three-doors-export.json", "Cache-Control": "no-store" },
    });
  } catch (e) { return fail(e, "account.export"); }
}
