import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { serviceClient, verifyOrigin } from "../../../lib/server/auth";
const input = z
  .object({
    eventId: z.uuid(),
    sessionId: z.uuid(),
    path: z.enum([
      "/",
      "/plans",
      "/inventory-management",
      "/sales-tracking",
      "/receipts",
      "/signup",
      "/login",
    ]),
    referrer: z.string().max(200).default(""),
  })
  .strict();
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 2048)
      return new Response(null, { status: 413 });
    if (
      /bot|crawler|spider|headless|lighthouse|preview/i.test(
        request.headers.get("user-agent") || "",
      )
    )
      return new Response(null, { status: 204 });
    const raw = await request.text();
    if (raw.length > 2048) return new Response(null, { status: 413 });
    const parsed = input.safeParse(JSON.parse(raw));
    if (!parsed.success) return new Response(null, { status: 400 });
    const data = parsed.data;
    const host = data.referrer
      ? new URL(`https://${data.referrer}`).hostname.toLowerCase()
      : "";
    if (
      host &&
      (host !== data.referrer.toLowerCase() || !/^[a-z0-9.-]+$/.test(host))
    )
      return new Response(null, { status: 400 });
    const secret =
      process.env.TRAFFIC_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return new Response(null, { status: 503 });
    const address =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const rateKey = createHmac("sha256", secret)
      .update(`${new Date().toISOString().slice(0, 10)}:${address}`)
      .digest("hex");
    const saved = await serviceClient().rpc("record_website_visit", {
      event_ref: data.eventId,
      session_ref: data.sessionId,
      page_path: data.path,
      referrer: host,
      rate_key: rateKey,
    });
    if (saved.error) return new Response(null, { status: 503 });
    return saved.data
      ? new Response(null, { status: 204 })
      : NextResponse.json({ error: "Too many requests." }, { status: 429 });
  } catch {
    return new Response(null, { status: 400 });
  }
}
