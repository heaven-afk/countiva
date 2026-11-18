import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticatedServer,
  serviceClient,
  verifyOrigin,
} from "../../../../lib/server/auth";
import { buildAnalytics } from "../../../../lib/analytics";
import { explainAnalytics } from "../../../../lib/server/ai-analytics";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const { client } = await authenticatedServer(request);
    const admin = serviceClient();
    const { businessId, reportId, days } = z
      .object({
        businessId: z.uuid(),
        reportId: z.uuid().optional(),
        days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
      })
      .parse(await request.json());
    const reserved = reportId
      ? await client.rpc("reserve_business_report", {
          bid: businessId,
          report_id: reportId,
        })
      : await client.rpc("reserve_included_report", { bid: businessId, days });
    if (reserved.error)
      return NextResponse.json(
        { error: reserved.error.message },
        { status: 403 },
      );
    if (reserved.data.ready)
      return NextResponse.json({ report: reserved.data.report });
    const report = buildAnalytics(reserved.data.snapshot, days);
    let ai = null;
    try {
      ai = await explainAnalytics(report);
    } catch {}
    const result = { ...report, aiSummary: ai, aiAvailable: !!ai };
    const saved = await admin.rpc("complete_business_report", {
      bid: businessId,
      report_id: reportId || reserved.data.reportId,
      report_data: result,
    });
    if (saved.error) throw saved.error;
    return NextResponse.json({ report: result });
  } catch {
    return NextResponse.json(
      {
        error:
          "The detailed report could not be prepared. No additional payment is required. Try again shortly.",
      },
      { status: 503 },
    );
  }
}
