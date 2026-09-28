import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server.ts";

// Handles the return from Google / LinkedIn sign-in and email confirmation links.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  const sb = await supabaseServer();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  // First visit goes to AI settings so the user connects a provider; later visits land on Roles.
  const { data } = await sb.from("provider_connections").select("provider").limit(1);
  return NextResponse.redirect(new URL(data && data.length ? "/roles" : "/settings/ai", url.origin));
}
