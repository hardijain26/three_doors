"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons.tsx";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { wipeBrowserVault } from "@/lib/client/browser-vault.ts";
import { WB_OPTS, setWbConfig, useScreenMinutes, wbCfg } from "@/lib/client/wellbeing.ts";

const GENERIC_FIELDS: [string, string, string, "input" | "textarea"][] = [
  ["first_name", "Name", "Your name", "input"],
  ["last_role", "Current role", "e.g. Researcher, designer, teacher, engineer", "input"],
  ["last_company", "Current organization", "Where you work now", "input"],
  ["based_in", "Location", "Where you are based", "input"],
  ["owned", "Experience", "What have you worked on or delivered?", "textarea"],
  ["results", "Evidence and results", "What changed because of your work? Include numbers if you have them.", "textarea"],
  ["background", "Strengths", "What are you strongest at or known for?", "textarea"],
  ["portfolio", "Portfolio or website", "Optional", "input"],
  ["linkedin_url", "Professional link", "LinkedIn or another profile", "input"],
];

function toGenericCopy(key: string) {
  const copy: Record<string, string> = {
    first_name: "The basics about you.",
    last_role: "Your current role or most recent work.",
    last_company: "The organization or team you work with.",
    based_in: "Where you are based or can work from.",
    owned: "What you have done, built, led, taught, delivered or improved.",
    results: "Evidence of impact, outcomes or measurable results.",
    background: "What you are known for, your strengths, or how you contribute.",
    portfolio: "A portfolio, website, or other professional profile.",
    linkedin_url: "A professional link people can use to learn more.",
  };
  return copy[key] ?? "";
}

