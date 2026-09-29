import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin.ts";

export const maxDuration = 300;
const IST_OFFSET_MS = 19_800_000;
const DAY_MS = 86_400_000;
type Schedule = { freq?: string; day?: string; time?: string };

function istNow(now = Date.now()) {
  const d = new Date(now + IST_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16), day: String(d.getUTCDay()) };
}
function weekKey(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay();
  return new Date(d.getTime() - ((day + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}
function due(schedule: Schedule, lastStartedAt?: string | null, now = Date.now()) {
  const freq = schedule.freq || "off";
  if (freq === "off") return false;
  const last = lastStartedAt ? Date.parse(lastStartedAt) : 0;
  if (freq === "every6") return !last || now - last >= 6 * 60 * 60 * 1000;
  if (freq === "every12") return !last || now - last >= 12 * 60 * 60 * 1000;
  const i = istNow(now), time = schedule.time || "08:50";
  if (i.time < time) return false;
  if (freq === "daily") return !last || istNow(last).date !== i.date;
  if (freq === "weekly") return (schedule.day || "1") === i.day && (!last || weekKey(istNow(last).date) !== weekKey(i.date));
  return false;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = supabaseAdmin();
  const { data: profiles, error } = await admin.from("profiles").select("id, search");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results: { user: string; status: number }[] = [];
  for (const profile of profiles || []) {
    const schedule = (profile.search || {}).schedule as Schedule | undefined;
    if (!due(schedule || {})) continue;
    const { data: last } = await admin.from("search_runs").select("started_at,status").eq("user_id", profile.id).neq("status", "failed").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (!due(schedule || {}, last?.started_at)) continue;
    const url = new URL("/api/openings/search", req.url);
    const response = await fetch(url, { method: "POST", headers: { "x-three-doors-cron-secret": secret, "x-three-doors-user-id": profile.id } });
    results.push({ user: profile.id, status: response.status });
  }
  return NextResponse.json({ checked: profiles?.length || 0, triggered: results.length, results });
}
