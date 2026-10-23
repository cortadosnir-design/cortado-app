// מה שהיה מותקן מהכתובת הזו הוסר ב-23.10.2026. דפדפן שעוד מחזיק את הגרסה הישנה
// מוריד את הקובץ הזה פעם אחת: הוא מוחק את המטמון, מסיר את עצמו ומרענן את הדף,
// שמפנה לדף העגלה. הקובץ נשאר כאן כדי שגם מכשיר שלא נפתח חודשים יתנקה.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
})()));
