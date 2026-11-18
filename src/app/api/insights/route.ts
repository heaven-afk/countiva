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
    const reserved = await client.rpc("reserve_daily_insight", {
      bid: businessId,
    });
    if (reserved.error)
      return NextResponse.json(
        { error: reserved.error.message },
        { status: 403 },
      );
    if (reserved.data.cached && reserved.data.body.financials)
      return NextResponse.json(reserved.data.body);
    reservedBusiness = businessId;
    let snapshot = reserved.data.snapshot;
    if (reserved.data.cached) {
      const saved = await client.rpc("sync_workspace", {
        bid: businessId,
        payload: { products: [], sales: [], movements: [], payments: [] },
      });
      if (saved.error) throw saved.error;
      snapshot = saved.data;
    }
    const report = buildAnalytics(snapshot, 30),
      brief = reserved.data.cached
        ? reserved.data.body.brief
        : await explainAnalytics(report);
    if (!brief) throw new Error("AI unavailable");
    const result = {
      brief,
      asOf: reserved.data.cached ? reserved.data.body.asOf : report.asOf,
      financialsAsOf: report.asOf,
      periodDays: 30,
      financials: {
        salesMade: report.metrics.revenue,
        grossProfit: report.metrics.grossProfit,
        collected: report.metrics.collected,
        outstanding: report.metrics.credit,
        discountsGiven: report.metrics.discountsGiven,
        availableCash: null,
      },
    };
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
            : "The AI brief could not be prepared. Your recorded figures remain available. Try again shortly.",
      },
      { status: 503 },
    );
  }
}
