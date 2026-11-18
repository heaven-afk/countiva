export const COUNTIVA_ORIGIN = "https://countiva.shop";
export function siteOrigin(
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
      "The Countiva address is unavailable. Please try again later.",
    );
  // Deployments may retain the previous environment value during the domain move.
  if (target.origin === "https://countiva.vercel.app") return COUNTIVA_ORIGIN;
  return target.origin;
}
export function signInUrl(
  currentOrigin: string,
  configuredOrigin?: string,
  production = true,
) {
  return new URL(
    "/login",
    siteOrigin(currentOrigin, configuredOrigin, production),
  ).href;
}
