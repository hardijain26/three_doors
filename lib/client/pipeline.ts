export const STEPS = ["Found", "Request sent", "Accepted", "Messaged", "Replied", "Coffee chat", "Referral given"] as const;
export const SHORT: Record<string, string> = { "Request sent": "Sent", Accepted: "Accept", Messaged: "Message", Replied: "Reply", "Coffee chat": "Coffee", "Referral given": "Referral" };
export const ALL_STATUSES = ["Not found", ...STEPS, "Closed"];
export type ContactType = "hm" | "rec" | "other";
export interface Contact {
  id: string; role_id: string; type: ContactType; dept: string | null; name: string | null; title: string | null; linkedin_url: string | null; email: string | null; notes: string | null;
  status: string; status_history: Record<string, string>; common: { point: string; from: string }[] | null; followup: string | null; updated_at: string; created_at?: string;
  website?: string | null; mutual?: string | null; shared?: string | null; topic?: string | null; msg_coffee?: string | null; msg_ref?: string | null; hook?: string | null; status_on?: string | null;
}
export interface Role { id: string; company: string; title: string; location: string | null; link: string | null; fit: string | null; angle: string | null; applied_on: string | null; created_at: string; opening_id?: string | null; cid?: string | null }

export const typeLabel = (c: Pick<Contact, "type" | "dept">) => c.type === "hm" ? "Hiring manager" : c.type === "rec" ? "Recruiter" : `${c.dept || "Other"} team`;
export const today = () => new Date().toISOString().slice(0, 10);
export const istToday = () => new Date(Date.now() + 19_800_000).toISOString().slice(0, 10);
export const daysSince = (d?: string | null) => d ? Math.floor((Date.parse(today()) - Date.parse(d)) / 864e5) : 0;
export const reached = (c: Contact) => Math.max(c.status === "Closed" || c.status === "Not found" ? -1 : STEPS.indexOf(c.status as any), ...Object.keys(c.status_history || {}).map((s) => STEPS.indexOf(s as any)));
export const lastDate = (c: Pick<Contact, "status_history" | "status_on">) => [c.status_on || "", ...Object.values(c.status_history || {})].sort().pop() || "";
/** The date the current status was set: the tracker's "since" date, which resets whenever the status changes. */
export const statusSince = (c: Pick<Contact, "status" | "status_history" | "status_on">) => c.status_on || c.status_history?.[c.status] || "";
export const APPLY_CAP = 5;

/** [what to do next, is it overdue]. */
export function nextStep(c: Contact): [string, boolean] {
  const n = daysSince(statusSince(c));
  switch (c.status) {
    case "Not found": return ["Find this person", false];
    case "Found": return ["Send connection request", false];
    case "Request sent": return n >= 21 ? ["Pending 3 weeks: withdraw it", true] : [`Waiting on accept (${n}d)`, false];
    case "Accepted": return ["Send the follow-up message today", true];
    case "Messaged": return n >= 7 ? ["No reply in a week: send one nudge", true] : [`Waiting on reply (${n}d)`, false];
    case "Replied": return ["Reply within a day and ask for a coffee chat", true];
    case "Coffee chat": return ["Thank them, then ask for a referral", true];
    case "Referral given": return ["Thank them, then apply through the referral", false];
    default: return ["Done", false];
  }
}
/** Colour of the next-step box: red when overdue, green when it's yours to act on now. */
export const nextKind = (c: Contact) => c.status === "Closed" ? "" : nextStep(c)[1] ? "due" : ["Not found", "Found", "Referral given"].includes(c.status) ? "go" : "";

