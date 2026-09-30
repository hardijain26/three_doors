"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { runFeature, postWithKey, ApiError } from "@/lib/client/ai.ts";
import { useMe } from "@/lib/client/useMe.ts";
import { Icon } from "@/components/icons.tsx";
import { showBreak } from "@/lib/client/wellbeing.ts";
import { StatsBar, OpeningsBanner, LinkedInNudge, SaveHint, useSaver } from "@/components/board.tsx";
import {
  APPLY_CAP, STEPS, SHORT, buildNote, coffeeMsg, refMsg, hookKind, istToday, nameFromUrl, nextKind, nextStep, normUrl, parseCid, reached, searchUrl, shortUrl, today, typeLabel,
  type Contact, type ContactType, type Role,
} from "@/lib/client/pipeline.ts";

const TYPES: [ContactType, string, string][] = [
  ["hm", "Hiring manager", "The person you'd report to, usually the Head of Product or a Group PM."],
  ["rec", "Recruiter", "The recruiter or talent partner hiring for this team."],
  ["other", "Someone in another department", "Someone in another team, such as an engineer, designer or marketer, who can tell you how the work runs and refer you."],
];
const ORDER: Record<ContactType, number> = { hm: 0, rec: 1, other: 2 };

async function copy(text: string, btn: HTMLButtonElement, label: string) {
  try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; } catch { btn.textContent = "Press Cmd+C"; }
  setTimeout(() => { btn.textContent = label; }, 1400);
}

