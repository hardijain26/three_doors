import { AIError } from "../ai/types.ts";

// Product features describe WHAT they need from a model. They never know which
// provider runs them; the gateway decides that from the user's connection.

export interface AboutMe { first_name?: string | null; last_role?: string | null; last_company?: string | null; owned?: string | null; results?: string | null; background?: string | null }
export interface ContactCtx { type: "hm" | "rec" | "other"; dept?: string | null; name?: string | null; roleTitle: string; company: string }

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");
const who = (c: ContactCtx) => c.type === "hm" ? "the hiring manager for the role" : c.type === "rec" ? "the recruiter for the role" : `someone in the ${clip(c.dept, 40) || "product"} team who might refer me`;
const aboutText = (m: AboutMe) => [
  m.first_name && `Name: ${clip(m.first_name, 60)}`,
  (m.last_role || m.last_company) && `Last role: ${clip(m.last_role, 80)} at ${clip(m.last_company, 80)}`,
  m.owned && `What I owned: ${clip(m.owned, 300)}`,
  m.results && `Results (keep numbers exact): ${clip(m.results, 800)}`,
  m.background && `Earlier background: ${clip(m.background, 300)}`,
].filter(Boolean).join("\n") || "(the user has not filled in their profile)";

function parseJson(text: string): Record<string, unknown> {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  try { return JSON.parse(a >= 0 && b > a ? t.slice(a, b + 1) : t); } catch { throw new AIError("bad_output", 502); }
}

export type FeatureId = "connection_note" | "common_ground";

export interface FeatureDef<I, O> {
  id: FeatureId;
  maxOutputTokens: number;
  json: boolean;
  validate(input: unknown): I;
  build(input: I): { system: string; user: string };
  parse(text: string): O;
}

type NoteIn = { contact: ContactCtx; me: AboutMe; mutual?: string; topic?: string };
const connectionNote: FeatureDef<NoteIn, { note: string }> = {
  id: "connection_note", maxOutputTokens: 400, json: true,
  validate(x: any) {
    if (!x?.contact?.company || !x?.contact?.roleTitle) throw new AIError("bad_request", 400);
    return { contact: x.contact, me: x.me ?? {}, mutual: clip(x.mutual, 80), topic: clip(x.topic, 160) };
  },
  build(i) {
    return {
      system: "You write LinkedIn connection notes for a job seeker. Hard limit: 300 characters including spaces. Plain words, no buzzwords, no em dashes, no flattery. Use only facts given. Sign off with the sender's first name if known.",
      user: `Write a connection note to ${clip(i.contact.name, 80) || "this person"}, ${who(i.contact)} (${clip(i.contact.roleTitle, 120)} at ${clip(i.contact.company, 120)}).\n${i.mutual ? `Mutual connection: ${i.mutual}\n` : ""}${i.topic ? `Their recent post or work: ${i.topic}\n` : ""}\nABOUT ME:\n${aboutText(i.me)}\n\nReply as JSON {"note": "..."}.`,
    };
  },
  parse(text) {
    const note = String(parseJson(text).note ?? "").trim();
    if (!note) throw new AIError("bad_output", 502);
    return { note: note.length > 300 ? note.slice(0, 297).replace(/\s+\S*$/, "") + "…" : note };
  },
};

type CGIn = { contact: ContactCtx; me: AboutMe; profileText: string };
type CGOut = { name: string; title: string; email: string; website: string; points: { point: string; from: string }[]; followup: string };
const commonGround: FeatureDef<CGIn, CGOut> = {
  id: "common_ground", maxOutputTokens: 1200, json: true,
  validate(x: any) {
    const profileText = clip(x?.profileText, 12000).trim();
    if (!profileText || !x?.contact?.company) throw new AIError("bad_request", 400);
    return { contact: x.contact, me: x.me ?? {}, profileText };
  },
  build(i) {
    return {
      system: "You help a job seeker open a real conversation on LinkedIn. Never invent a fact, number, employer, school or opinion. Every common point must be backed by something in MY BACKGROUND and something in THEIR PROFILE. If there is no real overlap, return an empty list. Plain words, no buzzwords, no em dashes, no flattery.",
      user: `Their LinkedIn profile text is below. They are ${who(i.contact)} (${clip(i.contact.roleTitle, 120)} at ${clip(i.contact.company, 120)}).\n\n1. Extract their name, current title, an email only if they published one in the text (never guess), and their own website or blog if listed (not linkedin.com).\n2. Up to 3 points of real common ground, strongest first, each naming both sides.\n3. A follow-up message for the day they accept my request: under 600 characters, starting "Thanks for connecting, <first name>.", opening with the strongest point, tying it to one of my results with its real number, ending with one easy question.\n\nReply as JSON {"name":"","title":"","email":"","website":"","points":[{"point":"","from":"profile|post"}],"followup":""}.\n\nMY BACKGROUND:\n${aboutText(i.me)}\n\nTHEIR PROFILE:\n${i.profileText}`,
    };
  },
  parse(text) {
    const j = parseJson(text) as any;
    const email = typeof j.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(j.email) ? j.email : "";
    const website = typeof j.website === "string" && !/linkedin\.com/i.test(j.website) ? j.website.slice(0, 200) : "";
    return {
      name: clip(j.name, 120), title: clip(j.title, 160), email, website,
      points: (Array.isArray(j.points) ? j.points : []).slice(0, 3).map((p: any) => ({ point: clip(p?.point, 400), from: clip(p?.from, 20) })).filter((p: any) => p.point),
      followup: clip(j.followup, 900),
    };
  },
};

export const FEATURES: Record<FeatureId, FeatureDef<any, any>> = { connection_note: connectionNote, common_ground: commonGround };
export function isFeatureId(x: unknown): x is FeatureId { return typeof x === "string" && x in FEATURES; }
