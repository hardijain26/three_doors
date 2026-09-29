import { test } from "node:test";
import assert from "node:assert/strict";
const W = await import("../lib/client/wellbeing.ts");
const P = await import("../lib/client/pipeline.ts");

const cfg = W.wbCfg({ session: 30, brk: 5, daily: 60 });
const T0 = Date.parse("2026-09-29T04:00:00Z"); // 09:30 in India

function run(s: any, from: number, steps: number, active = true) {
  let lock: any = null, t = from;
  for (let i = 0; i < steps && !lock; i++) { t += 15_000; const r = W.tick(s, cfg, t, true, active ? t - 1000 : t - 10 * 60_000); s = r.s; lock = r.lock; }
  return { s, lock, t };
}

test("break settings fall back to the tracker defaults and ignore odd values", () => {
  assert.deepEqual(W.wbCfg({}), { session: 45, brk: 10, daily: 120 });
  assert.deepEqual(W.wbCfg({ session: 7, brk: "x", daily: 999 }), { session: 45, brk: 10, daily: 120 });
});

test("30 minutes of use locks for the chosen break length", () => {
  const { s, lock, t } = run(W.blankState(), T0, 200);
  assert.equal(lock, "session");
  assert.equal(s.dayActive, 30 * 60);
  assert.equal(s.lockUntil - t, 5 * 60_000);
  assert.equal(s.session, 0);
  // still locked a minute later, free after 5
  assert.equal(W.tick(s, cfg, t + 60_000, true, t).lock, "session");
  assert.equal(W.tick(s, cfg, t + 5 * 60_000 + 1, true, t).lock, null);
});

test("idle time doesn't count and 10 minutes away resets the session", () => {
  let { s } = run(W.blankState(), T0, 40); // 10 minutes
  assert.equal(s.session, 600);
  s = run(s, T0 + 600_000, 10, false).s;
  assert.equal(s.session, 600, "no input for 2+ minutes: nothing counted");
  const r = W.tick(s, cfg, s.lastActive + 11 * 60_000, true, s.lastActive + 11 * 60_000 - 1000);
  assert.equal(r.s.session, 15, "back after 11 minutes: fresh session");
  assert.equal(r.s.dayActive, 615, "the day total keeps going");
});

test("daily limit locks for an hour, once a day, and resets on the next India day", () => {
  let s = { ...W.blankState(), day: W.istToday(T0), dayActive: 60 * 60 - 15, lastActive: T0, lastTick: T0 - 15_000 };
  let r = W.tick(s, cfg, T0 + 15_000, true, T0 + 14_000);
  assert.equal(r.lock, "daily");
  assert.equal(r.s.lockUntil, T0 + 15_000 + 60 * 60_000);
  s = { ...r.s, lockUntil: 0 };
  r = W.tick(s, cfg, T0 + 2 * 3.6e6, true, T0 + 2 * 3.6e6 - 1000);
  assert.notEqual(r.lock, "daily", "only once per day");
  const next = W.tick(r.s, cfg, Date.parse("2026-09-29T18:31:00Z"), true, Date.parse("2026-09-29T18:30:59Z")); // 00:01 India, next day
  assert.equal(next.s.day, "2026-09-30");
  assert.equal(next.s.dayActive, 15);
});

test("two open tabs don't double count the same step", () => {
  const a = W.tick(W.blankState(), cfg, T0, true, T0 - 1000).s;
  const b = W.tick(a, cfg, T0 + 2000, true, T0 + 1000).s; // other tab, 2 s later
  assert.equal(b.dayActive, 15);
});

test("next step counts from the status date, like the tracker's 'since' date", () => {
  const old = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), now = new Date().toISOString().slice(0, 10);
  const c: any = { status: "Request sent", status_history: { "Request sent": old }, status_on: now };
  assert.match(P.nextStep(c)[0], /Waiting on accept \(0d\)/);
  assert.equal(P.nextStep({ ...c, status_on: null })[0], "Pending 3 weeks: withdraw it");
  assert.equal(P.lastDate(c), now);
});
