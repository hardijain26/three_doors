import type { SupabaseClient } from "@supabase/supabase-js";

const IST_OFFSET_MS = 19_800_000;
const DAY_MS = 86_400_000;

type Schedule = { freq?: string; day?: string; time?: string };

export type SearchDispatchResult = {
  user: string;
  status: number;
};

export type SearchDispatchSummary = {
  checked: number;
  triggered: number;
  results: SearchDispatchResult[];
};

function istNow(now = Date.now()) {
  const d = new Date(now + IST_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    time: d.toISOString().slice(11, 16),
    day: String(d.getUTCDay()),
  };
}

function weekKey(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay();
  return new Date(d.getTime() - ((day + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

function isDue(schedule: Schedule, lastStartedAt?: string | null, now = Date.now()) {
  const freq = schedule.freq || "off";
  if (freq === "off") return false;

  const last = lastStartedAt ? Date.parse(lastStartedAt) : 0;
  if (freq === "every6") return !last || now - last >= 6 * 60 * 60 * 1000;
  if (freq === "every12") return !last || now - last >= 12 * 60 * 60 * 1000;

  const current = istNow(now);
  const time = schedule.time || "08:50";
  if (current.time < time) return false;

  if (freq === "daily") {
    return !last || istNow(last).date !== current.date;
  }

  if (freq === "weekly") {
    return (schedule.day || "1") === current.day
      && (!last || weekKey(istNow(last).date) !== weekKey(current.date));
  }

  return false;
}

/**
 * Provider-neutral search orchestration.
 *
 * This layer owns scheduling/dispatch only. It does not know which LLM,
 * scraper, or agent implementation performs the actual search. The existing
 * /api/openings/search endpoint remains the search worker and already resolves
 * the user's configured AI provider through the AI gateway.
 */
export async function dispatchDueSearches({
  admin,
  requestUrl,
  cronSecret,
}: {
  admin: SupabaseClient;
  requestUrl: string;
  cronSecret: string;
}): Promise<SearchDispatchSummary> {
  const { data: profiles, error } = await admin.from("profiles").select("id, search");
  if (error) throw error;

  const results: SearchDispatchResult[] = [];

  for (const profile of profiles || []) {
    const schedule = (profile.search || {}).schedule as Schedule | undefined;
    if (!isDue(schedule || {})) continue;

    const { data: last } = await admin
      .from("search_runs")
      .select("started_at,status")
      .eq("user_id", profile.id)
      .neq("status", "failed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!isDue(schedule || {}, last?.started_at)) continue;

    const url = new URL("/api/openings/search", requestUrl);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-three-doors-cron-secret": cronSecret,
        "x-three-doors-user-id": profile.id,
      },
    });

    results.push({ user: profile.id, status: response.status });
  }

  return {
    checked: profiles?.length || 0,
    triggered: results.length,
    results,
  };
}