export default function Roles() {
  const sb = supabaseBrowser(); const me = useMe(); const { state, queue } = useSaver();
  const [roles, setRoles] = useState<Role[] | null>(null); const [cs, setCs] = useState<Contact[]>([]); const [fresh, setFresh] = useState<{ score: number | null }[]>([]);
  const [edit, setEdit] = useState<Record<string, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);
  async function load() {
    const [r, c, o] = await Promise.all([sb.from("roles").select("*").order("created_at", { ascending: true }), sb.from("contacts").select("*").order("created_at", { ascending: true }), sb.from("openings").select("score").eq("state", "new")]);
    setRoles(r.data ?? []); setCs(c.data ?? []); setFresh(o.data ?? []);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { // People tab links to a role card
    if (!roles || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1)); if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [roles === null]);

  /** Local update first, then a debounced write, so typing never waits on the network. */
  const patchContact = (id: string, patch: Partial<Contact>, delay = 600) => {
    setCs((all) => all.map((x) => x.id === id ? { ...x, ...patch } : x));
    queue(`c:${id}:${Object.keys(patch).sort().join(",")}`, () => sb.from("contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id), delay);
  };
  const patchRole = (id: string, patch: Partial<Role>) => {
    setRoles((all) => (all ?? []).map((x) => x.id === id ? { ...x, ...patch } : x));
    queue(`r:${id}:${Object.keys(patch).join(",")}`, () => sb.from("roles").update(patch).eq("id", id), 0);
  };
  const activeRoles = roles?.filter((r) => !r.archived_at) ?? [];
  const archivedRoles = roles?.filter((r) => !!r.archived_at) ?? [];
  const activeRoleIds = new Set(activeRoles.map((r) => r.id));
  const activeContacts = cs.filter((c) => activeRoleIds.has(c.role_id));
  const visibleRoles = showArchived ? roles ?? [] : activeRoles;
  const appliedToday = activeRoles.filter((r) => r.applied_on === istToday()).length;

  if (!roles) return <p className="meta">Loading your roles…</p>;
  return (
    <div className="stack">
      <div className="page-head"><div><h1>Roles</h1><p>Every target role gets three people: the hiring manager, a recruiter, and someone who might refer you. Log each one here and the board tells you what to do next.</p></div><SaveHint state={state} /></div>
      <StatsBar roles={activeRoles} contacts={activeContacts} />
      <LinkedInNudge url={me ? me.linkedin_url : "https://www.linkedin.com/in/x"} />
      <OpeningsBanner fresh={fresh} />
      {archivedRoles.length > 0 && <label className="row"><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Show archived roles ({archivedRoles.length})</label>}
      {!activeRoles.length && !showArchived && <div className="card stack" style={{ alignItems: "flex-start" }}><p style={{ margin: 0 }}>No active roles yet. Roles are the jobs you have decided to pursue. Pick them on the Openings tab with <b>Add to Roles</b>, and for each one you add the people to reach: the hiring manager, a recruiter, and someone in another department who might refer you.</p><Link className="btn primary" href="/openings">Go to Openings</Link></div>}
      {visibleRoles.map((r) => (
        <RoleCard key={r.id} r={r} people={cs.filter((c) => c.role_id === r.id).sort((a, b) => ORDER[a.type] - ORDER[b.type] || String(a.created_at).localeCompare(String(b.created_at)))} me={me}
          archived={!!r.archived_at}
          edit={edit} setEdit={(id, v) => setEdit((e) => ({ ...e, [id]: v }))} patchContact={patchContact}
          onStartApplication={() => patchRole(r.id, { application_started_at: istToday() })}
          onApply={() => {
            if (appliedToday >= APPLY_CAP) { showBreak("apply"); return; }
            patchRole(r.id, { application_started_at: r.application_started_at || istToday(), applied_on: istToday() }); if (appliedToday + 1 === APPLY_CAP) showBreak("applydone");
          }}
          onUnapply={() => patchRole(r.id, { applied_on: null })}
          onCid={(cid) => { for (const x of roles) if (x.company.toLowerCase() === r.company.toLowerCase() && (cid ? !x.cid || x.id === r.id : true)) patchRole(x.id, { cid }); }}
          onAdded={(c) => { setCs((all) => [...all, c]); setEdit((e) => ({ ...e, [c.id]: true })); }}
          onRemoved={(id) => setCs((all) => all.filter((x) => x.id !== id))}
          onMerge={(id, ch) => setCs((all) => all.map((x) => x.id === id ? { ...x, ...ch } : x))}
          onArchive={async () => {
            const archivedAt = new Date().toISOString();
            const { error } = await sb.from("roles").update({ archived_at: archivedAt }).eq("id", r.id).is("archived_at", null);
            if (error) return false;
            setRoles((all) => (all ?? []).map((x) => x.id === r.id ? { ...x, archived_at: archivedAt } : x)); return true;
          }}
          onRestore={async () => {
            const { error } = await sb.from("roles").update({ archived_at: null }).eq("id", r.id);
            if (error) return false;
            setRoles((all) => (all ?? []).map((x) => x.id === r.id ? { ...x, archived_at: null } : x)); return true;
          }} />
      ))}
    </div>
  );
}

type CardProps = {
  r: Role; people: Contact[]; me: any; archived: boolean; edit: Record<string, boolean>; setEdit: (id: string, v: boolean) => void;
  patchContact: (id: string, p: Partial<Contact>, delay?: number) => void; onStartApplication: () => void; onApply: () => void; onUnapply: () => void; onCid: (cid: string | null) => void;
  onAdded: (c: Contact) => void; onRemoved: (id: string) => void; onMerge: (id: string, ch: Partial<Contact>) => void; onArchive: () => Promise<boolean>; onRestore: () => Promise<boolean>;
};
function RoleCard(p: CardProps) {
  const { r, people } = p; const [del, setDel] = useState(false); const [delErr, setDelErr] = useState(false);
  const named = people.filter((c) => c.name), contacted = people.filter((c) => reached(c) >= 1).length;
  const due = named.filter((c) => c.status !== "Closed" && nextStep(c)[1]).map((c) => `${(c.name || "").split(/\s+/)[0] || typeLabel(c)}: ${nextStep(c)[0].toLowerCase()}`);
  return (
    <article className="card rolecard" id={`role-${r.id}`}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0 }}>{r.company} · {r.title}</h2>
          <div className="meta">{r.location}{r.link && <>{r.location ? " · " : ""}<a href={r.link} target="_blank" rel="noopener noreferrer">Job post</a></>}</div>
          <div className="row rsum"><span className="mono meta">{people.length ? `${contacted} of ${people.length} contacted` : "No one added yet"}</span>{due.length > 0 && <span className="due">{due[0]}{due.length > 1 ? ` (+${due.length - 1} more)` : ""}</span>}</div>
        </div>
        <div className="row">
          {r.applied_on ? <><span className="chip">Applied {r.applied_on}</span><button className="link" onClick={p.onUnapply}>Undo</button></> : <>
            {r.application_started_at ? <span className="chip">Application started {r.application_started_at}</span> : <button onClick={p.onStartApplication}>Start application</button>}
            <button onClick={p.onApply}>Mark as applied</button>
          </>}
          {r.fit && <span className={`chip${r.fit === "Strong" ? " ok" : r.fit === "Stretch" ? " warn" : ""}`}>{r.fit}</span>}
        </div>
      </div>
      {r.angle && <p className="angle">{r.angle}</p>}
      <div className="people3">
        {people.map((c) => <Person key={c.id} c={c} r={r} me={p.me} editing={p.edit[c.id] || !c.name} setEditing={(v) => p.setEdit(c.id, v)} patch={(x, d) => p.patchContact(c.id, x, d)} onRemoved={() => p.onRemoved(c.id)} onMerge={p.onMerge} />)}
        <AddCard r={r} people={people} onAdded={p.onAdded} />
      </div>
      <details className="assist">
        <summary>{r.cid ? "LinkedIn company filter is on" : "Turn on the LinkedIn company filter for search"}</summary>
        <CidBox r={r} onCid={p.onCid} />
      </details>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        {p.archived ? <button className="link" onClick={async () => { setDelErr(false); if (!(await p.onRestore())) setDelErr(true); }}>{delErr ? "Couldn't restore it. Try again." : "Restore to active Roles"}</button> : <button className="link muted" onClick={async () => { if (!del) { setDel(true); return; } setDelErr(false); if (!(await p.onArchive())) setDelErr(true); }}>{delErr ? "Couldn't archive it. Try again." : del ? `Archive ${r.company}? Contacts and history will stay. Click again` : "Archive from active Roles"}</button>}
      </div>
    </article>
  );
}

