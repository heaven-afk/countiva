import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticatedServer,
  applicationOrigin,
  serviceClient,
  verifyOrigin,
} from "../../../../lib/server/auth";
import { bachsClient, safeCheckoutUrl } from "../../../../lib/server/bachs";
const input = z
  .object({
    businessId: z.uuid(),
    offerCode: z.enum([
      "starter-monthly",
      "growth-monthly",
      "growth-quarter",
      "growth-halfyear",
      "growth-year",
      "analytics-report",
    ]),
  })
  .strict();
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const { client, user } = await authenticatedServer(request);
    const bachs = bachsClient();
    const admin = serviceClient();
    const { businessId, offerCode } = input.parse(await request.json());
    const { data: order, error } = await client.rpc("create_billing_order", {
      bid: businessId,
      product_code: offerCode,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (order.checkout_url)
      return NextResponse.json({
        url: safeCheckoutUrl(order.checkout_url),
        orderId: order.id,
      });
    const origin = applicationOrigin(request);
    const checkout = await bachs.checkoutSessions.create(
      {
        pricing: {
          currency: "NGN",
          amount: (Number(order.amount) / 100).toFixed(2),
        },
        customer: {
          email: user.email!,
          name: user.user_metadata?.owner_name || user.email!.split("@")[0],
        },
        billing_currency: "NGN",
        payment_method_types: ["NGN_CARD", "NGN_BANK_TRANSFER"],
        reference: order.id,
        metadata: { order_id: order.id, offer_code: offerCode },
        expires_in_minutes: 30,
        success_url: `${origin}/workspace?view=Subscription&billing=returned`,
        cancel_url: `${origin}/workspace?view=Subscription&billing=cancelled`,
      },
      { idempotencyKey: `countiva-order-${order.id}` },
    );
    const safe = safeCheckoutUrl(checkout.checkout_url);
    const saved = await admin
      .from("billing_orders")
      .update({ checkout_id: checkout.checkout_id, checkout_url: safe })
      .eq("id", order.id)
      .eq("status", "pending");
    if (saved.error)
      throw new Error("Checkout could not be saved. Please retry.");
    return NextResponse.json({ url: safe, orderId: order.id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Checkout could not be opened.";
    return NextResponse.json(
      {
        error:
          message.includes("configured") ||
          message.includes("sign in") ||
          message.includes("APP_URL")
            ? message
            : "Secure checkout could not be opened. Please retry shortly.",
      },
      { status: 503 },
    );
  }
}
