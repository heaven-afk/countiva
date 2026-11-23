import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./test-database.mjs";
test("business deletion requires owner/admin confirmation, removes scoped dependencies and preserves other businesses and trial claims", async () => {
  const { db, identity, rpc } = await testDatabase();
  try {
    const owner = randomUUID(),
      staff = randomUUID(),
      other = randomUUID(),
      admin = randomUUID(),
      viewer = randomUUID();
    for (const id of [owner, staff, other, admin, viewer])
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, `${id}@deletion.test`],
      );
    await db.query(
      "insert into platform_admins(user_id,role) values($1,'owner'),($2,'viewer')",
      [admin, viewer],
    );
    await identity(other);
    const keep = await rpc("setup_business", [
      "Keep shop",
      "Retail shop",
      "",
      "",
    ]);
    await identity(owner);
    const bid = await rpc("setup_business", [
      "Delete shop",
      "Retail shop",
      "",
      "",
    ]);
    const pid = randomUUID();
    await rpc("sync_workspace", [
      bid,
      {
        products: [
          {
            id: pid,
            name: "Phone",
            unit: "phone",
            category: "Devices",
            price: 200,
            cost: 100,
            threshold: 2,
          },
        ],
        movements: [
          {
            id: randomUUID(),
            productId: pid,
            quantity: 2,
            reason: "Opening",
            createdAt: new Date().toISOString(),
          },
        ],
        sales: [
          {
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            total: 200,
            paid: 100,
            customer: "Ada",
            method: "Cash",
            lines: [
              {
                productId: pid,
                name: "Phone",
                unit: "phone",
                quantity: 1,
                price: 200,
                cost: 100,
              },
            ],
          },
        ],
        payments: [],
      },
    ]);
    await db.exec("reset role");
    await db.query(
      "insert into receipt_edit_audit(business_id,sale_id,revision,actor_id,previous_details,next_details) select business_id,id,1,$2,'{}'::jsonb,'{}'::jsonb from sales where business_id=$1",
      [bid, owner],
    );
    await db.query("insert into memberships values($1,$2,'staff')", [
      bid,
      staff,
    ]);
    const event = (
      await db.query(
        "select id from business_push_events where business_id=$1 limit 1",
        [bid],
      )
    ).rows[0].id;
    await db.query(
      "insert into business_push_deliveries(event_id,user_id) values($1,$2)",
      [event, staff],
    );
    await db.query(
      "insert into business_push_device_receipts(event_id,user_id,subscription_id) values($1,$2,$3)",
      [event, staff, randomUUID()],
    );
    await identity(staff);
    await assert.rejects(
      rpc("delete_business", [bid, "Delete shop", true]),
      /Only the business owner/,
    );
    await assert.rejects(
      db.query("delete from businesses where id=$1", [bid]),
      /permission denied/,
    );
    await identity(viewer);
    await assert.rejects(
      rpc("platform_delete_business", [
        bid,
        "Delete shop",
        true,
        "Request permanent removal",
      ]),
      /administrator required/,
    );
    await identity(other);
    await assert.rejects(
      rpc("delete_business", [bid, "Delete shop", true]),
      /Only the business owner/,
    );
    await identity(owner);
    await assert.rejects(
      rpc("delete_business", [bid, "wrong name", true]),
      /exact business name/,
    );
    await assert.rejects(
      rpc("delete_business", [bid, "Delete shop", false]),
      /confirm permanent/,
    );
    const order = await rpc("create_plan_order", [
      bid,
      "business-monthly",
      3000000,
    ]);
    await assert.rejects(
      rpc("delete_business", [bid, "Delete shop", true]),
      /checkout is still pending/,
    );
    await db.exec("reset role");
    await db.query(
      "update billing_orders set checkout_id='deleted-checkout' where id=$1",
      [order.id],
    );
    await db.exec("set role service_role");
    await rpc("apply_verified_billing_payment", [
      order.id,
      "deleted-checkout",
      "deleted-payment",
      3000000,
      "NGN",
      "deleted-event",
      "checkout.completed",
    ]);
    await identity(owner);
    await rpc("delete_business", [bid, "Delete shop", true]);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query("select count(*)::int n from businesses where id=$1", [
          bid,
        ])
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query("select count(*)::int n from businesses where id=$1", [
          keep,
        ])
      ).rows[0].n,
      1,
    );
    for (const table of [
      "memberships",
      "products",
      "stock_movements",
      "sales",
      "sale_items",
      "receipt_edit_audit",
      "subscription_terms",
      "billing_orders",
      "business_push_events",
      "stock_alert_states",
      "stock_audit_log",
    ])
      assert.equal(
        (
          await db.query(
            `select count(*)::int n from ${table} where business_id=$1`,
            [bid],
          )
        ).rows[0].n,
        0,
        table,
      );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from business_push_deliveries where event_id=$1",
          [event],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from billing_events where order_id=$1",
          [order.id],
        )
      ).rows[0].n,
      0,
    );
    const claim = (
      await db.query(
        "select business_id,grant_id from new_owner_trial_claims where owner_id=$1",
        [owner],
      )
    ).rows[0];
    assert.equal(claim.business_id, null);
    assert.equal(claim.grant_id, null);
    assert.equal(
      (
        await db.query("select count(*)::int n from auth.users where id=$1", [
          owner,
        ])
      ).rows[0].n,
      1,
    );
    await db.exec("set role service_role");
    assert.equal(
      await rpc("is_deleted_business_checkout", ["deleted-checkout"]),
      true,
    );
    await identity(owner);
    const recreated = await rpc("setup_business", [
      "New shop",
      "Retail shop",
      "",
      "",
    ]);
    assert.equal(
      (await rpc("business_entitlements", [recreated])).status,
      "inactive",
    );
    await identity(admin);
    await assert.rejects(
      rpc("platform_delete_business", [recreated, "New shop", true, "short"]),
      /deletion reason/,
    );
    await rpc("platform_delete_business", [
      recreated,
      "New shop",
      true,
      "Owner requested business removal",
    ]);
    await db.exec("reset role");
    const audit = (
      await db.query(
        "select actor_kind,reason from business_deletion_events where business_id=$1",
        [recreated],
      )
    ).rows[0];
    assert.equal(audit.actor_kind, "admin");
    assert.equal(audit.reason, "Owner requested business removal");
    await identity(staff);
    await assert.rejects(
      db.query("select * from business_deletion_events"),
      /permission denied/,
    );
    await assert.rejects(
      rpc("perform_business_deletion", [
        keep,
        "Keep shop",
        true,
        "owner",
        null,
      ]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
