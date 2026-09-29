"use client";
import Link from "next/link";
import { Icon } from "@/components/icons.tsx";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { runFeature, ApiError } from "@/lib/client/ai.ts";
import { STEPS, SHORT, nextStep, reached, searchUrl, today, typeLabel, type Contact, type ContactType, type Role } from "@/lib/client/pipeline.ts";

const TYPES: [ContactType, string, string][] = [
  ["hm", "Hiring manager", "The person you'd report to, usually the Head of Product or a Group PM."],
  ["rec", "Recruiter", "The recruiter or talent partner hiring for this team."],
  ["other", "Someone in another department", "An engineer, designer or marketer who can tell you how the work runs and refer you."],
];

export default function RolePage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const sb = supabaseBrowser();
  const [role, setRole] = useState<Role | null>(null); const [cs, setCs] = useState<Contact[]>([]); const [me, setMe] = useState<any>({});
  const [adding, setAdding] = useState<{ type: ContactType | ""; dept: string } | null>(null); const [delRole, setDelRole] = useState(false);
  async function load() {
    const [r, c, u] = await Promise.all([sb.from("roles").select("*").eq("id", id).single(), sb.from("contacts").select("*").eq("role_id", id).order("created_at"), sb.auth.getUser()]);
    setRole(r.data); setCs(c.data ?? []);
    if (u.data.user) { const { data } = await sb.from("profiles").select("first_name,last_role,last_company,owned,results,background").eq("id", u.data.user.id).single(); setMe(data ?? {}); }
  }
  useEffect(() => { load(); }, [id]);
  if (!role) return <p className="meta">Loading…</p>;
  const have = new Set(cs.map((c) => c.type));
  const missing = TYPES.filter(([t]) => !have.has(t)).map(([, l]) => l.toLowerCase());
  async function addPerson() {
    if (!adding?.type || (adding.type === "other" && !adding.dept.trim())) return;
    const { error } = await sb.from("contacts").insert({ role_id: id, type: adding.type, dept: adding.type === "other" ? adding.dept.trim() : null, status: "Found", status_history: { Found: today() } });
    if (!error) { sb.rpc("track_event", { p_event: "contact_created", p_props: { contact_type: adding.type } }).then(() => {}, () => {}); setAdding(null); load(); }
  }
  return (
    <div className="stack">
      <Link href="/roles" className="row meta" style={{ gap: 6, width: "fit-content" }}><Icon name="back" />All roles</Link>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h1>{role.company} · {role.title}</h1><div className="meta">{role.location}{role.link && <> · <a href={role.link} target="_blank" rel="noopener noreferrer">Job post</a></>}</div></div>
        {role.fit && <span className={`chip${role.fit === "Strong" ? " ok" : role.fit === "Stretch" ? " warn" : ""}`}>{role.fit}</span>}
      </div>
      <div className="grid">
        {cs.map((c) => <Person key={c.id} c={c} role={role} me={me} reload={load} />)}
        <div className="pbox add">
          {!adding ? <><button className="primary block" onClick={() => setAdding({ type: "", dept: "" })}><Icon name="plus" />Add person</button><p className="hint">{missing.length ? `Still to find: ${missing.join(", ")}.` : "All three kinds of contact are covered."}</p></> : (
            <div className="stack">
              <b>Who is this person?</b>
              {TYPES.map(([t, l, h]) => <label key={t} className={`opt${adding.type === t ? " on" : ""}`}><input type="radio" name="ptype" checked={adding.type === t} onChange={() => setAdding({ ...adding, type: t })} /><span><b>{l}</b><br /><span className="hint">{h}</span></span></label>)}
              {adding.type === "other" && <label className="f">Which department? (needed)<input autoFocus value={adding.dept} placeholder="e.g. Engineering, Design, Marketing" onChange={(e) => setAdding({ ...adding, dept: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") addPerson(); }} /></label>}
              <div className="row">
                {adding.type && (adding.type !== "other" || adding.dept.trim()) && <a className="btn" href={searchUrl(role.company, adding.type, adding.dept)} target="_blank" rel="noopener noreferrer"><Icon name="search" />Search LinkedIn</a>}
                <button className="primary" disabled={!adding.type || (adding.type === "other" && !adding.dept.trim())} onClick={addPerson}>Continue</button>
                <button className="link" onClick={() => setAdding(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="row">{delRole ? <button className="danger" onClick={async () => { if (role.opening_id) await sb.from("openings").update({ state: "new" }).eq("id", role.opening_id); await sb.from("roles").delete().eq("id", id); router.push("/roles"); }}>Click again: delete this role and its people</button> : <button className="danger" onClick={() => setDelRole(true)}>Delete role</button>}</div>
    </div>
  );
}

function Person({ c, role, me, reload }: { c: Contact; role: Role; me: any; reload: () => void }) {
  const sb = supabaseBrowser();
  const [edit, setEdit] = useState(!c.name); const [d, setD] = useState({ name: c.name ?? "", title: c.title ?? "", linkedin_url: c.linkedin_url ?? "", email: c.email ?? "" });
  const [paste, setPaste] = useState(""); const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [note, setNote] = useState(""); const [mutual, setMutual] = useState("");
  const cur = reached(c); const [ns, due] = nextStep(c);
  const ctx = { type: c.type, dept: c.dept, name: c.name, roleTitle: role.title, company: role.company };
  const save = async (patch: Partial<Contact>) => { await sb.from("contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", c.id); reload(); };
  const setStatus = (s: string) => { save({ status: s, status_history: { ...c.status_history, [s]: c.status_history?.[s] || today() } }); sb.rpc("track_event", { p_event: "contact_status_changed", p_props: { to_status: s.replace(/\s+/g, "_") } }).then(() => {}, () => {}); };
  async function ai<T>(feature: string, input: unknown, label: string): Promise<T | null> {
    setBusy(label); setErr("");
    try { return await runFeature<T>(feature, input); } catch (e) { setErr(e instanceof ApiError ? e.message : "That didn't work."); return null; } finally { setBusy(""); }
  }
  async function commonGround() {
    const r = await ai<{ name: string; title: string; email: string; website: string; points: any[]; followup: string }>("common_ground", { contact: ctx, me, profileText: paste }, "Reading their profile…");
    if (!r) return;
    const patch: Partial<Contact> = { common: r.points, followup: r.followup };
    if (!c.name && r.name) patch.name = r.name; if (!c.title && r.title) patch.title = r.title; if (!c.email && r.email) patch.email = r.email;
    setPaste(""); save(patch);
  }
  const first = (c.name || "").split(/\s+/)[0] || "there";
  const coffee = c.type === "rec" ? `Thanks, ${first}. Would you have 15 minutes this week or next for a quick call about the ${role.title} role? I'd like to understand what the hiring team is weighing most.` : `Thanks, ${first}. Would you have 20 minutes in the next week or two for a quick call? I'd like to hear how ${c.type === "hm" ? "your team" : `the ${c.dept} team`} works and what the ${role.title} role most needs to get right early on.`;
  const referral = `Thanks again for the call, ${first}. It helped, especially {what they told you}. ` + (c.type === "other" ? `I'm applying for the ${role.title} role. If you're comfortable, would you refer me? I can send my CV and a two-line summary.` : `I've applied for the ${role.title} role. If you think I'd fit, would you put my application forward?`);
  return (
    <div className="pbox">
      <div className="row" style={{ justifyContent: "space-between" }}><span className="eyebrow">{typeLabel(c)}</span><a className="btn iconbtn" href={searchUrl(role.company, c.type, c.dept)} target="_blank" rel="noopener noreferrer" title={`Search LinkedIn for this ${typeLabel(c).toLowerCase()}`}><Icon name="search" label={`Search LinkedIn for this ${typeLabel(c).toLowerCase()}`} /></a></div>
      {edit ? (
        <div className="stack">
          <label className="f">LinkedIn profile link<input value={d.linkedin_url} placeholder="linkedin.com/in/…" onChange={(e) => { const u = e.target.value; const m = u.match(/linkedin\.com\/in\/([^/?#\s]+)/i); setD({ ...d, linkedin_url: u, name: d.name || (m ? decodeURIComponent(m[1]).split("-").filter((x) => x && !/\d/.test(x)).map((x) => x[0].toUpperCase() + x.slice(1)).join(" ") : "") }); }} /></label>
          <label className="f">Name<input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
          <label className="f">Job title<input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
          <label className="f">Email, only if they publish it<input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></label>
          <div className="row"><button className="primary" disabled={!d.name.trim()} onClick={() => { save({ ...d, linkedin_url: d.linkedin_url || null, email: d.email || null }); setEdit(false); }}>Done</button><button className="link" onClick={async () => { await sb.from("contacts").delete().eq("id", c.id); reload(); }}>Remove</button></div>
        </div>
      ) : (<>
        <div><b>{c.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer">{c.name}</a> : c.name}</b>{c.title && <div className="meta">{c.title}</div>}{c.email && <div className="meta">{c.email}</div>}</div>
        <div className="stepper" role="group" aria-label="Status">
          {STEPS.map((s, i) => { const at = c.status_history?.[s]; return (
            <button key={s} className={`stp${cur >= i && c.status !== "Closed" ? " done" : ""}${c.status === s ? " now" : ""}`} onClick={() => setStatus(s)} title={s}>
              <span className="dot" /><span className="slab">{SHORT[s] ?? s}</span>{at && <span className="sdate">{at.slice(5)}</span>}
            </button>); })}
        </div>
        <div className={`msg${due && c.status !== "Closed" ? " err" : ""}`}>{ns}</div>
        {c.common && c.common.length > 0 && <div className="common"><span className="meta">In common</span><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{c.common.map((p, i) => <li key={i}>{p.point} {p.from && <span className="src">{p.from}</span>}</li>)}</ul></div>}
        {c.followup && <details open={c.status === "Accepted"}><summary className={c.status === "Accepted" ? "due" : ""}>{c.status === "Accepted" ? "Send this follow-up today" : "Follow-up for when they accept"}</summary><p className="note">{c.followup}</p><button onClick={() => navigator.clipboard.writeText(c.followup!)}><Icon name="copy" />Copy</button></details>}
        {cur >= 4 && c.status !== "Closed" && <details open={c.status === "Replied"}><summary>Ask for a coffee chat</summary><p className="note">{coffee}</p><button onClick={() => navigator.clipboard.writeText(coffee)}><Icon name="copy" />Copy</button></details>}
        {cur >= 5 && c.status !== "Closed" && <details open={c.status === "Coffee chat"}><summary>{c.type === "other" ? "Ask for a referral" : "Ask them to put you forward"}</summary><p className="note">{referral}</p><p className="hint">Replace anything in braces before sending.</p><button onClick={() => navigator.clipboard.writeText(referral)}><Icon name="copy" />Copy</button></details>}
        <details open={cur < 1}><summary>Connection note</summary>
          <div className="stack" style={{ marginTop: 6 }}>
            <label className="f">Mutual connection (optional)<input value={mutual} onChange={(e) => setMutual(e.target.value)} /></label>
            <button className="primary" disabled={!!busy} onClick={async () => { const r = await ai<{ note: string }>("connection_note", { contact: ctx, me, mutual }, "Drafting…"); if (r) setNote(r.note); }}>{busy === "Drafting…" ? <><span className="spin" aria-hidden="true" />Drafting…</> : <><Icon name="sparkles" />Draft with my AI</>}</button>
            {note && <><p className="note">{note}</p><div className="row"><span className="meta">{note.length} / 300</span><button onClick={() => navigator.clipboard.writeText(note)}><Icon name="copy" />Copy note</button></div></>}
          </div>
        </details>
        <details><summary>Find common ground</summary>
          <div className="stack" style={{ marginTop: 6 }}>
            <p className="hint">LinkedIn doesn't let other apps read profiles. Open theirs, press Cmd+A then Cmd+C, and paste here. It's sent to your AI provider for this one request and not stored.</p>
            <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste their LinkedIn page" />
            <button disabled={!!busy || paste.trim().length < 50} onClick={commonGround}>{busy === "Reading their profile…" ? <><span className="spin" aria-hidden="true" />Reading their profile…</> : <><Icon name="sparkles" />Find common ground</>}</button>
          </div>
        </details>
        <label className="f">Notes<textarea rows={2} defaultValue={c.notes ?? ""} onBlur={(e) => e.target.value !== (c.notes ?? "") && save({ notes: e.target.value })} /></label>
        {err && <div className="msg err">{err} {/connect|settings|browser/i.test(err) && <Link href="/settings/ai">AI settings</Link>}</div>}
        <div className="row"><button className="link" onClick={() => setEdit(true)}>Edit</button>{c.status !== "Closed" ? <button className="link" onClick={() => setStatus("Closed")}>Close</button> : <button className="link" onClick={() => save({ status: "Found" })}>Reopen</button>}</div>
      </>)}
    </div>
  );
}
