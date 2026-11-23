export function analyticsFailure(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (code === "PGRST202" || code === "42883")
    return "The report service needs a database update. Ask the Countiva administrator to check the latest migrations.";
  if (code === "42501")
    return "The report service could not save its results. Ask the Countiva administrator to check Service health and database access.";
  if (
    error instanceof Error &&
    error.message === "Server services are not configured."
  )
    return "Countiva’s report service is not configured. Ask the platform administrator to check Service health.";
  if (error instanceof Error && error.message.startsWith("Please sign in"))
    return error.message;
  return "The report could not be prepared. Your saved records are unchanged. Please try again shortly.";
}
