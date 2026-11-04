const CACHE = "shopilot-shell-v10-countiva-v2";
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
  const assets = new Set();
  for (const path of ["/", "/workspace", "/login", "/signup"]) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Shell fetch failed");
    const html = await response.clone().text();
    await cache.put(path, response);
    for (const asset of html.match(/\/_next\/static\/[^"\s<>]+\.(?:js|css)/g) ||
      [])
      assets.add(asset);
  }
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

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data.json();
      } catch {
        return;
      }
      await self.registration.showNotification(
        String(data.title || "Countiva").slice(0, 100),
        {
          body: String(
            data.body || "Open your workspace for today’s business updates.",
          ).slice(0, 500),
          icon: "/brand/countiva-192.png?v=4",
          tag: String(data.tag || "countiva-reminder").slice(0, 100),
          data: { url: "/workspace?view=Notifications" },
        },
      );
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const url = new URL("/workspace?view=Notifications", self.location.origin)
        .href;
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const active = windows.find(
        (client) => new URL(client.url).pathname === "/workspace",
      );
      if (active) {
        await active.navigate(url);
        return active.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
