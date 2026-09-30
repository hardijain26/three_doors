"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons.tsx";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { wipeBrowserVault } from "@/lib/client/browser-vault.ts";
import { WB_OPTS, setWbConfig, useScreenMinutes, wbCfg } from "@/lib/client/wellbeing.ts";
import { api, ApiError, currentUid, getConnections, type Conn } from "@/lib/client/ai.ts";
import { forgetBrowserKey, loadBrowserKey, saveBrowserKey } from "@/lib/client/browser-vault.ts";

/** CONSTANTS */
const FIELDS: [string, string, string][] = [
  ["first_name", "First name (how you sign messages)", "Hardi"], ["last_role", "Your last job title", "Product Manager"], ["last_company", "Last company", "PayU"],
  ["owned", "What you owned there", "web checkout, payment links and the SDK"], ["results", "Your best results, with their numbers", "Filtering bot traffic lifted checkout conversion 7%"], ["background", "Background before that (optional)", "Chartered Accountant"], ["based_in", "Where you live now", "Bengaluru, India"], ["portfolio", "Portfolio or website (optional)", "yourname.com"], ["linkedin_url", "Your LinkedIn profile URL", "https://www.linkedin.com/in/your-name"],
];
const LISTS: [string, string, string][] = [["roles", "Job titles to search for", "e.g. Growth Product Manager"], ["countries", "Countries", "e.g. Netherlands"], ["cities", "Cities", "e.g. Amsterdam"], ["skip", "Industries to skip", "e.g. crypto"]];
const SEARCH_FREQ: [string, string][] = [["off", "Off: only when I click Find jobs"], ["daily", "Once a day"], ["weekly", "Once a week"]];
const SEARCH_DAYS: [string, string][] = [["1", "Monday"], ["2", "Tuesday"], ["3", "Wednesday"], ["4", "Thursday"], ["5", "Friday"], ["6", "Saturday"], ["0", "Sunday"]];
const KM: [number, string][] = [[10, "About 10 km"], [25, "About 25 km"], [50, "About 50 km"], [100, "About 100 km"]];
const MILES: Record<number, number> = { 10: 5, 25: 10, 50: 25, 100: 50 };

type SearchSchedule = { freq: string; day: string; time: string };
type Method = { type: "api_key"; keyUrl: string; keyPrefixHint?: string; billing: string } | { type: "oauth"; enabled: boolean; note: string };
type Prov = { id: string; displayName: string; authMethods: Method[] };

export default function ProfileSettings({ section }: { section: "about" | "settings" }) {
  const sb = supabaseBrowser(); const router = useRouter();
  const [p, setP] = useState<Record<string, any> | null>(null); const [saved, setSaved] = useState("");
  
  useEffect(() => { 
    sb.auth.getUser().then(async ({ data }: { data: { user: { id: string } | null } }) => { 
      if (!data.user) return; 
      const { data: row } = await sb.from("profiles").select("*").eq("id", data.user.id).single(); 
      setP(row); 
    }); 
  }, []);

  const save = async (patch: Record<string, any>) => { 
    if (!p) return;
    setP({ ...p, ...patch }); 
    await sb.from("profiles").update(patch).eq("id", p.id); 
    setSaved("Saved"); setTimeout(() => setSaved(""), 1200); 
  };

  if (!p) return <p className="meta">Loading…</p>;

  return (
    <div className={`stack profile-settings${section === "about" ? " about-page" : ""}`}>
      <div className="page-head"><div>
        <h1>{section === "about" ? "About" : "Settings"}</h1>
        <p>{section === "about" ? "Your personal details and career path." : "Manage AI connections, job search, breaks, and account data."}</p>
      </div></div>
      {section === "about" && <AboutUser profile={p} onSave={save} savedStatus={saved} />}
      {section === "settings" && <>
        <AIConnections />
        <SearchSettings profile={p} onSave={save} />
        <WellbeingSettings profile={p} onSave={save} />
        <DataControls profile={p} onSave={save} router={router} />
      </>}
    </div>
  );
}

