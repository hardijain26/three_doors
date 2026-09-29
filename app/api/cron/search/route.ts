import { NextResponse } from "next/server";
import { dispatchDueSearches } from "@/lib/search/orchestrator.ts";
import { supabaseAdmin } from "@/lib/supabase/admin.ts";

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await dispatchDueSearches({
      admin: supabaseAdmin(),
      requestUrl: req.url,
      cronSecret: secret,
    });
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "scheduler_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
