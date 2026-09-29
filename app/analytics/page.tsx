"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { STEPS, daysSince, reached, today, type Contact, type Role } from "@/lib/client/pipeline.ts";

type Row = { c: Contact; r?: Role };
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);
function agg(list: Row[]) {
  const o = { found: 0, sent: 0, acc: 0, msg: 0, rep: 0, cof: 0, ref: 0 };
  for (const { c } of list) { const i = reached(c); if (i >= 0) o.found++; if (i >= 1) o.sent++; if (i >= 2) o.acc++; if (i >= 3) o.msg++; if (i >= 4) o.rep++; if (i >= 5) o.cof++; if (i >= 6) o.ref++; }
  return o;
}
const sentOn = (c: Contact) => c.status_history?.["Request sent"] || "";
const wkStart = (s: string) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

export default function Analytics() {
  const getSb = () => supabaseBrowser();
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { const sb = getSb(); Promise.all([sb.from("contacts").select("*"), sb.from("roles").select("*")]).then(([c, r]) => { const rm = Object.fromEntries((r.data ?? []).map((x: Role) => [x.id, x])); setRows((c.data ?? []).map((x: Contact) => ({ c: x, r: rm[x.role_id] }))); }); }, []);
  const A = useMemo(() => agg(rows ?? []), [rows]);
  if (!rows) return <p className="meta">Loading…</p>;
  const ar = pct(A.acc, A.sent);
  const stale = rows.filter(({ c }) => c.status === "Request sent" && daysSince(sentOn(c)) >= 21).length;
  const accDays = rows.filter(({ c }) => c.status_history?.Accepted && sentOn(c)).map(({ c }) => (Date.parse(c.status_history.Accepted) - Date.parse(sentOn(c))) / 864e5).sort((a, b) => a - b);
  const med = accDays.length ? accDays[Math.floor(accDays.length / 2)] : null;
  const health = A.sent < 5 ? null : ar >= 30 ? { t: "Healthy", c: "ok" } : { t: "Below 30%", c: "hot" };
  const funnel: [string, number][] = [["Found", A.found], ["Request sent", A.sent], ["Accepted", A.acc], ["Messaged", A.msg], ["Replied", A.rep], ["Coffee chat", A.cof], ["Referral given", A.ref]];
  const byType = [["hm", "Hiring managers"], ["rec", "Recruiters"], ["other", "Other departments"]].map(([k, l]) => [l, rows.filter(({ c }) => c.type === k)] as [string, Row[]]);
  const byFit = ["Strong", "Good", "Stretch"].map((f) => [f, rows.filter(({ r }) => r?.fit === f)] as [string, Row[]]);
  const insights: string[] = [];
  const t = byType.map(([l, g]) => { const a = agg(g); return [l, a.sent, pct(a.acc, a.sent)] as [string, number, number]; }).filter((x) => x[1] >= 5).sort((a, b) => b[2] - a[2]);
  if (t.length >= 2 && t[0][2] - t[t.length - 1][2] >= 10) insights.push(`${t[0][0]} accept ${t[0][2]}% of your requests; ${t[t.length - 1][0].toLowerCase()} only ${t[t.length - 1][2]}%. Rewrite the note for the lower group first.`);
  if (A.acc >= 5 && pct(A.rep, A.acc) < 30) insights.push(`Only ${pct(A.rep, A.acc)}% reply after accepting. The follow-up message is the weak step, not the connection note.`);
  if (A.sent >= 10 && A.ref === 0) insights.push(`No referrals yet from ${A.sent} requests. Reach the other-department contact before you apply; a referral after applying rarely counts.`);
  if (stale) insights.push(`${stale} request${stale > 1 ? "s have" : " has"} been pending 3+ weeks. Withdraw ${stale > 1 ? "them" : "it"} to protect your acceptance rate.`);

  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Analytics</h1><p>How your outreach is converting, from the statuses you set on each person.</p></div></div>
      {!A.sent && <div className="msg">Nothing to chart yet. When you mark someone as <b>Sent</b> on a role card, this page starts counting.</div>}
      <div className="kpis">
        <Kpi l="Requests sent" v={A.sent} />
        <Kpi l="Accepted" v={`${ar}%`} s={<>{A.acc} of {A.sent}{health && <> · <span className={`chip ${health.c}`}>{health.t}</span></>}</>} />
        <Kpi l="Replied" v={`${pct(A.rep, A.acc)}%`} s={`${A.rep} of ${A.acc} who accepted`} />
        <Kpi l="Referrals" v={A.ref} s={`${A.cof} coffee chat${A.cof === 1 ? "" : "s"}`} />
        <Kpi l="Days to accept" v={med == null ? "–" : Math.round(med)} s="median" />
        <Kpi l="Stale requests" v={stale} s={stale ? <span className="due">Withdraw these</span> : "none pending 3+ weeks"} />
      </div>
      {health?.c === "hot" && <div className="msg warn">LinkedIn may throttle accounts below about 30% acceptance. Send fewer, better-targeted notes.</div>}
      <section className="card stack">
        <h2>Where people drop off</h2>
        <p className="hint">Each bar is people who got at least that far; the percentage is how many made it from the step above.</p>
        <div className="funnel">{funnel.map(([l, n], i) => (
          <div className="frow" key={l} title={`${l}: ${n}`}><span className="flbl">{l}</span><span className="ftrack"><span className="fbar" style={{ width: `${A.found ? Math.max(n ? 2 : 0, (100 * n) / A.found) : 0}%` }} /></span><span className="fval">{n}{i > 0 && <em> {funnel[i - 1][1] ? `${pct(n, funnel[i - 1][1])}%` : "–"}</em>}</span></div>
        ))}</div>
      </section>
      <div className="grid wide">
        <Breakdown title="Which person accepts" groups={byType} />
        <Breakdown title="By role fit" groups={byFit} />
        <Weekly rows={rows} />
      </div>
      {insights.length > 0 && <section className="card stack"><h2>What the numbers say</h2><ul style={{ margin: 0, paddingLeft: 20 }} className="stack">{insights.map((s) => <li key={s}>{s}</li>)}</ul></section>}
    </div>
  );
}
function Kpi({ l, v, s }: { l: string; v: React.ReactNode; s?: React.ReactNode }) {
  return <div className="kpi card tight"><span className="eyebrow">{l}</span><span className="kv">{v}</span>{s && <span className="meta">{s}</span>}</div>;
}
function Breakdown({ title, groups }: { title: string; groups: [string, Row[]][] }) {
  return (
    <section className="card stack"><h2>{title}</h2>
      <div className="tscroll"><table><thead><tr><th>Group</th><th>Sent</th><th>Accept rate</th><th>Replied</th></tr></thead><tbody>
        {groups.map(([l, g]) => { const a = agg(g), r = pct(a.acc, a.sent); return (
          <tr key={l}><th scope="row" style={{ background: "none", font: "inherit", textTransform: "none", letterSpacing: 0, color: "var(--ink)" }}>{l}</th><td>{a.sent}</td>
            <td>{a.sent >= 5 ? <span className="row" style={{ gap: 6 }}><span className="mini" title={`${a.acc} of ${a.sent} accepted`}><span style={{ width: `${r}%` }} /></span>{r}%</span> : <span className="meta">{a.sent ? `${a.acc} of ${a.sent}` : "–"}</span>}</td><td>{a.rep}</td></tr>); })}
      </tbody></table></div>
      <p className="hint">Rates show once a group has 5 or more requests.</p>
    </section>
  );
}
function Weekly({ rows }: { rows: Row[] }) {
  const cur = wkStart(today()); const wk: [string, number][] = [];
  for (let i = 7; i >= 0; i--) { const d = new Date(cur + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 7 * i); wk.push([d.toISOString().slice(0, 10), 0]); }
  for (const { c } of rows) { const s = sentOn(c); if (!s) continue; const w = wkStart(s); const hit = wk.find((x) => x[0] === w); if (hit) hit[1]++; }
  const mx = Math.max(20, ...wk.map((x) => x[1])), W = 320, H = 160, pl = 28, pb = 22, bw = (W - pl) / 8, y = (v: number) => H - pb - ((H - pb - 8) * v) / mx;
  const lbl = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <section className="card stack"><h2>Requests per week</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="wk" role="img" aria-label={`Requests sent per week, last 8 weeks: ${wk.map(([d, n]) => `${lbl(d)} ${n}`).join(", ")}`}>
        {[0, Math.round(mx / 2), mx].map((v) => <g key={v}><line x1={pl} x2={W} y1={y(v)} y2={y(v)} className="gl" /><text x={pl - 6} y={y(v) + 4} className="ax" textAnchor="end">{v}</text></g>)}
        {wk.map(([d, n], i) => { const x = pl + i * bw + bw * 0.2, h = H - pb - y(n); return (
          <g key={d}><title>{`Week of ${lbl(d)}: ${n} sent`}</title><rect x={pl + i * bw} y={0} width={bw} height={H - pb} fill="transparent" />
            {n > 0 && <path d={`M${x} ${H - pb} V${y(n) + Math.min(4, h)} q0 -4 4 -4 h${bw * 0.6 - 8} q4 0 4 4 V${H - pb} Z`} className="bar" />}
            {(i % 2 === 1 || i === 7) && <text x={x + bw * 0.3} y={H - 6} className="ax" textAnchor="middle">{lbl(d)}</text>}</g>); })}
        <line x1={pl} x2={W} y1={y(15)} y2={y(15)} className="target" /><text x={W - 2} y={y(15) - 4} className="ax" textAnchor="end">target 15</text>
      </svg>
      <p className="hint">Aim for about 15 a week. LinkedIn's limit is around 100.</p>
    </section>
  );
}
