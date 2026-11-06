export const COUNTIVA_ORIGIN = "https://countiva.vercel.app";
export const RECOVERY_MARKER = "countiva-password-recovery-v1";
export const RECOVERY_WINDOW_MS = 10 * 60 * 1000;
export const INVALID_RECOVERY =
  "This reset link has expired or is invalid. Request a new link below.";
type Failure = { message?: string; code?: string } | null;
type Session = { user: { id: string } };
type Result = {
  data: { session: Session | null; redirectType?: string | null };
  error: Failure;
};
export type RecoveryAuth = {
  setSession: (tokens: {
    access_token: string;
    refresh_token: string;
  }) => Promise<Result>;
  exchangeCodeForSession: (
    code: string,
    options?: { flowId?: string },
  ) => Promise<Result>;
  verifyOtp: (input: {
    token_hash: string;
    type: "recovery";
  }) => Promise<Result>;
  getUser: () => Promise<{
    data: { user: { id: string } | null };
    error: Failure;
  }>;
};
export type RecoveryLink =
  | { kind: "implicit"; accessToken: string; refreshToken: string }
  | { kind: "pkce"; code: string; flowId?: string }
  | { kind: "token"; tokenHash: string }
  | { kind: "empty" }
  | { kind: "invalid" };
export function parseRecoveryLink(url: URL): RecoveryLink {
  const hash = new URLSearchParams(url.hash.slice(1)),
    query = url.searchParams;
  if (
    hash.has("error") ||
    hash.has("error_description") ||
    query.has("error") ||
    query.has("error_description")
  )
    return { kind: "invalid" };
  const type = hash.get("type") || query.get("type");
  if (query.has("token_hash"))
    return type === "recovery" &&
      !!query.get("token_hash") &&
      query.get("token_hash")!.length <= 4096
      ? { kind: "token", tokenHash: query.get("token_hash")! }
      : { kind: "invalid" };
  if (hash.has("access_token") || hash.has("refresh_token"))
    return type === "recovery" &&
      !!hash.get("access_token") &&
      !!hash.get("refresh_token") &&
      hash.get("access_token")!.length <= 16384 &&
      hash.get("refresh_token")!.length <= 16384
      ? {
          kind: "implicit",
          accessToken: hash.get("access_token")!,
          refreshToken: hash.get("refresh_token")!,
        }
      : { kind: "invalid" };
  if (query.has("code"))
    return query.get("code") && query.get("code")!.length <= 4096
      ? {
          kind: "pkce",
          code: query.get("code")!,
          flowId: query.get("sb_flow_id") || undefined,
        }
      : { kind: "invalid" };
  return type === "recovery" ? { kind: "invalid" } : { kind: "empty" };
}
export function passwordResetUrl(
  currentOrigin: string,
  configuredOrigin?: string,
  production = true,
): string {
  const current = new URL(currentOrigin);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(current.hostname);
  const target = new URL(
    !production && local ? current.origin : configuredOrigin || COUNTIVA_ORIGIN,
  );
  if (
    target.username ||
    target.password ||
    (target.protocol !== "https:" &&
      !(
        local &&
        !production &&
        target.origin === current.origin &&
        target.protocol === "http:"
      ))
  )
    throw new Error(
      "Password reset is temporarily unavailable. Please contact support.",
    );
  return new URL("/reset-password", target.origin).href;
}
export function isLegacyRecovery(url: URL): boolean {
  const hash = new URLSearchParams(url.hash.slice(1));
  return (
    url.searchParams.get("type") === "recovery" ||
    hash.get("type") === "recovery" ||
    url.searchParams.has("token_hash") ||
    hash.has("error_description") ||
    hash.has("error")
  );
}
export function recoveryRedirect(url: URL): string {
  return "/reset-password" + url.search + url.hash;
}
export async function verifyRecovery(
  auth: RecoveryAuth,
  link: RecoveryLink,
  marker: { userId: string; expiresAt: number } | null = null,
  now = Date.now(),
): Promise<string> {
  if (link.kind === "invalid") throw new Error(INVALID_RECOVERY);
  let expectedUser: string | undefined;
  if (link.kind === "empty") {
    if (
      !marker ||
      !marker.userId ||
      marker.expiresAt <= now ||
      marker.expiresAt > now + RECOVERY_WINDOW_MS
    )
      throw new Error(INVALID_RECOVERY);
    expectedUser = marker.userId;
  } else {
    const result =
      link.kind === "implicit"
        ? await auth.setSession({
            access_token: link.accessToken,
            refresh_token: link.refreshToken,
          })
        : link.kind === "token"
          ? await auth.verifyOtp({
              token_hash: link.tokenHash,
              type: "recovery",
            })
          : await auth.exchangeCodeForSession(
              link.code,
              link.flowId ? { flowId: link.flowId } : undefined,
            );
    if (
      result.error ||
      !result.data.session ||
      (link.kind === "pkce" && result.data.redirectType !== "recovery")
    )
      throw new Error(INVALID_RECOVERY);
    expectedUser = result.data.session.user.id;
  }
  const verified = await auth.getUser();
  if (
    verified.error ||
    !verified.data.user ||
    verified.data.user.id !== expectedUser
  )
    throw new Error(INVALID_RECOVERY);
  return verified.data.user.id;
}
export function authErrorMessage(error: unknown): string {
  const failure = error as { code?: string; message?: string };
  if (
    failure?.code === "invalid_credentials" ||
    /invalid login credentials/i.test(failure?.message || "")
  )
    return "The email or password is incorrect. Check both and try again.";
  if (failure?.code === "email_not_confirmed")
    return "Confirm your email address before signing in.";
  if (failure?.code === "same_password")
    return "Choose a password different from your current password.";
  if (
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      failure?.code || "",
    )
  )
    return "Too many requests. Wait a few minutes before trying again.";
  return (
    failure?.message || "We couldn’t complete that request. Please try again."
  );
}
