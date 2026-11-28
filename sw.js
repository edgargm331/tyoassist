// sw.js — Service Worker Offline-First para TyO Assist (v56)
// Candado LFPDPPP: solo cachea archivos estáticos del mismo origen; CERO caché de API o POST.
// build.py inserta la versión desde config.js: al subir de versión, el caché se renueva solo.

const CACHE_NAME = "tyo-assist-v56";
const CORE_ASSETS = ["./", "./manifest.json", "./icon.svg"];
const OPTIONAL_ASSETS = ["./index.html", "./icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-192.png", "./icon-maskable-512.png", "./jspdf.umd.min.js", "./receta-escudo.jpg", "./receta-marca.jpg", "./receta-esquina.jpg"];

function shouldCacheRequest(request) {
  if (!request || request.method !== "GET") return false;
  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return true;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS);
      await Promise.allSettled(
        OPTIONAL_ASSETS.map(async (asset) => {
          const resp = await fetch(asset, { cache: "no-cache" });
          if (resp && resp.ok && resp.type === "basic") {
            await cache.put(asset, resp);
          }
        })
      );
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("tyo-assist-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!shouldCacheRequest(req)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });

      const networkPromise = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === "basic") {
            cache.put(req, resp.clone());
          }
          return resp;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(networkPromise);
        return cached;
      }

      const netResp = await networkPromise;
      if (netResp) return netResp;

      if (req.mode === "navigate") {
        return (
          (await cache.match("./")) ||
          (await cache.match("./index.html")) ||
          new Response("TyO Assist sin conexión. Abre la app una vez con internet para completar el caché.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          })
        );
      }

      return new Response("", { status: 504 });
    })
  );
});
