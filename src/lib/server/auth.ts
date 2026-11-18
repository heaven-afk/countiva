import { createClient } from "@supabase/supabase-js";
import { siteOrigin } from "../site.ts";
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
  return siteOrigin(
    new URL(request.url).origin,
    process.env.APP_URL,
    process.env.NODE_ENV === "production",
  );
}
export function verifyOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const canonical = applicationOrigin(request);
  const countivaOrigins = [
    "https://countiva.shop",
    "https://www.countiva.shop",
  ];
  if (
    origin &&
    origin !== canonical &&
    !(countivaOrigins.includes(canonical) && countivaOrigins.includes(origin))
  )
    throw new Error("This request did not come from Countiva.");
}
