import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticatedServer,
  serviceClient,
  verifyOrigin,
} from "../../../lib/server/auth";
import { buildAnalytics } from "../../../lib/analytics";
import { explainAnalytics } from "../../../lib/server/ai-analytics";
import { AIServiceError } from "../../../lib/server/gemini";
import { analyticsLevel, scopeAnalytics } from "../../../lib/analytics-access";
import { dailyBriefResult } from "../../../lib/daily-brief";
import { analyticsFailure } from "../../../lib/server/analytics-failure";
export const maxDuration = 60;
export async function POST(request: Request) {
  let reservedBusiness: string | null = null;
  let privileged: ReturnType<typeof serviceClient> | null = null;
  try {
    verifyOrigin(request);
    const { client } = await authenticatedServer(request);
    const admin = serviceClient();
    privileged = admin;
    const { businessId } = z
      .object({ businessId: z.uuid() })
      .parse(await request.json());
    const { data: access, error: accessError } = await client.rpc(
      "business_entitlements",
      { bid: businessId },
    );
    const level = access ? analyticsLevel(access) : "none";
    if (accessError)
      return NextResponse.json(
        { error: analyticsFailure(accessError) },
        { status: 503 },
      );
    if (!access?.hasAccess || level === "none")
      return NextResponse.json(
        {
          error: "Business insights require an active Growth or Business plan.",
        },
        { status: 403 },
      );
    const reserved = await client.rpc("reserve_daily_insight", {
      bid: businessId,
    });
    if (reserved.error)
      return NextResponse.json(
        { error: reserved.error.message },
        { status: 403 },
      );
    if (!reserved.data.cached) reservedBusiness = businessId;
    let snapshot = reserved.data.snapshot;
    if (reserved.data.cached) {
      const saved = await client.rpc("sync_workspace", {
        bid: businessId,
        payload: { products: [], sales: [], movements: [], payments: [] },
      });
      if (saved.error) throw saved.error;
      snapshot = saved.data;
    }
    const report = scopeAnalytics(buildAnalytics(snapshot, 30), level),
      brief = reserved.data.cached
        ? reserved.data.body.brief
        : await explainAnalytics(report, level);
    if (!brief) throw new Error("AI unavailable");
    const result = dailyBriefResult(
      report,
      brief,
      reserved.data.cached ? reserved.data.body.asOf : report.asOf,
      level,
    );
    // Refresh figures from current online records, while keeping the dated daily narrative.
    // Do not overwrite a concurrent newer narrative when returning a cached one.
    if (reserved.data.cached) return NextResponse.json(result);
    const saved = await admin.rpc("complete_daily_insight", {
      bid: businessId,
      body_data: result,
    });
    if (saved.error) throw saved.error;
    return NextResponse.json(result);
  } catch (error) {
    if (reservedBusiness && privileged) {
      try {
        await privileged.rpc("release_daily_insight", {
          bid: reservedBusiness,
        });
      } catch {}
    }
    return NextResponse.json(
      {
        error:
          error instanceof AIServiceError
            ? error.message
            : analyticsFailure(error),
      },
      { status: 503 },
    );
  }
}
