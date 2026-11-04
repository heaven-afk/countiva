import { Bachs } from "@bachs/sdk";
import { toKobo } from "../domain.ts";
export function bachsClient() {
  const apiKey = process.env.BACHS_API_KEY;
  if (!apiKey)
    throw new Error(
      "Secure checkout is being configured. Please try again later.",
    );
  return new Bachs({ apiKey });
}
export function validateBachsPayment(
  order: { id: string; amount: number; currency: string; checkout_id: string },
  checkout: {
    checkout_id: string;
    status: string;
    reference?: string | null;
    amount?: string;
    currency?: string;
  },
  payment: {
    payment_id: string;
    status: string;
    amount: string;
    currency: string;
    checkout_id?: string | null;
  },
) {
  if (
    checkout.checkout_id !== order.checkout_id ||
    checkout.reference !== order.id ||
    checkout.status.toLowerCase() !== "completed" ||
    payment.status.toLowerCase() !== "succeeded" ||
    payment.checkout_id !== order.checkout_id ||
    checkout.currency !== order.currency ||
    payment.currency !== order.currency ||
    toKobo(checkout.amount || "") !== order.amount ||
    toKobo(payment.amount) !== order.amount
  )
    throw new Error("Payment verification did not match the order.");
}
export function safeCheckoutUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "bachs.io" || url.hostname.endsWith(".bachs.io"))
  )
    throw new Error("Invalid checkout address.");
  return url.href;
}