export default function Profile() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [p, setP] = useState<Record<string, any> | null>(null); const [saved, setSaved] = useState(""); const [del, setDel] = useState(false);
  useEffect(() => { sb.auth.getUser().then(async ({ data }: { data: { user: { id: string } | null } }) => { if (!data.user) return; const { data: row } = await sb.from("profiles").select("*").eq("id", data.user.id).single(); setP(row); }); }, []);
  if (!p) return <p className="meta">Loading…</p>;
  const save = async (patch: Record<string, any>) => {
    const next = { ...p, ...patch };
    const profileData = {
      ...(typeof p.profile_data === "object" && p.profile_data ? p.profile_data : {}),
      first_name: next.first_name ?? undefined,
      current_role: next.last_role ?? undefined,
      current_org: next.last_company ?? undefined,
      location: next.based_in ?? undefined,
      experience_summary: next.owned ?? undefined,
      results: next.results ?? undefined,
      strengths_summary: next.background ?? undefined,
      portfolio: next.portfolio ?? undefined,
      linkedin_url: next.linkedin_url ?? undefined,
      profession_hint: next.profession_hint ?? undefined,
      profile_ready: !!next.profile_ready,
    };
    setP(next);
    await sb.from("profiles").update({ ...patch, profile_data: profileData }).eq("id", p.id);
    setSaved("Saved"); setTimeout(() => setSaved(""), 1200);
  };
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="page-head"><div><h1>Profile &amp; privacy</h1><p>One universal profile model. The wording adapts to your profession, but the underlying structure stays consistent.</p></div></div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>You</h2><span className="meta">{saved}</span></div>
        <p className="hint">Keep the basics accurate and make the rest of the profile evidence-based.</p>
        <div className="grid">
          {GENERIC_FIELDS.filter(([key]) => ["first_name", "last_role", "last_company", "based_in", "portfolio", "linkedin_url"].includes(key)).map(([k, l, ph, type]) => (
            <label key={k} className="f" style={{ gridColumn: type === "textarea" ? "1 / -1" : undefined }}>{l}<span className="hint" style={{ display: "block", marginBottom: 4 }}>{toGenericCopy(k)}</span>
              {type === "textarea" ? <textarea rows={3} defaultValue={p[k] ?? ""} placeholder={ph} onBlur={(e) => save({ [k]: e.target.value })} /> : <input defaultValue={p[k] ?? ""} placeholder={ph} onBlur={(e) => save({ [k]: e.target.value })} />}
            </label>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h2>Experience</h2>
        <p className="hint">What have you done, built, led, taught, improved or delivered?</p>
        {GENERIC_FIELDS.filter(([key]) => ["owned", "results"].includes(key)).map(([k, l, ph, type]) => (
          <label key={k} className="f" style={{ display: "grid" }}>{l}<span className="hint" style={{ display: "block", marginBottom: 4 }}>{toGenericCopy(k)}</span>
            {type === "textarea" ? <textarea rows={4} defaultValue={p[k] ?? ""} placeholder={ph} onBlur={(e) => save({ [k]: e.target.value })} /> : <input defaultValue={p[k] ?? ""} placeholder={ph} onBlur={(e) => save({ [k]: e.target.value })} />}
          </label>
        ))}
      </div>

      <div className="card stack">
        <h2>Strengths</h2>
        <p className="hint">Describe what you do well, with examples or evidence where possible.</p>
        {GENERIC_FIELDS.filter(([key]) => ["background"].includes(key)).map(([k, l, ph, type]) => (
          <label key={k} className="f" style={{ display: "grid" }}>{l}<span className="hint" style={{ display: "block", marginBottom: 4 }}>{toGenericCopy(k)}</span>
            {type === "textarea" ? <textarea rows={4} defaultValue={p[k] ?? ""} placeholder={ph} onBlur={(e) => save({ [k]: e.target.value })} /> : <input defaultValue={p[k] ?? ""} placeholder={ph} onBlur={(e) => save({ [k]: e.target.value })} />}
          </label>
        ))}
      </div>

      <div className="card stack">
        <h2>Goals, preferences and constraints</h2>
        <p className="hint">The system keeps these separate so opportunity matching can weigh must-haves differently from nice-to-haves.</p>
        <div className="stack" style={{ gap: 8 }}>
          <div className="hint">This version keeps the existing search settings and profile fields, but the copy is now profession-neutral and the decision logic can treat goals, preferences and constraints separately.</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="chip">Goals</span>
            <span className="chip">Preferences</span>
            <span className="chip">Constraints</span>
          </div>
        </div>
      </div>

      <SearchSettings value={p.search || {}} onSave={(search) => save({ search })} />
      <Breaks value={p.wellbeing} onSave={(wellbeing) => { save({ wellbeing }); setWbConfig(wellbeing); }} />
      <div className="card stack">
        <h2>Product analytics</h2>
        <label className="opt" style={{ cursor: "pointer" }}><input type="checkbox" checked={!p.telemetry_opt_out} onChange={(e) => save({ telemetry_opt_out: !e.target.checked })} /><span>Share anonymous product events (feature used, model, timing, success). Never your content.</span></label>
      </div>
      <div className="card stack">
        <h2>Your data</h2>
        <div className="row">
          <a className="btn" href="/api/account/export"><Icon name="download" />Download my available saved data (JSON)</a>
          {del ? <button className="danger" onClick={async () => { const r = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!r.ok) { alert("We couldn't delete your saved data. Nothing was deleted. Please try again."); return; } await wipeBrowserVault(); router.push("/"); }}>Yes, delete my saved data</button>
            : <button className="danger" onClick={() => setDel(true)}>Delete your saved data and AI keys</button>}
        </div>
        <p className="hint">Deleting removes your saved CVs, career information, roles, contacts, openings, sources, search history, AI connections and stored keys. Your Three Doors account remains active. Anonymous analytics uses a one-way identifier and isn't linked to your email.</p>
      </div>
    </div>
  );
}

