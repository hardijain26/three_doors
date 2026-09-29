import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as ufetch } from "undici";

// Fetches a user-supplied job-board page without letting it reach private networks.
// Every connection (including each redirect hop) resolves DNS through a lookup that
// rejects private, loopback, link-local, CGNAT, multicast, NAT64/6to4 and metadata
// addresses, and the socket connects to exactly the address that was checked, so
// DNS rebinding can't swap in an internal address after the check.
const MAX_BYTES = 1_500_000, TIMEOUT = 10_000, MAX_REDIRECTS = 3;

// Separate lists: Node's BlockList matches IPv4 addresses against IPv4-compatible IPv6 rules (::/96).
const blocked4 = new BlockList(), blocked6 = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3]] as const) blocked4.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [["::", 96], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8]] as const) blocked6.addSubnet(net, bits, "ipv6");

export function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return blocked4.check(ip, "ipv4");
  if (fam === 6) {
    const m = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return blocked4.check(m[1], "ipv4");
    return blocked6.check(ip, "ipv6");
  }
  return true;
}

function safeLookup(hostname: string, options: any, cb: any) {
  dnsLookup(hostname, { ...options, all: true }, (err, addrs: any) => {
    if (err) return cb(err);
    const list = (Array.isArray(addrs) ? addrs : [{ address: addrs, family: options?.family ?? 4 }]) as { address: string; family: number }[];
    if (!list.length || list.some((a) => isBlockedIp(a.address))) return cb(Object.assign(new Error("blocked_host"), { code: "EBLOCKED" }));
    options?.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
  });
}
const agent = new Agent({ connect: { lookup: safeLookup as any, timeout: TIMEOUT } });

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("bad_url"); }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) throw new Error("bad_url");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new Error("blocked_host");
  if (isIP(host) && isBlockedIp(host)) throw new Error("blocked_host");
  return u;
}

export async function safeFetchText(raw: string): Promise<string> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    let res: Awaited<ReturnType<typeof ufetch>>;
    try {
      res = await ufetch(url, { redirect: "manual", signal: ctrl.signal, dispatcher: agent, headers: { "User-Agent": "ThreeDoorsBot/1.0 (+job search on behalf of a signed-in user)", Accept: "text/html,application/xhtml+xml" } });
    } catch (e: any) { clearTimeout(t); throw new Error(ctrl.signal.aborted ? "timeout" : String(e?.cause?.code || e?.code || "").includes("BLOCKED") || /blocked_host/.test(String(e?.cause?.message)) ? "blocked_host" : "unreachable"); }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      clearTimeout(t); await res.body?.cancel().catch(() => {});
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).href); continue;
    }
    if (!res.ok) { clearTimeout(t); await res.body?.cancel().catch(() => {}); throw new Error(`http_${res.status}`); }
    const type = res.headers.get("content-type") || "";
    if (type && !/text\/|html|xml/.test(type)) { clearTimeout(t); await res.body?.cancel().catch(() => {}); throw new Error("not_html"); }
    const reader = res.body?.getReader(); if (!reader) { clearTimeout(t); return ""; }
    const chunks: Uint8Array[] = []; let n = 0;
    try {
      for (;;) { const { value, done } = await reader.read(); if (done) break; n += value.length; if (n > MAX_BYTES) { await reader.cancel(); break; } chunks.push(value); }
    } finally { clearTimeout(t); }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  throw new Error("too_many_redirects");
}

/** Turns HTML into readable text, keeping link targets so the model can cite job URLs. */
export function htmlToText(html: string, base: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
      let abs = ""; try { abs = new URL(href, base).href; } catch { /* ignore */ }
      const t = inner.replace(/<[^>]+>/g, " ").trim();
      return t && abs.startsWith("https://") ? ` ${t} [${abs}] ` : ` ${t} `;
    })
    .replace(/<\/(p|div|li|h\d|tr|section|article)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
