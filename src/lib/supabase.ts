import type { Entitlements, ReceiptTemplate } from "./plans";
import type { AnalyticsReport } from "./analytics";
import type { ReceiptDetails, SavedReceiptDetails } from "./receipt-details";
import type {
  SubscriptionAction,
  SubscriptionPage,
  SubscriptionHistory,
} from "./admin-subscriptions";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { State } from "./domain";
import type {
  BusinessRole,
  Invitation,
  PlatformRole,
  PlatformDashboard,
  Team,
  Workspace,
} from "./contracts";
type Business = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  business_type: string;
  phone: string;
  address: string;
  receipt_footer: string;
  receipt_width: 58 | 80;
  logo_url: string;
  receipt_template: ReceiptTemplate;
};
type Database = {
  public: {
    Tables: {
      memberships: {
        Row: { business_id: string; user_id: string; role: BusinessRole };
        Insert: { business_id: string; user_id: string; role: BusinessRole };
        Update: { role?: BusinessRole };
        Relationships: [];
      };
      businesses: {
        Row: Business;
        Insert: Business;
        Update: Partial<Business>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_sale_receipt: {
        Args: { bid: string; sale_ref: string };
        Returns: SavedReceiptDetails;
      };
      update_sale_receipt: {
        Args: {
          bid: string;
          sale_ref: string;
          expected_revision: number;
          details: ReceiptDetails;
        };
        Returns: SavedReceiptDetails;
      };
      platform_subscriptions: {
        Args: {
          search_text: string;
          status_filter: string;
          offset_rows: number;
          page_size: number;
        };
        Returns: SubscriptionPage;
      };
      platform_subscription_history: {
        Args: { bid: string };
        Returns: SubscriptionHistory;
      };
      platform_manage_subscription: {
        Args: {
          bid: string;
          action_name: SubscriptionAction;
          details: {
            requestId: string;
            reason: string;
            tier?: string;
            expiresAt?: string;
          };
        };
        Returns: Entitlements;
      };
      business_entitlements: { Args: { bid: string }; Returns: Entitlements };
      visit_workspace: { Args: { bid: string }; Returns: undefined };
      apply_stock_scan: {
        Args: { bid: string; ticket_id: string; rows: unknown[] };
        Returns: boolean;
      };
      business_billing_history: {
        Args: { bid: string };
        Returns: Array<{
          id: string;
          offer_code: string;
          amount: number;
          status: string;
          created_at: string;
        }>;
      };
      list_business_reports: {
        Args: { bid: string };
        Returns: Array<{
          id: string;
          status: string;
          generatedAt: string | null;
        }>;
      };
      get_business_report: {
        Args: { bid: string; report_id: string };
        Returns: AnalyticsReport;
      };
      get_notification_preferences: {
        Args: { bid: string };
        Returns: {
          enabled: boolean;
          morning: boolean;
          evening: boolean;
          morning_time: string;
          evening_time: string;
        };
      };
      save_notification_preferences: {
        Args: {
          bid: string;
          details: {
            enabled: boolean;
            morning: boolean;
            evening: boolean;
            morning_time: string;
            evening_time: string;
          };
        };
        Returns: undefined;
      };
      save_push_subscription: {
        Args: {
          bid: string;
          details: { endpoint: string; p256dh?: string; auth?: string };
        };
        Returns: undefined;
      };
      create_workspace: { Args: { workspace_name: string }; Returns: string };
      setup_business: {
        Args: {
          workspace_name: string;
          business_type: string;
          business_phone: string;
          business_address: string;
        };
        Returns: string;
      };
      sync_workspace: {
        Args: { bid: string; payload: State & { deviceId?: string } };
        Returns: State;
      };
      business_role: { Args: { bid: string }; Returns: BusinessRole | null };
      invite_staff: {
        Args: { bid: string; staff_email: string; staff_role: string };
        Returns: string;
      };
      my_invitations: { Args: Record<string, never>; Returns: Invitation[] };
      accept_staff_invitation: {
        Args: { invitation_id: string };
        Returns: string;
      };
      business_team: { Args: { bid: string }; Returns: Team };
      update_team_access: {
        Args: { bid: string; target_user: string; new_role: string };
        Returns: undefined;
      };
      revoke_staff_invitation: {
        Args: { bid: string; invitation_id: string };
        Returns: undefined;
      };
      update_business_settings: {
        Args: { bid: string; details: Omit<Workspace, "id"> & { id?: string } };
        Returns: Workspace;
      };
      platform_access: {
        Args: Record<string, never>;
        Returns: PlatformRole | null;
      };
      platform_dashboard: {
        Args: Record<string, never>;
        Returns: PlatformDashboard;
      };
      set_platform_access: {
        Args: { target_email: string; access_role: string };
        Returns: undefined;
      };
      reserve_scan: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
let client: SupabaseClient<Database> | null = null;
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ??= createClient<Database>(url, key);
  return client;
}
