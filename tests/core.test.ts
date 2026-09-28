import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.CREDENTIAL_MASTER_KEY = randomBytes(32).toString("base64");
process.env.CREDENTIAL_KEY_VERSION = "1";
const { encryptSecret, decryptSecret, keyHint } = await import("../lib/security/crypto.ts");
const { redact } = await import("../lib/security/redact.ts");
const { OpenAIProvider } = await import("../lib/ai/providers/openai.ts");
const { AnthropicProvider } = await import("../lib/ai/providers/anthropic.ts");
const { GeminiProvider } = await import("../lib/ai/providers/gemini.ts");
const { FEATURES } = await import("../lib/features/index.ts");
const { AIError } = await import("../lib/ai/types.ts");

const KEY = "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

test("encrypts and decrypts a key bound to user and provider", () => {
  const enc = encryptSecret(KEY, "user-1", "openai");
  assert.ok(!enc.ciphertext.includes("ABCDEF"));
  assert.equal(decryptSecret(enc, "user-1", "openai"), KEY);
  assert.throws(() => decryptSecret(enc, "user-2", "openai"));   // row copied to another user
  assert.throws(() => decryptSecret(enc, "user-1", "anthropic")); // or another provider
  assert.throws(() => decryptSecret({ ...enc, ciphertext: Buffer.from("x".repeat(40)).toString("base64") }, "user-1", "openai"));
});

test("key hint is at most 4 safe characters", () => { assert.equal(keyHint(KEY), "6789"); });

test("redacts every key format", () => {
  const s = redact(`a ${KEY} b sk-ant-api03-abcdefghijk c AIzaSyA1234567890abcdefghijk d Bearer abc.def.ghi`);
  for (const bad of ["sk-proj", "sk-ant", "AIza", "abc.def"]) assert.ok(!s.includes(bad), s);
});

function mockFetch(status: number, body: unknown, capture?: (url: string, init: RequestInit) => void) {
  globalThis.fetch = (async (url: string, init: RequestInit) => { capture?.(String(url), init); return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }) as typeof fetch;
}
const cred = { kind: "api_key" as const, apiKey: KEY };
const req = { model: "m", system: "s", messages: [{ role: "user" as const, content: "hi" }] };

test("openai: parses text and usage, sends key only in the auth header, store:false", async () => {
  let seen: RequestInit = {}; let url = "";
  mockFetch(200, { model: "gpt-x", output: [{ type: "message", content: [{ type: "output_text", text: "hello" }] }], usage: { input_tokens: 5, output_tokens: 2 } }, (u, i) => { url = u; seen = i; });
  const r = await OpenAIProvider.generate(cred, req);
  assert.deepEqual([r.text, r.usage.inputTokens, r.usage.outputTokens], ["hello", 5, 2]);
  assert.equal((seen.headers as any).Authorization, `Bearer ${KEY}`);
  assert.ok(!url.includes(KEY)); assert.equal(JSON.parse(String(seen.body)).store, false);
});

test("anthropic: parses text and usage with x-api-key", async () => {
  let seen: RequestInit = {};
  mockFetch(200, { content: [{ type: "text", text: "hey" }], usage: { input_tokens: 3, output_tokens: 1 } }, (_u, i) => { seen = i; });
  const r = await AnthropicProvider.generate(cred, req);
  assert.equal(r.text, "hey"); assert.equal((seen.headers as any)["x-api-key"], KEY);
});

test("gemini: parses text, skips thought parts, key in header not URL", async () => {
  let url = ""; let seen: RequestInit = {};
  mockFetch(200, { candidates: [{ content: { parts: [{ text: "hmm", thought: true }, { text: "yo" }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, thoughtsTokenCount: 3 } }, (u, i) => { url = u; seen = i; });
  const r = await GeminiProvider.generate(cred, req);
  assert.equal(r.text, "yo"); assert.equal(r.usage.outputTokens, 5);
  assert.ok(!url.includes(KEY)); assert.equal((seen.headers as any)["x-goog-api-key"], KEY);
});

test("provider errors map to codes and never carry the provider's message", async () => {
  mockFetch(401, { error: { message: `Incorrect API key provided: ${KEY}` } });
  await assert.rejects(OpenAIProvider.generate(cred, req), (e: any) => e instanceof AIError && e.code === "invalid_key" && !String(e.message).includes("sk-"));
  mockFetch(429, { error: { type: "insufficient_quota" } });
  await assert.rejects(OpenAIProvider.generate(cred, req), (e: any) => e.code === "quota_exceeded");
  mockFetch(400, { error: { message: "API key not valid. Please pass a valid API key." } });
  await assert.rejects(GeminiProvider.validateConnection(cred), (e: any) => e.code === "invalid_key");
  mockFetch(529, "overloaded");
  await assert.rejects(AnthropicProvider.generate(cred, req), (e: any) => e.code === "provider_unavailable");
});

test("openai model list keeps chat models only", async () => {
  mockFetch(200, { data: [{ id: "gpt-4.1-mini", created: 2 }, { id: "text-embedding-3-small" }, { id: "gpt-4o-audio-preview" }, { id: "o3", created: 3 }, { id: "dall-e-3" }] });
  const m = await OpenAIProvider.listAvailableModels(cred);
  assert.deepEqual(m.map((x) => x.id), ["o3", "gpt-4.1-mini"]);
  assert.equal(OpenAIProvider.pickDefaultModel(m), "gpt-4.1-mini");
});

test("features: note capped at 300 chars; common ground drops guessed emails and linkedin sites", () => {
  const long = "x ".repeat(400);
  assert.ok(FEATURES.connection_note.parse(JSON.stringify({ note: long })).note.length <= 300);
  const cg = FEATURES.common_ground.parse('```json\n{"name":"Ana","email":"not-an-email","website":"https://linkedin.com/in/ana","points":[{"point":"Both ex-audit","from":"profile"}],"followup":"Thanks"}\n```');
  assert.equal(cg.email, ""); assert.equal(cg.website, ""); assert.equal(cg.points.length, 1);
  assert.throws(() => FEATURES.common_ground.parse("not json"), (e: any) => e.code === "bad_output");
});

test("reasoning models get low effort and output headroom", async () => {
  let b: any = {};
  mockFetch(200, { output: [], usage: {} }, (_u, i) => { b = JSON.parse(String(i.body)); });
  await OpenAIProvider.generate(cred, { ...req, model: "gpt-5-mini", maxOutputTokens: 400 });
  assert.equal(b.reasoning.effort, "low"); assert.ok(b.max_output_tokens >= 4000);
  await OpenAIProvider.generate(cred, { ...req, model: "gpt-4.1-mini", maxOutputTokens: 400 });
  assert.equal(b.reasoning, undefined); assert.equal(b.max_output_tokens, 400);
  mockFetch(200, { candidates: [] }, (_u, i) => { b = JSON.parse(String(i.body)); });
  await GeminiProvider.generate(cred, { ...req, model: "gemini-2.5-flash", maxOutputTokens: 400 });
  assert.ok(b.generationConfig.maxOutputTokens >= 6000);
});
