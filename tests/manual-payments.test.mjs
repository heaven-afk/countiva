import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./test-database.mjs";

test("bank transfers require owner submission and verified admin approval; payments extend access once and preserve price snapshots", async () => {
  const { db, identity, rpc } = await testDatabase();
  try {
    const owner = randomUUID(),
      staff = randomUUID(),
      admin = randomUUID(),
      viewer = randomUUID(),
      other = randomUUID();
    for (const id of [owner, staff, admin, viewer, other])
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, `${id}@manual.test`],
      );
    await db.query(
      "insert into platform_admins(user_id,role) values($1,'admin'),($2,'viewer')",
      [admin, viewer],
    );
    await identity(owner);
    const bid = await rpc("setup_business", [
      "Transfer shop",
      "Retail shop",
      "",
      "",
    ]);
    await db.exec("reset role");
    await db.query("insert into memberships values($1,$2,'staff')", [
      bid,
      staff,
    ]);
    await identity(staff);
    await assert.rejects(
      rpc("create_manual_payment", [bid, "growth-monthly", 1500000]),
      /Only the business owner/,
    );
    await identity(owner);
    await assert.rejects(
      rpc("create_manual_payment", [bid, "growth-monthly", 1]),
      /price has changed/,
    );
    await assert.rejects(
      rpc("create_manual_payment", [bid, "growth-quarter", 6000000]),
      /plan or price/,
    );
    const starterPrice = (await rpc("public_plan_catalog")).find(
      (plan) => plan.code === "starter-monthly",
    ).amount;
    await assert.rejects(
      rpc("create_manual_payment", [bid, "starter-monthly", starterPrice]),
      /cannot fit/,
    );
    const quote = await rpc("create_manual_payment", [
      bid,
      "growth-monthly",
      1500000,
    ]);
    assert.equal(quote.bank_details.accountNumber, "0272178094");
    assert.equal(
      (await rpc("create_manual_payment", [bid, "growth-monthly", 1500000])).id,
      quote.id,
    );
    await assert.rejects(
      rpc("create_manual_payment", [bid, "business-monthly", 3000000]),
      /Cancel your existing/,
    );
    await assert.rejects(
      db.query("select * from manual_payment_requests"),
      /permission denied/,
    );
    await identity(other);
    await assert.rejects(
      rpc("business_manual_payments", [bid]),
      /Only the business owner/,
    );
    await assert.rejects(
      rpc("submit_manual_payment", [quote.id, "Sender name", "TRANSFER001"]),
      /Only the business owner/,
    );
    await identity(owner);
    const claimed = await rpc("submit_manual_payment", [
      quote.id,
      "Sender name",
      "TRANSFER001",
    ]);
    assert.equal(claimed.status, "submitted");
    await rpc("submit_manual_payment", [
      quote.id,
      "Sender name",
      "TRANSFER001",
    ]);
    await assert.rejects(
      rpc("delete_business", [bid, "Transfer shop", true]),
      /awaiting review/,
    );
    await assert.rejects(
      rpc("review_manual_payment", [
        quote.id,
        "approve",
        1500000,
        "BANK001",
        "Credit verified",
        true,
      ]),
      /administrator/,
    );
    await identity(viewer);
    await assert.rejects(rpc("platform_manual_payments"), /administrator/);
    await assert.rejects(
      rpc("review_manual_payment", [
        quote.id,
        "approve",
        1500000,
        "BANK001",
        "Credit verified",
        true,
      ]),
      /administrator/,
    );
    await identity(admin);
    assert.equal((await rpc("platform_manual_payments")).total, 1);
    await assert.rejects(
      rpc("review_manual_payment", [
        quote.id,
        "approve",
        1500000,
        "BANK001",
        "Credit verified",
        false,
      ]),
      /actual bank credit/,
    );
    await assert.rejects(
      rpc("review_manual_payment", [
        quote.id,
        "approve",
        500000,
        "BANK001",
        "Credit verified",
        true,
      ]),
      /full quoted amount/,
    );
    await db.exec("reset role");
    await db.query(
      "update billing_catalog set amount=1700000 where code='growth-monthly'",
    );
    await identity(admin);
    const approved = await rpc("review_manual_payment", [
      quote.id,
      "approve",
      1500000,
      "bank-001",
      "Credit verified in bank",
      true,
    ]);
    assert.equal(approved.status, "approved");
    await rpc("review_manual_payment", [
      quote.id,
      "approve",
      1500000,
      "BANK001",
      "Retry after connection loss",
      true,
    ]);
    await db.exec("reset role");
    const terms = (
      await db.query(
        "select t.*,o.amount from subscription_terms t join billing_orders o on o.id=t.order_id where t.business_id=$1",
        [bid],
      )
    ).rows;
    assert.equal(terms.length, 1);
    assert.equal(terms[0].amount, 1500000);
    assert.equal(terms[0].capacity_snapshot.members, 3);
    const trial = (
      await db.query(
        "select ends_at from subscription_access_grants where business_id=$1",
        [bid],
      )
    ).rows[0];
    assert.equal(
      new Date(terms[0].starts_at).getTime(),
      new Date(trial.ends_at).getTime(),
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from platform_alerts where kind='transfer'",
        )
      ).rows[0].n,
      1,
    );
    await identity(owner);
    const next = await rpc("create_manual_payment", [
      bid,
      "growth-monthly",
      1700000,
    ]);
    await rpc("submit_manual_payment", [next.id, "Sender name", "TRANSFER002"]);
    await identity(admin);
    await assert.rejects(
      rpc("review_manual_payment", [
        next.id,
        "approve",
        1700000,
        "BANK001",
        "Same transaction reference",
        true,
      ]),
      /already been used/,
    );
    await rpc("review_manual_payment", [
      next.id,
      "reject",
      0,
      "",
      "No matching credit found; contact support if debited.",
      false,
    ]);
    await assert.rejects(
      rpc("review_manual_payment", [
        next.id,
        "approve",
        1700000,
        "BANK002",
        "Credit verified",
        true,
      ]),
      /Only submitted/,
    );
    await identity(owner);
    const cancel = await rpc("create_manual_payment", [
      bid,
      "growth-monthly",
      1700000,
    ]);
    await rpc("cancel_manual_payment", [cancel.id]);
    await assert.rejects(
      rpc("submit_manual_payment", [cancel.id, "Sender name", "TRANSFER003"]),
      /closed/,
    );
    // Completed payments remain auditable after confirmed business deletion.
    await rpc("delete_business", [bid, "Transfer shop", true]);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from manual_payment_audit where action='approve' and request_id is null",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select count(*)::int n from manual_payment_requests"))
        .rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("admin alerts are private, deduplicate spikes, track personal reads and stop push on access removal", async () => {
  const { db, identity, rpc } = await testDatabase();
  try {
    const admin = randomUUID(),
      other = randomUUID(),
      viewer = randomUUID();
    for (const id of [admin, other, viewer])
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, `${id}@alerts.test`],
      );
    await db.query(
      "insert into platform_admins(user_id,role) values($1,'owner'),($2,'admin'),($3,'viewer')",
      [admin, other, viewer],
    );
    await db.query(
      "insert into website_visits(event_id,session_id,path,created_at) select gen_random_uuid(),gen_random_uuid(),'/',now()-interval '2 days' from generate_series(1,70)",
    );
    await db.query(
      "insert into website_visits(event_id,session_id,path) select gen_random_uuid(),gen_random_uuid(),'/' from generate_series(1,30)",
    );
    await identity(viewer);
    await assert.rejects(rpc("platform_alert_inbox"), /administrator/);
    await identity(admin);
    const inbox = await rpc("platform_alert_inbox");
    assert.equal(inbox.alerts.length, 1);
    assert.equal(inbox.alerts[0].kind, "traffic_spike");
    assert.equal((await rpc("platform_alert_inbox")).unreadCount, 1);
    await rpc("read_platform_alert", [inbox.alerts[0].id]);
    assert.equal((await rpc("platform_alert_inbox")).unreadCount, 0);
    await identity(other);
    assert.equal((await rpc("platform_alert_inbox")).unreadCount, 1);
    await assert.rejects(
      rpc("claim_platform_push_alerts"),
      /permission denied/,
    );
    await rpc("save_platform_notification_preferences", [true, true, true]);
    await assert.rejects(
      rpc("save_platform_push_subscription", [
        {
          endpoint: "https://example.com/private",
          p256dh: "p".repeat(50),
          auth: "a".repeat(22),
        },
      ]),
      /Unsupported/,
    );
    await rpc("save_platform_push_subscription", [
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        p256dh: "p".repeat(50),
        auth: "a".repeat(22),
      },
    ]);
    await db.exec("reset role");
    await db.query(
      "insert into platform_alerts(event_key,kind,title,body) values('new-transfer-test','transfer','New transfer','Review it')",
    );
    await db.exec("set role service_role");
    const jobs = await rpc("claim_platform_push_alerts");
    assert.equal(jobs.length, 1);
    assert.equal(
      await rpc("platform_push_delivery_allowed", [
        jobs[0].alert_id,
        jobs[0].subscription_id,
      ]),
      true,
    );
    assert.equal(
      (await rpc("claim_platform_push_alerts")).length,
      0,
      "claims have a retry lease",
    );
    await db.exec("reset role");
    await db.query("delete from platform_admins where user_id=$1", [other]);
    await db.exec("set role service_role");
    assert.equal(
      await rpc("platform_push_delivery_allowed", [
        jobs[0].alert_id,
        jobs[0].subscription_id,
      ]),
      false,
    );
  } finally {
    await db.close();
  }
});
