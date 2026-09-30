import { runFeature } from "@/lib/ai/gateway.ts";
import { AIError } from "@/lib/ai/types.ts";
import { isFeatureId } from "@/lib/features/index.ts";
import { ok, fail, unauthorized, browserKey } from "@/lib/http/respond.ts";
import { requireUser } from "@/lib/supabase/server.ts";
import { supabaseAdmin } from "@/lib/supabase/admin.ts";

export const maxDuration = 300;

// CONFIGURATION: Change these to adjust your limits
const REQUEST_LIMIT = 20; // Max requests per hour
const WINDOW_HOURS = 1;

export async function POST(req: Request) {
  try {
    const { sb, user } = await requireUser();
    if (!user) return unauthorized();
    
    const { feature, input, provider } = await req.json().catch(() => ({}));
    if (!isFeatureId(feature) || feature === "extract_openings") throw new AIError("bad_request", 400);

    // --- START RATE LIMIT LOGIC ---
    const admin = supabaseAdmin();
    
    // 1. Get current rate limit data for this user
    const { data: limitData, error: limitError } = await admin
      .from("ai_rate_limits")
      .select("request_count, window_start")
      .eq("user_id", user.id)
      .single();

    const now = new Date();
    let count = 0;
    let windowStart = now;

    if (limitData) {
      const start = new Date(limitData.window_start);
      const diffHours = (now.getTime() - start.getTime()) / (1000 * 60 * 60);

      if (diffHours < WINDOW_HOURS) {
        count = limitData.request_count;
        windowStart = start;
      }
    }

    // 2. Check if limit is exceeded
    if (count >= REQUEST_LIMIT) {
      return fail(new Error("too_many_requests"), "ai.run", 429);
    }

    // 3. Increment the count in the database
    await admin.from("ai_rate_limits").upsert({
      user_id: user.id,
      request_count: count + 1,
      window_start: windowStart,
    });
    // --- END RATE LIMIT LOGIC ---

    return ok({ 
      result: await runFeature(sb, user, feature, input, browserKey(req), typeof provider === "string" ? provider : undefined) 
    });
  } catch (e) { 
    return fail(e, "ai.run"); 
  }
}
