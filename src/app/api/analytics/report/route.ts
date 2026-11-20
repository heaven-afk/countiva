import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticatedServer,
  serviceClient,
  verifyOrigin,
} from "../../../../lib/server/auth";
import { buildAnalytics } from "../../../../lib/analytics";
import { explainAnalytics } from "../../../../lib/server/ai-analytics";
import {
  analyticsLevel,
  scopeAnalytics,
} from "../../../../lib/analytics-access";
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
        days: z
          .union([z.literal(1), z.literal(7), z.literal(30), z.literal(90)])
          .default(30),
      })
      .parse(await request.json());
    const { data: access, error: accessError } = await client.rpc(
      "business_entitlements",
      { bid: businessId },
    );
    const level = access ? analyticsLevel(access) : "none";
    if (accessError || !access?.hasAccess || level === "none")
      return NextResponse.json(
        {
          error: "Business insights require an active Growth or Business plan.",
        },
        { status: 403 },
      );
    if (level === "growth" && days > 31)
      return NextResponse.json(
        { error: "90-day reports require the Business plan." },
        { status: 403 },
      );
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
    if (reserved.data.ready) {
      if (level === "growth" && reserved.data.report.days > 31)
        return NextResponse.json(
          { error: "This report requires the Business plan." },
          { status: 403 },
        );
      return NextResponse.json({
        report: scopeAnalytics(reserved.data.report, level),
      });
    }
    const calculated = buildAnalytics(reserved.data.snapshot, days);
    const report = scopeAnalytics(calculated, level);
    let ai = null;
    try {
      ai = await explainAnalytics(report, level);
    } catch {}
    // Preserve the calculated snapshot so an upgrade can unlock its full detail.
    // Every response and database read still applies the current access level.
    const result = { ...calculated, aiSummary: ai, aiAvailable: !!ai };
    const saved = await admin.rpc("complete_business_report", {
      bid: businessId,
      report_id: reportId || reserved.data.reportId,
      report_data: result,
    });
    if (saved.error) throw saved.error;
    return NextResponse.json({ report: scopeAnalytics(result, level) });
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
