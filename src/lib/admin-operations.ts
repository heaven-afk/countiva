import type { State } from "./domain";
import type { Workspace } from "./contracts";
export type CatalogPlan = {
  code: string;
  name: string;
  tier: "starter" | "growth" | "business";
  category: "monthly" | "annual";
  months: number;
  amount: number;
  enabled: boolean;
  revision: number;
  baseAmount?: number;
  promotionEndsAt?: string | null;
  promotionLabel?: string | null;
};
export type TrialPolicy = { enabled: boolean; days: number; revision: number };
export type PlanSettings = {
  promotion?: {
    amount: number;
    starts_at: string;
    ends_at: string;
    enabled: boolean;
  } | null;
  plans: CatalogPlan[];
  trial: TrialPolicy;
  audit: {
    id: number;
    action: string;
    target: string;
    reason: string;
    actor_email: string;
    created_at: string;
    previous_value: unknown;
    next_value: unknown;
  }[];
};
export type SupportWorkspace = {
  sessionId: string;
  expiresAt: string;
  workspace: Workspace;
  snapshot: State;
  team: { email: string; role: string }[];
  subscription: { status: string; tier: string };
};
