import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
type AdminPushJob = {
  alert_id: string;
  subscription_id: string;
  title: string;
  body: string;
  kind: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
};
export async function deliverAdminPushAlerts(
  admin: SupabaseClient,
  sender: typeof webpush.sendNotification = webpush.sendNotification,
) {
  const claim = await admin.rpc("claim_platform_push_alerts");
  if (claim.error) throw claim.error;
  const pending = [...(claim.data || [])] as AdminPushJob[];
  const processed = pending.length;
  let delivered = 0;
  await Promise.all(
    Array.from({ length: Math.min(10, pending.length) }, async () => {
      for (let job; (job = pending.shift());) {
        const permitted = await admin.rpc("platform_push_delivery_allowed", {
          alert_ref: job.alert_id,
          subscription_ref: job.subscription_id,
        });
        if (permitted.error) throw permitted.error;
        if (!permitted.data) continue;
        try {
          await sender(
            {
              endpoint: job.endpoint,
              keys: { p256dh: job.p256dh, auth: job.auth_secret },
            },
            JSON.stringify({
              title: `Countiva Admin · ${job.title}`,
              body: job.body,
              tag: `countiva-admin-${job.alert_id}`,
              url:
                job.kind === "transfer" ? "/admin#payments" : "/admin#alerts",
            }),
            { TTL: 3600, timeout: 8000 },
          );
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            const removed = await admin
              .from("platform_push_subscriptions")
              .delete()
              .eq("id", job.subscription_id);
            if (removed.error) throw removed.error;
          }
          continue;
        }
        const saved = await admin
          .from("platform_push_deliveries")
          .update({ sent_at: new Date().toISOString() })
          .eq("alert_id", job.alert_id)
          .eq("subscription_id", job.subscription_id);
        if (saved.error) throw saved.error;
        delivered++;
      }
    }),
  );
  return { processed, delivered };
}
