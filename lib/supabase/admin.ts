import { createClient } from "@supabase/supabase-js";

/** Server-only Supabase client used by the automatic-search scheduler. */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service-role configuration is missing");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