function CidBox({ r, onCid }: { r: Role; onCid: (cid: string | null) => void }) {
  const [msg, setMsg] = useState("");
  if (r.cid) return <div className="row"><span className="chip ok">Company filter on</span><span className="meta">LinkedIn ID {r.cid}</span><button className="link" onClick={() => onCid(null)}>Change</button></div>;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="meta">Search uses the company name only, so it also finds people who left. To turn on the real company filter, open <a href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(r.company)}`} target="_blank" rel="noopener noreferrer">{r.company} on LinkedIn</a>, click the employees count, and paste that page's link here:</span>
      <input placeholder="linkedin.com/search/results/people/?currentCompany=…" aria-label={`${r.company} employees link`} onChange={(e) => {
        const v = e.target.value; if (!v.trim()) { setMsg(""); return; }
        const id = parseCid(v); if (!id) { setMsg("No company ID in that link. Copy the address after clicking the employees count."); return; }
        setMsg(""); onCid(id);
      }} />
      {msg && <span className="meta due">{msg}</span>}
    </div>
  );
}

function AddCard({ r, people, onAdded }: { r: Role; people: Contact[]; onAdded: (c: Contact) => void }) {
  const sb = supabaseBrowser();
  const [a, setA] = useState<{ type: ContactType | ""; dept: string } | null>(null); const [err, setErr] = useState("");
  const have = new Set(people.map((c) => c.type));
  const miss = ([["hm", "a hiring manager"], ["rec", "a recruiter"], ["other", "someone in another department"]] as const).filter(([t]) => !have.has(t)).map(([, l]) => l);
  const ok = !!a?.type && (a.type !== "other" || !!a.dept.trim());
  async function go() {
    if (!a || !ok) return;
    const dept = a.type === "other" ? a.dept.trim().replace(/^./, (x) => x.toUpperCase()) : null;
    const { data, error } = await sb.from("contacts").insert({ role_id: r.id, type: a.type, dept, status: "Not found", status_history: {} }).select("*").single();
    if (error || !data) { setErr("Couldn't add them. Try again."); return; }
    sb.rpc("track_event", { p_event: "contact_created", p_props: { contact_type: a.type } }).then(() => {}, () => {});
    setA(null); onAdded(data);
  }
  if (!a) return (
    <div className="pbox add">
      <button className="primary block" onClick={() => setA({ type: "", dept: "" })}><Icon name="plus" />Add person</button>
      <p className="hint">{miss.length ? `Still to find: ${miss.join(", ")}.` : "All three kinds of contact are covered. Add more if it helps."}</p>
    </div>
  );
  return (
    <div className="pbox add">
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
        <legend className="hint" style={{ marginBottom: 6 }}>Who is this person?</legend>
        {TYPES.map(([t, l, h]) => <label key={t} className={`opt${a.type === t ? " on" : ""}`}><input type="radio" name={`pt-${r.id}`} checked={a.type === t} onChange={() => setA({ ...a, type: t })} /><span><b>{l}</b><br /><span className="hint">{h}</span></span></label>)}
      </fieldset>
      {a.type === "other" && <label className="f">Which department? <span className="chip hot" style={{ alignSelf: "flex-start" }}>needed</span><input autoFocus value={a.dept} placeholder="e.g. Engineering, Design, Marketing" onChange={(e) => setA({ ...a, dept: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") go(); }} /></label>}
      <div className="row">
        {a.type && <a className={`btn iconbtn${ok ? "" : " off"}`} aria-disabled={!ok} href={ok ? searchUrl(r.company, a.type as ContactType, a.dept, r.cid) : undefined} target="_blank" rel="noopener noreferrer" title="Search LinkedIn for them"><Icon name="search" label="Search LinkedIn for them" /></a>}
        <button className="primary" disabled={!ok} onClick={go}>Continue</button>
        <button className="link" onClick={() => setA(null)}>Cancel</button>
      </div>
      {err && <div className="msg err">{err}</div>}
    </div>
  );
}

type PersonProps = { c: Contact; r: Role; me: any; editing: boolean; setEditing: (v: boolean) => void; patch: (p: Partial<Contact>, delay?: number) => void; onRemoved: () => void; onMerge: (id: string, ch: Partial<Contact>) => void };
function Person({ c, r, me, editing, setEditing, patch, onRemoved, onMerge }: PersonProps) {
  const cRef = useRef(c); cRef.current = c;
  const sb = supabaseBrowser();
  const [paste, setPaste] = useState(""); const [busy, setBusy] = useState(false); const busyRef = useRef(false); const [msg, setMsg] = useState(""); const [delArm, setDelArm] = useState(false);
  const label = typeLabel(c), m = me ?? {};
  const search = <a className="btn iconbtn" href={searchUrl(r.company, c.type, c.dept, r.cid)} target="_blank" rel="noopener noreferrer" title={`Search LinkedIn for the ${label.toLowerCase()} at ${r.company}`}><Icon name="search" label={`Search LinkedIn for the ${label.toLowerCase()} at ${r.company}`} /></a>;
  const setStatus = (s: string) => {
    if (s === c.status) return;
    const hist = { ...(c.status_history || {}) }; if (s !== "Closed" && !hist[s]) hist[s] = today();
    const p: Partial<Contact> = { status: s, status_history: hist, status_on: today() }; if (s === "Request sent" && !c.hook) p.hook = hookKind(c);
    patch(p, 0); sb.rpc("track_event", { p_event: "contact_status_changed", p_props: { to_status: s.replace(/\s+/g, "_") } }).then(() => {}, () => {});
  };
  // Typing a name moves them from "Not found" to "Found", like the tracker.
  const withFound = (p: Partial<Contact>): Partial<Contact> => ((p.name ?? c.name ?? "").trim() && c.status === "Not found") ? { ...p, status: "Found", status_on: today(), status_history: { ...(c.status_history || {}), Found: c.status_history?.Found || today() } } : p;

  async function enrich(text = paste, website = c.website || "") {
    if (busyRef.current) return;
    if (!text.trim() && !website.trim()) { setMsg("Paste their LinkedIn page or add their website first."); return; }
    busyRef.current = true; setBusy(true); setMsg(text.trim() ? "Reading their profile…" : "Reading their website…");
    try {
      const before = cRef.current;
      const res = await postWithKey<{ changed: Partial<Contact>; points: number; siteNote: string; nothing?: boolean }>("/api/people/enrich", { contactId: c.id, profileText: text, website });
      if (res.nothing) { setMsg(res.siteNote); busyRef.current = false; setBusy(false); return; }
      const now = cRef.current as any, was = before as any;
      onMerge(c.id, Object.fromEntries(Object.entries(res.changed).filter(([k]) => now[k] === was[k] || k === "common" || k === "followup")) as Partial<Contact>); setPaste("");
      setMsg(`${res.siteNote ? res.siteNote + " " : ""}${res.points ? `Found ${res.points} point${res.points > 1 ? "s" : ""} in common. Press Done to see them.` : "No real overlap found, so the follow-up is built around the role."}`);
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "That didn't work. Try again."); }
    busyRef.current = false; setBusy(false);
  }
  const siteAtFocus = useRef("");

  if (editing) return (
    <div className="pbox">
      <div className="row between"><span className="eyebrow">{label}</span>{search}</div>
      <label className="f sm">LinkedIn profile link<input autoFocus={!c.name && !c.linkedin_url} maxLength={300} value={c.linkedin_url ?? ""} placeholder="linkedin.com/in/…" onChange={(e) => { const u = e.target.value; const nm = !(c.name || "").trim() ? nameFromUrl(u) : ""; patch(withFound({ linkedin_url: u || null, ...(nm ? { name: nm } : {}) })); }} /></label>
      <div className="pastebox">
        <label className="f sm" htmlFor={`pt-${c.id}`}>Their LinkedIn page</label>
        <textarea id={`pt-${c.id}`} rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} onPaste={(e) => { const t = e.currentTarget; setTimeout(() => { if (t.value.trim()) enrich(t.value); }, 80); }} placeholder="Open their profile, press Cmd+A then Cmd+C, and paste here" />
        <p className="hint">LinkedIn blocks other apps from reading profiles, so one paste is how Three Doors gets their details. Name, title, website and any email they published fill in by themselves, then their website is read and your AI looks for what you have in common. The paste is not stored.</p>
        <div className="row"><button disabled={busy} onClick={() => enrich()}>{busy ? <span className="spin" aria-hidden="true" /> : <Icon name="sparkles" />}{c.common ? "Find common ground again" : "Find common ground"}</button><span className="meta" aria-live="polite">{msg}</span></div>
      </div>
      <label className="f sm">Name<input maxLength={120} value={c.name ?? ""} placeholder="Fills in from the link" onChange={(e) => patch(withFound({ name: e.target.value }))} /></label>
      <label className="f sm">Job title<input maxLength={160} value={c.title ?? ""} placeholder="Fills in from their page" onChange={(e) => patch({ title: e.target.value || null })} /></label>
      <label className="f sm">Email, only if they publish it<input type="email" maxLength={200} value={c.email ?? ""} placeholder="From their page or website" onChange={(e) => patch({ email: e.target.value || null })} /></label>
      <label className="f sm">Website or blog<input maxLength={300} value={c.website ?? ""} placeholder="Fills in if their profile lists one" onFocus={(e) => { siteAtFocus.current = e.target.value; }} onChange={(e) => patch({ website: e.target.value || null })} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== siteAtFocus.current.trim()) enrich("", v); }} /></label>
      <label className="f sm">Notes<textarea rows={2} maxLength={2000} value={c.notes ?? ""} placeholder="How you found them" onChange={(e) => patch({ notes: e.target.value || null })} /></label>
      <div className="row"><button className="primary" disabled={!(c.name || "").trim()} onClick={() => setEditing(false)}>Done</button>
        <button className="link" onClick={async () => { if (!delArm) { setDelArm(true); return; } await sb.from("contacts").delete().eq("id", c.id); onRemoved(); }}>{delArm ? "Click again to remove" : "Remove"}</button></div>
    </div>
  );

  const cur = reached(c), closed = c.status === "Closed", [ns] = nextStep(c), site = normUrl(c.website);
  return (
    <div className="pbox">
      <div className="row between"><span className="eyebrow">{label}</span>{search}</div>
      <div>
        <div className="pname">{c.linkedin_url ? <a href={normUrl(c.linkedin_url) || undefined} target="_blank" rel="noopener noreferrer">{c.name}</a> : c.name}</div>
        {c.title && <div className="meta">{c.title}</div>}
        {c.email && <div className="meta mono" style={{ wordBreak: "break-all" }}>{c.email}</div>}
        {site && <div className="meta"><a href={site} target="_blank" rel="noopener noreferrer">{shortUrl(site)}</a></div>}
      </div>
      <div className="stepper" role="group" aria-label={`${label} status`}>
        {STEPS.map((s, i) => { const at = c.status_history?.[s]; return (
          <button key={s} className={`stp${cur >= i && !closed ? " done" : ""}${c.status === s ? " now" : ""}`} onClick={() => setStatus(s)} title={s + (at ? ` on ${at}` : "")}>
            <span className="dot" /><span className="slab">{SHORT[s] ?? s}</span>{at && <span className="sdate">{at.slice(5)}</span>}
          </button>); })}
      </div>
      <div className={`next ${nextKind(c)}`}>{closed ? "Closed" : ns}</div>
      {c.common && c.common.length > 0 && <div className="common"><span className="hint">In common</span><ul>{c.common.map((x, i) => <li key={i}>{x.point} {x.from && <span className="src">{x.from}</span>}</li>)}</ul></div>}
      {c.followup && <details className={c.status === "Accepted" ? "hot" : ""} open={c.status === "Accepted"}><summary>{c.status === "Accepted" ? "Send this follow-up today" : "Follow-up for when they accept"}</summary><p className="note">{c.followup}</p><div className="row"><span className="meta mono">{c.followup.length} characters</span><button onClick={(e) => copy(c.followup!, e.currentTarget, "Copy")}><Icon name="copy" />Copy</button></div></details>}
      {!closed && ([["Replied", "msg_coffee", "Ask for a coffee chat", coffeeMsg], ["Coffee chat", "msg_ref", c.type === "other" ? "Ask for a referral" : "Ask them to put you forward", refMsg]] as const).map(([from, f, title, fn]) => {
        if (cur < STEPS.indexOf(from)) return null; const now = c.status === from, v = (c[f] as string | null | undefined) ?? fn(r, c, m);
        return (<details key={f} className={now ? "hot" : ""} open={now}><summary>{title}{now ? " now" : ""}</summary>
          <textarea rows={6} maxLength={2000} value={v} onChange={(e) => patch({ [f]: e.target.value } as Partial<Contact>)} aria-label={title} />
          <div className="row between"><span className="hint">Replace anything in {"{braces}"} before sending.</span><button onClick={(e) => copy(v, e.currentTarget, "Copy")}><Icon name="copy" />Copy</button></div>
        </details>);
      })}
      <NoteBlock c={c} r={r} me={m} patch={patch} />
      {c.notes && <p className="hint" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{c.notes}</p>}
      <div className="row"><button className="link" onClick={() => setEditing(true)}>Edit</button>{!c.followup && <button className="link" onClick={() => setEditing(true)}>Find common ground</button>}
        {!closed ? <button className="link" onClick={() => setStatus("Closed")}>Close</button> : <button className="link" onClick={() => setStatus("Found")}>Reopen</button>}</div>
    </div>
  );
}

function NoteBlock({ c, r, me, patch }: { c: Contact; r: Role; me: any; patch: (p: Partial<Contact>, delay?: number) => void }) {
  const open = reached(c) < 1 && c.status !== "Closed";
  const note = useMemo(() => buildNote(r, c, me), [r, c, me]);
  const [post, setPost] = useState(""); const [sg, setSg] = useState(""); const [busy, setBusy] = useState(false);
  async function suggest() {
    if (!post.trim()) { setSg("Paste their post first."); return; }
    setBusy(true); setSg("Thinking…");
    try {
      const o = await runFeature<{ line: string }>("suggest_line", { contact: { type: c.type, dept: c.dept, name: c.name, roleTitle: r.title, company: r.company }, me, text: post });
      patch({ topic: o.line || null }, 0); setSg(o.line ? "Done. Edit the line above if it's off." : "No line came back. Write it yourself.");
    } catch (e) { setSg(e instanceof ApiError ? e.message : "That didn't work. Write the line yourself."); }
    setBusy(false);
  }
  return (
    <details open={open}>
      <summary>{open ? "Connection note" : "Connection note (sent)"}</summary>
      <p className="hint">On their profile, look under their name for mutual connections, then check Activity for their latest post.</p>
      <label className="f sm">Mutual connection<input maxLength={120} value={c.mutual ?? ""} placeholder="e.g. Priya Shah" onChange={(e) => patch({ mutual: e.target.value || null })} /></label>
      <label className="f sm">Or shared background<input maxLength={200} value={c.shared ?? ""} placeholder="e.g. we were both at KPMG" onChange={(e) => patch({ shared: e.target.value || null })} /></label>
      {c.type !== "rec" && <label className="f sm">{c.type === "other" ? "Topic of their recent post" : "What you would work on (one sentence)"}<input maxLength={200} value={c.topic ?? ""} placeholder={c.type === "other" ? "e.g. onboarding drop-off" : "e.g. Your trial-to-paid flow is the part I'd most want to work on"} onChange={(e) => patch({ topic: e.target.value || null })} /></label>}
      {c.type !== "rec" && <details className="assist"><summary>Let your AI write that line from their post</summary>
        <textarea rows={3} value={post} onChange={(e) => setPost(e.target.value)} placeholder="Paste their latest post or their About section" />
        <div className="row"><button disabled={busy} onClick={suggest}>{busy ? <span className="spin" aria-hidden="true" /> : <Icon name="sparkles" />}Suggest the line</button><span className="meta" aria-live="polite">{sg}</span></div>
      </details>}
      <p className="note notebox">{note}</p>
      <div className="row between"><span className={`meta mono${note.length > 300 ? " due" : ""}`}>{note.length} / 300 characters</span><button className="primary" onClick={(e) => copy(note, e.currentTarget, "Copy note")}><Icon name="copy" />Copy note</button></div>
    </details>
  );
}
