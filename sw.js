// מטמון בסיסי כדי שהאפליקציה תיפתח מהר, וגם כשאין רשת.
// חייב להיות זהה ל-APP_VERSION ב-config.js. tests/version.mjs נופל אם לא.
const VERSION = "2026-09-21.13";
const CACHE = "cortado-shell-" + VERSION;
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./core.js", "./playbook.js",
  "./shifts.js", "./creative.js", "./reach.js", "./ops.js", "./launch.js", "./now.js", "./analyze.js", "./table.js", "./xlsx.js", "./sales.js", "./sales-stats.js", "./z.html", "./z.js", "./config.js", "./manifest.webmanifest", "./hours.html"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // נתונים תמיד מהרשת
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
