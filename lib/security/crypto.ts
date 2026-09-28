import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Envelope-free AES-256-GCM. The master key lives only in the server environment
// (CREDENTIAL_MASTER_KEY), never in the database, so a database dump alone reveals nothing.
// Associated data binds each ciphertext to its user and provider, so a row copied onto
// another user or provider fails to decrypt.

function masterKey(version: number): Buffer {
  const name = version === currentVersion() ? "CREDENTIAL_MASTER_KEY" : `CREDENTIAL_MASTER_KEY_V${version}`;
  const raw = process.env[name];
  if (!raw) throw new Error("credential key not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("credential key must be 32 bytes");
  return key;
}
export function currentVersion(): number { return Number(process.env.CREDENTIAL_KEY_VERSION || "1"); }

const aad = (userId: string, provider: string, version: number) => Buffer.from(`${userId}:${provider}:v${version}`);

export function encryptSecret(plain: string, userId: string, provider: string) {
  const version = currentVersion();
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", masterKey(version), iv);
  c.setAAD(aad(userId, provider, version));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), auth_tag: c.getAuthTag().toString("base64"), key_version: version };
}

export function decryptSecret(row: { ciphertext: string; iv: string; auth_tag: string; key_version: number }, userId: string, provider: string): string {
  const d = createDecipheriv("aes-256-gcm", masterKey(row.key_version), Buffer.from(row.iv, "base64"));
  d.setAAD(aad(userId, provider, row.key_version));
  d.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(row.ciphertext, "base64")), d.final()]).toString("utf8");
}

/** Last four characters, for "connected with key ending …abcd". Never more. */
export function keyHint(key: string): string { return key.replace(/[^A-Za-z0-9_-]/g, "").slice(-4); }
