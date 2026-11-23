export function adminFailure(error: unknown): {
  status: number;
  code: string;
  error: string;
} {
  const message = error instanceof Error ? error.message : "";
  const dbCode =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (message === "Account services are not configured.")
    return {
      status: 503,
      code: "ACCOUNT_CONFIGURATION",
      error:
        "Account services are not configured on this deployment. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel Production, then redeploy.",
    };
  if (message.startsWith("Please sign in"))
    return {
      status: 401,
      code: "SESSION_REQUIRED",
      error:
        "Your session could not be verified by the server. Sign out and sign in again. If this continues, check that Vercel and this account use the same Supabase project.",
    };
  if (message === "This request did not come from Countiva.")
    return {
      status: 403,
      code: "ORIGIN_MISMATCH",
      error:
        "This request came from a different website. Open https://www.countiva.shop/admin and sign in there, then retry the operation.",
    };
  if (
    message === "Invalid URL" ||
    message === "The Countiva address is unavailable. Please try again later."
  )
    return {
      status: 503,
      code: "SITE_CONFIGURATION",
      error:
        "The configured website address is invalid. Set APP_URL to https://www.countiva.shop in Vercel Production, then redeploy.",
    };
  if (["PGRST202", "42883", "42P01"].includes(dbCode))
    return {
      status: 503,
      code: "DATABASE_UPDATE",
      error:
        "An admin database function is missing. Run the read-only migration checker in the same Supabase project used by Vercel and apply only the missing migrations in order.",
    };
  if (dbCode === "42501")
    return {
      status: 403,
      code: "DATABASE_PERMISSION",
      error:
        "The database denied this admin operation. Check your platform access and the installed admin migrations.",
    };
  if (error instanceof SyntaxError)
    return {
      status: 400,
      code: "INVALID_REQUEST",
      error:
        "The request could not be read. Refresh Countiva Admin and try again.",
    };
  return {
    status: 503,
    code: "ADMIN_CONNECTION",
    error:
      "Countiva could not reach the account or database service. Retry shortly. If it persists, check Vercel’s /api/admin/operations logs for the error code and verify the Supabase project configuration.",
  };
}
