// מטמון בסיסי כדי שהאפליקציה תיפתח מהר, וגם כשאין רשת.
// חייב להיות זהה ל-APP_VERSION ב-config.js. tests/version.mjs נופל אם לא.
const VERSION = "2026-09-21.18";
const CACHE = "cortado-shell-" + VERSION;
// כל מודול ש-app.js מייבא חייב להיות כאן. weather/season/people נשכחו,
// ולכן פתיחה קרה בלי רשת שברה את גרף המודולים — בדיוק המקרה שבשבילו
// ה-Service Worker קיים. tests/version.mjs מוודא שהרשימה מלאה.
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./core.js", "./playbook.js", "./card.js",
  "./shifts.js", "./creative.js", "./reach.js", "./ops.js", "./launch.js", "./now.js", "./analyze.js",
  "./table.js", "./xlsx.js", "./sales.js", "./sales-stats.js", "./weather.js", "./season.js", "./people.js",
  "./z.html", "./z.js", "./config.js", "./manifest.webmanifest", "./hours.html", "./hours.js",
  "./icon-192.png", "./icon-512.png"];
// בכוונה בלי skipWaiting אוטומטי: החלפה באמצע חיים מגישה קבצים חדשים
// ללשונית שכבר מריצה JS ישן — וזה בדיוק "HTML חדש עם JS ישן" שמתוקן
// ידנית ב-app.js. הגרסה החדשה ממתינה, המשתמש רואה "יש גרסה חדשה",
// ורק הלחיצה על "רענן" מעבירה אותה (דרך הודעת skip למטה).
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // נתונים תמיד מהרשת
  e.respondWith(
    fetch(e.request).then(res => {
      // רק תשובה תקינה נכנסת למטמון. בלי הבדיקה הזו 404 או 500 חד-פעמי
      // בזמן פריסה נצרב ומוגש כ"גרסה האחרונה" עד שמעלים את APP_VERSION.
      if (res.ok && res.status === 200 && res.type === "basic"){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request).then(r =>
      // נפילה לדף שממנו באו, לא תמיד לאפליקציה: מי שפתח את דף העובד
      // צריך לקבל אותו בחזרה, לא את מסך המנהל.
      r || caches.match(url.pathname.includes("z.html") ? "./z.html" : "./index.html")))
  );
});

// "רענן" ב-app.js שולח את ההודעה הזו. בלי המאזין היא נפלה לרצפה.
self.addEventListener("message", (e) => { if (e.data && e.data.type === "skip") self.skipWaiting(); });
