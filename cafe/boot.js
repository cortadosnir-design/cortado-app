// site.js: מסילת הוויטרינה. cafe.js: שעות מלוח המשמרות, "פתוח עכשיו", מוזיקה, אנליטיקס והסכמה.
// התנועה (GSAP) והכוס בתלת־ממד נטענות אחרי הציור הראשון, כדי שלא יתחרו בתמונה הראשית. בלעדיהן הדף שלם.
import("./site.js");
import("./cafe.js").catch(() => {});
const load = (src) => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
requestAnimationFrame(() => requestAnimationFrame(() => {
  load("vendor/gsap.min.js").then(() => load("vendor/ScrollTrigger.min.js")).then(() => import("./motion.js")).catch(() => {});
  import("./glass3d.js").catch(() => {});
}));
