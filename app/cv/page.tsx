"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { runFeature, ApiError } from "@/lib/client/ai.ts";
import { useMe } from "@/lib/client/useMe.ts";
import { buildPrompt, PF_FORM, PF_PRESETS, esc, mdHtml, mdLines, nums, hasKw, TPLS, buildPdf } from "@/lib/client/legacy.js";
import { Icon } from "@/components/icons.tsx";

type Doc = { prompt_fields: Record<string, string> | null; prompt: string | null; source: string | null; master: string | null; master_diff: string[]; template: string };
type Job = { key: string; company: string; title: string; link: string | null; group: string };
const PRESETS: [string, string][] = [["pm", "Finance → Product Manager"], ["id", "Teacher → Instructional Designer"], ["cs", "Sales → Customer Success"], ["blank", "Start blank"]];

export default function CV() {
  const sb = supabaseBrowser(); const me = useMe();
  const [doc, setDoc] = useState<Doc | null>(null); const [fields, setFields] = useState<Record<string, string> | null>(null); const [editPrompt, setEditPrompt] = useState(false);
  const [source, setSource] = useState(""); const [master, setMaster] = useState<string | null>(null);
  const [career, setCareer] = useState<any>(null); const [jobs, setJobs] = useState<Job[]>([]);
  const [sel, setSel] = useState(""); const [jd, setJd] = useState(""); const [kw, setKw] = useState<string[]>([]); const [out, setOut] = useState(""); const [ana, setAna] = useState("");
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState<{ where: string; t: string; err?: boolean } | null>(null);

  useEffect(() => {
    Promise.all([sb.from("cv_docs").select("*").maybeSingle(), sb.from("career").select("*").maybeSingle(), sb.from("roles").select("id, company, title, link").is("archived_at", null), sb.from("openings").select("id, company, title, link").eq("state", "new")]).then(([d, c, r, o]: any[]) => {
      const dd: Doc = d.data ?? { prompt_fields: null, prompt: null, source: "", master: "", master_diff: [], template: "classic" };
      setDoc(dd); setSource(dd.source ?? ""); setCareer(c.data);
      setJobs([...(r.data ?? []).map((x: any) => ({ key: `r-${x.id}`, company: x.company, title: x.title, link: x.link, group: "Roles" })), ...(o.data ?? []).map((x: any) => ({ key: `o-${x.id}`, company: x.company, title: x.title, link: x.link, group: "Openings" }))]);
    });
  }, []);
  const v = fields ?? doc?.prompt_fields ?? PF_PRESETS.blank;
  const saved = !!doc?.prompt_fields;
  const masterText = master ?? doc?.master ?? "";
  const job = jobs.find((j) => j.key === sel);
  const okSkills = (career?.skills ?? []).filter((s: any) => s.ok);
  const badNums = useMemo(() => { if (!out) return []; const base = new Set<string>(); nums(masterText).forEach((n) => { base.add(n); base.add(n.replace(/[%kmx+]$/, "")); }); return [...new Set(nums(out).filter((n) => !base.has(n)))]; }, [out, masterText]);
  if (!doc) return <p className="meta">Loading…</p>;

  async function upsertDoc(patch: Partial<Doc> & Record<string, unknown>) {
    const { data: u } = await sb.auth.getUser();
    const next = { ...doc!, ...patch }; setDoc(next as Doc);
    const { error } = await sb.from("cv_docs").upsert({ user_id: u.user!.id, ...next, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
  const fail = (where: string, e: unknown) => setMsg({ where, t: e instanceof ApiError ? e.message : "That didn't work. Try again.", err: true });
  async function makeMaster(refresh: boolean, promptFields = v) {
    const old = doc!.master ?? "";
    if (!refresh && !source.trim() && !(career?.steps ?? []).some((s: any) => s.title || s.org)) { setMsg({ where: "master", t: "Paste your resume or fill in your Career path first. The AI can only use what you give it.", err: true }); return; }
    setBusy("master"); setMsg(null);
    try {
      const r = await runFeature<{ md: string }>("cv_master", { fields: promptFields, source, steps: career?.steps ?? [], me, skills: okSkills, old, refresh });
      const before = mdLines(old);
      const diff = old.trim() ? r.md.split("\n").map((l) => l.trim()).filter((t) => t && !before[t]).slice(0, 300) : [];
      await upsertDoc({ master: r.md, source, master_diff: diff, master_at: new Date().toISOString() });
      setMaster(null);
    } catch (e) { fail("master", e); }
    setBusy("");
  }
  async function savePrompt() {
    if (!(v.role || "").trim()) { setMsg({ where: "prompt", t: "Add your main target role first.", err: true }); return; }
    const hadMaster = !!(doc!.master || "").trim() && saved;
    try { await upsertDoc({ prompt_fields: v, prompt: buildPrompt(v, false), prompt_at: new Date().toISOString() }); setFields(null); setEditPrompt(false); if (hadMaster) makeMaster(true, v); }
    catch (e) { fail("prompt", e); }
  }
  async function selectJob(key: string) {
    setSel(key); setJd(""); setKw([]); setOut(""); setAna(""); setMsg(null);
    if (!key) return;
    const { data } = await sb.from("cv_versions").select("*").eq("job_key", key).maybeSingle();
    if (data) { setJd(data.jd ?? ""); setKw(data.keywords ?? []); setOut(data.md ?? ""); setAna(data.analysis ?? ""); }
  }
  async function saveVersion(patch: Record<string, unknown>) {
    if (!job) return; const { data: u } = await sb.auth.getUser();
    await sb.from("cv_versions").upsert({ user_id: u.user!.id, job_key: job.key, company: job.company, title: job.title, link: job.link, jd, keywords: kw, md: out, analysis: ana, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,job_key" });
  }
  async function keywords(text = jd) {
    if (text.trim().length < 80) return;
    setBusy("kw"); setMsg(null);
    try { const r = await runFeature<{ keywords: string[] }>("cv_keywords", { jd: text }); setKw(r.keywords); saveVersion({ jd: text, keywords: r.keywords }); } catch (e) { fail("tailor", e); }
    setBusy("");
  }
  async function tailor() {
    if (!job) return; setBusy("tailor"); setMsg(null); setOut(""); setAna("");
    try {
      const r = await runFeature<{ analysis: string; md: string }>("cv_tailor", { prompt: doc!.prompt || buildPrompt(v, false), master: masterText, jd, company: job.company, title: job.title, skills: okSkills });
      setOut(r.md); setAna(r.analysis); saveVersion({ md: r.md, analysis: r.analysis });
    } catch (e) { fail("tailor", e); }
    setBusy("");
  }
  const fileBase = () => `${(me?.first_name || "CV").replace(/[^A-Za-z0-9]+/g, "-")}-CV-${(job?.company || "tailored").replace(/[^A-Za-z0-9]+/g, "-")}`;
  function download(blob: Blob, name: string) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  async function pdf() { const lib = await import("jspdf"); const d = buildPdf(out, lib, doc!.template || "classic"); download(new Blob([d.output("arraybuffer")], { type: "application/pdf" }), `${fileBase()}-${TPLS[doc!.template || "classic"].name.split(" ")[0]}.pdf`); }
  const preview = esc(buildPrompt(v, true)).replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>");
  const M = (where: string) => msg?.where === where ? <span className={msg.err ? "due" : "meta"} role="status">{msg.t}</span> : null;
  const diffMap = Object.fromEntries((doc.master_diff ?? []).map((x) => [x, 1]));
  const ready = saved && masterText.trim();

  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>CV</h1><p>Build one master prompt and one master resume, then cut a tailored version for each job. Every fact and number stays as you wrote it.</p></div></div>
      <ol className="cvsteps"><li className={saved ? "done" : "now"}>Master prompt</li><li className={masterText.trim() ? "done" : saved ? "now" : ""}>Master resume</li><li className={ready ? "now" : ""}>Customise and download</li></ol>

      {(!saved || editPrompt || fields) ? (
        <section className="card stack">
          <h2>1. Build your master prompt</h2>
          <p className="hint">Fill in the fields and the page writes your prompt. Anything you leave empty tells the AI to work it out and state its assumption.</p>
          <div className="row"><span className="meta">Start from an example:</span>{PRESETS.map(([k, l]) => <button key={k} className="chipbtn" onClick={() => setFields({ ...PF_PRESETS[k] })}>{l}</button>)}</div>
          <div className="pfgrid">
            <div className="stack">
              {PF_FORM.map(([legend, fs]) => (
                <fieldset key={legend} className="stack" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}><legend className="eyebrow" style={{ padding: "0 6px" }}>{legend}</legend>
                  {fs.map(([id, label, ph, kind, extra]) => (
                    <label key={id} className="f">{label}{extra === 1 && <span className="chip hot" style={{ alignSelf: "flex-start" }}>needed</span>}
                      {kind === "area" ? <textarea rows={3} value={v[id] ?? ""} placeholder={ph} onChange={(e) => setFields({ ...v, [id]: e.target.value })} /> : <input value={v[id] ?? ""} placeholder={ph} onChange={(e) => setFields({ ...v, [id]: e.target.value })} />}
                      {typeof extra === "string" && <span className="hint" style={{ fontWeight: 400 }}>{extra}</span>}
                    </label>))}
                </fieldset>))}
              <fieldset className="row" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}><legend className="eyebrow" style={{ padding: "0 6px" }}>Format</legend>
                <label className="f" style={{ flex: 1 }}>Length<select value={v.pages} onChange={(e) => setFields({ ...v, pages: e.target.value })}><option value="1">1 page</option><option value="2">2 pages</option></select></label>
                <label className="f" style={{ flex: 1 }}>Spelling<select value={v.spelling} onChange={(e) => setFields({ ...v, spelling: e.target.value })}>{["US English", "UK English", "Indian English"].map((s) => <option key={s}>{s}</option>)}</select></label>
                <label className="f" style={{ flex: 1 }}>Analysis<select value={v.mode} onChange={(e) => setFields({ ...v, mode: e.target.value })}><option value="short">Short: verdict, gaps, resume</option><option value="full">Full: 12-section analysis</option></select></label>
              </fieldset>
            </div>
            <div className="stack">
              <div className="row between"><h3>Your prompt</h3><span className="meta">{buildPrompt(v, false).split(/\s+/).length.toLocaleString()} words</span></div>
              <div className="row"><button className="primary" onClick={savePrompt}>Save master prompt</button>{saved && <button onClick={() => { setFields(null); setEditPrompt(false); }}>Cancel</button>}{M("prompt")}</div>
              <pre className="pfpre" dangerouslySetInnerHTML={{ __html: preview }} />
              <p className="hint">Highlighted text came from your fields.</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="card row between"><div className="row"><span className="chip ok"><Icon name="check" />Master prompt saved</span><span className="meta">{doc.prompt_fields?.role}</span></div><button className="link" onClick={() => setEditPrompt(true)}>Edit</button></section>
      )}

      <section className={`card stack${saved ? "" : " locked"}`}>
        <h2>2. Your master resume</h2>
        {!saved ? <p className="hint">Save your master prompt first.</p> : <>
          <p className="hint">Paste your current resume or LinkedIn profile text. The AI combines it with your Career path and Profile into one complete master resume. Every customised version is cut from this.</p>
          <textarea rows={7} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Paste your current resume or LinkedIn profile text here" />
          <div className="row"><button className="primary" disabled={!!busy} onClick={() => makeMaster(false)}>{busy === "master" ? <><span className="spin" aria-hidden="true" />Writing your master resume…</> : masterText.trim() ? "Recreate master resume" : <><Icon name="sparkles" />Create my master resume</>}</button>{M("master")}</div>
          {(doc.master_diff?.length ?? 0) > 0 && master == null && <div className="msg row between"><span>Your master resume was updated to match your new master prompt. {doc.master_diff.length} line{doc.master_diff.length > 1 ? "s" : ""} changed, highlighted below. Every fact and number was kept.</span><button onClick={() => upsertDoc({ master_diff: [] })}>Got it</button></div>}
          {masterText.trim() && <div className="cvpanes">
            <label className="f">Master resume (Markdown, you can edit it)<textarea rows={18} value={masterText} onChange={(e) => setMaster(e.target.value)} /></label>
            <div className="stack"><span className="f">Preview</span><div className="cvpreview" dangerouslySetInnerHTML={{ __html: mdHtml(masterText, [], master == null ? diffMap : null) }} /></div>
          </div>}
          {master != null && <div className="row"><button className="primary" onClick={async () => { await upsertDoc({ master, master_diff: [], master_at: new Date().toISOString() }); setMaster(null); }}>Save master resume</button><span className="meta">Unsaved changes</span></div>}
        </>}
      </section>

      <section className={`card stack${ready ? "" : " locked"}`}>
        <h2>3. Customise for a job</h2>
        {!ready ? <p className="hint">Your master resume comes first.</p> : <>
          <label className="f">Job<select value={sel} onChange={(e) => selectJob(e.target.value)}><option value="">Choose a job</option>
            {["Roles", "Openings"].map((g) => { const js = jobs.filter((j) => j.group === g); return js.length ? <optgroup key={g} label={g}>{js.map((j) => <option key={j.key} value={j.key}>{j.company} · {j.title}</option>)}</optgroup> : null; })}</select></label>
          {job && <>
            <p className="meta">{job.link?.startsWith("https://") ? <><a href={job.link} target="_blank" rel="noopener noreferrer">Open the job post</a>, copy the description, and paste it below. Keywords are marked as soon as you paste.</> : "Paste the job description below."}</p>
            <textarea rows={7} value={jd} onChange={(e) => setJd(e.target.value)} onPaste={(e) => { const t = e.clipboardData.getData("text"); setTimeout(() => keywords((jd + t).trim()), 50); }} onBlur={() => saveVersion({ jd })} placeholder="Paste the full job description here" />
            {kw.length > 0 && <div className="stack">
              <div className="row"><span className="meta">In your master resume ({kw.filter((k) => hasKw(masterText, k)).length}):</span>{kw.filter((k) => hasKw(masterText, k)).map((k) => <span key={k} className="chip ok">{k}</span>)}</div>
              <div className="row"><span className="meta">Missing ({kw.filter((k) => !hasKw(masterText, k)).length}). Add them to your master resume only if they're true:</span>{kw.filter((k) => !hasKw(masterText, k)).map((k) => <span key={k} className="chip warn">{k}</span>)}</div>
            </div>}
            <div className="row">
              <button className="primary" disabled={!!busy || jd.trim().length < 80} onClick={tailor}>{busy === "tailor" ? <><span className="spin" aria-hidden="true" />Customising…</> : <><Icon name="sparkles" />Customise</>}</button>
              <button disabled={!!busy || jd.trim().length < 80} onClick={() => keywords()}>{busy === "kw" ? "Finding keywords…" : "Highlight keywords"}</button>{M("tailor")}
            </div>
          </>}
        </>}
      </section>

      {ready && job && out && (
        <section className="card stack">
          <div className="row between"><h2 style={{ margin: 0 }}>Your resume for {job.company}</h2><div className="row"><button className="primary" onClick={pdf}><Icon name="download" />Download PDF</button><button onClick={() => download(new Blob([out], { type: "text/markdown" }), `${fileBase()}.md`)}>Download .md</button></div></div>
          {badNums.length ? <div className="msg err">Check before sending: {badNums.join(", ")} {badNums.length > 1 ? "are" : "is"} not in your master resume. Fix or delete {badNums.length > 1 ? "them" : "it"} below.</div> : <div className="msg ok">Every number in this version is in your master resume.</div>}
          <div className="stack"><span className="meta">Template for the PDF. All three are single-column text that applicant tracking systems read cleanly.</span>
            <div className="tplpick" role="radiogroup" aria-label="CV template">{Object.entries(TPLS).map(([k, T]) => (
              <button key={k} role="radio" aria-checked={doc.template === k} className={`tplcard${doc.template === k ? " on" : ""}`} onClick={() => upsertDoc({ template: k })}><b>{T.name}</b><small>{T.desc}</small></button>))}</div></div>
          {ana && <details open><summary>Fit verdict, gaps and claims to confirm</summary><div className="cvpreview" dangerouslySetInnerHTML={{ __html: mdHtml(ana, []) }} /></details>}
          <div className="cvpanes">
            <label className="f">Markdown (you can edit it)<textarea rows={22} value={out} onChange={(e) => setOut(e.target.value)} onBlur={() => saveVersion({ md: out })} /></label>
            <div className="stack"><span className="f">Preview, with the job's keywords marked</span><div className="cvpreview" dangerouslySetInnerHTML={{ __html: mdHtml(out, kw) }} /></div>
          </div>
        </section>
      )}
    </div>
  );
}
