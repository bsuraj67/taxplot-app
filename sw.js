/**
 * TaxPlot — service worker (task 6, docs/NEXT_STEPS_2026-10.md)
 *
 * Two jobs:
 * 1. Cache the consumer-app shell so it opens and keeps working with no
 *    connection. There is still no backend (see app.js's top comment — STATE
 *    is in-memory only and resets on reload, same offline or online), so
 *    this is specifically about the app shell loading, not about syncing
 *    receipt data anywhere.
 * 2. Catch the POST navigation that manifest.json's share_target sends when
 *    someone uses "Share to TaxPlot" from WhatsApp/gallery/email (Android
 *    Chrome, installed PWA only — see manifest.json). A static site has no
 *    server to receive that POST, so the service worker intercepts it
 *    directly, stashes the shared file in Cache Storage, and redirects back
 *    into the app, which picks it up in app.js's loadSharedReceiptIfAny().
 */
const CACHE_VERSION = "v1";
const SHELL_CACHE = `taxplot-shell-${CACHE_VERSION}`;
// Name duplicated in app.js's loadSharedReceiptIfAny() -- the two sides of
// the share hand-off agree on it, there's no API to look it up dynamically.
const SHARE_CACHE = `taxplot-share-${CACHE_VERSION}`;
const SHARED_RECEIPT_KEY = "/shared-receipt";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./tax-engine.js",
  "./style.css",
  "./manifest.json",
  "./locales/i18n.js",
  "./locales/en.json",
  "./locales/glossary.en.json",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fonts etc. -- let the browser handle those natively

  if (req.method === "POST" && url.pathname.endsWith("/share-target")) {
    event.respondWith(handleShareTarget(event));
    return;
  }
  if (req.method !== "GET") return;

  // Cache-first for the app shell, falling back to network and topping up
  // the cache; falls back to whatever's cached (even if stale) if offline.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) caches.open(SHELL_CACHE).then((cache) => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    const file = formData.get("photos") || formData.get("file");
    if (file && typeof file === "object" && "type" in file) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(SHARED_RECEIPT_KEY, new Response(file, { headers: { "Content-Type": file.type || "application/octet-stream" } }));
    }
  } catch (e) {
    // No usable file in the share -- fall through and just open the app.
  }
  return Response.redirect("./index.html?shared=1", 303);
}
