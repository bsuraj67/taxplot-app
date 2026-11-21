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
// Bump CACHE_VERSION on every release: old shell caches are deleted on activate.
const CACHE_VERSION = "v11"; // keep equal to V in index.html and ca.html (scripts are requested as ?v=<version>)
const SHELL_CACHE = `taxplot-shell-${CACHE_VERSION}`;
// Name duplicated in app.js's loadSharedReceiptIfAny() -- the two sides of
// the share hand-off agree on it, there's no API to look it up dynamically.
// Fixed (not tied to CACHE_VERSION) so bumping the shell version never breaks it.
const SHARE_CACHE = "taxplot-share-v1";
const SHARED_RECEIPT_KEY = "/shared-receipt";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  `./app.js?v=${CACHE_VERSION}`,
  "./ca.html",
  `./ca.js?v=${CACHE_VERSION}`,
  `./tax-engine.js?v=${CACHE_VERSION}`,
  `./style.css?v=${CACHE_VERSION}`,
  "./manifest.json",
  `./locales/i18n.js?v=${CACHE_VERSION}`,
  `./locales/en.json?v=${CACHE_VERSION}`,
  `./locales/glossary.en.json?v=${CACHE_VERSION}`,
  "./apple-touch-icon.png",
  `./vendor/jspdf.umd.min.js?v=${CACHE_VERSION}`,
  `./vendor/jspdf.plugin.autotable.min.js?v=${CACHE_VERSION}`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS.map((u) => new Request(u, { cache: "reload" }))))
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

  // Network-first: a new release is picked up on the first load; the cache is
  // only the offline fallback. cache:"no-cache" makes the browser revalidate
  // instead of reusing its HTTP cache (Pages serves max-age=600).
  event.respondWith(
    fetch(req, { cache: "no-cache" }).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((cached) => cached || (req.mode === "navigate" ? caches.match("./index.html") : undefined) || Response.error()))
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
