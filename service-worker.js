const CACHE_NAME = "idle-rpg-pwa-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./service-worker.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./data/weapons.json",
  "./data/armors.json",
  "./data/rings.json",
  "./data/pets.json",
  "./data/pet_skills.json",
  "./src/app.js",
  "./src/ui.js",
  "./src/state.js",
  "./src/utils.js",
  "./src/balance.js",
  "./src/items.js",
  "./src/pets.js",
  "./src/skills.js",
  "./src/combat.js",
  "./src/sw-register.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k === CACHE_NAME ? Promise.resolve() : caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith((async () => {
    // Network-first for navigation
    if (req.mode === "navigate") {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
        return res;
      } catch {
        return (await caches.match("./index.html")) || Response.error();
      }
    }

    // Cache-first for others
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, res.clone());
      return res;
    } catch {
      return cached || Response.error();
    }
  })());
});
