"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client.ts";
import { useMe } from "@/lib/client/useMe.ts";
import { StatsBar, LinkedInNudge, SaveHint, useSaver } from "@/components/board.tsx";
import { ALL_STATUSES, daysSince, lastDate, nextStep, normUrl, reached, typeLabel, type Contact, type Role } from "@/lib/client/pipeline.ts";

const stage = (c: Contact) => c.status === "Closed" ? "closed" : reached(c) >= 4 ? "warm" : reached(c) >= 1 ? "mid" : "new";

export default function People() {
  const sb = supabaseBrowser(); const me = useMe(); const { state, queue } = useSaver();
  const [cs, setCs] = useState<Contact[] | null>(null); const [roles, setRoles] = useState<Role[]>([]);
  const [q, setQ] = useState(""); const [type, setType] = useState(""); const [st, setSt] = useState("");
  useEffect(() => { Promise.all([sb.from("contacts").select("*"), sb.from("roles").select("*")]).then(([c, r]: any[]) => { setCs(c.data ?? []); setRoles(r.data ?? []); }); }, []);
  const byId = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r])), [roles]);
  const isDue = (c: Contact) => c.status !== "Closed" && nextStep(c)[1];
  const activeRoleIds = new Set(roles.filter((r) => !r.archived_at).map((r) => r.id));
  const all = (cs ?? []).filter((c) => activeRoleIds.has(c.role_id));
  const rows = useMemo(() => all.filter((c) => {
    const r = byId[c.role_id];
    if (type && c.type !== type) return false; if (st === "due" && !isDue(c)) return false; if (st && st !== "due" && c.status !== st) return false;
    return !q.trim() || [c.name, c.title, c.email, c.notes, r?.company, r?.title, typeLabel(c)].join(" ").toLowerCase().includes(q.trim().toLowerCase());
  }).sort((a, b) => (Number(isDue(b)) - Number(isDue(a))) || lastDate(b).localeCompare(lastDate(a))), [all, byId, q, type, st]);
  if (!cs) return <p className="meta">Loading…</p>;
  const dueCount = all.filter(isDue).length;
  const saveNote = (id: string, notes: string) => {
    setCs((x) => (x ?? []).map((c) => c.id === id ? { ...c, notes } : c));
    queue(`n:${id}`, () => sb.from("contacts").update({ notes: notes || null, updated_at: new Date().toISOString() }).eq("id", id));
  };
  return (
    <div className="stack">
      <div className="page-head"><div><h1>People</h1><p>Everyone you've added across all roles, with their latest status and your notes.</p></div><SaveHint state={state} /></div>
      <StatsBar roles={roles} contacts={all} />
      <LinkedInNudge url={me ? me.linkedin_url : "https://www.linkedin.com/in/x"} />
      {!all.length ? <div className="card stack" style={{ alignItems: "flex-start" }}><p style={{ margin: 0 }}>No one added yet. Add people from a role card on the Roles tab and they all show up here, with their latest status and your notes.</p><Link className="btn primary" href="/roles">Go to Roles</Link></div> : <>
        <div className="row">
          <input style={{ flex: 1, minWidth: 200 }} placeholder="Search name, company, notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
          <select style={{ width: "auto" }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type"><option value="">Everyone</option><option value="hm">Hiring managers</option><option value="rec">Recruiters</option><option value="other">Other departments</option></select>
          <select style={{ width: "auto" }} value={st} onChange={(e) => setSt(e.target.value)} aria-label="Filter by status"><option value="">Any status</option><option value="due">Needs action ({dueCount})</option>{ALL_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
          <span className="meta">{rows.length} of {all.length} people</span>
        </div>
        {!rows.length ? <p className="card meta">No one matches these filters.</p> :
          <div className="tscroll card" style={{ padding: 0 }}><table className="ppl"><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Next step</th><th>Notes</th></tr></thead><tbody>
            {rows.map((c) => { const r = byId[c.role_id]; const [ns] = nextStep(c); const ld = lastDate(c); const nm = c.name || "(no name yet)"; const url = normUrl(c.linkedin_url);
              return (<tr key={c.id}>
                <td><div className="pname">{url ? <a href={url} target="_blank" rel="noopener noreferrer">{nm}</a> : nm}</div><div className="meta">{typeLabel(c)}{c.title ? ` · ${c.title}` : ""}</div>{c.email && <div className="meta mono" style={{ wordBreak: "break-all" }}>{c.email}</div>}</td>
                <td><Link href={`/roles#role-${c.role_id}`}>{r?.company}</Link><div className="meta">{r?.title}</div></td>
                <td><span className={`chip st-${stage(c)}`}>{c.status}</span>{ld && <div className="meta">{ld} · {daysSince(ld) ? `${daysSince(ld)}d ago` : "today"}</div>}</td>
                <td className={isDue(c) ? "due" : ""}>{c.status === "Closed" ? "–" : ns}</td>
                <td style={{ minWidth: 220 }}><textarea rows={2} value={c.notes ?? ""} placeholder="Add a note" aria-label={`Notes on ${c.name || typeLabel(c)}`} onChange={(e) => saveNote(c.id, e.target.value)} /></td>
              </tr>); })}
          </tbody></table></div>}
        <p className="hint">Notes save as you type and show on the person's card in Roles. Click a company to jump to its role card.</p>
      </>}
    </div>
  );
}
