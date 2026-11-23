import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type webpush from "web-push";
import { deliverAdminPushAlerts } from "../src/lib/server/admin-push-delivery.ts";
test("admin push reaches only currently authorised devices, marks successful sends, removes expired endpoints and retries transient failures", async () => {
  const removed: string[] = [],
    sent: string[] = [],
    payloads: Record<string, unknown>[] = [];
  const jobs = ["success", "revoked", "expired", "temporary"].map((id) => ({
    alert_id: id,
    subscription_id: id,
    kind: "transfer",
    title: "Review transfer",
    body: "Verify credit",
    endpoint: id,
    p256dh: "test",
    auth_secret: "test",
  }));
  const client = {
    rpc: async (name: string, args?: { alert_ref: string }) => ({
      data:
        name === "claim_platform_push_alerts"
          ? jobs
          : args?.alert_ref !== "revoked",
      error: null,
    }),
    from: () => {
      let action = "";
      let id = "";
      const query = {
        delete() {
          action = "delete";
          return query;
        },
        update() {
          action = "sent";
          return query;
        },
        eq(key: string, value: string) {
          if (key === "id" || key === "subscription_id") id = value;
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          if (action === "delete") removed.push(id);
          else sent.push(id);
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const sender = (async (subscription: { endpoint: string }, body: string) => {
    if (subscription.endpoint === "expired") throw { statusCode: 410 };
    if (subscription.endpoint === "temporary") throw { statusCode: 503 };
    payloads.push(JSON.parse(body));
  }) as unknown as typeof webpush.sendNotification;
  const result = await deliverAdminPushAlerts(client, sender);
  assert.equal(result.processed, 4);
  assert.equal(result.delivered, 1);
  assert.deepEqual(removed, ["expired"]);
  assert.deepEqual(sent, ["success"]);
  assert.equal(payloads[0].url, "/admin#payments");
});
