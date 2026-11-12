import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";

test("existing stock can be edited by staff and deleted only by owners without losing sales or leaking audit logs", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated,service_role;grant execute on function auth.uid() to authenticated;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;",
    );
    const migrations = new URL("../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(migrations))
      .sort()
      .filter((name) => /^00[1-9]_/.test(name))) {
      await db.exec(await readFile(new URL(name, migrations), "utf8"));
    }
    const owner = randomUUID(),
      staff = randomUUID(),
      manager = randomUUID(),
      outsider = randomUUID();
    for (const [id, name] of [
      [owner, "owner"],
      [staff, "staff"],
      [manager, "manager"],
      [outsider, "outsider"],
    ]) {
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, `${name}@stock.test`],
      );
    }
    const identity = async (id) => {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    const rpc = async (name, ...args) =>
      (
        await db.query(
          `select public.${name}(${args.map((_, index) => `$${index + 1}`).join(",")}) as result`,
          args,
        )
      ).rows[0].result;
    await identity(owner);
    const bid = await rpc("setup_business", "Test shop", "Retail shop", "", "");
    await db.exec("reset role");
    await db.query(
      "insert into legacy_billing_access(business_id) values($1)",
      [bid],
    );
    await db.query(
      "insert into memberships(business_id,user_id,role) values($1,$2,'staff'),($1,$3,'manager')",
      [bid, staff, manager],
    );
    const product = {
      id: randomUUID(),
      name: "Tea",
      category: "Drinks",
      unit: "box",
      stock: 10,
      cost: 1000,
      price: 1500,
      threshold: 2,
    };
    const createdAt = new Date().toISOString();
    const sale = {
      id: randomUUID(),
      createdAt,
      lines: [
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          quantity: 1,
          price: 1500,
          cost: 1000,
        },
      ],
      total: 1500,
      paid: 1500,
      method: "Cash",
      customer: "",
    };
    const oldPayload = {
      products: [product],
      sales: [sale],
      movements: [
        {
          id: randomUUID(),
          productId: product.id,
          quantity: 10,
          reason: "Opening stock",
          createdAt,
        },
      ],
      payments: [],
    };
    await identity(owner);
    await rpc("sync_workspace", bid, JSON.stringify(oldPayload));
    await db.exec("reset role");
    await db.exec(
      await readFile(new URL("010_stock_management.sql", migrations), "utf8"),
    );

    await identity(staff);
    const update = JSON.stringify({
      ...product,
      name: "Black tea",
      price: 1700,
      stock: 7,
      expectedStock: 9,
    });
    await rpc("update_stock_product", bid, product.id, 0, update);
    await assert.rejects(
      rpc("update_stock_product", bid, product.id, 0, update),
      /changed on another device/,
    );
    await assert.rejects(
      rpc("update_stock_product", bid, product.id, 1, update),
      /Stock changed/,
    );
    for (const user of [staff, manager, outsider]) {
      await identity(user);
      await assert.rejects(
        rpc("delete_stock_product", bid, product.id, 1),
        /Only the store owner/,
      );
      await assert.rejects(
        rpc("list_stock_audit", bid),
        /Only the store owner/,
      );
      await assert.rejects(
        db.query("select * from stock_audit_log"),
        /permission denied/,
      );
      assert.equal((await db.query("select * from audit_logs")).rows.length, 0);
    }
    await assert.rejects(
      rpc("update_stock_product", bid, product.id, 1, update),
      /access denied/,
    );

    await identity(owner);
    const beforeDelete = await rpc(
      "sync_workspace",
      bid,
      JSON.stringify(oldPayload),
    );
    assert.equal(beforeDelete.products[0].name, "Black tea");
    assert.equal(beforeDelete.products[0].price, 1700);
    assert.equal(beforeDelete.products[0].stock, 7);
    assert.deepEqual(beforeDelete.sales[0].lines, sale.lines);
    const logs = await rpc("list_stock_audit", bid);
    assert.deepEqual(
      logs.map((entry) => entry.action),
      ["edited", "adjusted"],
    );
    assert.equal(logs[0].actor_email, "staff@stock.test");
    assert.equal(logs[0].before_details.price, 1500);
    assert.equal(logs[0].after_details.price, 1700);
    assert.equal(logs[1].after_details.quantity, -2);
    await rpc("delete_stock_product", bid, product.id, 1);
    await assert.rejects(
      rpc("delete_stock_product", bid, product.id, 1),
      /changed or was deleted/,
    );
    const afterDelete = await rpc(
      "sync_workspace",
      bid,
      JSON.stringify(oldPayload),
    );
    assert.ok(
      afterDelete.products[0].archivedAt,
      "an old device snapshot cannot reactivate a deleted product",
    );
    assert.deepEqual(afterDelete.sales, beforeDelete.sales);
    assert.equal((await rpc("get_sale_receipt", bid, sale.id)).revision, 0);
    const ticket = await rpc("begin_stock_scan", bid);
    await db.exec("reset role");
    await db.query(
      "update stock_scan_requests set status='ready' where id=$1",
      [ticket.id],
    );
    await identity(owner);
    await assert.rejects(
      rpc(
        "apply_stock_scan",
        bid,
        ticket.id,
        JSON.stringify([{ productId: product.id, quantity: 3 }]),
      ),
      /has been deleted/,
    );
    const afterLogs = await rpc("list_stock_audit", bid);
    assert.deepEqual(
      afterLogs.map((entry) => entry.action),
      ["deleted", "edited", "adjusted"],
    );
    assert.equal(afterLogs[0].actor_email, "owner@stock.test");
    assert.deepEqual(
      (await rpc("list_stock_audit", bid, afterLogs[0].id)).map(
        (entry) => entry.action,
      ),
      ["edited", "adjusted"],
    );
  } finally {
    await db.close();
  }
});
