"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { ALL_STATUSES, daysSince, lastDate, nextStep, typeLabel, type Contact, type Role } from "@/lib/client/pipeline.ts";

export default function People() {
  const sb = supabaseBrowser();
  const [cs, setCs] = useState<Contact[] | null>(null); const [roles, setRoles] = useState<Record<string, Role>>({});
  const [q, setQ] = useState(""); const [type, setType] = useState(""); const [st, setSt] = useState("");
  useEffect(() => { Promise.all([sb.from("contacts").select("*"), sb.from("roles").select("*")]).then(([c, r]) => { setCs(c.data ?? []); setRoles(Object.fromEntries((r.data ?? []).map((x: Role) => [x.id, x]))); }); }, []);
  const rows = useMemo(() => (cs ?? []).filter((c) => {
    const r = roles[c.role_id]; const due = c.status !== "Closed" && nextStep(c)[1];
    if (type && c.type !== type) return false; if (st === "due" && !due) return false; if (st && st !== "due" && c.status !== st) return false;
    return !q || [c.name, c.title, c.email, c.notes, r?.company, r?.title].join(" ").toLowerCase().includes(q.toLowerCase());
  }).sort((a, b) => (Number(b.status !== "Closed" && nextStep(b)[1]) - Number(a.status !== "Closed" && nextStep(a)[1])) || lastDate(b).localeCompare(lastDate(a))), [cs, roles, q, type, st]);
  if (!cs) return <p className="meta">Loading…</p>;
  const saveNote = (id: string, notes: string) => sb.from("contacts").update({ notes, updated_at: new Date().toISOString() }).eq("id", id);
  return (
    <div className="stack">
      <div className="page-head"><div><h1>People</h1><p>Everyone you've added, across all roles.</p></div></div>
      <div className="row">
        <input style={{ flex: 1, minWidth: 200 }} placeholder="Search name, company, notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
        <select style={{ width: "auto" }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">Everyone</option><option value="hm">Hiring managers</option><option value="rec">Recruiters</option><option value="other">Other departments</option></select>
        <select style={{ width: "auto" }} value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status"><option value="">Any status</option><option value="due">Needs action</option>{ALL_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <span className="meta">{rows.length} of {cs.length}</span>
      </div>
      {!cs.length ? <div className="card">No one added yet. Open a role and add its people.</div> :
        <div className="tscroll card" style={{ padding: 0 }}><table><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Next step</th><th>Notes</th></tr></thead><tbody>
          {rows.map((c) => { const r = roles[c.role_id]; const [ns, due] = nextStep(c); const ld = lastDate(c);
            return (<tr key={c.id}>
              <td><b>{c.linkedin_url ? <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer">{c.name || "(no name yet)"}</a> : c.name || "(no name yet)"}</b><div className="meta">{typeLabel(c)}{c.title ? ` · ${c.title}` : ""}</div></td>
              <td><Link href={`/roles/${c.role_id}`}>{r?.company}</Link><div className="meta">{r?.title}</div></td>
              <td><span className={`chip${c.status === "Closed" ? " mute" : ""}`}>{c.status}</span>{ld && <div className="meta">{ld} · {daysSince(ld) ? `${daysSince(ld)}d ago` : "today"}</div>}</td>
              <td className={due && c.status !== "Closed" ? "due" : ""}>{c.status === "Closed" ? "–" : ns}</td>
              <td style={{ minWidth: 220 }}><textarea rows={2} defaultValue={c.notes ?? ""} placeholder="Add a note" aria-label="Notes" onBlur={(e) => saveNote(c.id, e.target.value)} /></td>
            </tr>); })}
        </tbody></table></div>}
    </div>
  );
}
