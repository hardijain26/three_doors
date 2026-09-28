"use client";
// "Only in this browser" key storage.
// The API key is encrypted with an AES-GCM key that the browser generates as
// NON-EXTRACTABLE: script can use it to decrypt, but can never read or export it.
// Both live in IndexedDB for this site only. Nothing is sent to our servers until a
// request needs the key; then it travels over HTTPS in one header and is dropped.
// Limits: anyone with this unlocked browser profile, or a script injected into this
// site, could still use the key. See docs/SECURITY.md.

const DB = "three-doors-keys", STORE = "k";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function get<T>(k: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE).objectStore(STORE).get(k); t.onsuccess = () => res(t.result as T); t.onerror = () => rej(t.error); });
}
async function put(k: string, v: unknown) {
  const db = await open();
  return new Promise<void>((res, rej) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
async function del(k: string) {
  const db = await open();
  return new Promise<void>((res, rej) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).delete(k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
async function wrapKey(): Promise<CryptoKey> {
  let k = await get<CryptoKey>("wrap");
  if (!k) { k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); await put("wrap", k); }
  return k;
}

// Keys are stored per signed-in user and bound to that user id, so another account
// signing in on the same browser can't load them. Sign-out wipes the whole store.
const slot = (uid: string, provider: string) => `key:${uid}:${provider}`;
const aad = (uid: string, provider: string) => new TextEncoder().encode(`${uid}:${provider}`);

export async function saveBrowserKey(uid: string, provider: string, apiKey: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(uid, provider) }, await wrapKey(), new TextEncoder().encode(apiKey));
  await put(slot(uid, provider), { iv, ct });
}
export async function loadBrowserKey(uid: string, provider: string): Promise<string | null> {
  const rec = await get<{ iv: Uint8Array<ArrayBuffer>; ct: ArrayBuffer }>(slot(uid, provider));
  if (!rec) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv, additionalData: aad(uid, provider) }, await wrapKey(), rec.ct);
    return new TextDecoder().decode(pt);
  } catch { return null; }
}
export async function forgetBrowserKey(uid: string, provider: string) { await del(slot(uid, provider)); }
/** Removes every key and the wrapping key. Called on sign-out and account deletion. */
export async function wipeBrowserVault() {
  try { await new Promise<void>((res) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); }); } catch { /* nothing stored */ }
}