const LISTS: [string, string, string][] = [["roles", "Job titles to search for", "e.g. Growth Product Manager"], ["countries", "Countries", "e.g. Netherlands"], ["cities", "Cities", "e.g. Amsterdam"], ["skip", "Industries to skip", "e.g. crypto"]];
function SearchSettings({ value, onSave }: { value: any; onSave: (v: any) => void }) {
  const [v, setV] = useState<any>({ roles: [], countries: [], cities: [], skip: [], remote: {}, ...value });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const commit = (next: any) => { setV(next); onSave(next); };
  const add = (k: string) => { const vals = (drafts[k] || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean); if (!vals.length) return; const list = [...(v[k] || [])]; vals.forEach((x) => { if (!list.some((y: string) => y.toLowerCase() === x.toLowerCase())) list.push(x); }); setDrafts({ ...drafts, [k]: "" }); commit({ ...v, [k]: list }); };
  return (
    <div className="card stack">
      <h2>Job search</h2>
      <p className="hint">Used by Find jobs on the Openings tab and by the "match my profile" filter.</p>
      <div className="grid">{LISTS.map(([k, l, ph]) => (
        <div key={k} className="stack" style={{ gap: 6 }}>
          <span className="f">{l}</span>
          <div className="row" style={{ gap: 6 }}>{(v[k] || []).length ? (v[k] as string[]).map((x, i) => <span key={x} className="chip mute">{x}<button className="link" style={{ minHeight: 0, textDecoration: "none" }} aria-label={`Remove ${x}`} onClick={() => commit({ ...v, [k]: v[k].filter((_: string, j: number) => j !== i) })}>×</button></span>) : <span className="hint">None yet</span>}</div>
          <div className="row" style={{ flexWrap: "nowrap" }}><input value={drafts[k] || ""} placeholder={ph} aria-label={`Add to ${l}`} onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(k); } }} /><button onClick={() => add(k)}>Add</button></div>
        </div>))}</div>
      <div className="row">{[["europe", "Remote within Europe"], ["worldwide", "Remote, anywhere"], ["india", "Remote from India"]].map(([k, l]) => (
        <label key={k} className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={!!v.remote?.[k]} onChange={(e) => commit({ ...v, remote: { ...(v.remote || {}), [k]: e.target.checked } })} />{l}</label>))}</div>
      <NearMe near={v.near || {}} roles={v.roles || []} onSave={(near) => commit({ ...v, near })} />
      <AutomaticSearches value={v.schedule} onSave={(schedule) => commit({ ...v, schedule })} />
    </div>
  );
}

