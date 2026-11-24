import { createClient } from "@supabase/supabase-js";
import { siteOrigin } from "../site.ts";
const countivaOrigins = new Set([
  "https://countiva.shop",
  "https://www.countiva.shop",
]);
export async function authenticatedServer(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Account services are not configured.");
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token || token.length > 8192) throw new Error("Please sign in again.");
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.email_confirmed_at)
    throw new Error("Please sign in with a confirmed email address.");
  return { client, user: data.user };
}
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server services are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function applicationOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const browserOrigin = request.headers.get("origin");
  // Production aliases can retain an old APP_URL. Redirects originating on the
  // established public domains must stay on one of those exact domains.
  if (countivaOrigins.has(requestOrigin)) return requestOrigin;
  if (browserOrigin && countivaOrigins.has(browserOrigin)) return browserOrigin;
  return siteOrigin(
    requestOrigin,
    process.env.APP_URL,
    process.env.NODE_ENV === "production",
  );
}
export function verifyOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Non-browser callers still require the route's authenticated bearer token.
  if (!origin || countivaOrigins.has(origin)) return;
  const destination = new URL(request.url);
  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(destination.hostname);
  // Validate the browser against its actual API destination, not a redirect
  // setting. Never infer trusted destinations from forwarded headers or allow
  // wildcard Vercel domains. This also supports same-origin preview testing.
  if (
    origin === destination.origin &&
    (destination.protocol === "https:" ||
      (localDevelopment && destination.protocol === "http:"))
  )
    return;
  throw new Error("This request did not come from Countiva.");
}
