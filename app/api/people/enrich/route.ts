import { runFeature } from "@/lib/ai/gateway.ts";
import { AIError } from "@/lib/ai/types.ts";
import { ok, fail, unauthorized, browserKey } from "@/lib/http/respond.ts";
import { htmlToText, safeFetchText } from "@/lib/security/safe-fetch.ts";
import { requireUser } from "@/lib/supabase/server.ts";
import { nameFromUrl } from "@/lib/client/pipeline.ts";

export const maxDuration = 120;

type CG = { name: string; title: string; email: string; website: string; points: { point: string; from: string }[]; followup: string };
const siteUrl = (u?: string | null) => {
  let s = (u || "").trim(); if (!s || /linkedin\.com/i.test(s)) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  s = s.replace(/^http:\/\//i, "https://");
  try { return new URL(s).href; } catch { return ""; }
};
const SITE_ERR: Record<string, string> = { timeout: "Their website took too long to load.", blocked_host: "That website address isn't allowed.", not_html: "Their website isn't a normal web page.", unreachable: "Their website didn't load." };

// Find common ground: reads the LinkedIn text the user pasted and, like the tracker,
// the person's own website, then asks the user's AI for shared points and a follow-up.
// The pasted text is used for this one request and never stored.
export async function POST(req: Request) {
  const { sb, user } = await requireUser();
  if (!user) return unauthorized();
  try {
    const body = await req.json().catch(() => ({}));
    const contactId = typeof body.contactId === "string" ? body.contactId : "";
    const profileText = typeof body.profileText === "string" ? body.profileText.slice(0, 12000).trim() : "";
    // A website typed a moment ago may not be saved yet, so the page sends it along.
    const typedSite = typeof body.website === "string" ? body.website.slice(0, 300).trim() : "";
    const { data: c } = await sb.from("contacts").select("*").eq("id", contactId).maybeSingle();
    if (!c) throw new AIError("bad_request", 400);
    const [{ data: role }, { data: me }] = await Promise.all([
      sb.from("roles").select("company, title").eq("id", c.role_id).single(),
      sb.from("profiles").select("first_name, last_role, last_company, owned, results, background").eq("id", user.id).single(),
    ]);
    if (!role) throw new AIError("bad_request", 400);
    const contact = { type: c.type, dept: c.dept, name: c.name, roleTitle: role.title, company: role.company };
    const extra = [c.title && `Title: ${c.title}`, c.notes && `My notes: ${c.notes}`].filter(Boolean).join("\n");

    let siteNote = "", siteText = "", readSite = "", siteEmail = "";
    const read = async (u: string) => {
      readSite = u;
      try {
        const html = await safeFetchText(u); siteText = htmlToText(html, u).slice(0, 9000);
        const m = html.match(/mailto:([^\s)"'>?]+@[^\s)"'>?]+)/i); // an address they published themselves
        if (m && /^[^@\s]{1,64}@[^@\s]{1,190}\.[a-z]{2,}$/i.test(m[1])) siteEmail = m[1];
      }
      catch (e: any) { siteNote = SITE_ERR[String(e?.message)] ?? (/^http_/.test(String(e?.message)) ? "Their website didn't load." : "Their website didn't load."); }
    };
    const known = siteUrl(typedSite || c.website);
    if (known) await read(known);
    if (!profileText && !siteText) return ok({ changed: {}, points: 0, siteNote: siteNote || "Nothing to compare yet. Paste their LinkedIn page.", nothing: true });

    let r = await runFeature(sb, user, "common_ground", { contact, me: me ?? {}, profileText, siteText, extra }, browserKey(req)) as CG;
    // The profile listed a website we haven't read yet: read it and look again.
    const found = siteUrl(r.website);
    if (!known && found && found !== readSite) {
      await read(found);
      if (siteText) r = await runFeature(sb, user, "common_ground", { contact, me: me ?? {}, profileText, siteText, extra }, browserKey(req)) as CG;
    }

    // The user may have typed while the AI ran: decide against the row as it is now.
    const { data: fresh } = await sb.from("contacts").select("*").eq("id", c.id).maybeSingle();
    if (fresh) Object.assign(c, fresh);
    const patch: Record<string, unknown> = { common: r.points, followup: r.followup || null };
    if (typedSite && known && !(c.website || "").trim()) patch.website = typedSite;
    // Replace an empty name, or one guessed from the profile link, with the real one.
    const guessed = !(c.name || "").trim() || c.name.trim() === nameFromUrl(c.linkedin_url || "");
    if (guessed && r.name) patch.name = r.name.slice(0, 120);
    if (!(c.title || "").trim() && r.title) patch.title = r.title.slice(0, 160);
    if (!(c.email || "").trim() && (r.email || siteEmail)) patch.email = (r.email || siteEmail).slice(0, 200);
    if (!patch.website && !(c.website || "").trim() && found) patch.website = found.slice(0, 300);
    const named = ((patch.name as string) || c.name || "").trim();
    if (named && c.status === "Not found") { const d = new Date().toISOString().slice(0, 10); patch.status = "Found"; patch.status_on = d; patch.status_history = { ...(c.status_history || {}), Found: c.status_history?.Found || d }; }
    const { error } = await sb.from("contacts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) throw error;
    return ok({ changed: patch, points: r.points.length, siteNote, siteRead: !!siteText });
  } catch (e) { return fail(e, "people.enrich"); }
}
