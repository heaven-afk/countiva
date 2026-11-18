import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
test("service worker opens trusted report links and refuses external notification destinations", async () => {
  const listeners = {},
    shown = [],
    opened = [];
  const self = {
    location: { origin: "https://www.countiva.shop" },
    addEventListener: (event, fn) => (listeners[event] = fn),
    registration: {
      showNotification: async (title, options) =>
        shown.push({ title, ...options }),
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
  };
  vm.runInNewContext(
    await readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    { self, URL, console },
  );
  for (const url of [
    "/workspace?view=Business%20insights&business=one&report=two",
    "https://attacker.test/workspace",
  ]) {
    let work;
    listeners.push({
      data: {
        json: () => ({
          title: "Report ready",
          body: "Review your numbers",
          url,
        }),
      },
      waitUntil: (promise) => (work = promise),
    });
    await work;
    const notification = shown.at(-1);
    listeners.notificationclick({
      notification: { data: notification.data, close() {} },
      waitUntil: (promise) => (work = promise),
    });
    await work;
  }
  assert.equal(
    opened[0],
    "https://www.countiva.shop/workspace?view=Business%20insights&business=one&report=two",
  );
  assert.equal(
    opened[1],
    "https://www.countiva.shop/workspace?view=Notifications",
  );
});