function AIConnections() {
  const [provs, setProvs] = useState<Prov[]>([]); const [conns, setConns] = useState<Conn[]>([]);
  const [open, setOpen] = useState<string | null>(null); const [err, setErr] = useState("");
  const [local, setLocal] = useState<Record<string, boolean>>({});

  async function load() {
    try {
      const d = await getConnections(); setProvs(d.providers); setConns(d.connections);
      const l: Record<string, boolean> = {};
      const uid = await currentUid();
      for (const c of d.connections) if (c.storage === "browser_only") l[c.provider] = !!(uid && await loadBrowserKey(uid, c.provider));
      setLocal(l);
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  const active = conns.find((c) => c.is_active);
  return (
    <div className="card stack">
      <div className="row between"><h2 style={{ margin: 0 }}>Connect your AI</h2><span className="meta">Usage billed by provider</span></div>
      <p className="hint">Three Doors runs on your own AI account. We never store your usage data.</p>
      {err && <div className="msg err">{err}</div>}
      {!active && conns.length === 0 && <div className="msg warn">No AI connected yet. Pick a provider below.</div>}
      <div className="prov">
        {provs.map((p) => {
          const c = conns.find((x) => x.provider === p.id);
          if (c && open !== p.id) {
            return <Connected key={p.id} p={p} c={c} hasLocal={local[p.id]} onChange={() => setOpen(p.id)} reload={load} />;
          }
          return <ConnectCard key={p.id} p={p} open={open === p.id} onOpen={() => setOpen(open === p.id ? null : p.id)} done={() => { setOpen(null); load(); }} replacing={!!c} />;
        })}
      </div>
    </div>
  );
}

function ConnectCard({ p, open, onOpen, done, replacing }: { p: Prov; open: boolean; onOpen: () => void; done: () => void; replacing: boolean }) {
  const key = p.authMethods.find((m) => m.type === "api_key") as Extract<Method, { type: "api_key" }> | undefined;
  const [apiKey, setKey] = useState(""); const [storage, setStorage] = useState<"server_vault" | "browser_only">("server_vault");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  async function connect(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      await api.post("/api/ai/connect", { provider: p.id, apiKey: apiKey.trim(), storage });
      const uid = await currentUid(); if (!uid) throw new ApiError("unauthorized", "Sign in again.");
      if (storage === "browser_only") await saveBrowserKey(uid, p.id, apiKey.trim()); else await forgetBrowserKey(uid, p.id);
      setKey(""); done();
    } catch (e) { setMsg(e instanceof ApiError ? e.message : "Couldn't connect."); }
    setBusy(false);
  }
  return (
    <div className="card stack" style={{ border: "1px solid var(--line)", padding: 12, borderRadius: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0, fontSize: "small" }}>{p.displayName}</h2><span className="chip mute">API key</span></div>
      {!open && <button className="primary" style={{ padding: 4 }} onClick={onOpen}>{replacing ? "Change key" : `Connect ${p.displayName}`}</button>}
      {open && (
        <form onSubmit={connect} className="stack" style={{ marginTop: 8 }}>
          <p className="hint" style={{ fontSize: "small" }}>{key?.billing}</p>
          <label className="f" style={{ fontSize: "small" }}>API key<input type="password" autoComplete="off" spellCheck={false} placeholder={key?.keyPrefixHint ? `${key.keyPrefixHint}…` : ""} value={apiKey} onChange={(e) => setKey(e.target.value)} required /></label>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="meta" style={{ fontSize: "small", marginBottom: 4 }}>Storage</legend>
            <label className={`opt${storage === "server_vault" ? " on" : ""}`}><input type="radio" name={`st-${p.id}`} checked={storage === "server_vault"} onChange={() => setStorage("server_vault")} /><span style={{ fontSize: "small" }}>Encrypted server</span></label>
            <label className={`opt${storage === "browser_only" ? " on" : ""}`}><input type="radio" name={`st-${p.id}`} checked={storage === "browser_only"} onChange={() => setStorage("browser_only")} /><span style={{ fontSize: "small" }}>Browser only</span></label>
          </fieldset>
          {msg && <div className="msg err" style={{ fontSize: "small" }}>{msg}</div>}
          <button className="primary" disabled={busy || apiKey.trim().length < 20}>{busy ? "Checking…" : "Connect"}</button>
        </form>
      )}
    </div>
  );
}

function Connected({ p, c, hasLocal, onChange, reload }: { p: Prov; c: Conn; hasLocal?: boolean; onChange: () => void; reload: () => void }) {
  const [models, setModels] = useState<{ id: string; label: string }[] | null>(null); const [msg, setMsg] = useState(""); const [confirm, setConfirm] = useState(false);
  async function loadModels() {
    setMsg("");
    try { const uid = await currentUid(); const key = c.storage === "browser_only" && uid ? await loadBrowserKey(uid, c.provider) : null; setModels((await api.post("/api/ai/models", { provider: c.provider }, key)).models); }
    catch (e) { setMsg((e as Error).message); }
  }
  const missing = c.storage === "browser_only" && hasLocal === false;
  
  const renderModelSection = () => {
    if (!models) {
      return (
        <span>
          {c.default_model ?? "none"} 
          <button className="link" onClick={loadModels}>Change</button>
        </span>
      );
    }
    return (
      <select value={c.default_model ?? ""} onChange={async (e) => { await api.post("/api/ai/update", { provider: c.provider, model: e.target.value }); reload(); }}>
        {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
    );
  };

  return (
    <div className="card stack" style={{ border: "1px solid var(--line)", padding: 12, borderRadius: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0, fontSize: "small" }}>{p.displayName}</h2>{c.is_active ? <span className="chip ok"><Icon name="check" />In use</span> : <button onClick={async () => { await api.post("/api/ai/update", { provider: c.provider, active: true }); reload(); }}>Use this one</button>}</div>
      <dl className="kv" style={{ fontSize: "small" }}>
        <dt>Status</dt><dd>{missing ? <span className="due">Key missing in browser</span> : c.status === "connected" ? "Connected" : "Key rejected"}</dd>
        <dt>Model</dt><dd>{renderModelSection()}</dd>
      </dl>
      {msg && <div className="msg err" style={{ fontSize: "small" }}>{msg}</div>}
      <div className="row" style={{ gap: 8 }}>
        <button onClick={onChange} style={{ fontSize: "small" }}>Change key</button>
        {confirm ? <button className="danger" style={{ fontSize: "small" }} onClick={async () => { await api.post("/api/ai/disconnect", { provider: c.provider }); const uid = await currentUid(); if (uid) await forgetBrowserKey(uid, c.provider); reload(); }}>Confirm disconnect</button>
          : <button className="danger" style={{ fontSize: "small" }} onClick={() => setConfirm(true)}>Disconnect</button>}
      </div>
    </div>
  );
}

function AboutUser({ profile, onSave, savedStatus }: { profile: any; onSave: any; savedStatus: string }) {
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>About you</h2><span className="meta">{savedStatus}</span></div>
      <p className="hint">Your AI drafts are written from these saved facts. Keep the real numbers.</p>
      <div className="about-fields">
        {FIELDS.map(([k, l, ph]) => {
          const wide = k === "owned" || k === "results";
          if (k === "results") {
            return <label key={k} className={`f${wide ? " about-field-wide" : ""}`}>{l}<textarea rows={3} defaultValue={profile[k] ?? ""} placeholder={ph} onBlur={(e) => onSave({ [k]: e.target.value })} /></label>;
          }
          return <label key={k} className={`f${wide ? " about-field-wide" : ""}`}>{l}<input defaultValue={profile[k] ?? ""} placeholder={ph} onBlur={(e) => onSave({ [k]: e.target.value })} /></label>;
        })}
      </div>
    </div>
  );
}

function SearchSettings({ profile, onSave }: { profile: any; onSave: any }) {
  const [v, setV] = useState<any>({ roles: [], countries: [], cities: [], skip: [], remote: {}, ...profile.search });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const commit = (next: any) => { setV(next); onSave({ search: next }); };
  const add = (k: string) => { 
    const vals = (drafts[k] || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean); 
    if (!vals.length) return; 
    const list = [...(v[k] || [])]; 
    vals.forEach((x) => { if (!list.some((y: string) => y.toLowerCase() === x.toLowerCase())) list.push(x); }); 
    setDrafts({ ...drafts, [k]: "" }); 
    commit({ ...v, [k]: list }); 
  };

  const renderListItems = (k: string) => {
    const list = v[k] || [];
    if (!list.length) return <span className="hint">None yet</span>;
    return list.map((x: string, i: number) => (
      <span key={x} className="chip mute">
        {x}
        <button className="link" style={{ minHeight: 0, textDecoration: "none" }} onClick={() => commit({ ...v, [k]: v[k].filter((_: string, j: number) => j !== i) })}>×</button>
      </span>
    ));
  };

  return (
    <div className="card stack">
      <h2>Job search</h2>
      <p className="hint">Used by Find jobs on the Openings tab and by the "match my profile" filter.</p>
      <div className="grid">
        {LISTS.map(([k, l, ph]) => (
          <div key={k} className="stack" style={{ gap: 6 }}>
            <span className="f">{l}</span>
            <div className="row" style={{ gap: 6 }}>{renderListItems(k)}</div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input value={drafts[k] || ""} placeholder={ph} onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(k); } }} />
              <button onClick={() => add(k)}>Add</button>
            </div>
          </div>
        ))}
      </div>
      <div className="row">
        {[["europe", "Remote within Europe"], ["worldwide", "Remote, anywhere"], ["india", "Remote from India"]].map(([k, l]) => (
          <label key={k} className="row" style={{ gap: 8 }}>
            <input type="checkbox" style={{ width: 18, minHeight: 18 }} checked={!!v.remote?.[k]} onChange={(e) => commit({ ...v, remote: { ...(v.remote || {}), [k]: e.target.checked } })} />{l}
          </label>
        ))}
      </div>
      <NearMe near={v.near || {}} roles={v.roles || []} onSave={(near) => commit({ ...v, near })} />
      <AutomaticSearches value={v.schedule} onSave={(schedule) => commit({ ...v, schedule })} />
    </div>
  );
}

