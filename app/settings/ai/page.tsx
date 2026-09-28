"use client";
import { useEffect, useState } from "react";
import { api, ApiError, currentUid, getConnections, type Conn } from "@/lib/client/ai.ts";
import { forgetBrowserKey, loadBrowserKey, saveBrowserKey } from "@/lib/client/browser-vault.ts";

type Method = { type: "api_key"; keyUrl: string; keyPrefixHint?: string; billing: string } | { type: "oauth"; enabled: boolean; note: string };
type Prov = { id: string; displayName: string; authMethods: Method[] };

export default function AISettings() {
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
    <div className="stack">
      <div><h1>Connect your AI</h1><p className="meta" style={{ margin: 0 }}>Three Doors runs on your own AI account. Usage is billed by your provider to you, not by us.</p></div>
      {err && <div className="msg err">{err}</div>}
      {!active && conns.length === 0 && <div className="msg warn">No AI connected yet. Pick a provider below.</div>}
      <div className="prov">
        {provs.map((p) => {
          const c = conns.find((x) => x.provider === p.id);
          return c && open !== p.id
            ? <Connected key={p.id} p={p} c={c} hasLocal={local[p.id]} onChange={() => setOpen(p.id)} reload={load} />
            : <ConnectCard key={p.id} p={p} open={open === p.id} onOpen={() => setOpen(open === p.id ? null : p.id)} done={() => { setOpen(null); load(); }} replacing={!!c} />;
        })}
      </div>
    </div>
  );
}

function ConnectCard({ p, open, onOpen, done, replacing }: { p: Prov; open: boolean; onOpen: () => void; done: () => void; replacing: boolean }) {
  const key = p.authMethods.find((m) => m.type === "api_key") as Extract<Method, { type: "api_key" }> | undefined;
  const oauth = p.authMethods.find((m) => m.type === "oauth") as Extract<Method, { type: "oauth" }> | undefined;
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
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>{p.displayName}</h2><span className="chip mute">API key</span></div>
      {!open ? <button className="primary" onClick={onOpen}>{replacing ? "Cancel change" : `Continue with ${p.displayName}`}</button> : null}
      {open && replacing && <button onClick={onOpen}>Cancel</button>}
      {open && key && (
        <form onSubmit={connect} className="stack">
          <p className="hint">{p.displayName} connects with an API key you create in your own account. {key.billing}</p>
          <a href={key.keyUrl} target="_blank" rel="noopener noreferrer">Create a key on {new URL(key.keyUrl).host} ↗</a>
          <label className="f">API key<input type="password" autoComplete="off" spellCheck={false} placeholder={key.keyPrefixHint ? `${key.keyPrefixHint}…` : ""} value={apiKey} onChange={(e) => setKey(e.target.value)} required /></label>
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="meta" style={{ marginBottom: 6 }}>Where should we keep it?</legend>
            <label className={`opt${storage === "server_vault" ? " on" : ""}`}><input type="radio" name={`st-${p.id}`} checked={storage === "server_vault"} onChange={() => setStorage("server_vault")} /><span><b>Encrypted on our server</b><br /><span className="hint">Works on any device you sign in from. We store it encrypted; we never show it again.</span></span></label>
            <label className={`opt${storage === "browser_only" ? " on" : ""}`}><input type="radio" name={`st-${p.id}`} checked={storage === "browser_only"} onChange={() => setStorage("browser_only")} /><span><b>Only in this browser</b><br /><span className="hint">We keep only the last 4 characters. The key passes through our server only while a request runs. Enter it again on other devices.</span></span></label>
          </fieldset>
          {msg && <div className="msg err">{msg}</div>}
          <button className="primary" disabled={busy || apiKey.trim().length < 20}>{busy ? "Checking the key…" : "Check and connect"}</button>
          {oauth && <p className="hint">{oauth.note}</p>}
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
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>{p.displayName}</h2>{c.is_active ? <span className="chip">In use</span> : <button onClick={async () => { await api.post("/api/ai/update", { provider: c.provider, active: true }); reload(); }}>Use this one</button>}</div>
      <dl className="kv">
        <dt>Status</dt><dd>{missing ? <span className="due">Key not in this browser</span> : c.status === "connected" ? "Connected" : "Key rejected"}</dd>
        <dt>Account</dt><dd className="meta">Not available with API keys</dd>
        <dt>Connection</dt><dd>API key ending …{c.key_hint}</dd>
        <dt>Stored</dt><dd>{c.storage === "server_vault" ? "Encrypted on our server" : "Only in your browser"}</dd>
        <dt>Model</dt><dd>{models ? <select value={c.default_model ?? ""} onChange={async (e) => { await api.post("/api/ai/update", { provider: c.provider, model: e.target.value }); reload(); }}>{models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select> : <span>{c.default_model ?? "none"} <button className="link" onClick={loadModels}>Change</button></span>}</dd>
        <dt>Checked</dt><dd className="meta">{c.validated_at ? new Date(c.validated_at).toLocaleString() : "–"}</dd>
      </dl>
      {missing && <div className="msg warn">This key is saved in a different browser. Use "Change key" to enter it here.</div>}
      {msg && <div className="msg err">{msg}</div>}
      <div className="row">
        <button onClick={onChange}>Change key</button>
        {confirm ? <button className="danger" onClick={async () => { await api.post("/api/ai/disconnect", { provider: c.provider }); const uid = await currentUid(); if (uid) await forgetBrowserKey(uid, c.provider); reload(); }}>Click again to disconnect</button>
          : <button className="danger" onClick={() => setConfirm(true)}>Disconnect</button>}
      </div>
    </div>
  );
}
