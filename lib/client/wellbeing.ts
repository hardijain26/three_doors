"use client";
import { useEffect, useState } from "react";

// Breaks and screen time, ported from the tracker:
// - time counts in 15-second steps while this tab is visible and you touched the keyboard,
//   mouse or screen in the last 2 minutes
// - after "break after" minutes of use: a locked break screen for "break length" minutes
// - after the daily limit: locked for an hour, once per day (India date)
// - 10 minutes away resets the session clock
// - marking the 5th application of the day, or trying a 6th, shows a break screen you can close
// Counters live in this browser only (per user), the same as the tracker. Settings live in the profile.

export type WbCfg = { session: number; brk: number; daily: number };
export const WB_OPTS: Record<keyof WbCfg, [number, string][]> = {
  session: [[30, "30 minutes"], [45, "45 minutes"], [60, "1 hour"], [90, "1.5 hours"]],
  brk: [[5, "5 minutes"], [10, "10 minutes"], [15, "15 minutes"]],
  daily: [[60, "1 hour"], [120, "2 hours"], [180, "3 hours"], [240, "4 hours"]],
};
const pick = (v: unknown, opts: [number, string][], d: number) => opts.some(([n]) => n === v) ? (v as number) : d;
export const wbCfg = (w?: any): WbCfg => ({ session: pick(w?.session, WB_OPTS.session, 45), brk: pick(w?.brk, WB_OPTS.brk, 10), daily: pick(w?.daily, WB_OPTS.daily, 120) });

export type BreakKind = "session" | "daily" | "apply" | "applydone";
export type WbState = { day: string; dayActive: number; session: number; lastActive: number; lastTick: number; lockUntil: number; lockKind: BreakKind | ""; dailyLocked: string };
export const TICK_S = 15, IDLE_MS = 120_000, RESET_MS = 10 * 60_000, DAILY_LOCK_MIN = 60;
export const istToday = (now = Date.now()) => new Date(now + 19_800_000).toISOString().slice(0, 10);
export const blankState = (): WbState => ({ day: "", dayActive: 0, session: 0, lastActive: 0, lastTick: 0, lockUntil: 0, lockKind: "", dailyLocked: "" });

/** One 15-second step of the tracker's clock. Pure, so it can be tested. */
export function tick(s0: WbState, cfg: WbCfg, now: number, visible: boolean, lastInput: number): { s: WbState; lock: BreakKind | null } {
  const s = { ...s0 }, d = istToday(now);
  if (s.day !== d) { s.day = d; s.dayActive = 0; s.dailyLocked = ""; }
  if (s.lockUntil > now) return { s, lock: (s.lockKind || "session") as BreakKind };
  if (s.lastActive && now - s.lastActive > RESET_MS) s.session = 0;
  // Another open tab already counted this step: don't count it twice.
  if (visible && now - lastInput < IDLE_MS && now - s.lastTick >= (TICK_S - 3) * 1000) { s.session += TICK_S; s.dayActive += TICK_S; s.lastActive = now; s.lastTick = now; }
  if (s.dayActive >= cfg.daily * 60 && s.dailyLocked !== d) { s.dailyLocked = d; return { s: lockFor(s, "daily", DAILY_LOCK_MIN, now), lock: "daily" }; }
  if (s.session >= cfg.session * 60) return { s: lockFor(s, "session", cfg.brk, now), lock: "session" };
  return { s, lock: null };
}
export function lockFor(s: WbState, kind: BreakKind, min: number, now: number): WbState {
  return { ...s, lockUntil: now + min * 60_000, lockKind: kind, session: 0 };
}
export const minutesToday = (s: WbState, now = Date.now()) => s.day === istToday(now) ? Math.floor(s.dayActive / 60) : 0;

const key = (uid: string) => `td-wb:${uid}`;
export function loadState(uid: string): WbState {
  try { const v = JSON.parse(localStorage.getItem(key(uid)) || "null"); if (v && typeof v === "object") return { ...blankState(), ...v }; } catch { /* storage off */ }
  return blankState();
}
export function saveState(uid: string, s: WbState) { try { localStorage.setItem(key(uid), JSON.stringify(s)); } catch { /* storage off */ } }

// Small event bus between the always-on break component and the pages.
export const showBreak = (kind: BreakKind) => window.dispatchEvent(new CustomEvent("td-break", { detail: kind }));
export const setWbConfig = (w: WbCfg) => window.dispatchEvent(new CustomEvent("td-wb-cfg", { detail: w }));
let lastMin: number | null = null;
export const announceMinutes = (m: number) => { lastMin = m; window.dispatchEvent(new CustomEvent("td-wb-min", { detail: m })); };
/** Minutes spent in the app today, updated every 15 seconds. */
export function useScreenMinutes() {
  const [m, setM] = useState<number | null>(lastMin);
  useEffect(() => { const f = (e: Event) => setM((e as CustomEvent<number>).detail); window.addEventListener("td-wb-min", f); if (lastMin != null) setM(lastMin); return () => window.removeEventListener("td-wb-min", f); }, []);
  return m;
}
