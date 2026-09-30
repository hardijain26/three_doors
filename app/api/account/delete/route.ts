import { ok, fail, unauthorized } from "@/lib/http/respond.ts";
import { supabaseAdmin } from "@/lib/supabase/admin.ts";
import { requireUser } from "@/lib/supabase/server.ts";

// Full account deletion: Removes all user data and the Auth account itself.
export async function POST() {
  try {
    const { sb, user } = await requireUser();
    if (!user) return unauthorized();
    const admin = supabaseAdmin();

    // Delete all associated data before removing the Auth account.
    const steps = [
      await sb.from("credentials").delete().eq("user_id", user.id),
      await sb.from("provider_connections").delete().eq("user_id", user.id),
      await admin.from("decision_events").delete().eq("user_id", user.id),
      await admin.from("roles").delete().eq("user_id", user.id), // contacts cascade
      await sb.from("openings").delete().eq("user_id", user.id),
      await sb.from("sources").delete().eq("user_id", user.id),
      await sb.from("search_runs").delete().eq("user_id", user.id),
      await sb.from("cv_versions").delete().eq("user_id", user.id),
      await sb.from("cv_docs").delete().eq("user_id", user.id),
      await sb.from("career").delete().eq("user_id", user.id),
      await sb.from("profiles").delete().eq("id", user.id),
    ];

    const failed = steps.find((s) => s.error);
    if (failed) throw failed.error;

    const { error: authError } = await admin.auth.admin.deleteUser(user.id);
    if (authError) throw authError;

    await sb.auth.signOut();

    return ok({ ok: true });
  } catch (e) {
    return fail(e, "account.delete");
  }
}
