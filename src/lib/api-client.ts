import { getSupabase } from "./supabase";
export async function authenticatedFetch(path: string, body: unknown) {
  const client = getSupabase();
  if (!client) throw new Error("Please refresh Countiva and sign in again.");
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error("Please sign in again.");
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(70000),
    });
  } catch (error) {
    throw new Error(
      error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError")
        ? "This request took too long. Please try again shortly."
        : "Couldn’t connect to Countiva. Check your connection and try again.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!result)
    throw new Error(
      response.status === 504
        ? "The server timed out while preparing your request. Please try again shortly."
        : "Countiva returned an unexpected response. Refresh and try again.",
    );
  if (!response.ok)
    throw new Error(result.error || "This request could not be completed.");
  return result;
}
