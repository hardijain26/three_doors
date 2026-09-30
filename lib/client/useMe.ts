"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "../supabase/client.ts";

export type Me = {
  id: string;
  first_name: string | null;
  last_role: string | null;
  last_company: string | null;
  owned: string | null;
  results: string | null;
  background: string | null;
  based_in: string | null;
  portfolio: string | null;
  linkedin_url: string | null;
  search: any;
  profile_data?: any;
  profession_hint?: string | null;
  profile_ready?: boolean;
};

export function normalizeProfileRow(row: Partial<Me> | null | undefined): Me | null {
  if (!row) return null;
  const generic = (row.profile_data && typeof row.profile_data === "object") ? row.profile_data : {};
  return {
    ...row,
    first_name: row.first_name ?? generic.first_name ?? null,
    last_role: row.last_role ?? generic.current_role ?? null,
    last_company: row.last_company ?? generic.current_org ?? null,
    owned: row.owned ?? generic.experience_summary ?? null,
    results: row.results ?? generic.results ?? null,
    background: row.background ?? generic.strengths_summary ?? null,
    based_in: row.based_in ?? generic.location ?? null,
    portfolio: row.portfolio ?? generic.portfolio ?? null,
    linkedin_url: row.linkedin_url ?? generic.linkedin_url ?? null,
    profile_data: generic,
    profession_hint: row.profession_hint ?? generic.profession_hint ?? null,
    profile_ready: !!(row.profile_ready ?? generic.profile_ready),
  } as Me;
}
/** The signed-in user's profile row, or null while loading. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { const sb = supabaseBrowser(); sb.auth.getUser().then(async ({ data }: any) => { if (!data.user) return; const { data: p } = await sb.from("profiles").select("*").eq("id", data.user.id).single(); setMe(normalizeProfileRow(p)); }); }, []);
  return me;
}
export const wins = (me: Me | null) => (me?.results || "").split(/\n|;/).map((x) => x.trim()).filter(Boolean);
