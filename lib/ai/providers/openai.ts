import { call, sse } from "../http.ts";
import { AIError, type AIProvider, type Credential, type GenerateRequest, type ModelInfo } from "../types.ts";

const BASE = "https://api.openai.com/v1";
function headers(c: Credential) {
  if (c.kind !== "api_key") throw new AIError("not_connected", 400);
  return { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" };
}
// Reasoning models spend output tokens on thinking before they write, so they get a low
// effort setting and a higher ceiling, otherwise short tasks come back empty.
const REASONING = /^(gpt-5|o\d)/;
function body(req: GenerateRequest, stream: boolean) {
  const reasoning = REASONING.test(req.model);
  return JSON.stringify({
    model: req.model,
    instructions: req.system,
    input: req.messages.map((m) => ({ role: m.role, content: m.content })),
    max_output_tokens: reasoning ? Math.max(4000, req.maxOutputTokens ?? 0) : req.maxOutputTokens ?? 1200,
    ...(reasoning ? { reasoning: { effort: "low" } } : {}),
    ...(req.json ? { text: { format: { type: "json_object" } } } : {}),
    stream,
    store: false, // don't keep the conversation on OpenAI's side
  });
}
const CHAT = /^(gpt-|o\d|chatgpt-)/;
const SKIP = /(audio|realtime|transcribe|tts|search|image|embedding|moderation|instruct|codex|computer-use|deep-research)/;

export const OpenAIProvider: AIProvider = {
  id: "openai",
  displayName: "OpenAI",
  authMethods: [
    { type: "api_key", keyUrl: "https://platform.openai.com/settings/organization/api-keys", keyPrefixHint: "sk-", billing: "Usage is billed to the OpenAI account that owns the key." },
    { type: "oauth", enabled: false, note: "OpenAI does not offer third-party apps a sign-in that bills API usage to your account. 'Sign in with ChatGPT' shares identity only." },
  ],
  async validateConnection(c) { await call(`${BASE}/models`, { headers: headers(c), timeoutMs: 15000 }); },
  async listAvailableModels(c) {
    const r = await call(`${BASE}/models`, { headers: headers(c), timeoutMs: 15000 });
    const j = (await r.json()) as { data: { id: string; created?: number }[] };
    return j.data.filter((m) => CHAT.test(m.id) && !SKIP.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).map((m) => ({ id: m.id, label: m.id }));
  },
  pickDefaultModel(models: ModelInfo[]) {
    const pref = [/^gpt-5(\.\d+)?-mini$/, /^gpt-4\.1-mini$/, /^gpt-4o-mini$/, /^gpt-5/, /^gpt-4/];
    for (const p of pref) { const m = models.find((x) => p.test(x.id)); if (m) return m.id; }
    return models[0]?.id ?? null;
  },
  async generate(c, req) {
    const r = await call(`${BASE}/responses`, { method: "POST", headers: headers(c), body: body(req, false), signal: req.signal, timeoutMs: req.timeoutMs });
    const j = (await r.json()) as { output?: { type: string; content?: { type: string; text?: string }[] }[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string };
    const text = (j.output ?? []).flatMap((o) => o.content ?? []).filter((p) => p.type === "output_text").map((p) => p.text ?? "").join("");
    return { text, model: j.model ?? req.model, usage: { inputTokens: j.usage?.input_tokens ?? null, outputTokens: j.usage?.output_tokens ?? null } };
  },
  async *streamGenerate(c, req) {
    const r = await call(`${BASE}/responses`, { method: "POST", headers: headers(c), body: body(req, true), signal: req.signal, timeoutMs: req.timeoutMs });
    for await (const ev of sse(r)) {
      if (ev.data === "[DONE]") break;
      const j = JSON.parse(ev.data);
      if (j.type === "response.output_text.delta") yield { type: "text", text: j.delta as string };
      else if (j.type === "response.completed") yield { type: "done", usage: { inputTokens: j.response?.usage?.input_tokens ?? null, outputTokens: j.response?.usage?.output_tokens ?? null } };
    }
  },
};
