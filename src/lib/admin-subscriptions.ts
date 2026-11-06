import type { Entitlements, PlanTier } from "./plans";

export type SubscriptionAction =
  "pause" | "resume" | "trial" | "activate" | "end_grant";
export type AdminSubscription = {
  id: string;
  name: string;
  ownerEmail: string;
  members: number;
  access: Entitlements;
  lastPayment: { amount: number; paidAt: string; offerCode: string } | null;
};
export type SubscriptionPage = {
  businesses: AdminSubscription[];
  total: number;
  offset: number;
  pageSize: number;
};
export type SubscriptionHistory = {
  events: {
    id: string;
    action: SubscriptionAction;
    reason: string;
    actorEmail: string;
    createdAt: string;
    tier: PlanTier | null;
    expiresAt: string | null;
  }[];
  orders: {
    id: string;
    offerCode: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
    paidAt: string | null;
  }[];
};
