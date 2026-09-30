import { ok, fail, unauthorized } from "@/lib/http/respond.ts";
import { requireUser } from "@/lib/supabase/server.ts";

// Everything we hold about the user, minus encrypted keys (useless outside this app).
export async function GET() {
  try {
    const { sb, user } = await requireUser();
    if (!user) return unauthorized();
    const [profile, roles, contacts, decisionEvents, conns, career, cv, cvs, sources, openings] = await Promise.all([
      sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      sb.from("roles").select("*").eq("user_id", user.id),
      sb.from("contacts").select("*").eq("user_id", user.id),
      sb.from("decision_events").select("*").eq("user_id", user.id),
      sb.from("provider_connections").select("provider, auth_method, storage, key_hint, default_model, status, validated_at").eq("user_id", user.id),
      sb.from("career").select("*").eq("user_id", user.id).maybeSingle(),
      sb.from("cv_docs").select("*").eq("user_id", user.id).maybeSingle(),
      sb.from("cv_versions").select("*").eq("user_id", user.id),
      sb.from("sources").select("*").eq("user_id", user.id),
      sb.from("openings").select("*").eq("user_id", user.id),
    ]);
    return new Response(JSON.stringify({ exported_at: new Date().toISOString(), email: user.email, profile: { ...profile.data, profile_data: profile.data?.profile_data ?? {} }, roles: roles.data, contacts: contacts.data, decision_events: decisionEvents.data, ai_connections: conns.data, career: career.data, cv: cv.data, cv_versions: cvs.data, sources: sources.data, openings: openings.data }, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": "attachment; filename=three-doors-export.json", "Cache-Control": "no-store" },
    });
  } catch (e) { return fail(e, "account.export"); }
}
