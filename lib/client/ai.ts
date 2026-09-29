"use client";
import { loadBrowserKey, wipeBrowserVault } from "./browser-vault.ts";
import { supabaseBrowser } from "../supabase/client.ts";

export async function currentUid(): Promise<string | null> { const { data } = await supabaseBrowser().auth.getUser(); return data.user?.id ?? null; }
export async function signOutEverywhere() { await wipeBrowserVault(); await supabaseBrowser().auth.signOut(); }

export type Conn = { provider: string; auth_method: string; storage: string; key_hint: string | null; default_model: string | null; status: string; is_active: boolean; validated_at: string | null };
export class ApiError extends Error { constructor(public code: string, message: string) { super(message); } }

async function post(url: string, body: unknown, key?: string | null) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "x-byok-key": key } : {}) }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(j.error ?? "server_error", j.message ?? "Request failed.");
  return j;
}

export async function getConnections(): Promise<{ providers: any[]; connections: Conn[] }> {
  const res = await fetch("/api/ai/providers", { cache: "no-store" });
  if (!res.ok) throw new ApiError("server_error", "Couldn't load AI settings.");
  return res.json();
}

/** Runs a product feature through the gateway. Adds the browser-held key only when
 *  the active connection is "only in this browser". */
export async function runFeature<T>(feature: string, input: unknown): Promise<T> {
  const { connections } = await getConnections();
  const active = connections.find((c) => c.is_active);
  if (!active) throw new ApiError("not_connected", "Connect an AI provider in AI settings first.");
  const uid = await currentUid();
  const key = active.storage === "browser_only" && uid ? await loadBrowserKey(uid, active.provider) : null;
  if (active.storage === "browser_only" && !key) throw new ApiError("browser_key_missing", "Your key is saved in a different browser. Enter it again in AI settings on this device.");
  return (await post("/api/ai/run", { feature, input, provider: active.provider }, key)).result as T;
}

export const api = { post };

/** POSTs to one of our routes, attaching the browser-held key when the active connection keeps it in this browser. */
export async function postWithKey<T>(url: string, body: unknown): Promise<T> {
  const { connections } = await getConnections();
  const active = connections.find((c) => c.is_active);
  if (!active) throw new ApiError("not_connected", "Connect an AI provider in AI settings first.");
  const uid = await currentUid();
  const key = active.storage === "browser_only" && uid ? await loadBrowserKey(uid, active.provider) : null;
  if (active.storage === "browser_only" && !key) throw new ApiError("browser_key_missing", "Your key is saved in a different browser. Enter it again in AI settings on this device.");
  return post(url, body, key) as Promise<T>;
}
