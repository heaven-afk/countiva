import type { AnalyticsReport } from "./analytics.ts";
export type BusinessBrief = {
  summary: string;
  observations: string[];
  actions: string[];
};
export function dailyBriefResult(
  report: AnalyticsReport,
  brief: BusinessBrief,
  preparedAt: string,
  level: "growth" | "business",
) {
  return {
    brief:
      level === "growth"
        ? {
            ...brief,
            observations: brief.observations.slice(0, 2),
            actions: brief.actions.slice(0, 2),
          }
        : brief,
    asOf: preparedAt,
    financialsAsOf: report.asOf,
    analysisLevel: level,
    periodDays: report.days,
    financials: {
      salesMade: report.metrics.revenue,
      grossProfit: report.metrics.grossProfit,
      collected: report.metrics.collected,
      outstanding: report.metrics.credit,
      discountsGiven: report.metrics.discountsGiven,
      availableCash: null,
    },
  };
}
