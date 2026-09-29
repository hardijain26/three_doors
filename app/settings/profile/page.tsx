"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons.tsx";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { wipeBrowserVault } from "@/lib/client/browser-vault.ts";
import { WB_OPTS, setWbConfig, useScreenMinutes, wbCfg } from "@/lib/client/wellbeing.ts";

const FIELDS: [string, string, string][] = [
  ["first_name", "First name (how you sign messages)", "Hardi"], ["last_role", "Your last job title", "Product Manager"], ["last_company", "Last company", "PayU"],
  ["owned", "What you owned there", "web checkout, payment links and the SDK"], ["results", "Your best results, with their numbers", "Filtering bot traffic lifted checkout conversion 7%"], ["background", "Background before that (optional)", "Chartered Accountant"], ["based_in", "Where you live now", "Bengaluru, India"], ["portfolio", "Portfolio or website (optional)", "yourname.com"], ["linkedin_url", "Your LinkedIn profile URL", "https://www.linkedin.com/in/your-name"],
];
export default function Profile() {
  const sb = supabaseBrowser(); const router = useRouter();
  const [p, setP] = useState<Record<string, any> | null>(null); const [saved, setSaved] = useState(""); const [del, setDel] = useState(false);
  useEffect(() => { sb.auth.getUser().then(async ({ data }: { data: { user: { id: string } | null } }) => { if (!data.user) return; const { data: row } = await sb.from("profiles").select("*").eq("id", data.user.id).single(); setP(row); }); }, []);
  if (!p) return <p className="meta">Loading…</p>;
  const save = async (patch: Record<string, any>) => { setP({ ...p, ...patch }); await sb.from("profiles").update(patch).eq("id", p.id); setSaved("Saved"); setTimeout(() => setSaved(""), 1200); };
  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="page-head"><div><h1>Profile &amp; privacy</h1><p>What your AI drafts are written from, and your data controls.</p></div></div>
      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>About you</h2><span className="meta">{saved}</span></div>
        <p className="hint">Your AI drafts are written from these facts. Keep the real numbers.</p>
        {FIELDS.map(([k, l, ph]) => <label key={k} className="f">{l}{k === "results" ? <textarea rows={3} defaultValue={p[k] ?? ""} placeholder={ph} onBlur={(e) => save({ [k]: e.target.value })} /> : <input defaultValue={p[k] ?? ""} placeholder={ph} onBlur={(e) => save({ [k]: e.target.value })} />}</label>)}
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
          <a className="btn" href="/api/account/export"><Icon name="download" />Download all my data (JSON)</a>
          {del ? <button className="danger" onClick={async () => { const r = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!r.ok) { alert("Deleting failed. Nothing was signed out; try again."); return; } await wipeBrowserVault(); router.push("/"); }}>Click again: delete everything</button>
            : <button className="danger" onClick={() => setDel(true)}>Delete my data and keys</button>}
        </div>
        <p className="hint">Deleting removes your roles, contacts, notes, AI connections and stored keys. Anonymous analytics can't be linked back to you, so there's nothing there to delete.</p>
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
    </div>
  );
}

// "Near me", as in the tracker: links only, nothing is fetched.
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
    <label className="f">{label}<select value={w[k]} onChange={(e) => onSave({ ...w, [k]: +e.target.value })}>{WB_OPTS[k].map(([n, l]) => <option key={n} value={n}>{l}</option>)}</select></label>);
  return (
    <div className="card stack">
      <div className="row between"><h2 style={{ margin: 0 }}>Breaks</h2><span className="meta">Today so far: {mins ?? 0} min</span></div>
      <div className="grid">{sel("session", "Break after")}{sel("brk", "Break length")}{sel("daily", "Daily time limit")}</div>
      <p className="hint">When you reach a limit, Three Doors pauses and shows a break screen. After the daily limit it stays paused for an hour. You can also mark up to 5 roles as applied per day. Time counts only while this tab is open and you're using it, and the count stays in this browser.</p>
    </div>
  );
}
