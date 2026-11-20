export type PlanTier = "starter" | "growth" | "business";
export type BillingCategory = "monthly" | "annual";
export const planLimits = {
  starter: {
    members: 1,
    templates: ["classic", "minimal"],
    scans: 10,
    scanItems: 10,
  },
  growth: {
    members: 3,
    templates: ["classic", "minimal", "ledger", "bold"],
    scans: 30,
    scanItems: 20,
  },
  business: {
    members: 6,
    templates: ["classic", "minimal", "ledger", "bold"],
    scans: 100,
    scanItems: 40,
  },
} as const;
export const offers = [
  {
    code: "starter-monthly",
    name: "Starter",
    tier: "starter",
    category: "monthly",
    months: 1,
    amount: 5000,
    hot: false,
    description: "A complete workspace for an owner who runs the shop.",
  },
  {
    code: "starter-year",
    name: "Starter",
    tier: "starter",
    category: "annual",
    months: 12,
    amount: 50000,
    hot: false,
    description: "A complete workspace for an owner who runs the shop.",
  },
  {
    code: "growth-monthly",
    name: "Growth",
    tier: "growth",
    category: "monthly",
    months: 1,
    amount: 15000,
    hot: false,
    description: "Work with two staff and manage a growing business.",
  },
  {
    code: "growth-year",
    name: "Growth",
    tier: "growth",
    category: "annual",
    months: 12,
    amount: 150000,
    hot: false,
    description: "Work with two staff and manage a growing business.",
  },
  {
    code: "business-monthly",
    name: "Business",
    tier: "business",
    category: "monthly",
    months: 1,
    amount: 30000,
    hot: false,
    description: "More team capacity and scanning for a busy business.",
  },
  {
    code: "business-year",
    name: "Business",
    tier: "business",
    category: "annual",
    months: 12,
    amount: 300000,
    hot: false,
    description: "More team capacity and scanning for a busy business.",
  },
] as const;
export type OfferCode = (typeof offers)[number]["code"];
export type ReceiptTemplate = "classic" | "minimal" | "ledger" | "bold";
export type Entitlements = {
  tier: PlanTier;
  analyticsLevel?: "none" | "growth" | "business";
  status: "active" | "legacy" | "inactive" | "trial" | "paused";
  source?: "payment" | "manual" | "trial" | "legacy" | "none";
  paidExpiresAt?: string | null;
  pausedAt?: string | null;
  hasAccess: boolean;
  maxMembers: number;
  receiptTemplates: ReceiptTemplate[];
  scanLimit: number;
  scanItems: number;
  scansUsed: number;
  currentOffer: string | null;
  expiresAt: string | null;
  nextOffer: string | null;
  nextStartsAt: string | null;
};
export const formatNaira = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
export function findOffer(code: string) {
  return offers.find((offer) => offer.code === code);
}

export const planName = (tier: string) =>
  tier === "business" ? "Business" : tier === "growth" ? "Growth" : "Starter";
