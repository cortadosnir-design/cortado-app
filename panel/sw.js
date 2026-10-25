// מרכז השליטה כאפליקציה מותקנת. רשת קודם, תמיד: מה שמוצג הוא הגרסה האחרונה שנפרסה.
// המטמון רק מחזיק את המעטפת, כדי שהאפליקציה תיפתח גם בלי קליטה. בקשות לבוט ול-Firebase לא נוגעים בהן.
const CACHE = "panel-shell-2026-10-25";
const SHELL = ["./", "img/icon-192.png"]; // the rest is cached as it is fetched, with its version in the URL

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const keep = res.clone(); caches.open(CACHE).then((c) => c.put(req, keep)).catch(() => {}); }
      return res;
    } catch {
      return (await caches.match(req)) || (req.mode === "navigate" && (await caches.match("./"))) || Response.error();
    }
  })());
});
