"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons.tsx";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { wipeBrowserVault } from "@/lib/client/browser-vault.ts";

const FIELDS: [string, string, string][] = [
  ["first_name", "First name (how you sign messages)", "Hardi"], ["last_role", "Your last job title", "Product Manager"], ["last_company", "Last company", "PayU"],
  ["owned", "What you owned there", "web checkout, payment links and the SDK"], ["results", "Your best results, with their numbers", "Filtering bot traffic lifted checkout conversion 7%"], ["background", "Background before that (optional)", "Chartered Accountant"],
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
