"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { APPLY_CAP, istToday, nextStep, reached, type Contact } from "@/lib/client/pipeline.ts";
import { useScreenMinutes } from "@/lib/client/wellbeing.ts";

type Lite = Pick<Contact, "status" | "status_history" | "type">;
/** The tracker's stats line: roles, requests, accepts, replies, referrals, actions due, applications today, minutes today. */
export function StatsBar({ roles, contacts }: { roles: { applied_on: string | null }[]; contacts: Lite[] }) {
  const c = { sent: 0, acc: 0, rep: 0, ref: 0, due: 0 };
  for (const x of contacts as Contact[]) {
    const r = reached(x), open = x.status !== "Closed";
    if (r >= 1) c.sent++; if (r >= 2 && open) c.acc++; if (r >= 4 && open) c.rep++;
    if (x.status === "Referral given") c.ref++; if (open && nextStep(x)[1]) c.due++;
  }
  const applied = roles.filter((r) => r.applied_on === istToday()).length; const mins = useScreenMinutes();
  return (
    <div className="stats" aria-label="Your numbers">
      <span><b>{roles.length}</b>roles</span><span><b>{c.sent}</b>requests sent</span><span><b>{c.acc}</b>accepted</span><span><b>{c.rep}</b>replied</span><span><b>{c.ref}</b>referrals</span>
      <span className={c.due ? "hot" : ""}><b>{c.due}</b>need action</span><span><b>{applied}</b>of {APPLY_CAP} applications today</span><span><b>{mins ?? 0}</b>min here today</span>
    </div>
  );
}

/** Loads what the stats line needs, for pages that don't already have it. */
export function useBoard(tick = 0) {
  const [d, setD] = useState<{ roles: { applied_on: string | null }[]; contacts: Lite[]; fresh: { score: number | null }[]; linkedin: string | null } | null>(null);
  useEffect(() => {
    const sb = supabaseBrowser();
    Promise.all([sb.from("roles").select("id,applied_on").is("archived_at", null), sb.from("contacts").select("role_id,status,status_history,type"), sb.from("openings").select("score").eq("state", "new"), sb.auth.getUser()]).then(async ([r, c, o, u]: any[]) => {
      const p = u.data.user ? (await sb.from("profiles").select("linkedin_url").eq("id", u.data.user.id).single()).data : null;
      const roleIds = new Set((r.data ?? []).map((x: { id: string }) => x.id));
      setD({ roles: r.data ?? [], contacts: (c.data ?? []).filter((x: { role_id: string }) => roleIds.has(x.role_id)), fresh: o.data ?? [], linkedin: p?.linkedin_url ?? null });
    });
  }, [tick]);
  return d;
}

export const liOk = (u?: string | null) => /linkedin\.com\/in\/[^/?#\s]+/i.test(u || "");
export function LinkedInNudge({ url }: { url: string | null | undefined }) {
  if (liOk(url)) return null;
  return <Link className="banner warn" href="/about">Add your LinkedIn profile URL in About. Recruiters open it before anything else →</Link>;
}
export function OpeningsBanner({ fresh }: { fresh: { score: number | null }[] }) {
  if (!fresh.length) return null;
  const top = fresh.filter((o) => (o.score ?? 0) >= 70).length;
  return <Link className="banner" href="/openings">{fresh.length} new opening{fresh.length > 1 ? "s" : ""} to review{top ? `, ${top} top match${top > 1 ? "es" : ""}` : ""} →</Link>;
}

/** Save-as-you-type: writes each key after a short pause and reports the state like the tracker ("All changes saved"). */
export function useSaver() {
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const pend = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; run: () => PromiseLike<{ error: unknown }> }>());
  const inflight = useRef(0);
  const fire = useCallback(async (key: string) => {
    const m = pend.current, p = m.get(key); if (!p) return;
    clearTimeout(p.t); m.delete(key); inflight.current++;
    let bad = false; try { const r = await p.run(); bad = !!r.error; } catch { bad = true; }
    inflight.current--;
    setState(bad ? "error" : m.size || inflight.current ? "saving" : "saved");
  }, []);
  const queue = useCallback((key: string, run: () => PromiseLike<{ error: unknown }>, delay = 600) => {
    const m = pend.current; const old = m.get(key); if (old) clearTimeout(old.t); setState("saving");
    m.set(key, { run, t: setTimeout(() => fire(key), delay) });
  }, [fire]);
  // Leaving the page never drops a pending edit: write it straight away.
  useEffect(() => () => { [...pend.current.keys()].forEach((k) => fire(k)); }, [fire]);
  return { state, queue };
}
export const SaveHint = ({ state }: { state: "saved" | "saving" | "error" }) =>
  <span className={`savehint${state === "error" ? " due" : ""}`} role="status">{state === "saving" ? "Saving…" : state === "error" ? "Couldn't save the last change. Check your connection." : "All changes saved"}</span>;