const SEARCH_FREQ: [string, string][] = [["off", "Off: only when I click Find jobs"], ["daily", "Once a day"], ["weekly", "Once a week"]];
const SEARCH_DAYS: [string, string][] = [["1", "Monday"], ["2", "Tuesday"], ["3", "Wednesday"], ["4", "Thursday"], ["5", "Friday"], ["6", "Saturday"], ["0", "Sunday"]];
type SearchSchedule = { freq: string; day: string; time: string };
const scheduleDefaults = (s?: Partial<SearchSchedule>): SearchSchedule => ({ freq: s?.freq || "off", day: s?.day || "1", time: s?.time || "09:00" });
function AutomaticSearches({ value, onSave }: { value?: Partial<SearchSchedule>; onSave: (s: SearchSchedule) => void }) {
  const [s, setS] = useState<SearchSchedule>(scheduleDefaults(value));
  useEffect(() => setS(scheduleDefaults(value)), [value?.freq, value?.day, value?.time]);
  const save = (patch: Partial<SearchSchedule>) => { const next = scheduleDefaults({ ...s, ...patch }); setS(next); onSave(next); };
  return (
    <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <h3>Automatic searches</h3>
      <p className="hint">Run Find jobs automatically using your saved search profile and enabled sources.</p>
      <label className="f">How often<select value={s.freq} onChange={(e) => save({ freq: e.target.value })}>{SEARCH_FREQ.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      {s.freq === "weekly" && <label className="f">Day<select value={s.day} onChange={(e) => save({ day: e.target.value })}>{SEARCH_DAYS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>}
      {(s.freq === "weekly" || s.freq === "daily") && <label className="f">Time (India)<input type="time" value={s.time} onChange={(e) => save({ time: e.target.value })} /></label>}
      <p className="hint">Automatic searches follow your selected daily or weekly schedule. The same 20-opening daily limit applies to automatic searches.</p>
    </div>
  );
}

const KM: [number, string][] = [[10, "About 10 km"], [25, "About 25 km"], [50, "About 50 km"], [100, "About 100 km"]];
const MILES: Record<number, number> = { 10: 5, 25: 10, 50: 25, 100: 50 };
function NearMe({ near, roles, onSave }: { near: { area?: string; km?: number }; roles: string[]; onSave: (n: { area: string; km: number }) => void }) {
  const [area, setArea] = useState(near.area || ""); const km = near.km || 25; const a = (near.area || "").trim(), q = encodeURIComponent;
  return (
    <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <h3>Near me</h3>
      <div className="grid">
        <label className="f">Your area<input value={area} placeholder="e.g. Koramangala, Bengaluru" onChange={(e) => setArea(e.target.value)} onBlur={() => { if (area.trim() !== a) onSave({ area: area.trim().slice(0, 120), km }); }} /></label>
        <label className="f">Distance<select value={km} onChange={(e) => onSave({ area: area.trim().slice(0, 120), km: +e.target.value })}>{KM.map(([n, l]) => <option key={n} value={n}>{l}</option>)}</select></label>
      </div>
      {!a ? <p className="hint">Add your area to get map and job search links for companies near you.</p> : <>
        <div className="stack" style={{ gap: 4 }}>
          <a href={`https://www.google.com/maps/search/${q("software companies near " + a)}`} target="_blank" rel="noopener noreferrer">Software companies on Google Maps</a>
          <a href={`https://www.google.com/maps/search/${q("tech startups near " + a)}`} target="_blank" rel="noopener noreferrer">Tech startups on Google Maps</a>
          {roles.slice(0, 4).map((r) => <span key={r} className="stack" style={{ gap: 4 }}>
            <a href={`https://www.google.com/search?q=${q(r + " jobs near " + a)}&ibp=htl;jobs`} target="_blank" rel="noopener noreferrer">{r} jobs near you (Google Jobs)</a>
            <a href={`https://www.linkedin.com/jobs/search/?keywords=${q(r)}&location=${q(a)}&distance=${MILES[km] || 25}`} target="_blank" rel="noopener noreferrer">{r} on LinkedIn Jobs</a></span>)}
        </div>
        <p className="hint">Google Maps shows companies, not their openings. Use it to spot companies near you, then add their careers page as a source on the Openings tab. The Google Jobs and LinkedIn links show real openings around your area.</p>
      </>}
    </div>
  );
}

function Breaks({ value, onSave }: { value: any; onSave: (w: { session: number; brk: number; daily: number }) => void }) {
  const w = wbCfg(value), mins = useScreenMinutes();
  const sel = (k: "session" | "brk" | "daily", label: string) => (
    <label className="f">{label}<select value={w[k]} onChange={(e) => onSave({ ...w, [k]: +e.target.value })}>{WB_OPTS[k].map(([n, l]) => <option key={n} value={n}>{l}</option>)}</select></label>
  );
  return (
    <div className="card stack">
      <div className="row between"><h2 style={{ margin: 0 }}>Breaks</h2><span className="meta">Screen time today: {mins ?? 0} min</span></div>
      <div className="grid">{sel("session", "Break after")}{sel("brk", "Break length")}{sel("daily", "Daily time limit")}</div>
      <p className="hint">When you reach a limit, Three Doors pauses and shows a break screen. After the daily limit it stays paused for an hour. You can also mark up to 5 roles as applied per day. Screen time is counted only while this Three Doors tab is open and active. The count stays in this browser.</p>
    </div>
  );
}
