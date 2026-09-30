import { resolveCredential, runPrepared } from "@/lib/ai/gateway.ts";
import { AIError } from "@/lib/ai/types.ts";
import type { FoundOpening } from "@/lib/features/index.ts";
import { ok, fail, unauthorized, browserKey } from "@/lib/http/respond.ts";
import { htmlToText, safeFetchText } from "@/lib/security/safe-fetch.ts";
import { log } from "@/lib/security/redact.ts";
import { requireUser } from "@/lib/supabase/server.ts";
import { supabaseAdmin } from "@/lib/supabase/admin.ts";
import { NextResponse } from "next/server";

export const maxDuration = 300;
const PER_RUN = 30, DAY_CAP = 20, GAP_H = 6, CONCURRENCY = 4, DEADLINE_MS = 150_000;
const istToday = () => new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);

export async function POST(req: Request) {
  const t0 = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  const internalSecret = req.headers.get("x-three-doors-cron-secret");
  const internalUserId = req.headers.get("x-three-doors-user-id");
  const isCron = !!cronSecret && !!internalUserId && internalSecret === cronSecret;
  let sb: any;
  let user: any;
  if (isCron) {
    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.getUserById(internalUserId!);
    if (error || !data.user) return unauthorized();
    sb = admin;
    user = data.user;
  } else {
    const auth = await requireUser();
    sb = auth.sb; user = auth.user;
    if (!user) return unauthorized();
  }
  try {
    const { data: last } = await sb.from("search_runs").select("started_at, status").eq("user_id", user.id).neq("status", "failed").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - Date.parse(last.started_at) < GAP_H * 3_600_000) {
      const next = new Date(Date.parse(last.started_at) + GAP_H * 3_600_000).toISOString();
      return NextResponse.json({ error: "too_soon", message: "Searches need 6 hours between them.", next }, { status: 429 });
    }
    const today = istToday();
    const { count: addedToday } = await sb.from("openings").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("found_on", today).eq("manual", false);
    const room = DAY_CAP - (addedToday ?? 0);
    if (room <= 0) return NextResponse.json({ error: "day_cap", message: "Today's 20 openings are already in. The next search can run tomorrow." }, { status: 429 });

    const ctx = await resolveCredential(sb, user, undefined, browserKey(req));
    const [{ data: sources }, { data: prof }] = await Promise.all([
      sb.from("sources").select("id, name, url").eq("user_id", user.id).eq("enabled", true).order("fav", { ascending: false }).order("last_checked", { ascending: true, nullsFirst: true }).limit(PER_RUN),
      sb.from("profiles").select("search, first_name, last_role, last_company, owned, results, background").eq("id", user.id).single(),
    ]);
    if (!sources?.length) throw new AIError("bad_request", 400);
    const { data: runId, error: runErr } = isCron
      ? await sb.rpc("start_scheduled_search_run", { p_user_id: user.id, p_total: sources.length })
      : await sb.rpc("start_search_run", { p_total: sources.length });
    if (runErr) throw runErr;
    if (!runId) return NextResponse.json({ error: "too_soon", message: "Searches need 6 hours between them." }, { status: 429 });
    const run = { id: runId as string };

    const criteria = { roles: [], countries: [], cities: [], skip: [], remote: {}, ...(prof?.search ?? {}) };
    const skip = (criteria.skip as string[]).map((s) => new RegExp(`\\b${s.toLowerCase().replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i"));
    const me = { first_name: prof?.first_name, last_role: prof?.last_role, last_company: prof?.last_company, owned: prof?.owned, results: prof?.results, background: prof?.background };
    let added = 0, checked = 0; let aiError = null as string | null;
    const queue = [...sources];

    async function worker() {
      while (queue.length && Date.now() - t0 < DEADLINE_MS && added < room && !aiError) {
        const s = queue.shift()!;
        let found = 0, err: string | null = null;
        try {
          const text = htmlToText(await safeFetchText(s.url), s.url).slice(0, 15000);
          if (text.length < 200) err = "Page had almost no text (it may need JavaScript to load)";
          else {
            const { openings } = await runPrepared(sb, ctx, "extract_openings", { pageText: text, sourceUrl: s.url, criteria, me }) as { openings: FoundOpening[] };
            for (const o of openings) {
              if (skip.some((re) => re.test(`${o.company} ${o.why}`))) continue;
              if (added >= room) break;
              added++;
              const real = o.link && text.includes(`[${o.link}]`) ? o.link : "";
              const link = real || `${s.url}#${encodeURIComponent(`${o.company}-${o.title}`.toLowerCase())}`;
              const { error } = await sb.from("openings").insert({ source_id: s.id, company: o.company, title: o.title, location: o.location, link, score: o.score, why: o.why, flag: o.flag || null, found_on: today });
              if (error) added--; else found++;
            }
          }
        } catch (e) {
          if (e instanceof AIError && ["invalid_key", "quota_exceeded", "not_connected", "browser_key_missing", "model_not_found"].includes(e.code)) aiError = e.code;
          err = e instanceof AIError ? e.code : (e as Error).message?.slice(0, 60) || "failed";
          if (!(e instanceof AIError)) log.error("openings.source", e);
        }
        checked++;
        await sb.from("sources").update({ last_checked: new Date().toISOString(), last_found: found, last_error: err }).eq("id", s.id);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const ae = aiError as string | null;
    const note = ae ? `Stopped early: ${ae.replace(/_/g, " ")}.` : added >= room ? "Reached today's limit of 20." : Date.now() - t0 >= DEADLINE_MS ? "Stopped at the time limit; the rest go next time." : null;
    await sb.from("search_runs").update({ status: aiError && !added ? "failed" : "done", finished_at: new Date().toISOString(), checked, added, note }).eq("id", run.id);
    if (aiError && !added) throw new AIError(aiError as any, 400);
    return ok({ checked, total: sources.length, added, note });
  } catch (e) { return fail(e, "openings.search"); }
}
