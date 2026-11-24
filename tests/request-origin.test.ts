import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyOrigin, applicationOrigin } from "../src/lib/server/auth.ts";
import {
  unstable_getResponseFromNextConfig,
  getRedirectUrl,
} from "next/experimental/testing/server.js";
import nextConfig from "../next.config.ts";

test("legacy admin URLs redirect to the public domain without looping or interrupting workspace and recovery pages", async () => {
  for (const path of [
    "/admin",
    "/admin/login",
    "/admin?section=traffic",
    "/admin/login?next=%2Fadmin",
  ]) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://countiva.vercel.app${path}`,
      nextConfig,
    });
    assert.equal(response.status, 308);
    const redirected = new URL(getRedirectUrl(response)!);
    assert.equal(redirected.origin, "https://www.countiva.shop");
    assert.equal(
      redirected.pathname,
      new URL(`https://countiva.vercel.app${path}`).pathname,
    );
    assert.equal(
      redirected.searchParams.get("section"),
      new URL(`https://countiva.vercel.app${path}`).searchParams.get("section"),
    );
    assert.equal(
      redirected.searchParams.get("next"),
      new URL(`https://countiva.vercel.app${path}`).searchParams.get("next"),
    );
  }
  for (const url of [
    "https://www.countiva.shop/admin",
    "https://countiva.shop/admin",
    "https://unrelated.vercel.app/admin",
    "https://countivaXvercelXapp/admin",
    "https://countiva.vercel.app/workspace",
    "https://countiva.vercel.app/reset-password",
  ]) {
    const response = await unstable_getResponseFromNextConfig({
      url,
      nextConfig,
    });
    assert.equal(response.status, 200, `Unexpected redirect: ${url}`);
  }
});

test("admin, insights and checkout accept their real website without depending on a stale redirect setting", () => {
  const saved = { mode: process.env.NODE_ENV, app: process.env.APP_URL };
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    for (const configured of [
      undefined,
      "https://countiva-old-preview.vercel.app",
      "https://www.countiva.shop",
      "invalid-address",
    ]) {
      if (configured === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = configured;
      for (const host of [
        "https://www.countiva.shop",
        "https://countiva.shop",
      ]) {
        for (const path of [
          "/api/admin/operations",
          "/api/insights",
          "/api/billing/checkout",
        ]) {
          const request = new Request(host + path, {
            headers: { Origin: host },
          });
          assert.doesNotThrow(() => verifyOrigin(request));
          assert.equal(applicationOrigin(request), host);
        }
      }
      // A browser on the deployed preview may legitimately call that preview's
      // API even when redirects are configured for the public website.
      assert.doesNotThrow(() =>
        verifyOrigin(
          new Request(
            "https://countiva-current-preview.vercel.app/api/admin/operations",
            {
              headers: {
                Origin: "https://countiva-current-preview.vercel.app",
              },
            },
          ),
        ),
      );
      // A reverse proxy's internal URL is not reflected into payment callbacks.
      const proxied = new Request(
        "http://localhost:3000/api/billing/checkout",
        { headers: { Origin: "https://www.countiva.shop" } },
      );
      assert.doesNotThrow(() => verifyOrigin(proxied));
      assert.equal(applicationOrigin(proxied), "https://www.countiva.shop");
    }
    process.env.APP_URL = "https://stale-deployment.vercel.app";
    for (const origin of [
      "https://evil.test",
      "https://countiva.shop.evil.test",
      "https://www.countiva.shop.evil.test",
      "http://www.countiva.shop",
      "null",
      "https://unrelated.vercel.app",
      "https://stale-deployment.vercel.app",
    ]) {
      assert.throws(
        () =>
          verifyOrigin(
            new Request("https://www.countiva.shop/api/admin/operations", {
              headers: {
                Origin: origin,
                "X-Forwarded-Host": new URL(
                  origin === "null" ? "https://evil.test" : origin,
                ).host,
                "X-Forwarded-Proto": "https",
              },
            }),
          ),
        /did not come from Countiva/,
      );
    }
    assert.throws(
      () =>
        verifyOrigin(
          new Request(
            "https://countiva-current-preview.vercel.app/api/admin/operations",
            { headers: { Origin: "https://unrelated.vercel.app" } },
          ),
        ),
      /did not come from Countiva/,
    );
    assert.throws(
      () =>
        verifyOrigin(
          new Request("http://localhost:3000/api/admin/operations", {
            headers: { Origin: "http://localhost:3000" },
          }),
        ),
      /did not come from Countiva/,
    );
    Object.assign(process.env, { NODE_ENV: "development" });
    assert.doesNotThrow(() =>
      verifyOrigin(
        new Request("http://127.0.0.1:3000/api/admin/operations", {
          headers: { Origin: "http://127.0.0.1:3000" },
        }),
      ),
    );
  } finally {
    if (saved.mode === undefined)
      Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: saved.mode });
    if (saved.app === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = saved.app;
  }
});
