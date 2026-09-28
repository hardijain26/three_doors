import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelemetryEvent } from "./events.ts";

/** Fire-and-forget. Telemetry must never break or slow a user action. */
export function track(sb: SupabaseClient, e: TelemetryEvent) {
  const props = Object.fromEntries(Object.entries(e.props).filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => [k, typeof v === "string" ? v.replace(/\s+/g, "_").slice(0, 64) : v]));
  sb.rpc("track_event", { p_event: e.event, p_props: props }).then(() => {}, () => {});
}
