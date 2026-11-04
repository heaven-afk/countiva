import { NextResponse } from "next/server";
import { webhooks, BachsWebhookError } from "@bachs/sdk";
import {
  bachsClient,
  validateBachsPayment,
} from "../../../../lib/server/bachs";
import { serviceClient } from "../../../../lib/server/auth";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length") || 0) > 262144)
    return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > 262144) return new Response(null, { status: 413 });
  let event;
  try {
    event = webhooks.constructEvent(raw, request.headers, secret);
  } catch (e) {
    if (e instanceof BachsWebhookError)
      return new Response("Invalid signature", { status: 400 });
    return new Response("Invalid webhook", { status: 400 });
  }
  if (
    process.env.BACHS_ACCOUNT_ID &&
    event.organization_id !== process.env.BACHS_ACCOUNT_ID
  )
    return new Response("Wrong account", { status: 400 });
  try {
    const admin = serviceClient();
    const bachs = bachsClient();
    if (["checkout.completed", "collection.succeeded"].includes(event.type)) {
      const checkoutId = event.data.checkout_id;
      if (typeof checkoutId !== "string" || checkoutId.length > 200)
        return new Response("Missing checkout", { status: 400 });
      const { data: order, error } = await admin
        .from("billing_orders")
        .select("*")
        .eq("checkout_id", checkoutId)
        .maybeSingle();
      if (error) throw error;
      if (!order)
        return new Response(
          "Checkout is not registered yet. Retry this delivery.",
          { status: 503 },
        );
      const checkout = await bachs.checkoutSessions.get(checkoutId);
      const paymentId =
        checkout.charge?.payment_id ||
        event.data.payment_id ||
        event.data.charge_id;
      if (typeof paymentId !== "string")
        throw new Error("Payment is not yet available");
      const payment = await bachs.payments.get(paymentId);
      validateBachsPayment(order, checkout, payment);
      const applied = await admin.rpc("apply_verified_billing_payment", {
        order_ref: order.id,
        provider_checkout: checkoutId,
        provider_payment: payment.payment_id,
        paid_amount: order.amount,
        paid_currency: payment.currency,
        event_ref: event.id,
        event_kind: event.type,
      });
      if (applied.error) throw applied.error;
    } else if (event.type === "refund.paid") {
      const paymentId = event.data.payment_id || event.data.charge_id;
      if (typeof paymentId === "string") {
        const payment = await bachs.payments.get(paymentId);
        if (
          ["refunded", "auto_refunded"].includes(payment.status.toLowerCase())
        ) {
          const reversed = await admin.rpc("reverse_billing_payment", {
            provider_payment: payment.payment_id,
            event_ref: event.id,
            event_kind: event.type,
          });
          if (reversed.error) throw reversed.error;
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      {
        error: "Verification is temporarily unavailable. Retry this delivery.",
      },
      { status: 503 },
    );
  }
}
