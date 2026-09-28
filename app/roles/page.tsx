"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { nextStep, reached, type Contact, type Role } from "@/lib/client/pipeline.ts";

export default function Roles() {
  const sb = supabaseBrowser();
  const [roles, setRoles] = useState<Role[] | null>(null); const [contacts, setContacts] = useState<Contact[]>([]);
  const [adding, setAdding] = useState(false); const [f, setF] = useState({ company: "", title: "", location: "", link: "", fit: "Good" });
  async function load() {
    const [r, c] = await Promise.all([sb.from("roles").select("*").order("created_at", { ascending: false }), sb.from("contacts").select("*")]);
    setRoles(r.data ?? []); setContacts(c.data ?? []);
  }
  useEffect(() => { load(); }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await sb.from("roles").insert({ ...f, location: f.location || null, link: f.link || null });
    if (!error) { sb.rpc("track_event", { p_event: "role_created", p_props: {} }).then(() => {}, () => {}); setF({ company: "", title: "", location: "", link: "", fit: "Good" }); setAdding(false); load(); }
  }
  if (!roles) return <p className="meta">Loading…</p>;
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}><div><h1>Roles</h1><p className="meta" style={{ margin: 0 }}>The jobs you're going after. Open one to add its people.</p></div><button className="primary" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "+ Add role"}</button></div>
      {adding && (
        <form onSubmit={add} className="card grid">
          <label className="f">Company<input required value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></label>
          <label className="f">Job title<input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="f">Location<input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
          <label className="f">Job post link<input type="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></label>
          <label className="f">Fit<select value={f.fit} onChange={(e) => setF({ ...f, fit: e.target.value })}><option>Strong</option><option>Good</option><option>Stretch</option></select></label>
          <div className="row" style={{ alignSelf: "end" }}><button className="primary">Save role</button></div>
        </form>
      )}
      {!roles.length && !adding && <div className="card"><p style={{ margin: 0 }}>No roles yet. Add the first job you want to go after.</p></div>}
      <div className="grid">
        {roles.map((r) => {
          const cs = contacts.filter((c) => c.role_id === r.id), sent = cs.filter((c) => reached(c) >= 1).length, due = cs.filter((c) => c.status !== "Closed" && nextStep(c)[1]).length;
          return (
            <Link key={r.id} href={`/roles/${r.id}`} className="card stack" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>{r.company}</h2>{r.fit && <span className={`chip${r.fit === "Stretch" ? " warn" : ""}`}>{r.fit}</span>}</div>
              <div>{r.title}</div><div className="meta">{r.location}</div>
              <div className="meta">{cs.length ? `${sent} of ${cs.length} contacted` : "No people added yet"}{due ? <span className="due"> · {due} need action</span> : null}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
