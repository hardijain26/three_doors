"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { postWithKey, ApiError } from "@/lib/client/ai.ts";
import { useMe } from "@/lib/client/useMe.ts";
import { Icon } from "@/components/icons.tsx";

type Source = { id: string; name: string; url: string; enabled: boolean; fav: boolean; last_checked: string | null; last_found: number | null; last_error: string | null };
type Opening = { id: string; company: string; title: string; location: string | null; link: string | null; score: number | null; why: string | null; flag: string | null; state: string; manual: boolean; found_on: string; source_id: string | null };
type Run = { started_at: string; finished_at: string | null; status: string; checked: number; total: number; added: number; note: string | null };
const MAX_SRC = 1000, DAY_CAP = 20, GAP_H = 6;
const istToday = () => new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const ALIAS: Record<string, string[]> = { "united kingdom": ["uk", "london", "england", "manchester", "edinburgh", "cambridge"], "united states": ["us", "usa", "san francisco", "new york", "nyc", "seattle", "boston", "austin"], netherlands: ["amsterdam", "rotterdam", "utrecht"], germany: ["berlin", "munich", "hamburg"], ireland: ["dublin"], spain: ["madrid", "barcelona"], france: ["paris"], canada: ["toronto", "vancouver"], india: ["bangalore", "bengaluru", "mumbai", "delhi", "gurgaon", "gurugram", "pune", "hyderabad"] };
function matches(o: Opening, s: any) {
  if (!s) return true;
  const t = (o.title || "").toLowerCase(), l = (o.location || "").toLowerCase(), r = s.remote || {};
  const roles: string[] = s.roles || [];
  const roleOk = !roles.length || roles.some((x) => t.includes(x.toLowerCase())) || (/\bpm\b|product manager/.test(t) && roles.some((x) => /product manager/i.test(x)));
  const places = [...(s.countries || []), ...(s.cities || [])].map((x: string) => x.toLowerCase());
  const placeOk = places.some((p) => l.includes(p) || (ALIAS[p] || []).some((a) => new RegExp(`\\b${a}\\b`).test(l)));
  const remoteOk = /remote|anywhere/.test(l) && (r.worldwide || (r.europe && /europe|emea|uk|eu\b/.test(l)) || (r.india && /india|apac|asia|worldwide|anywhere/.test(l)));
  return roleOk && (!places.length && !r.worldwide && !r.europe && !r.india ? true : placeOk || remoteOk);
}

