import { call, sse } from "../http.ts";
import { type AIProvider, type Credential, type GenerateRequest } from "../types.ts";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
function headers(c: Credential): Record<string, string> {
  if (c.kind === "oauth") return { Authorization: `Bearer ${c.accessToken}`, ...(c.project ? { "x-goog-user-project": c.project } : {}), "Content-Type": "application/json" };
  return { "x-goog-api-key": c.apiKey, "Content-Type": "application/json" };
}
function body(req: GenerateRequest) {
  return JSON.stringify({
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    // 2.5+ models think by default and that counts against maxOutputTokens: leave headroom.
    generationConfig: { maxOutputTokens: /gemini-(2\.5|[3-9])/.test(req.model) ? Math.max(6000, req.maxOutputTokens ?? 0) : req.maxOutputTokens ?? 1200, ...(req.json ? { responseMimeType: "application/json" } : {}) },
  });
}
type GenResp = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }; modelVersion?: string };
const textOf = (j: GenResp) => (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
const usageOf = (j: GenResp) => ({ inputTokens: j.usageMetadata?.promptTokenCount ?? null, outputTokens: j.usageMetadata ? (j.usageMetadata.candidatesTokenCount ?? 0) + (j.usageMetadata.thoughtsTokenCount ?? 0) : null });
const path = (model: string) => encodeURIComponent(model.replace(/^models\//, ""));

export const GeminiProvider: AIProvider = {
  id: "gemini",
  displayName: "Google Gemini",
  authMethods: [
    { type: "api_key", keyUrl: "https://aistudio.google.com/apikey", keyPrefixHint: "AIza", billing: "Usage is billed to the Google Cloud project the key belongs to. On Google's free tier, Google may use prompts to improve its products." },
    { type: "oauth", enabled: false, note: "Google does support signing in with your Google account for the Gemini API. It needs a verified Google OAuth app, so it is planned but not switched on yet." },
  ],
  async validateConnection(c) { await call(`${BASE}/models?pageSize=1`, { headers: headers(c), timeoutMs: 15000 }); },
  async listAvailableModels(c) {
    const out: { id: string; label: string }[] = []; let token: string | undefined;
    for (let page = 0; page < 5; page++) {
      const r = await call(`${BASE}/models?pageSize=100${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`, { headers: headers(c), timeoutMs: 15000 });
      const j = (await r.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };
      for (const m of j.models ?? []) if (m.supportedGenerationMethods?.includes("generateContent") && /gemini/.test(m.name) && !/(embedding|image|tts|audio|live)/.test(m.name))
        out.push({ id: m.name.replace(/^models\//, ""), label: m.displayName ?? m.name });
      if (!j.nextPageToken) break; token = j.nextPageToken;
    }
    return out;
  },
  pickDefaultModel(models) {
    const pref = [/^gemini-[\d.]+-flash$/, /flash-lite/, /flash/, /pro/];
    for (const p of pref) { const m = models.find((x) => p.test(x.id)); if (m) return m.id; }
    return models[0]?.id ?? null;
  },
  async generate(c, req) {
    const r = await call(`${BASE}/models/${path(req.model)}:generateContent`, { method: "POST", headers: headers(c), body: body(req), signal: req.signal });
    const j = (await r.json()) as GenResp;
    return { text: textOf(j), model: j.modelVersion ?? req.model, usage: usageOf(j) };
  },
  async *streamGenerate(c, req) {
    const r = await call(`${BASE}/models/${path(req.model)}:streamGenerateContent?alt=sse`, { method: "POST", headers: headers(c), body: body(req), signal: req.signal });
    let last: GenResp = {};
    for await (const ev of sse(r)) {
      const j = JSON.parse(ev.data) as GenResp; last = j;
      const t = textOf(j); if (t) yield { type: "text", text: t };
    }
    yield { type: "done", usage: usageOf(last) };
  },
};
