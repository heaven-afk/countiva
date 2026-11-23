import { getSupabase } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
export type ManualPayment = {
  id: string;
  business_id: string;
  offer_code: string;
  tier: string;
  months: number;
  amount: number;
  status: "quoted" | "submitted" | "approved" | "rejected" | "cancelled";
  bank_details: {
    bankName: string;
    accountName: string;
    accountNumber: string;
  };
  created_at: string;
  quote_expires_at: string;
  promotion_ends_at?: string | null;
  submitted_at: string | null;
  sender_name: string | null;
  transfer_reference: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  business_name?: string;
  owner_email?: string;
};
export async function paymentRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const client = getSupabase();
  if (!client || !navigator.onLine)
    throw new Error("Connect to Countiva and sign in to continue.");
  const result = await (client as SupabaseClient)
    .rpc(name, args)
    .abortSignal(AbortSignal.timeout(20000));
  if (result.error) {
    if (["PGRST202", "42P01", "42883"].includes(result.error.code))
      throw new Error(
        name.includes("platform") || name === "review_manual_payment"
          ? "The admin payment database updates are incomplete. Run the migration checker and apply missing migrations 022 and 023 in order. Do not rerun installed migrations."
          : "Bank-transfer services are not ready yet. Contact Countiva support before sending money.",
      );
    throw new Error(
      result.error.message || "This request did not complete. Please retry.",
    );
  }
  return result.data as T;
}
export const paymentDate = (date: string) =>
  new Date(date).toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    dateStyle: "medium",
    timeStyle: "short",
  });