const TQ: Record<ContactType, string> = { hm: "Head of Product OR Director of Product OR Group Product Manager", rec: "recruiter OR talent acquisition", other: "" };
/** LinkedIn people search. With the company's LinkedIn ID it filters to current staff only. */
export function searchUrl(company: string, type: ContactType, dept?: string | null, cid?: string | null) {
  const q = type === "other" ? `"${(dept || "Product").trim()}"` : TQ[type];
  if (cid) return "https://www.linkedin.com/search/results/people/?currentCompany=" + encodeURIComponent(`["${cid}"]`) + "&keywords=" + encodeURIComponent(q) + "&origin=FACETED_SEARCH";
  return "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(`"${company}" ${q}`);
}
export function parseCid(v: string) {
  v = (v || "").trim(); try { v = decodeURIComponent(v); } catch { /* keep raw */ }
  const m = v.match(/currentCompany=\[?"?(\d+)/) || v.match(/company\/(\d+)/) || v.match(/^(\d{2,})$/);
  return m ? m[1] : "";
}
export function nameFromUrl(u: string) {
  const m = (u || "").match(/linkedin\.com\/in\/([^/?#\s]+)/i); if (!m) return "";
  let s = m[1]; try { s = decodeURIComponent(s); } catch { /* keep raw */ }
  return s.split("-").filter((x) => x && !/\d/.test(x) && !/^[0-9a-f]{6,}$/i.test(x)).map((x) => x[0].toUpperCase() + x.slice(1)).join(" ");
}
export function normUrl(u?: string | null) {
  let s = (u || "").trim(); if (!s) return ""; if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { const x = new URL(s); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch { return ""; }
}
export const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

// ---------- Messages built from the profile, no AI needed (same wording as the tracker) ----------
export type MeLite = { first_name?: string | null; last_role?: string | null; last_company?: string | null; owned?: string | null; results?: string | null; background?: string | null };
const cap = (x?: string | null) => { const s = (x || "").trim(); return s ? s[0].toUpperCase() + s.slice(1) : ""; };
const dot = (x?: string | null) => { const s = (x || "").trim(); return !s ? "" : /[.!?]$/.test(s) ? s : s + "."; };
const sent = (x?: string | null) => { const s = cap(x); return !s ? "" : /[.!?]$/.test(s) ? s : s + "."; };
const lower1 = (s: string) => s ? s[0].toLowerCase() + s.slice(1) : s;
const wins = (m: MeLite) => (m.results || "").split(/\n|;/).map((x) => x.trim()).filter(Boolean).map(lower1);
export const firstOf = (c: Pick<Contact, "name">) => (c.name || "").trim().split(/\s+/)[0] || "{First}";
function hookOf(c: Contact) {
  if ((c.mutual || "").trim()) return `we're both connected to ${c.mutual!.trim()}. `;
  let s = (c.shared || "").trim(); if (!s) return "";
  s = /[.!?]$/.test(s) ? s : s + "."; return lower1(s) + " ";
}
export function buildNote(role: Pick<Role, "title" | "company">, c: Contact, m: MeLite) {
  const sg = (m.first_name || "").trim() || "{your name}", co = (m.last_company || "").trim() || "{company}", own = (m.owned || "").trim(), rl = (m.last_role || "").trim() || "PM";
  const [w1, w2] = wins(m); const hi = `Hi ${firstOf(c)}, ${hookOf(c)}`, R = role.title, C = role.company, t = (c.topic || "").trim();
  const ranW = own && w1 ? `At ${co} I ran ${own}; ${w1}. ` : own ? `At ${co} I ran ${own}. ` : w1 ? `At ${co}, ${w1}. ` : "";
  const ran = own ? `At ${co} I ran ${own}. ` : ranW;
  let v: string[];
  if (c.type === "hm") { const ap = `I'm applying for the ${R} role on your team. `, line = t ? sent(t) + " " : ""; v = [hi + ap + ranW + line + sg, hi + ap + ran + line + sg, hi + `I'm applying for a PM role on your team. ` + ran + line + sg, hi + ap + ran + sg]; }
  else if (c.type === "rec") {
    const a = hi + `I've applied for the ${R} role at ${C}. I was a ${rl} at ${co}${own ? ` (${own})` : ""}${m.background ? ` and ${m.background.trim()} before that` : ""}. `, w = w2 || w1;
    v = [a + (w ? dot(cap(w)) + " " : "") + "Happy to send anything that helps. " + sg, a + (w ? dot(cap(w)) + " " : "") + sg, a + sg];
  } else {
    let o = t ? `your post on ${t.replace(/[.!?]$/, "")} stuck with me. I hit something similar at ${co}. ` : `I'm a ${rl}, ex-${co}${own ? ` (${own})` : ""}. `;
    if (hookOf(c)) o = cap(o);
    v = [hi + o + `I'm looking hard at ${C}'s ${R} role and would value 15 minutes of your view on the team. ` + sg, hi + o + `I'm looking at the ${R} role at ${C} and would value 15 minutes with you. ` + sg, hi + o + `I'm looking at a PM role at ${C} and would value 15 minutes with you. ` + sg];
  }
  return v.find((x) => x.length <= 300) ?? v[v.length - 1];
}
export function coffeeMsg(role: Pick<Role, "title">, c: Contact, m: MeLite) {
  const end = (m.first_name || "").trim() ? `\n\n${m.first_name!.trim()}` : "";
  if (c.type === "rec") return `Thanks, ${firstOf(c)}. Would you have 15 minutes this week or next for a quick call about the ${role.title} role? I'd like to understand what the hiring team is weighing most, so I can speak to it directly.` + end;
  return `Thanks, ${firstOf(c)}. Would you have 20 minutes in the next week or two for a quick call? I'd like to hear how ${c.type === "hm" ? "your team" : `the ${c.dept || "product"} team`} works and what the ${role.title} role most needs to get right in its first six months. Happy to work around your calendar.` + end;
}
export function refMsg(role: Pick<Role, "title">, c: Contact, m: MeLite) {
  const end = (m.first_name || "").trim() ? `\n\n${m.first_name!.trim()}` : "", a = `Thanks again for the call, ${firstOf(c)}. It helped, especially {what they told you}. `;
  if (c.type === "rec") return a + `I've applied for the ${role.title} role. Would you put my application in front of the hiring manager? I can send a two-line summary to make that easy.` + end;
  if (c.type === "hm") return a + `I've applied for the ${role.title} role. If you think I'd fit, would you flag my application to the recruiter? Happy to send anything that helps.` + end;
  return a + `I'm applying for the ${role.title} role. If you're comfortable, would you refer me? I can send my CV and a two-line summary so it takes you two minutes.` + end;
}
/** Which opener was used when the request went out; feeds Analytics. */
export const hookKind = (c: Contact) => (c.mutual || "").trim() ? "mutual" : (c.shared || "").trim() ? "shared" : "none";
