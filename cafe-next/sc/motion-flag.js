// רץ ב-<head>, לפני הציור הראשון: מסמן שהכותרת של ההירו תיבנה ב-GSAP (cafe.js), כדי שלא תופיע ואז תיעלם.
// מי שביקש פחות תנועה מקבל את הדף בלי הסימון, כלומר את הכותרת מיד.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) document.documentElement.classList.add("gs-h1");
// תצוגה מקדימה בלבד: ?pal=stone / ?pal=milk מחליף את כיוון הצבע (pine הוא ברירת המחדל). לא עובר לדף האמיתי.
const pal = new URLSearchParams(location.search).get("pal");
if (/^(pine|stone|milk)$/.test(pal || "")) document.documentElement.dataset.pal = pal;
