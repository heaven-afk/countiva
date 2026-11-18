import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json(
      { error: "Plan details are temporarily unavailable." },
      { status: 503 },
    );
  const client = createClient(url, key, { auth: { persistSession: false } });
  const [plans, trial] = await Promise.all([
    client.rpc("public_plan_catalog"),
    client.rpc("public_trial_offer"),
  ]);
  if (plans.error || trial.error)
    return NextResponse.json(
      { error: "Plan details are temporarily unavailable." },
      { status: 503 },
    );
  return NextResponse.json(
    { plans: plans.data, trial: trial.data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
