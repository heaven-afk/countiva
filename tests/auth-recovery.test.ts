import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authErrorMessage,
  INVALID_RECOVERY,
  isLegacyRecovery,
  parseRecoveryLink,
  passwordResetUrl,
  RECOVERY_WINDOW_MS,
  verifyRecovery,
  type RecoveryAuth,
} from "../src/lib/auth-recovery.ts";
function fakeAuth(redirectType = "recovery", userId = "reset-user") {
  const calls: { method: string; input?: unknown }[] = [];
  const session = { user: { id: userId } };
  const auth: RecoveryAuth = {
    setSession: async (input) => {
      calls.push({ method: "setSession", input });
      return { data: { session }, error: null };
    },
    verifyOtp: async (input) => {
      calls.push({ method: "verifyOtp", input });
      return { data: { session }, error: null };
    },
    exchangeCodeForSession: async (code, options) => {
      calls.push({ method: "exchange", input: { code, options } });
      return { data: { session, redirectType }, error: null };
    },
    getUser: async () => {
      calls.push({ method: "getUser" });
      return { data: { user: { id: userId } }, error: null };
    },
  };
  return { auth, calls };
}
test("reset emails target the stable live origin rather than removable preview deployments", () => {
  assert.equal(
    passwordResetUrl("https://old-deployment.vercel.app"),
    "https://countiva.vercel.app/reset-password",
  );
  assert.equal(
    passwordResetUrl("http://127.0.0.1:3000", undefined, false),
    "http://127.0.0.1:3000/reset-password",
  );
  assert.equal(
    passwordResetUrl(
      "https://preview.vercel.app",
      "https://countiva.vercel.app/",
    ),
    "https://countiva.vercel.app/reset-password",
  );
  for (const value of [
    "http://countiva.vercel.app",
    "javascript:alert(1)",
    "https://name:password@countiva.vercel.app",
  ])
    assert.throws(
      () => passwordResetUrl("https://countiva.vercel.app", value),
      /unavailable/,
    );
});
test("implicit recovery verifies the returned user and preserves recovery intent in legacy links", async () => {
  const url = new URL(
    "https://countiva.vercel.app/login#access_token=fake-access&refresh_token=fake-refresh&type=recovery",
  );
  assert.equal(isLegacyRecovery(url), true);
  const { auth, calls } = fakeAuth();
  assert.equal(
    await verifyRecovery(auth, parseRecoveryLink(url)),
    "reset-user",
  );
  assert.deepEqual(calls[0], {
    method: "setSession",
    input: { access_token: "fake-access", refresh_token: "fake-refresh" },
  });
  assert.equal(calls[1].method, "getUser");
  assert.equal(
    isLegacyRecovery(
      new URL(
        "https://countiva.vercel.app/login#type=signup&access_token=signup-token",
      ),
    ),
    false,
  );
});
test("hashed-token callbacks require recovery type and use the single-use verification endpoint", async () => {
  const { auth, calls } = fakeAuth();
  assert.equal(
    await verifyRecovery(
      auth,
      parseRecoveryLink(
        new URL(
          "https://countiva.vercel.app/reset-password?type=recovery&token_hash=fake-hash",
        ),
      ),
    ),
    "reset-user",
  );
  assert.deepEqual(calls[0], {
    method: "verifyOtp",
    input: { token_hash: "fake-hash", type: "recovery" },
  });
  assert.equal(
    parseRecoveryLink(
      new URL(
        "https://countiva.vercel.app/reset-password?type=email&token_hash=fake-hash",
      ),
    ).kind,
    "invalid",
  );
});
test("PKCE callbacks require verified recovery metadata and pass the correct flow slot", async () => {
  const { auth, calls } = fakeAuth();
  const link = parseRecoveryLink(
    new URL(
      "https://countiva.vercel.app/reset-password?code=fake-code&sb_flow_id=flow-one",
    ),
  );
  assert.equal(await verifyRecovery(auth, link), "reset-user");
  assert.deepEqual(calls[0], {
    method: "exchange",
    input: { code: "fake-code", options: { flowId: "flow-one" } },
  });
  await assert.rejects(
    verifyRecovery(fakeAuth("signup").auth, link),
    new RegExp(INVALID_RECOVERY),
  );
});
test("expired, malformed and mismatched reset sessions cannot open the update-password flow", async () => {
  const { auth } = fakeAuth();
  for (const url of [
    "https://countiva.vercel.app/reset-password#error=access_denied&error_description=expired",
    "https://countiva.vercel.app/reset-password#type=recovery&access_token=only-one-token",
    "https://countiva.vercel.app/reset-password#type=signup&access_token=x&refresh_token=y",
  ]) {
    await assert.rejects(
      verifyRecovery(auth, parseRecoveryLink(new URL(url))),
      new RegExp(INVALID_RECOVERY),
    );
  }
  const now = 1000000;
  await assert.rejects(
    verifyRecovery(auth, { kind: "empty" }, null, now),
    /invalid/,
  );
  await assert.rejects(
    verifyRecovery(
      auth,
      { kind: "empty" },
      { userId: "reset-user", expiresAt: now - 1 },
      now,
    ),
    /invalid/,
  );
  await assert.rejects(
    verifyRecovery(
      auth,
      { kind: "empty" },
      { userId: "another-user", expiresAt: now + 1000 },
      now,
    ),
    /invalid/,
  );
  assert.equal(
    await verifyRecovery(
      auth,
      { kind: "empty" },
      { userId: "reset-user", expiresAt: now + RECOVERY_WINDOW_MS },
      now,
    ),
    "reset-user",
  );
  const invalid = fakeAuth();
  invalid.auth.getUser = async () => ({
    data: { user: null },
    error: { message: "Session expired" },
  });
  await assert.rejects(
    verifyRecovery(invalid.auth, {
      kind: "implicit",
      accessToken: "x",
      refreshToken: "y",
    }),
    /invalid/,
  );
});
test("credential and reset failures have clear messages without identifying whether an email exists", () => {
  assert.equal(
    authErrorMessage({
      code: "invalid_credentials",
      message: "Invalid login credentials",
    }),
    "The email or password is incorrect. Check both and try again.",
  );
  assert.match(authErrorMessage({ code: "same_password" }), /different/);
  assert.match(
    authErrorMessage({ code: "over_email_send_rate_limit" }),
    /Wait/,
  );
});
