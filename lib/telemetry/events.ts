// The full list of product events. Values must be short machine tokens or numbers:
// the database function rejects anything else, so free text can't be sent by mistake.
// Never add a property that could hold user content (names, notes, prompts, answers).
export type TelemetryEvent =
  | { event: "provider_connected"; props: { provider: string; auth_method: string; storage: string } }
  | { event: "provider_disconnected"; props: { provider: string } }
  | { event: "provider_validation_failed"; props: { provider: string; error_code: string } }
  | { event: "ai_request_completed"; props: { feature: string; provider: string; model: string; storage: string; duration_ms: number; input_tokens: number | null; output_tokens: number | null; success: boolean; error_code?: string } }
  | { event: "role_created"; props: Record<string, never> }
  | { event: "contact_created"; props: { contact_type: string } }
  | { event: "contact_status_changed"; props: { to_status: string } };
