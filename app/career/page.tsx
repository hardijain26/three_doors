"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { runFeature, ApiError } from "@/lib/client/ai.ts";
import { durOf, fmtDur, stepName, evOk } from "@/lib/client/legacy.js";
import { Icon } from "@/components/icons.tsx";

type Step = { title: string; org: string; years: string; did: string };
type Skill = { skill: string; from: string[]; evidence: string; why: string; cvLine: string; ok: boolean };
type Career = { target: string; steps: Step[]; skills: Skill[]; gaps: string[]; bridge: string };
const blank = (): Career => ({ target: "", steps: [{ title: "", org: "", years: "", did: "" }, { title: "", org: "", years: "", did: "" }], skills: [], gaps: [], bridge: "" });

export default function CareerPage() {
  const sb = supabaseBrowser();
  const [c, setC] = useState<Career | null>(null); const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const drag = useRef<{ from: number; over: number | null } | null>(null); const [over, setOver] = useState<number | null>(null);
  useEffect(() => { sb.from("career").select("*").maybeSingle().then(({ data }: any) => setC(data ? { target: data.target ?? "", steps: data.steps?.length ? data.steps : blank().steps, skills: data.skills ?? [], gaps: data.gaps ?? [], bridge: data.bridge ?? "" } : blank())); }, []);
  if (!c) return <p className="meta">Loading…</p>;
  const set = (patch: Partial<Career>) => { setC({ ...c, ...patch }); setDirty(true); setMsg(null); };
  const setStep = (i: number, patch: Partial<Step>) => set({ steps: c.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  async function save(next = c!) {
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb.from("career").upsert({ user_id: u.user!.id, ...next, updated_at: new Date().toISOString() });
    if (error) setMsg({ t: "Saving failed. Try again.", err: true }); else { setDirty(false); setMsg({ t: "Saved." }); }
  }
  async function find() {
    if (!c!.steps.some((s) => s.did.trim())) { setMsg({ t: "Write what you did in at least one step first. The AI can only use what you write.", err: true }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await runFeature<{ bridge: string; skills: Skill[]; gaps: string[] }>("career_skills", { target: c!.target, steps: c!.steps });
      const next = { ...c!, ...r }; setC(next); await save(next);
    } catch (e) { setMsg({ t: e instanceof ApiError ? e.message : "That didn't work. Try again.", err: true }); }
    setBusy(false);
  }
  const known = c.steps.filter((s) => durOf(s.years) != null);
  const total = Math.round(known.reduce((a, s) => a + (durOf(s.years) || 0), 0) * 10) / 10;
  const onDown = (i: number) => (e: React.PointerEvent) => { e.preventDefault(); drag.current = { from: i, over: null }; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onMove = (e: React.PointerEvent) => { if (!drag.current) return; const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-step]") as HTMLElement | null; const to = el ? Number(el.dataset.step) : null; drag.current.over = to; setOver(to); };
  const onUp = () => { const d = drag.current; drag.current = null; setOver(null); if (d && d.over != null && d.over !== d.from) { const st = [...c.steps]; const [it] = st.splice(d.from, 1); st.splice(d.over, 0, it); set({ steps: st }); } };

  return (
    <div className="stack-lg" onPointerMove={onMove} onPointerUp={onUp}>
      <div className="page-head"><div><h1>Career path</h1><p>List every step, including the ones that look unrelated. The AI finds the skills that carry over, and every skill must point to something you wrote.</p></div></div>
      <section className="card stack">
        <label className="f">Where you're heading<input value={c.target} placeholder="e.g. Product Manager at SaaS and AI companies" onChange={(e) => set({ target: e.target.value })} /></label>
      </section>
      <section className="card stack">
        <div className="row between"><h2 style={{ margin: 0 }}>Your path</h2>{known.length > 0 && <span className="chip">{fmtDur(total)} across {known.length} step{known.length > 1 ? "s" : ""}</span>}</div>
        <div className="row" style={{ gap: 6 }}>{c.steps.map((s, i) => <span key={i} className="row" style={{ gap: 6 }}><span className="chip mute">{stepName(s, i)}</span><Icon name="arrow" /></span>)}<span className="chip ok">{c.target || "Next role"}</span></div>
        <p className="hint">Drag a step by its handle to change the order. Put them in the order you want to tell them.</p>
        {c.steps.map((s, i) => { const du = durOf(s.years); return (
          <div key={i} data-step={i} className={`pbox${over === i ? " dropover" : ""}`}>
            <div className="row">
              <span className="grip" onPointerDown={onDown(i)} title="Drag to reorder" aria-label={`Drag to reorder step ${i + 1}`} role="button" tabIndex={0}>⋮⋮</span>
              <span className="chip">{i + 1}</span>
              <input style={{ flex: "1 1 160px", width: "auto" }} value={s.title} placeholder="Job title" aria-label="Job title" onChange={(e) => setStep(i, { title: e.target.value })} />
              <input style={{ flex: "1 1 160px", width: "auto" }} value={s.org} placeholder="Company or field" aria-label="Company or field" onChange={(e) => setStep(i, { org: e.target.value })} />
              <input style={{ flex: "0 1 190px", width: "auto" }} value={s.years} placeholder="2019 to 2021, or 2.5 yrs" aria-label="Dates or length" onChange={(e) => setStep(i, { years: e.target.value })} />
              {du != null && <span className="chip ok">{fmtDur(du)}</span>}
              <button className="link" onClick={() => set({ steps: c.steps.filter((_, j) => j !== i) })}>Remove</button>
            </div>
            <textarea rows={3} value={s.did} aria-label="What you did" placeholder="What you did there, with numbers. For example: audited revenue recognition for 6 clients; built a variance model the finance team used monthly." onChange={(e) => setStep(i, { did: e.target.value })} />
          </div>); })}
        <div className="row">
          <button onClick={() => set({ steps: [...c.steps, { title: "", org: "", years: "", did: "" }] })}><Icon name="plus" />Add a step</button>
          <button className={dirty ? "primary" : ""} disabled={!dirty} onClick={() => save()}>{dirty ? "Save" : "Saved"}</button>
          <button className="accent" disabled={busy} onClick={find}>{busy ? <><span className="spin" aria-hidden="true" />Finding skills…</> : <><Icon name="sparkles" />Find my transferable skills</>}</button>
          {msg && <span className={msg.err ? "due" : "meta"} role="status">{msg.t}</span>}
        </div>
      </section>
      {c.bridge && <section className="card stack"><h2>Your bridge line</h2><p className="note">{c.bridge}</p><div className="row"><button onClick={() => navigator.clipboard.writeText(c.bridge)}><Icon name="copy" />Copy</button><span className="hint">Use it in your LinkedIn About, CV summary, or "walk me through your background".</span></div></section>}
      {c.skills.length > 0 && (
        <section className="card stack">
          <h2>Transferable skills</h2>
          <p className="hint">Tick the ones that are true for you; ticked skills go into your CV. A red evidence line means the quote couldn't be found in what you wrote, so check it first.</p>
          <div className="tscroll"><table><thead><tr><th>Skill</th>{c.steps.map((s, i) => <th key={i} style={{ textAlign: "center" }}>{stepName(s, i)}</th>)}<th>True</th></tr></thead><tbody>
            {c.skills.map((sk, si) => (
              <tr key={si}><td><b>{sk.skill}</b></td>
                {c.steps.map((s, i) => { const on = sk.from.some((f) => f.toLowerCase() === stepName(s, i).toLowerCase()); return <td key={i} style={{ textAlign: "center" }}>{on ? <span className="dotmark" title={`From ${stepName(s, i)}`} /> : null}</td>; })}
                <td><input type="checkbox" style={{ width: 20, minHeight: 20 }} checked={sk.ok} aria-label={`${sk.skill} is true for me`} onChange={(e) => { const next = { ...c, skills: c.skills.map((x, j) => (j === si ? { ...x, ok: e.target.checked } : x)) }; setC(next); save(next); }} /></td></tr>))}
          </tbody></table></div>
          <div className="grid">{c.skills.map((sk, si) => { const ok = evOk(sk, c); return (
            <div key={si} className="pbox"><h3>{sk.skill}</h3>
              <p className={ok ? "hint" : "due"} style={{ fontSize: 13.5 }}>{ok ? "From what you wrote: " : "Check this, not found in your notes: "}"{sk.evidence}"</p>
              <p className="meta">{sk.why}</p>
              <div className="row between"><span style={{ fontSize: 14 }}>{sk.cvLine}</span><button className="link" onClick={() => navigator.clipboard.writeText(sk.cvLine)}>Copy CV line</button></div>
            </div>); })}</div>
        </section>
      )}
      {c.gaps.length > 0 && <section className="card stack"><h2>Gaps to close</h2><p className="hint">Skills this kind of role usually asks for that none of your steps shows yet. Close them with a project or course, or say how you'd learn them.</p><ul style={{ margin: 0, paddingLeft: 20 }}>{c.gaps.map((g) => <li key={g}>{g}</li>)}</ul></section>}
    </div>
  );
}
