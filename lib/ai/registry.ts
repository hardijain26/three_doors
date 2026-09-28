import { AnthropicProvider } from "./providers/anthropic.ts";
import { GeminiProvider } from "./providers/gemini.ts";
import { OpenAIProvider } from "./providers/openai.ts";
import type { AIProvider, ProviderId } from "./types.ts";

// To add a provider: write an adapter that implements AIProvider, add it here,
// and add its id to the provider check constraints in the database.
const PROVIDERS: Record<ProviderId, AIProvider> = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  gemini: GeminiProvider,
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
export function isProviderId(x: unknown): x is ProviderId { return typeof x === "string" && x in PROVIDERS; }
export function getProvider(id: ProviderId): AIProvider { return PROVIDERS[id]; }

/** Public, secret-free description used by the connect screen. */
export function providerCatalog() {
  return PROVIDER_IDS.map((id) => {
    const p = PROVIDERS[id];
    return { id, displayName: p.displayName, authMethods: p.authMethods };
  });
}
