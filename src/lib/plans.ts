export type PlanTier = "starter" | "growth";
export type BillingCategory = "monthly" | "annual";
export const planLimits = {
  starter: {
    members: 3,
    templates: ["classic", "minimal"],
    scans: 20,
    scanItems: 10,
  },
  growth: {
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
    amount: 25000,
    hot: false,
    description: "The essentials for a small, focused team.",
  },
  {
    code: "growth-monthly",
    name: "Growth",
    tier: "growth",
    category: "monthly",
    months: 1,
    amount: 45000,
    hot: false,
    description: "More people, more templates and more scan capacity.",
  },
  {
    code: "growth-quarter",
    name: "Growth Hot Plan",
    tier: "growth",
    category: "monthly",
    months: 3,
    amount: 60000,
    hot: true,
    description: "Three months of Growth features. Available on every renewal.",
  },
  {
    code: "growth-halfyear",
    name: "Growth · 6 months",
    tier: "growth",
    category: "annual",
    months: 6,
    amount: 150000,
    hot: false,
    description: "Six months of Growth, paid upfront.",
  },
  {
    code: "growth-year",
    name: "Growth · 12 months",
    tier: "growth",
    category: "annual",
    months: 12,
    amount: 350000,
    hot: false,
    description: "One year of Growth, paid upfront.",
  },
] as const;
export type OfferCode = (typeof offers)[number]["code"];
export type ReceiptTemplate = "classic" | "minimal" | "ledger" | "bold";
export type Entitlements = {
  tier: PlanTier;
  status: "active" | "legacy" | "inactive";
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