function NearMe({ near, roles, onSave }: { near: { area?: string; km: number }; roles: string[]; onSave: (n: { area: string; km: number }) => void }) {
  const [area, setArea] = useState(near.area || ""); const km = near.km || 25; const a = (near.area || "").trim(), q = encodeURIComponent;

  const handleAreaBlur = () => {
    if (area.trim() !== a) {
      onSave({ area: area.trim().slice(0, 120), km });
    }
  };

  const handleDistanceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSave({ area: area.trim().slice(0, 120), km: +e.target.value });
  };

  const renderLinks = () => {
    if (!a) return <p className="hint">Add your area to get map and job search links for companies near you.</p>;
    return (
      <div className="stack" style={{ gap: 4 }}>
        <a href={`https://www.google.com/maps/search/${q("software companies near " + a)}`} target="_blank" rel="noopener noreferrer">Software companies on Google Maps</a>
        <a href={`https://www.google.com/maps/search/${q("tech startups near " + a)}`} target="_blank" rel="noopener noreferrer">Tech startups on Google Maps</a>
        {roles.slice(0, 4).map((r) => (
          <span key={r} className="stack" style={{ gap: 4 }}>
            <a href={`https://www.google.com/search?q=${q(r + " jobs near " + a)}&ibp=htl;jobs`} target="_blank" rel="noopener noreferrer">{r} jobs near you (Google Jobs)</a>
            <a href={`https://www.linkedin.com/jobs/search/?keywords=${q(r)}&location=${q(a)}&distance=${MILES[km] || 25}`} target="_blank" rel="noopener noreferrer">{r} on LinkedIn Jobs</a>
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="stack" style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <h3>Near me</h3>
      <div className="grid">
        <label className="f">Your area<input value={area} placeholder="e.g. Koramangala, Bengaluru" onChange={(e) => setArea(e.target.value)} onBlur={handleAreaBlur} /></label>
        <label className="f">Distance<select value={km} onChange={handleDistanceChange}>{KM.map(([n, l]) => <option key={n} value={n}>{l}</option>)}</select></label>
      </div>
      {renderLinks()}
    </div>
  );
}

function AutomaticSearches({ value, onSave }: { value?: Partial<SearchSchedule>; onSave: (s: SearchSchedule) => void }) {
  const scheduleDefaults = (s?: Partial<SearchSchedule>): SearchSchedule => ({ freq: s?.freq || "off", day: s?.day || "1", time: s?.time || "09:00" });
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
    </div>
  );
}

function WellbeingSettings({ profile, onSave }: { profile: any; onSave: any }) {
  const w = wbCfg(profile.wellbeing), mins = useScreenMinutes();
  const sel = (k: "session" | "brk" | "daily", label: string) => (
    <label className="f">{label}<select value={w[k]} onChange={(e) => onSave({ wellbeing: { ...w, [k]: +e.target.value } })}>{WB_OPTS[k].map(([n, l]) => <option key={n} value={n}>{l}</option>)}</select></label>
  );
  return (
    <div className="card stack">
      <div className="row between"><h2 style={{ margin: 0 }}>Breaks</h2><span className="meta">Screen time today: {mins ?? 0} min</span></div>
      <div className="grid">{sel("session", "Break after")}{sel("brk", "Break length")}{sel("daily", "Daily time limit")}</div>
      <p className="hint">When you reach a limit, Three Doors pauses and shows a break screen. Screen time is counted only while this tab is open.</p>
    </div>
  );
}

function DataControls({ profile, onSave, router }: { profile: any; onSave: any; router: any }) {
  const [del, setDel] = useState(false);
  return (
    <div className="card stack">
      <h2>Your data</h2>
      <div className="row">
        <a className="btn" href="/api/account/export"><Icon name="download" />Download my available saved data (JSON)</a>
        {del && <button className="danger" onClick={async () => { const r = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); if (!r.ok) { alert("We couldn't delete your saved data. Please try again."); return; } await wipeBrowserVault(); router.push("/"); }}>Yes, delete my saved data</button>}
        {!del && <button className="danger" onClick={() => setDel(true)}>Delete your saved data and AI keys</button>}
      </div>
      <div className="card stack" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: "small" }}>Product analytics</h2>
        <label className="opt" style={{ cursor: "pointer" }}><input type="checkbox" checked={!profile.telemetry_opt_out} onChange={(e) => onSave({ telemetry_opt_out: !e.target.checked })} /><span style={{ fontSize: "small" }}>Share anonymous product events. Never your content.</span></label>
      </div>
      <p className="hint">Deleting removes your saved CVs, career information, roles, contacts, openings, sources, search history, and stored keys. Your Three Doors account remains active.</p>
    </div>
  );
}
