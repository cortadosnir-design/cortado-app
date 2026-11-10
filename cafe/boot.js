// הסקריפטים של הדף עולים רק אחרי הציור הראשון (שני פריימים), כדי שלא יתחרו בתמונה הראשית.
// כשהם רצו לפני הציור, ה-LCP בנייד נמדד 2.6 עד 4.3 שניות במקום 1.7 (PageSpeed, 10.11.2026).
requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
  const s = document.createElement("script");
  s.src = "sc/scrollcraft.js";
  s.onload = s.onerror = () => import("./cafe.js"); // cafe.js עובד גם בלי המנוע
  document.head.append(s);
})));
