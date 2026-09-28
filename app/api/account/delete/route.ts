import { ok, fail, unauthorized } from "@/lib/http/respond.ts";
import { requireUser } from "@/lib/supabase/server.ts";

// Deletes all of the user's data and keys. Telemetry rows carry only a keyed hash of
// the user id (pseudonymous) and no content.
export async function POST() {
  try {
    const { sb, user } = await requireUser();
    if (!user) return unauthorized();
    const steps = [
      await sb.from("credentials").delete().eq("user_id", user.id),
      await sb.from("provider_connections").delete().eq("user_id", user.id),
      await sb.from("roles").delete().eq("user_id", user.id), // contacts cascade
      await sb.from("profiles").update({ first_name: null, last_role: null, last_company: null, owned: null, results: null, background: null, display_name: null }).eq("id", user.id),
    ];
    const failed = steps.find((s) => s.error);
    if (failed) throw failed.error;
    await sb.auth.signOut();
    return ok({ ok: true });
  } catch (e) { return fail(e, "account.delete"); }
}
