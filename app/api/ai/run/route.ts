import { runFeature } from "@/lib/ai/gateway.ts";
import { AIError } from "@/lib/ai/types.ts";
import { isFeatureId } from "@/lib/features/index.ts";
import { ok, fail, unauthorized, browserKey } from "@/lib/http/respond.ts";
import { requireUser } from "@/lib/supabase/server.ts";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    if (!user) return unauthorized();
    const { feature, input, provider } = await req.json().catch(() => ({}));
    if (!isFeatureId(feature)) throw new AIError("bad_request", 400);
    return ok({ result: await runFeature(sb, user, feature, input, browserKey(req), typeof provider === "string" ? provider : undefined) });
  } catch (e) { return fail(e, "ai.run"); }
}