export default function Openings() {
  const sb = supabaseBrowser(); const me = useMe();
  const [ops, setOps] = useState<Opening[] | null>(null); const [src, setSrc] = useState<Source[]>([]); const [run, setRun] = useState<Run | null>(null);
  const [onlyMatch, setOnlyMatch] = useState(true); const [showHidden, setShowHidden] = useState(false);
  const [paste, setPaste] = useState(""); const [srcMsg, setSrcMsg] = useState(""); const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false); const [runMsg, setRunMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [adding, setAdding] = useState(false); const [f, setF] = useState({ company: "", title: "", location: "", link: "", fit: "Good", why: "" });
  async function load() {
    const [o, s, r] = await Promise.all([sb.from("openings").select("*").order("created_at", { ascending: false }), sb.from("sources").select("*").order("fav", { ascending: false }).order("name"), sb.from("search_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle()]);
    setOps(o.data ?? []); setSrc(s.data ?? []); setRun(r.data);
  }
  useEffect(() => { load(); }, []);
  const today = istToday();
  const addedToday = (ops ?? []).filter((o) => o.found_on === today && !o.manual).length;
  const nextAllowed = run && run.status !== "failed" ? Date.parse(run.started_at) + GAP_H * 3.6e6 : 0;
  const wait = Math.max(0, nextAllowed - Date.now());
  const enabled = src.filter((s) => s.enabled);
  const list = useMemo(() => (ops ?? []).filter((o) => (showHidden || o.state !== "hidden") && (!onlyMatch || o.manual || matches(o, me?.search))).sort((a, b) => ({ new: 0, added: 1, hidden: 2 } as any)[a.state] - ({ new: 0, added: 1, hidden: 2 } as any)[b.state] || (b.score ?? 0) - (a.score ?? 0)), [ops, showHidden, onlyMatch, me]);
  if (!ops) return <p className="meta">Loading…</p>;
  const offProfile = (ops ?? []).filter((o) => (showHidden || o.state !== "hidden") && onlyMatch && !o.manual && !matches(o, me?.search)).length;

  async function findJobs() {
    setBusy(true); setRunMsg({ t: `Searching ${Math.min(30, enabled.length)} sources. This takes a few minutes; keep this tab open.` });
    try { const r = await postWithKey<{ checked: number; total: number; added: number; note: string | null }>("/api/openings/search", {}); setRunMsg({ t: `Done: ${r.added} new opening${r.added === 1 ? "" : "s"} from ${r.checked} of ${r.total} sources.${r.note ? ` ${r.note}` : ""}` }); }
    catch (e) { setRunMsg({ t: e instanceof ApiError ? e.message : "The search failed. Try again later.", err: true }); }
    setBusy(false); load();
  }
  async function addSources() {
    const lines = paste.split(/\n+/).map((l) => l.trim()).filter(Boolean); const rows: { name: string; url: string }[] = []; let bad = 0;
    for (const l of lines) { const p = l.split("|"); let url = (p.length > 1 ? p.slice(1).join("|") : p[0]).trim(); const name = p.length > 1 ? p[0].trim() : "";
      if (!/^https?:\/\//i.test(url)) url = "https://" + url; url = url.replace(/^http:\/\//i, "https://");
      try { const u = new URL(url); rows.push({ name: name || u.hostname.replace(/^(www|jobs|careers)\./, ""), url: u.href }); } catch { bad++; } }
    const have = new Set(src.map((s) => s.url)); const fresh = rows.filter((r) => !have.has(r.url) && have.add(r.url)).slice(0, Math.max(0, MAX_SRC - src.length));
    if (!fresh.length) { setSrcMsg(rows.length ? "All of those are already listed, or you're at the 1,000 limit." : "No valid links found."); return; }
    const { error } = await sb.from("sources").insert(fresh);
    setSrcMsg(error ? "Saving failed. Links must start with https://." : `Added ${fresh.length} source${fresh.length === 1 ? "" : "s"}${bad ? `, couldn't read ${bad} line${bad > 1 ? "s" : ""}` : ""}.`);
    if (!error) setPaste(""); load();
  }
  async function toRoles(o: Opening) {
    const fit = (o.score ?? 0) >= 70 ? "Strong" : (o.score ?? 0) >= 50 ? "Good" : "Stretch";
    const { error } = await sb.from("roles").insert({ company: o.company, title: o.title, location: o.location, link: o.link?.startsWith("https://") ? o.link : null, fit, angle: [o.why, o.flag].filter(Boolean).join(" "), opening_id: o.id });
    if (!error) { await sb.from("openings").update({ state: "added" }).eq("id", o.id); sb.rpc("track_event", { p_event: "role_created", p_props: {} }).then(() => {}, () => {}); load(); }
  }
  const setState = async (o: Opening, state: string) => { await sb.from("openings").update({ state }).eq("id", o.id); load(); };
  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await sb.from("openings").insert({ company: f.company, title: f.title, location: f.location || null, link: f.link || `manual:${Date.now()}`, score: f.fit === "Strong" ? 80 : f.fit === "Good" ? 60 : 40, why: f.why || null, manual: true, found_on: today });
    if (!error) { setAdding(false); setF({ company: "", title: "", location: "", link: "", fit: "Good", why: "" }); load(); }
  }
  const s = me?.search || {};
  const btnLabel = busy ? "Searching…" : addedToday >= DAY_CAP ? "Daily limit reached" : wait ? `Next search ${new Date(nextAllowed).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Find jobs now";

  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Openings</h1><p>Every PM opening found in your sources, scored against your profile. Add the ones you'll pursue to Roles.</p></div><button onClick={() => setAdding(!adding)}>{adding ? "Cancel" : <><Icon name="plus" />Add a job yourself</>}</button></div>
      {adding && <form onSubmit={addManual} className="card grid">
        <label className="f">Company<input required value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></label>
        <label className="f">Role<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label className="f">Location<input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
        <label className="f">Job link<input type="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></label>
        <label className="f">Fit<select value={f.fit} onChange={(e) => setF({ ...f, fit: e.target.value })}><option>Strong</option><option>Good</option><option>Stretch</option></select></label>
        <label className="f">Why it fits you<input value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} /></label>
        <div className="row" style={{ alignSelf: "end" }}><button className="primary">Add to Openings</button></div>
      </form>}

      <section className="card stack">
        <div className="row">
          <button className="primary" disabled={busy || addedToday >= DAY_CAP || !!wait || !enabled.length} onClick={findJobs}>{busy ? <span className="spin" aria-hidden="true" /> : <Icon name="search" />}{btnLabel}</button>
          <span className={`chip${addedToday >= DAY_CAP ? " hot" : ""}`}>{addedToday} of {DAY_CAP} today</span>
          <span className={runMsg?.err ? "due" : "meta"} role="status">{runMsg?.t ?? (run ? `Last search ${ago(run.started_at)}: ${run.added} new from ${run.checked} of ${run.total} sources.${run.note ? ` ${run.note}` : ""}` : "No search has run yet.")}</span>
        </div>
        <p className="hint">Each search reads up to 30 sources (favourites first, then the ones checked longest ago) and asks your own AI to pull out matching PM openings, using your key. Searches run at least {GAP_H} hours apart. Boards that load jobs with JavaScript may show nothing; add their filtered search page, or add jobs yourself.</p>
        <p className="hint">Looking for: {(s.roles || []).join(", ") || "any PM title"} · {[...(s.countries || []), ...(s.cities || [])].join(", ") || "anywhere"}{s.skip?.length ? ` · skipping ${s.skip.join(", ")}` : ""}. <Link href="/settings/profile">Change in Profile</Link></p>
        <details><summary>Sources: {enabled.length} on, {src.length - enabled.length} off, {src.filter((x) => x.fav).length} favourite · {src.length} of {MAX_SRC}</summary>
          <p className="hint">Star your favourite boards; favourites are read first in every search.</p>
          {src.length > 8 && <input placeholder="Search your sources" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your sources" />}
          <div className="stack" style={{ gap: 4, maxHeight: 420, overflow: "auto" }}>
            {src.filter((x) => !q || `${x.name} ${x.url}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200).map((x) => (
              <div key={x.id} className="row srcrow">
                <button className={`iconbtn star${x.fav ? " on" : ""}`} aria-pressed={x.fav} aria-label={x.fav ? "Remove from favourites" : "Mark as favourite"} onClick={async () => { await sb.from("sources").update({ fav: !x.fav }).eq("id", x.id); load(); }}>{x.fav ? "★" : "☆"}</button>
                <label className="row" style={{ flex: 1, minWidth: 180, gap: 8 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={x.enabled} onChange={async (e) => { await sb.from("sources").update({ enabled: e.target.checked }).eq("id", x.id); load(); }} /><a href={x.url} target="_blank" rel="noopener noreferrer">{x.name}</a></label>
                <span className="meta">{x.last_checked ? `checked ${ago(x.last_checked)} · ${x.last_found ?? 0} found` : "not checked yet"}{x.last_error && <span className="due"> · {x.last_error}</span>}</span>
                <button className="link" onClick={async () => { await sb.from("sources").delete().eq("id", x.id); load(); }}>Remove</button>
              </div>))}
          </div>
          <label className="f">Add sources, one per line: just the link, or Name | link. Use the page that lists jobs, filtered to product roles if the site allows it.
            <textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Seedcamp | https://jobs.seedcamp.com/jobs?q=product%20manager\nhttps://jobs.lakestar.com/jobs"} /></label>
          <div className="row"><button onClick={addSources} disabled={!paste.trim()}><Icon name="plus" />Add sources</button><span className="meta">{srcMsg}</span></div>
        </details>
      </section>

      <div className="row">
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={onlyMatch} onChange={(e) => setOnlyMatch(e.target.checked)} />Only openings that match my profile</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />Show hidden</label>
        {offProfile > 0 && <span className="meta">{offProfile} outside your profile not shown</span>}
      </div>
      {!list.length && <div className="card"><p className="meta">No openings waiting. {src.length ? "Click Find jobs now, or add a job yourself." : "Add your job-board sources above, then click Find jobs now."}</p></div>}
      <div className="stack">{list.map((o) => { const top = (o.score ?? 0) >= 70 && o.state === "new"; return (
        <article key={o.id} className={`card tight stack${top ? " topmatch" : ""}${o.state !== "new" ? " dim" : ""}`}>
          <div className="row between">
            <div><h3>{o.company} · {o.title}</h3><div className="meta">{o.location}{o.manual ? " · added by you" : ` · found ${o.found_on}`}{o.link?.startsWith("https://") && <> · <a href={o.link} target="_blank" rel="noopener noreferrer">Job post</a></>}</div></div>
            <div className="row">{top && <span className="chip ok">Top match</span>}{o.state === "added" && <span className="chip">In Roles</span>}{o.state === "hidden" && <span className="chip mute">Hidden</span>}<span className="score" title="Match score out of 100">{o.score ?? "–"}</span></div>
          </div>
          {(o.why || o.flag) && <p className="meta">{o.why}{o.flag && <span className="chip warn" style={{ marginLeft: 6 }}>{o.flag}</span>}</p>}
          <div className="row">{o.state === "new" ? <><button className="primary" onClick={() => toRoles(o)}><Icon name="plus" />Add to Roles</button><button onClick={() => setState(o, "hidden")}>Hide</button></> : o.state === "hidden" ? <button onClick={() => setState(o, "new")}>Unhide</button> : null}</div>
        </article>); })}</div>
    </div>
  );
}
