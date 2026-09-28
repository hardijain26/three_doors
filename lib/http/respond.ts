import { NextResponse } from "next/server";
import { AIError, ERROR_TEXT } from "../ai/types.ts";
import { log } from "../security/redact.ts";

export const BYOK_HEADER = "x-byok-key";
const noStore = { "Cache-Control": "no-store" };

export function ok(data: unknown) { return NextResponse.json(data, { headers: noStore }); }
export function fail(e: unknown, where: string) {
  if (e instanceof AIError) return NextResponse.json({ error: e.code, message: ERROR_TEXT[e.code] }, { status: e.status, headers: noStore });
  log.error(where, e);
  return NextResponse.json({ error: "server_error", message: "Something went wrong on our side." }, { status: 500, headers: noStore });
}
export function unauthorized() { return NextResponse.json({ error: "unauthorized", message: "Sign in first." }, { status: 401, headers: noStore }); }
/** Only accept a browser-held key that looks like a real key, and never more than one. */
export function browserKey(req: Request): string | null {
  const k = req.headers.get(BYOK_HEADER);
  return k && k.length >= 20 && k.length <= 300 && !/\s/.test(k) ? k : null;
}
