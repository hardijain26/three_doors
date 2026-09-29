"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../supabase/client.ts";

export type Me = { id: string; first_name: string | null; last_role: string | null; last_company: string | null; owned: string | null; results: string | null; background: string | null; based_in: string | null; portfolio: string | null; linkedin_url: string | null; search: any };
/** The signed-in user's profile row, or null while loading. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { const sb = supabaseBrowser(); sb.auth.getUser().then(async ({ data }: any) => { if (!data.user) return; const { data: p } = await sb.from("profiles").select("*").eq("id", data.user.id).single(); setMe(p); }); }, []);
  return me;
}
export const wins = (me: Me | null) => (me?.results || "").split(/\n|;/).map((x) => x.trim()).filter(Boolean);
