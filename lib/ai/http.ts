import { AIError } from "./types.ts";

export function mapStatus(status: number, body: string): AIError {
  const b = body.toLowerCase();
  if (status === 401) return new AIError("invalid_key", 400);
  if (status === 403) return new AIError(b.includes("api key not valid") || b.includes("api_key_invalid") ? "invalid_key" : "no_access", 400);
  if (status === 400 && (b.includes("api key not valid") || b.includes("api_key_invalid"))) return new AIError("invalid_key", 400);
  if (status === 404) return new AIError("model_not_found", 400);
  if (status === 402 || b.includes("insufficient_quota") || b.includes("credit balance")) return new AIError("quota_exceeded", 402);
  if (status === 429) return new AIError(b.includes("quota") ? "quota_exceeded" : "rate_limited", 429);
  if (status >= 500) return new AIError("provider_unavailable", 502);
  return new AIError("bad_request", 400);
}

export async function call(url: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 60000);
  const outer = init.signal;
  if (outer) outer.addEventListener("abort", () => ctrl.abort(), { once: true });
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } catch {
    throw new AIError(ctrl.signal.aborted ? "timeout" : "provider_unavailable", 504);
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw mapStatus(res.status, await res.text().catch(() => ""));
  return res;
}

/** Minimal server-sent-events reader: yields each event's data payload. */
export async function* sse(res: Response): AsyncIterable<{ event?: string; data: string }> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2);
      let event: string | undefined; const data: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: data.join("\n") };
    }
  }
}
