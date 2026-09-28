// Provider-neutral contracts. Product features only ever see these types.

export type ProviderId = "openai" | "anthropic" | "gemini";

/** How a provider lets an end user connect. Only list what the provider officially supports. */
export type AuthMethod =
  | { type: "api_key"; keyUrl: string; keyPrefixHint?: string; billing: string }
  | { type: "oauth"; enabled: boolean; note: string };

export type Credential = { kind: "api_key"; apiKey: string } | { kind: "oauth"; accessToken: string; project?: string };

export interface ModelInfo { id: string; label: string }

export interface ChatMessage { role: "user" | "assistant"; content: string }

export interface GenerateRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
}

export interface Usage { inputTokens: number | null; outputTokens: number | null }

export interface GenerateResult { text: string; usage: Usage; model: string }

export type StreamChunk = { type: "text"; text: string } | { type: "done"; usage: Usage };

export interface AIProvider {
  id: ProviderId;
  displayName: string;
  authMethods: AuthMethod[];
  /** Cheapest authenticated call that proves the credential works. */
  validateConnection(cred: Credential): Promise<void>;
  listAvailableModels(cred: Credential): Promise<ModelInfo[]>;
  /** A sensible default when the user has not picked a model. */
  pickDefaultModel(models: ModelInfo[]): string | null;
  generate(cred: Credential, req: GenerateRequest): Promise<GenerateResult>;
  streamGenerate(cred: Credential, req: GenerateRequest): AsyncIterable<StreamChunk>;
}

/** Normalised, content-free error codes. Provider messages are never passed through,
 *  because some of them echo part of the key. */
export type AIErrorCode =
  | "invalid_key" | "no_access" | "rate_limited" | "quota_exceeded" | "model_not_found"
  | "bad_request" | "provider_unavailable" | "timeout" | "not_connected" | "browser_key_missing" | "bad_output";

export class AIError extends Error {
  code: AIErrorCode; status: number;
  constructor(code: AIErrorCode, status = 502) { super(code); this.name = "AIError"; this.code = code; this.status = status; }
}

export const ERROR_TEXT: Record<AIErrorCode, string> = {
  invalid_key: "The provider rejected this key. Check it was copied in full and hasn't been revoked.",
  no_access: "This key doesn't have access to that model or endpoint.",
  rate_limited: "The provider is rate-limiting this key. Wait a minute and try again.",
  quota_exceeded: "This key has run out of credit or quota on the provider's side.",
  model_not_found: "That model isn't available to this key. Pick another in AI settings.",
  bad_request: "The provider refused the request.",
  provider_unavailable: "The provider is having trouble right now. Try again shortly.",
  timeout: "The provider took too long to answer.",
  not_connected: "Connect an AI provider in AI settings first.",
  browser_key_missing: "Your key is saved in a different browser. Enter it again in AI settings on this device.",
  bad_output: "The model's answer couldn't be read. Try again.",
};
