import type { AnalyticsReport } from "./analytics.ts";
export type AnalyticsLevel = "none" | "growth" | "business";
export function analyticsLevel(access: {
  tier: string;
  analyticsLevel?: AnalyticsLevel;
}): AnalyticsLevel {
  if (access.tier === "starter") return "none";
  return (
    access.analyticsLevel ||
    (access.tier === "business" ? "business" : "growth")
  );
}
export function scopeAnalytics(
  report: AnalyticsReport,
  level: AnalyticsLevel,
): AnalyticsReport {
  if (level === "none")
    throw new Error(
      "Business insights are available on Growth and Business plans.",
    );
  if (level === "business") return report;
  const { intelligence: _intelligence, ...summary } = report;
  return {
    ...summary,
    products: [],
    creditAge: [],
    paymentMix: [],
    insights: report.insights.slice(0, 3),
    aiSummary: report.aiSummary
      ? {
          summary: report.aiSummary.summary,
          observations: report.aiSummary.observations.slice(0, 2),
          actions: report.aiSummary.actions.slice(0, 2),
        }
      : undefined,
  };
}
