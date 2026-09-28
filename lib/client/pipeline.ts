export const STEPS = ["Found", "Request sent", "Accepted", "Messaged", "Replied", "Coffee chat", "Referral given"] as const;
export const SHORT: Record<string, string> = { "Request sent": "Sent", Accepted: "Accept", Messaged: "Message", Replied: "Reply", "Coffee chat": "Coffee", "Referral given": "Referral" };
export const ALL_STATUSES = [...STEPS, "Closed"];
export type ContactType = "hm" | "rec" | "other";
export interface Contact { id: string; role_id: string; type: ContactType; dept: string | null; name: string | null; title: string | null; linkedin_url: string | null; email: string | null; notes: string | null; status: string; status_history: Record<string, string>; common: { point: string; from: string }[] | null; followup: string | null; updated_at: string }
export interface Role { id: string; company: string; title: string; location: string | null; link: string | null; fit: string | null; angle: string | null; applied_on: string | null; created_at: string }

export const typeLabel = (c: Pick<Contact, "type" | "dept">) => c.type === "hm" ? "Hiring manager" : c.type === "rec" ? "Recruiter" : `${c.dept || "Other"} team`;
export const today = () => new Date().toISOString().slice(0, 10);
export const daysSince = (d?: string | null) => d ? Math.floor((Date.parse(today()) - Date.parse(d)) / 864e5) : 0;
export const reached = (c: Contact) => Math.max(c.status === "Closed" ? -1 : STEPS.indexOf(c.status as any), ...Object.keys(c.status_history || {}).map((s) => STEPS.indexOf(s as any)));
export const lastDate = (c: Contact) => Object.values(c.status_history || {}).sort().pop() || "";

export function nextStep(c: Contact): [string, boolean] {
  const n = daysSince(c.status_history?.[c.status]);
  switch (c.status) {
    case "Found": return ["Send the connection request", false];
    case "Request sent": return n >= 21 ? ["Pending 3 weeks: withdraw it", true] : [`Waiting on accept (${n}d)`, false];
    case "Accepted": return ["Send the follow-up message today", true];
    case "Messaged": return n >= 7 ? ["No reply in a week: send one nudge", true] : [`Waiting on reply (${n}d)`, false];
    case "Replied": return ["Reply within a day and ask for a coffee chat", true];
    case "Coffee chat": return [c.type === "other" ? "Thank them, then ask for a referral" : "Thank them, then ask them to put you forward", true];
    case "Referral given": return ["Apply through the referral", false];
    default: return ["Closed", false];
  }
}

export function searchUrl(company: string, type: ContactType, dept?: string | null) {
  const q = type === "hm" ? "Head of Product OR Director of Product OR Group Product Manager" : type === "rec" ? "recruiter OR talent acquisition" : `"${dept || "Product"}"`;
  return "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(`"${company}" ${q}`);
}
