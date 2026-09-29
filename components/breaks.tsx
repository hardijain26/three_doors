"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { TICK_S, announceMinutes, loadState, minutesToday, saveState, tick, wbCfg, type BreakKind, type WbCfg } from "@/lib/client/wellbeing.ts";

const TEXT: Record<BreakKind, [string, string]> = {
  session: ["Time for a break", "You've been at this for a while. The roles will still be here in a few minutes."],
  daily: ["That's enough for today", "You've hit your daily time on the job search. Rest is part of the work. Three Doors opens again in an hour."],
  apply: ["5 applications today", "That's a full day's applications. Anything more today gets less of your attention than it deserves. Pick this up tomorrow."],
  applydone: ["That was number 5", "Good work today. That's your limit for applications. Step away and do something that has nothing to do with job hunting."],
};
const CUES = ["Breathe in", "Hold", "Breathe out", "Hold"];

/** Counts screen time and shows the break screen, on every page, while someone is signed in. */
export default function Breaks() {
  const [uid, setUid] = useState<string | null>(null); const cfg = useRef<WbCfg>(wbCfg());
  const [kind, setKind] = useState<BreakKind | null>(null); const [until, setUntil] = useState(0);
  const [cue, setCue] = useState(0); const [now, setNow] = useState(Date.now());
  const lastInput = useRef(Date.now()); const btn = useRef<HTMLButtonElement>(null);

  // Who is signed in, and their break settings.
  useEffect(() => {
    const sb = supabaseBrowser();
    let cur: string | null | undefined;
    const load = async (id: string | null) => {
      if (id === cur) return; cur = id;
      setUid(id); if (!id) { setKind(null); return; }
      const { data } = await sb.from("profiles").select("wellbeing").eq("id", id).maybeSingle();
      cfg.current = wbCfg(data?.wellbeing);
    };
    sb.auth.getUser().then(({ data }: any) => load(data.user?.id ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e: string, s: any) => { load(s?.user?.id ?? null); });
    const onCfg = (e: Event) => { cfg.current = wbCfg((e as CustomEvent).detail); };
    window.addEventListener("td-wb-cfg", onCfg);
    return () => { sub?.subscription?.unsubscribe(); window.removeEventListener("td-wb-cfg", onCfg); };
  }, []);

  // The 15-second clock.
  useEffect(() => {
    if (!uid) return;
    const touch = () => { lastInput.current = Date.now(); };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((ev) => window.addEventListener(ev, touch, { passive: true }));
    const step = () => {
      const t = Date.now(); const r = tick(loadState(uid), cfg.current, t, document.visibilityState === "visible", lastInput.current);
      saveState(uid, r.s); announceMinutes(minutesToday(r.s, t));
      if (r.lock) { setKind(r.lock); setUntil(r.s.lockUntil); }
      else setKind((k) => (k === "session" || k === "daily" ? null : k));
    };
    const first = loadState(uid);
    if (first.lockUntil > Date.now()) { setKind((first.lockKind || "session") as BreakKind); setUntil(first.lockUntil); }
    announceMinutes(minutesToday(first));
    const iv = setInterval(step, TICK_S * 1000);
    const onBreak = (e: Event) => { setKind((e as CustomEvent<BreakKind>).detail); setUntil(0); };
    window.addEventListener("td-break", onBreak);
    return () => { clearInterval(iv); evs.forEach((ev) => window.removeEventListener(ev, touch)); window.removeEventListener("td-break", onBreak); };
  }, [uid]);

  const locked = kind === "session" || kind === "daily";
  // While the screen is up: breathing cue every 4 s, countdown every second, rest of the app unusable.
  useEffect(() => {
    if (!kind) return;
    const els = [document.querySelector("main"), document.querySelector("header.nav")].filter(Boolean) as HTMLElement[];
    els.forEach((el) => el.setAttribute("inert", ""));
    const c = setInterval(() => setCue((i) => (i + 1) % 4), 4000);
    const n = setInterval(() => setNow(Date.now()), 1000);
    if (!locked) btn.current?.focus();
    return () => { els.forEach((el) => el.removeAttribute("inert")); clearInterval(c); clearInterval(n); setCue(0); };
  }, [kind, locked]);
  useEffect(() => { if (locked && until && now >= until) setKind(null); }, [now, until, locked]);

  if (!uid || !kind) return null;
  const ms = Math.max(0, until - now), m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  const [title, body] = TEXT[kind];
  return (
    <div className="breakscreen" role="dialog" aria-modal="true" aria-labelledby="brtitle">
      <div className="brcard">
        <h2 id="brtitle">{title}</h2>
        <p>{body}</p>
        <div className="breath" aria-hidden="true"><div className="circle" /></div>
        <p className="brcue" aria-live="polite">{CUES[cue]}</p>
        <ul className="brtips">
          <li>Drink a glass of water.</li>
          <li>Breathe with the circle: in for 4, hold for 4, out for 4, hold for 4.</li>
          <li>Stand up, roll your shoulders, and look at something far away.</li>
        </ul>
        {locked ? <p className="brcount">Three Doors opens again in {m}:{String(s).padStart(2, "0")}.</p>
          : <button ref={btn} className="primary" onClick={() => setKind(null)}>OK, I&apos;ll take a break</button>}
      </div>
    </div>
  );
}

