import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
test("admin API reports actionable session, configuration and migration errors and denies unauthorised accounts", async () => {
  const source = `export async function authenticatedServer(){if(globalThis.__adminAuthError)throw new Error(globalThis.__adminAuthError);return {client:globalThis.__adminClient,user:{id:'test'}}} export function verifyOrigin(){if(globalThis.__adminOriginError)throw new Error(globalThis.__adminOriginError)} export function serviceClient(){return globalThis.__adminClient}`;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier.endsWith("/lib/server/auth"))
        return {
          url: "data:text/javascript," + encodeURIComponent(source),
          shortCircuit: true,
        };
      if (specifier === "next/server") return next("next/server.js", context);
      if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
        const path = new URL(specifier + ".ts", context.parentURL);
        if (existsSync(fileURLToPath(path)))
          return { url: path.href, shortCircuit: true };
      }
      return next(specifier, context);
    },
  });
  let role = "owner",
    dbError = null;
  globalThis.__adminClient = {
    rpc: async () => ({ data: role, error: dbError }),
  };
  const original = console.error;
  console.error = () => {};
  try {
    const { POST } = await import("../src/app/api/admin/operations/route.ts");
    const call = async () =>
      POST(
        new Request("https://www.countiva.shop/api/admin/operations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "health" }),
        }),
      );
    assert.equal((await call()).status, 200);
    globalThis.__adminAuthError = "Please sign in again.";
    let result = await call();
    assert.equal(result.status, 401);
    assert.match((await result.json()).error, /Sign out and sign in/);
    globalThis.__adminAuthError = "Account services are not configured.";
    result = await call();
    assert.equal(result.status, 503);
    assert.match((await result.json()).error, /Vercel Production/);
    globalThis.__adminAuthError = null;
    globalThis.__adminOriginError = "This request did not come from Countiva.";
    result = await call();
    assert.equal(result.status, 403);
    assert.match((await result.json()).error, /APP_URL/);
    globalThis.__adminOriginError = null;
    dbError = { code: "PGRST202", message: "internal secret must not leak" };
    result = await call();
    assert.equal(result.status, 503);
    const body = await result.json();
    assert.match(body.error, /migration checker/);
    assert.ok(!JSON.stringify(body).includes("internal secret"));
    dbError = null;
    role = null;
    assert.equal((await call()).status, 403);
  } finally {
    hooks.deregister();
    console.error = original;
    delete globalThis.__adminClient;
    delete globalThis.__adminAuthError;
    delete globalThis.__adminOriginError;
  }
});
