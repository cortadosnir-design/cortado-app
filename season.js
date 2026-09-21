// חלונות ביקוש. עגלה ליד הבניאס חיה ממטיילים, והמטיילים מגיעים בחלונות —
// לא בימים בודדים. חול המועד הוא שבוע, חופש גדול הוא חודשיים, וסופ״ש ארוך
// הוא שלושה ימים. יום בודד ביומן לא מספר את זה.
//
// העוגנים הם HOLIDAYS ב-playbook.js. כאן רק גוזרים מהם חלונות, כדי שלא
// תיווצר רשימה שנייה שתסטה מהראשונה. מעדכנים שנה חדשה במקום אחד.
import { ymd, addDays, fromYmd } from "./core.js";
import { HOLIDAYS } from "./playbook.js";

/* הרשימה מחזיקה כמה שנים, ולכן "סוכות" מופיע יותר מפעם אחת. find פשוט
   היה מחזיר תמיד את המופע הראשון — כלומר את זה שכבר עבר, וחלון הביקוש
   היה נתקע בעבר. נבחר המופע הקרוב שעוד לא הסתיים, ואם כולם עברו — האחרון. */
function find(name){
  const all = HOLIDAYS.filter(h => h[1].startsWith(name));
  if (!all.length) return null;
  const today = ymd(new Date());
  return all.find(h => h[0] >= today) || all[all.length - 1];
}
const dateOf = (name) => { const h = find(name); return h ? h[0] : null; };
const shift = (iso, n) => iso ? ymd(addDays(fromYmd(iso), n)) : null;

/** חלון ביקוש: from ו-to כוללים, label לתצוגה, weight ככמה זה משנה לעגלה. */
function win(from, to, label, weight, note){
  return from && to ? { from, to, label, weight, note: note || "" } : null;
}

// חול המועד נגזר מהעוגנים: הימים שבין היום הראשון ליום האחרון של החג.
// זה שבוע שלם של טיולים בצפון, והפוסט שמביא אנשים בפועל הוא "מתי ואיפה".
function windows(){
  const sukkot = dateOf("סוכות"), simchat = dateOf("שמחת תורה");
  const pesach = dateOf("פסח"), hanukkah = dateOf("חנוכה");

  return [
    win(shift(sukkot, 1), shift(simchat, -1), "חול המועד סוכות", 3,
        "שבוע השיא של הצפון. מטיילים לאורך כל היום, לא רק בבוקר."),
    win(pesach && shift(pesach, 1), pesach && shift(pesach, 5), "חול המועד פסח", 3,
        "שיא שני. משפחות עם ילדים, שעות מוקדמות יותר."),
    win(hanukkah, shift(hanukkah, 7), "חנוכה", 2,
        "חופשת בית ספר. קר בבוקר, ביקוש לשתייה חמה."),
    // חופש גדול קבוע בלוח הישראלי ולא תלוי בלוח העברי.
    ...summers(),
  ].filter(Boolean);
}

function summers(){
  const y = new Date().getFullYear();
  return [y, y + 1].map(yy => win(`${yy}-07-01`, `${yy}-08-31`, "חופש גדול", 2,
    "חודשיים של תנועה. חם מאוד בצהריים — הבוקר הוא הזמן."));
}

let cached = null;
const all = () => (cached || (cached = windows()));

/** החלון שפעיל בתאריך נתון, או null. */
export function active(date){
  const key = typeof date === "string" ? date : ymd(date);
  return all().find(w => key >= w.from && key <= w.to) || null;
}

// רק חגים שבהם באמת לא עובדים יוצרים סופ״ש ארוך. "יום הקפה הבינלאומי"
// ו"ולנטיין" הם ווי תוכן — נחמד לכתוב עליהם, אבל אף אחד לא לוקח יום חופש.
const DAY_OFF = ["ראש השנה", "יום כיפור", "סוכות", "שמחת תורה", "פסח", "יום העצמאות", "שבועות"];
const isDayOff = (name) => DAY_OFF.some(h => name.startsWith(h));

/** סופ״ש ארוך: חג שנופל בראשון או בחמישי מדביק אליו את הסופ״ש. */
export function longWeekend(date){
  const key = typeof date === "string" ? date : ymd(date);
  for (const [iso, name] of HOLIDAYS){
    if (!isDayOff(name)) continue;
    const d = fromYmd(iso).getDay();
    if (d !== 0 && d !== 4) continue;                 // ראשון או חמישי בלבד
    const from = d === 0 ? shift(iso, -2) : iso;      // ראשון → מתחיל בשישי
    const to   = d === 0 ? iso : shift(iso, 2);       // חמישי → נגרר לשבת
    if (key >= from && key <= to) return { from, to, label: `סופ״ש ארוך · ${name}` };
  }
  return null;
}

/** החלון הקרוב שעוד לא התחיל, בתוך כמה ימים שנקבעו. */
export function upcoming(withinDays = 21){
  const today = ymd(new Date());
  const limit = ymd(addDays(new Date(), withinDays));
  return all().filter(w => w.from > today && w.from <= limit)
    .sort((a, b) => a.from.localeCompare(b.from))[0] || null;
}

/** מה שנשלח ל-AI: החלון הפעיל, הקרוב, וסופ״ש ארוך אם יש. */
export function forAI(weekStart){
  const out = [];
  for (let i = 0; i < 7; i++){
    const iso = ymd(addDays(weekStart, i));
    const w = active(iso), lw = longWeekend(iso);
    if (w && !out.some(x => x.label === w.label))
      out.push({ label: w.label, from: w.from, to: w.to, note: w.note, weight: w.weight });
    if (lw && !out.some(x => x.label === lw.label))
      out.push({ label: lw.label, from: lw.from, to: lw.to, note: "", weight: 2 });
  }
  const next = upcoming(21);
  if (next && !out.some(x => x.label === next.label))
    out.push({ label: next.label, from: next.from, to: next.to, note: next.note, weight: next.weight, soon: true });
  return out;
}

/** שורה אחת לתצוגה, או "" אם אין שום דבר מיוחד השבוע. */
export function weekLine(weekStart){
  const now = active(ymd(weekStart)) || active(ymd(addDays(weekStart, 3)));
  if (now) return `${now.label} · ${now.note}`;
  const next = upcoming(14);
  if (!next) return "";
  // חצות מול חצות. השוואה מול new Date() נתנה "בעוד 2 ימים" בחמישי בערב
  // לחג שמתחיל בראשון — כי 2 ימים ו-4 שעות מתעגלים למטה. כל אחר הצהריים
  // הפסיד יום שלם, וכל מה שקרוב מ-12 שעות הפך ל"בעוד 0 ימים".
  const days = Math.round((fromYmd(next.from) - fromYmd(ymd(new Date()))) / 86400000);
  return days <= 0 ? next.label : days === 1 ? `מחר: ${next.label}` : `בעוד ${days} ימים: ${next.label}`;
}
