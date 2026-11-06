import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
test("editable receipts validate item identifiers, preserve financial records, audit revisions and reject stale snapshots and unauthorised edits", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;",
    );
    for (const file of [
      "001_foundation.sql",
      "002_business_onboarding.sql",
      "003_team_and_business_settings.sql",
      "004_platform_admin.sql",
      "005_authorised_sync_and_receipts.sql",
      "006_countiva_v2.sql",
      "007_subscription_management.sql",
      "008_editable_receipt_details.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    const owner = randomUUID(),
      staff = randomUUID(),
      manager = randomUUID(),
      colleague = randomUUID(),
      outsider = randomUUID(),
      admin = randomUUID(),
      product = randomUUID(),
      accessory = randomUUID(),
      saleId = randomUUID();
    for (const [id, name] of [
      [owner, "Owner"],
      [staff, "Cashier"],
      [manager, "Manager"],
      [colleague, "Colleague"],
      [outsider, "Outsider"],
      [admin, "Platform admin"],
    ])
      await db.query("insert into auth.users values($1,$2,now(),$3)", [
        id,
        id + "@receipt.test",
        JSON.stringify({ owner_name: name }),
      ]);
    await db.query(
      "insert into platform_admins(user_id,role) values($1,'owner')",
      [admin],
    );
    const identity = async (id) => {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    const rpc = async (name, args = []) =>
      (
        await db.query(
          "select public." +
            name +
            "(" +
            args.map((_, i) => "$" + (i + 1)).join(",") +
            ") as result",
          args,
        )
      ).rows[0].result;
    const empty = { products: [], sales: [], movements: [], payments: [] };
    await identity(owner);
    const bid = await rpc("setup_business", [
      "Phone shop",
      "Retail shop",
      "",
      "",
    ]);
    await db.exec("reset role");
    for (const [user, role] of [
      [manager, "manager"],
      [staff, "staff"],
      [colleague, "staff"],
    ])
      await db.query("insert into memberships values($1,$2,$3)", [
        bid,
        user,
        role,
      ]);
    await identity(admin);
    await rpc("platform_manage_subscription", [
      bid,
      "trial",
      JSON.stringify({
        requestId: randomUUID(),
        reason: "Receipt feature verification",
        expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      }),
    ]);
    const sale = {
      id: saleId,
      createdAt: new Date().toISOString(),
      total: 155000,
      paid: 100000,
      method: "Cash",
      customer: "Ada original credit",
      sync: "pending",
      lines: [
        {
          productId: product,
          name: "Example phone",
          unit: "phone",
          quantity: 1,
          price: 150000,
          cost: 100000,
        },
        {
          productId: accessory,
          name: "Charger",
          unit: "piece",
          quantity: 1,
          price: 5000,
          cost: 3000,
        },
      ],
    };
    const payload = {
      ...empty,
      products: [
        {
          id: product,
          name: "Example phone",
          unit: "phone",
          category: "Devices",
          cost: 100000,
          price: 150000,
          threshold: 2,
        },
        {
          id: accessory,
          name: "Charger",
          unit: "piece",
          category: "Accessories",
          cost: 3000,
          price: 5000,
          threshold: 2,
        },
      ],
      movements: [
        {
          id: randomUUID(),
          productId: product,
          quantity: 10,
          reason: "Opening",
          createdAt: new Date().toISOString(),
        },
        {
          id: randomUUID(),
          productId: accessory,
          quantity: 10,
          reason: "Opening",
          createdAt: new Date().toISOString(),
        },
      ],
      sales: [sale],
    };
    await identity(owner);
    const initial = await rpc("sync_workspace", [bid, JSON.stringify(payload)]);
    let saved = await rpc("get_sale_receipt", [bid, saleId]);
    assert.equal(saved.revision, 0);
    assert.equal(saved.canEdit, true);
    const details = {
      customerName: "Ada receipt name",
      customerPhone: "+234 800 000 0000",
      reference: "ORDER-100",
      description: "Device supplied with accessories.",
      items: [
        {
          lineIndex: 0,
          productId: product,
          description: "Black, 256 GB. Tested before collection.",
          identifierType: "imei",
          identifiers: ["490154203237518"],
        },
        {
          lineIndex: 1,
          productId: accessory,
          description: "USB-C wall charger",
          identifierType: "serial",
          identifiers: ["CHG-00001"],
        },
      ],
    };
    saved = await rpc("update_sale_receipt", [
      bid,
      saleId,
      0,
      JSON.stringify(details),
    ]);
    assert.equal(saved.revision, 1);
    assert.equal(saved.details.items[0].identifiers[0], "490154203237518");
    assert.equal(saved.history[0].editorName, "Owner");
    await assert.rejects(
      rpc("update_sale_receipt", [bid, saleId, 0, JSON.stringify(details)]),
      /changed on another device/,
    );
    assert.equal(
      (
        await rpc("update_sale_receipt", [
          bid,
          saleId,
          1,
          JSON.stringify(details),
        ])
      ).revision,
      1,
    );
    let snapshot = await rpc("sync_workspace", [
      bid,
      JSON.stringify({
        ...payload,
        sales: [{ ...sale, receiptDetails: {}, receiptRevision: 999 }],
      }),
    ]);
    assert.equal(snapshot.sales[0].receiptRevision, 1);
    assert.equal(
      snapshot.sales[0].receiptDetails.customerName,
      "Ada receipt name",
    );
    assert.equal(snapshot.sales[0].total, sale.total);
    assert.equal(snapshot.sales[0].paid, sale.paid);
    assert.equal(snapshot.sales[0].customer, sale.customer);
    assert.deepEqual(
      snapshot.products.map((p) => p.stock),
      initial.products.map((p) => p.stock),
    );
    assert.deepEqual(snapshot.sales[0].lines, initial.sales[0].lines);
    assert.deepEqual(snapshot.payments, initial.payments);
    await assert.rejects(
      rpc("update_sale_receipt", [
        bid,
        saleId,
        1,
        JSON.stringify({ ...details, total: 1 }),
      ]),
      /Unsupported receipt field/,
    );
    await assert.rejects(
      rpc("update_sale_receipt", [
        bid,
        saleId,
        1,
        JSON.stringify({
          ...details,
          items: [{ ...details.items[0], identifiers: ["123"] }],
        }),
      ]),
      /15 digits/,
    );
    await assert.rejects(
      rpc("update_sale_receipt", [
        bid,
        saleId,
        1,
        JSON.stringify({
          ...details,
          items: [{ ...details.items[0], productId: randomUUID() }],
        }),
      ]),
      /original sale/,
    );
    await assert.rejects(
      rpc("update_sale_receipt", [
        bid,
        saleId,
        1,
        JSON.stringify({
          ...details,
          items: [details.items[0], details.items[0]],
        }),
      ]),
      /original sale/,
    );
    await assert.rejects(
      rpc("validate_receipt_details", [bid, saleId, JSON.stringify(details)]),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("select * from receipt_edit_audit"),
      /permission denied/,
    );
    await identity(staff);
    assert.equal((await rpc("get_sale_receipt", [bid, saleId])).canEdit, false);
    await assert.rejects(
      rpc("update_sale_receipt", [bid, saleId, 1, JSON.stringify(details)]),
      /original sale recorder/,
    );
    const ownSale = { ...sale, id: randomUUID() };
    await rpc("sync_workspace", [
      bid,
      JSON.stringify({ ...empty, sales: [ownSale] }),
    ]);
    assert.equal(
      (await rpc("get_sale_receipt", [bid, ownSale.id])).canEdit,
      true,
    );
    assert.equal(
      (
        await rpc("update_sale_receipt", [
          bid,
          ownSale.id,
          0,
          JSON.stringify({
            ...details,
            description: "Cashier entered description",
          }),
        ])
      ).revision,
      1,
    );
    await identity(manager);
    saved = await rpc("update_sale_receipt", [
      bid,
      saleId,
      1,
      JSON.stringify({ ...details, description: "Corrected description" }),
    ]);
    assert.equal(saved.revision, 2);
    assert.equal(saved.history[0].editorName, "Manager");
    assert.equal(saved.history.length, 2);
    await identity(outsider);
    await assert.rejects(
      rpc("get_sale_receipt", [bid, saleId]),
      /access denied/,
    );
    await assert.rejects(
      rpc("update_sale_receipt", [bid, saleId, 2, JSON.stringify(details)]),
      /access denied/,
    );
    await identity(admin);
    await assert.rejects(
      rpc("get_sale_receipt", [bid, saleId]),
      /access denied/,
    );
    await rpc("platform_manage_subscription", [
      bid,
      "pause",
      JSON.stringify({ requestId: randomUUID(), reason: "Pause verification" }),
    ]);
    await identity(owner);
    assert.equal((await rpc("get_sale_receipt", [bid, saleId])).canEdit, false);
    await assert.rejects(
      rpc("update_sale_receipt", [bid, saleId, 2, JSON.stringify(details)]),
      /unpaused/,
    );
    snapshot = await rpc("sync_workspace", [bid, JSON.stringify(empty)]);
    assert.equal(
      snapshot.sales.find((s) => s.id === saleId).receiptRevision,
      2,
    );
    await identity(admin);
    await rpc("platform_manage_subscription", [
      bid,
      "resume",
      JSON.stringify({
        requestId: randomUUID(),
        reason: "Resume verification",
      }),
    ]);
    await identity(owner);
    const restored = {
      ...sale,
      id: randomUUID(),
      receiptDetails: details,
      receiptRevision: 99,
    };
    snapshot = await rpc("sync_workspace", [
      bid,
      JSON.stringify({ ...empty, sales: [restored] }),
    ]);
    assert.equal(
      snapshot.sales.find((s) => s.id === restored.id).receiptRevision,
      0,
    );
    assert.equal(
      (await rpc("get_sale_receipt", [bid, restored.id])).history[0].revision,
      0,
    );
  } finally {
    await db.close();
  }
});
