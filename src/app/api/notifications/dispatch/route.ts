import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { serviceClient } from "../../../../lib/server/auth";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET,
    provided =
      request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (
    !secret ||
    Buffer.byteLength(secret) !== Buffer.byteLength(provided) ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))
  )
    return new Response("Unauthorized", { status: 401 });
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey = process.env.VAPID_PRIVATE_KEY,
    subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject)
    return NextResponse.json(
      { error: "Push delivery is not configured." },
      { status: 503 },
    );
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const admin = serviceClient();
    const { data: jobs, error } = await admin.rpc("claim_due_reminders");
    if (error) throw error;
    let delivered = 0;
    const pending = [...(jobs || [])];
    await Promise.all(
      Array.from({ length: Math.min(20, pending.length) }, async () => {
        for (let job; (job = pending.shift());) {
          const { data: subscriptions, error: lookup } = await admin
            .from("push_subscriptions")
            .select("id,endpoint,p256dh,auth_secret")
            .eq("business_id", job.businessId)
            .eq("user_id", job.userId)
            .limit(5);
          if (lookup) throw lookup;
          const body =
            job.kind === "morning"
              ? `Good morning, ${String(job.name).slice(0, 50)}. Remember to check and enter today’s stock for ${String(job.businessName).slice(0, 100)}.`
              : `Before you close for the day, check the stock records for ${String(job.businessName).slice(0, 100)}. No online updates have been recorded today.`;
          const results = await Promise.allSettled(
            (subscriptions || []).map(async (sub) => {
              try {
                await webpush.sendNotification(
                  {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
                  },
                  JSON.stringify({
                    title:
                      job.kind === "morning"
                        ? "A good start to your business day"
                        : "Your end-of-day stock check",
                    body,
                    tag: `countiva-${job.businessId}-${job.kind}`,
                  }),
                  { TTL: 3600, timeout: 8000 },
                );
                return true;
              } catch (e) {
                const status = (e as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410)
                  await admin
                    .from("push_subscriptions")
                    .delete()
                    .eq("id", sub.id);
                throw e;
              }
            }),
          );
          const sent = results.some((result) => result.status === "fulfilled");
          const updated = await admin
            .from("notification_deliveries")
            .update({ status: sent ? "sent" : "failed" })
            .eq("id", job.id);
          if (updated.error) throw updated.error;
          if (sent) delivered++;
        }
      }),
    );
    return NextResponse.json({ processed: (jobs || []).length, delivered });
  } catch {
    return NextResponse.json(
      { error: "Reminder delivery did not complete. Retry the scheduler." },
      { status: 503 },
    );
  }
}
