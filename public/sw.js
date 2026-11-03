const CACHE = "shopilot-shell-v9-countiva-monochrome";
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
async function prepareShell() {
  const cache = await caches.open(CACHE);
  const response = await fetch("/");
  if (!response.ok) throw new Error("Shell fetch failed");
  const html = await response.clone().text();
  await cache.put("/", response);
  const assets = [
    ...new Set(html.match(/\/_next\/static\/[^"\s<>]+\.(?:js|css)/g) || []),
  ];
  await cache.addAll([
    ...assets,
    "/icon.svg",
    "/favicon.ico",
    "/countiva-mark.svg",
    "/manifest.webmanifest",
    "/favicon.svg?v=4",
    "/favicon-light.svg?v=4",
    "/favicon-dark.svg?v=4",
    "/brand/apple-touch-icon.png?v=4",
    "/brand/countiva-192.png?v=4",
    "/brand/countiva-512.png?v=4",
  ]);
}
self.addEventListener("message", (event) => {
  if (event.data === "CACHE_SHELL")
    event.waitUntil(
      prepareShell()
        .then(() => event.source?.postMessage({ type: "OFFLINE_READY" }))
        .catch(() => event.source?.postMessage({ type: "OFFLINE_FAILED" })),
    );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.searchParams.has("_rsc")
  )
    return;
  if (event.request.mode === "navigate")
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(url.pathname)
            .then(
              (response) =>
                response ||
                new Response(
                  "Open Countiva online once before using it offline.",
                  { status: 503 },
                ),
            ),
        ),
    );
  else if (
    url.pathname.startsWith("/_next/static/") ||
    [
      "/icon.svg",
      "/favicon.ico",
      "/favicon.svg",
      "/favicon-light.svg",
      "/favicon-dark.svg",
      "/countiva-mark.svg",
      "/manifest.webmanifest",
    ].includes(url.pathname) ||
    url.pathname.startsWith("/brand/")
  )
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(CACHE)
                .then((cache) => cache.put(event.request, copy));
            }
            return response;
          }),
      ),
    );
});
