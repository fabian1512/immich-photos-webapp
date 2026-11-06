const SHELL = "fotos-shell-v23";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/style.css", "/app.js", "/logger.js", "/layout.js", "/thumbhash.js", "/i18n.js", "/icon.svg", "/icon-180.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// Cache only the app shell (network first); the API and images always go to the network.
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
