import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverPushJobs } from "../src/lib/server/push-delivery.ts";
import { createRequire } from "node:module";
test("default delivery reaches the actual Web Push request builder without making a network call", async () => {
  const WebPushLib = createRequire(import.meta.url)(
    "web-push/src/web-push-lib.js",
  );
  const original = WebPushLib.prototype.generateRequestDetails;
  let called = false;
  WebPushLib.prototype.generateRequestDetails = function (this: object) {
    called = Object.getPrototypeOf(this) === WebPushLib.prototype;
    throw new Error("Network disabled in isolated test");
  };
  const admin = {
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        limit() {
          return query;
        },
        update() {
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({
            data:
              table === "push_subscriptions"
                ? [
                    {
                      id: "test",
                      endpoint: "https://test.invalid",
                      p256dh: "key",
                      auth_secret: "key",
                    },
                  ]
                : [],
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  try {
    await deliverPushJobs(admin, [
      { id: "test", businessId: "business", userId: "owner", kind: "morning" },
    ]);
    assert.equal(called, true);
  } finally {
    WebPushLib.prototype.generateRequestDetails = original;
  }
});
test("push retry skips delivered devices, deletes invalid endpoints and preserves the report deep link", async () => {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    push_subscriptions: [
      {
        id: "one",
        business_id: "business",
        user_id: "owner",
        endpoint: "https://one.test",
        p256dh: "key",
        auth_secret: "auth",
      },
      {
        id: "two",
        business_id: "business",
        user_id: "owner",
        endpoint: "https://two.test",
        p256dh: "key",
        auth_secret: "auth",
      },
      {
        id: "expired",
        business_id: "business",
        user_id: "owner",
        endpoint: "https://expired.test",
        p256dh: "key",
        auth_secret: "auth",
      },
    ],
    business_push_device_receipts: [],
    business_push_deliveries: [
      { event_id: "event", user_id: "owner", status: "pending" },
    ],
  };
  const admin = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let mode = "read",
        data: Record<string, unknown> = {};
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        limit() {
          return query;
        },
        update(value: Record<string, unknown>) {
          mode = "update";
          data = value;
          return query;
        },
        delete() {
          mode = "delete";
          return query;
        },
        upsert(value: Record<string, unknown>) {
          mode = "insert";
          data = value;
          return query;
        },
        then(
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) {
          const matched = tables[table].filter((row) =>
            Object.entries(filters).every(([key, value]) => row[key] === value),
          );
          if (mode === "insert") tables[table].push({ ...data });
          if (mode === "update")
            matched.forEach((row) => Object.assign(row, data));
          if (mode === "delete")
            tables[table] = tables[table].filter(
              (row) => !matched.includes(row),
            );
          return Promise.resolve({ data: matched, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const calls: Record<string, number> = {};
  const url =
    "/workspace?view=Business%20insights&business=business&report=report";
  const sender: Parameters<typeof deliverPushJobs>[2] = async (
    sub,
    payload,
    options,
  ) => {
    calls[sub.endpoint] = (calls[sub.endpoint] || 0) + 1;
    assert.equal(JSON.parse(String(payload)).url, url);
    assert.equal(options?.TTL, 3600);
    if (sub.endpoint.includes("expired"))
      throw Object.assign(new Error("Expired"), { statusCode: 410 });
    if (sub.endpoint.includes("two") && calls[sub.endpoint] === 1)
      throw Object.assign(new Error("Temporary"), { statusCode: 503 });
    return { statusCode: 201, body: "", headers: {} };
  };
  const jobs = [
    {
      id: "event",
      eventId: "event",
      businessId: "business",
      userId: "owner",
      kind: "daily_report",
      title: "Report ready",
      body: "Daily report",
      url,
    },
  ];
  assert.equal((await deliverPushJobs(admin, jobs, sender)).delivered, 0);
  assert.equal(tables.push_subscriptions.length, 2);
  assert.equal(tables.business_push_deliveries[0].status, "failed");
  assert.equal((await deliverPushJobs(admin, jobs, sender)).delivered, 1);
  assert.equal(calls["https://one.test"], 1);
  assert.equal(calls["https://two.test"], 2);
  assert.equal(tables.business_push_deliveries[0].status, "sent");
  assert.equal(tables.business_push_device_receipts.length, 2);
});
