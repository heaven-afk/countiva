import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
export type PushJob = {
  id: string;
  businessId: string;
  userId: string;
  kind: string;
  eventId?: string;
  name?: string;
  businessName?: string;
  title?: string;
  body?: string;
  url?: string;
};
export async function deliverPushJobs(
  admin: SupabaseClient,
  jobs: PushJob[],
  sender: typeof webpush.sendNotification = webpush.sendNotification,
) {
  let delivered = 0;
  const pending = [...jobs];
  const processed = pending.length;
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
        const receipts = job.eventId
          ? await admin
              .from("business_push_device_receipts")
              .select("subscription_id")
              .eq("event_id", job.eventId)
              .eq("user_id", job.userId)
          : null;
        if (receipts?.error) throw receipts.error;
        const alreadySent = new Set(
          (receipts?.data || []).map((row) => row.subscription_id),
        );
        const body =
          job.body ||
          (job.kind === "morning"
            ? `Good morning, ${String(job.name).slice(0, 50)}. Open Countiva to check today’s stock for ${String(job.businessName).slice(0, 100)}.`
            : `Hello, ${String(job.name).slice(0, 50)}. Check ${String(job.businessName).slice(0, 100)} in Countiva before closing. Today’s stock and sales updates haven’t been saved online yet.`);
        const results = await Promise.allSettled(
          (subscriptions || []).map(async (sub) => {
            if (alreadySent.has(sub.id)) return true;
            try {
              await sender(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
                },
                JSON.stringify({
                  title:
                    job.title ||
                    (job.kind === "morning"
                      ? "Countiva · Your morning stock check"
                      : "Countiva · Your end-of-day reminder"),
                  body,
                  tag: `countiva-${job.businessId}-${job.eventId || job.kind}`,
                  url:
                    job.url ||
                    `/workspace?view=Notifications&business=${job.businessId}`,
                }),
                { TTL: 3600, timeout: 8000 },
              );
              if (job.eventId) {
                const receipt = await admin
                  .from("business_push_device_receipts")
                  .upsert(
                    {
                      event_id: job.eventId,
                      user_id: job.userId,
                      subscription_id: sub.id,
                    },
                    { onConflict: "event_id,user_id,subscription_id" },
                  );
                if (receipt.error) throw receipt.error;
              }
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
        const sent = job.eventId
          ? results.length > 0 &&
            results.every((result) => result.status === "fulfilled")
          : results.some((result) => result.status === "fulfilled");
        const updated = job.eventId
          ? await admin
              .from("business_push_deliveries")
              .update({ status: sent ? "sent" : "failed" })
              .eq("event_id", job.eventId)
              .eq("user_id", job.userId)
          : await admin
              .from("notification_deliveries")
              .update({ status: sent ? "sent" : "failed" })
              .eq("id", job.id);
        if (updated.error) throw updated.error;
        if (sent) delivered++;
      }
    }),
  );
  return { processed, delivered };
}
