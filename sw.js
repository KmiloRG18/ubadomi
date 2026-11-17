// Service worker de UbaDomi: permite instalar la página como app.
// Estrategia "primero la red": siempre muestra lo más reciente y usa la
// copia guardada solo si no hay conexión. La API nunca se guarda.
const CACHE = "ubadomi-v1";
const BASE = ["/", "/index.html", "/styles.css", "/app.js", "/config.js", "/restaurantes.js",
  "/restaurantes-osm.json", "/icono.svg", "/manifest.webmanifest", "/privacidad.html", "/terminos.html", "/404.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/operador")) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/index.html")))
  );
});
