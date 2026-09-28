// Anything that might be a credential is masked before it can reach a log line.
const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_\-]{8,}/g,
  /sk-(proj-|svcacct-)?[A-Za-z0-9_\-]{8,}/g,
  /AIza[0-9A-Za-z_\-]{20,}/g,
  /ya29\.[0-9A-Za-z_\-.]+/g,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
];
export function redact(s: string): string { return PATTERNS.reduce((acc, p) => acc.replace(p, "[redacted]"), s); }

/** The only logger server code should use. Logs codes and ids, never request bodies. */
export const log = {
  error(where: string, err: unknown) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[${where}] ${redact(msg).slice(0, 300)}`);
  },
};
