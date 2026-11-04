import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticatedServer,
  serviceClient,
  verifyOrigin,
} from "../../../lib/server/auth";
import { buildAnalytics } from "../../../lib/analytics";
import { explainAnalytics } from "../../../lib/server/ai-analytics";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const { client } = await authenticatedServer(request);
    const admin = serviceClient();
    if (!process.env.GEMINI_API_KEY)
      return NextResponse.json(
        {
          error:
            "AI briefs are temporarily unavailable. Your record-based insights remain available.",
        },
        { status: 503 },
      );
    const { businessId } = z
      .object({ businessId: z.uuid() })
      .parse(await request.json());
    const reserved = await client.rpc("reserve_daily_insight", {
      bid: businessId,
    });
    if (reserved.error)
      return NextResponse.json(
        { error: reserved.error.message },
        { status: 403 },
      );
    if (reserved.data.cached) return NextResponse.json(reserved.data.body);
    const report = buildAnalytics(reserved.data.snapshot, 30),
      brief = await explainAnalytics(report);
    if (!brief) throw new Error("AI unavailable");
    const result = { brief, asOf: report.asOf, periodDays: 30 };
    const saved = await admin.rpc("complete_daily_insight", {
      bid: businessId,
      body_data: result,
    });
    if (saved.error) throw saved.error;
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        error:
          "The AI brief could not be prepared. Your record-based insights remain available. Try again later.",
      },
      { status: 503 },
    );
  }
}
