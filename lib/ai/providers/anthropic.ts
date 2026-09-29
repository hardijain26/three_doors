import { call, sse } from "../http.ts";
import { AIError, type AIProvider, type Credential, type GenerateRequest, type ModelInfo } from "../types.ts";

const BASE = "https://api.anthropic.com/v1";
function headers(c: Credential) {
  if (c.kind !== "api_key") throw new AIError("not_connected", 400);
  return { "x-api-key": c.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" };
}
function body(req: GenerateRequest, stream: boolean) {
  return JSON.stringify({
    model: req.model,
    max_tokens: req.maxOutputTokens ?? 1200,
    system: req.json ? `${req.system ?? ""}\n\nReply with a single JSON object and nothing else.`.trim() : req.system,
    messages: req.messages,
    stream,
  });
}

export const AnthropicProvider: AIProvider = {
  id: "anthropic",
  displayName: "Claude (Anthropic)",
  authMethods: [
    { type: "api_key", keyUrl: "https://platform.claude.com/settings/keys", keyPrefixHint: "sk-ant-", billing: "Usage is billed to the Anthropic Console account that owns the key. A Claude.ai Pro or Max plan does not cover API use." },
    { type: "oauth", enabled: false, note: "Anthropic does not allow third-party apps to offer Claude.ai sign-in or use Claude.ai plan credentials." },
  ],
  async validateConnection(c) { await call(`${BASE}/models?limit=1`, { headers: headers(c), timeoutMs: 15000 }); },
  async listAvailableModels(c) {
    const out: ModelInfo[] = []; let after: string | undefined;
    for (let page = 0; page < 5; page++) {
      const r = await call(`${BASE}/models?limit=100${after ? `&after_id=${encodeURIComponent(after)}` : ""}`, { headers: headers(c), timeoutMs: 15000 });
      const j = (await r.json()) as { data: { id: string; display_name?: string }[]; has_more?: boolean; last_id?: string };
      out.push(...j.data.map((m) => ({ id: m.id, label: m.display_name ?? m.id })));
      if (!j.has_more || !j.last_id) break; after = j.last_id;
    }
    return out;
  },
  pickDefaultModel(models) {
    const pref = [/haiku/, /sonnet/];
    for (const p of pref) { const m = models.find((x) => p.test(x.id)); if (m) return m.id; }
    return models[0]?.id ?? null;
  },
  async generate(c, req) {
    const r = await call(`${BASE}/messages`, { method: "POST", headers: headers(c), body: body(req, false), signal: req.signal, timeoutMs: req.timeoutMs });
    const j = (await r.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string };
    const text = (j.content ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
    return { text, model: j.model ?? req.model, usage: { inputTokens: j.usage?.input_tokens ?? null, outputTokens: j.usage?.output_tokens ?? null } };
  },
  async *streamGenerate(c, req) {
    const r = await call(`${BASE}/messages`, { method: "POST", headers: headers(c), body: body(req, true), signal: req.signal, timeoutMs: req.timeoutMs });
    let input: number | null = null, output: number | null = null;
    for await (const ev of sse(r)) {
      const j = JSON.parse(ev.data);
      if (j.type === "message_start") input = j.message?.usage?.input_tokens ?? null;
      else if (j.type === "content_block_delta" && j.delta?.type === "text_delta") yield { type: "text", text: j.delta.text as string };
      else if (j.type === "message_delta") output = j.usage?.output_tokens ?? output;
      else if (j.type === "message_stop") yield { type: "done", usage: { inputTokens: input, outputTokens: output } };
    }
  },
};
