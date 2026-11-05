const SHELL = "fotos-shell-v4";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/style.css", "/app.js", "/layout.js", "/thumbhash.js", "/icon.svg", "/icon-180.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// Nur die App-Hülle cachen (Netz zuerst); API und Bilder gehen immer ans Netz.
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
