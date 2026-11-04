import { getSupabase } from "./supabase";
export async function authenticatedFetch(path: string, body: unknown) {
  const { data } = await getSupabase()!.auth.getSession();
  if (!data.session) throw new Error("Please sign in again.");
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "This request could not be completed.");
  return result;
}
