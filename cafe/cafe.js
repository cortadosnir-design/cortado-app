// דף הנחיתה הציבורי: פרטים קטנים בדפדפן, ושעות הפתיחה מלוח המשמרות.
//
// עומד בפני עצמו בכוונה — בלי core.js ובלי ה-SDK של Firebase (300KB).
// המסמך public/hours פתוח לקריאה לכולם, ולכן GET אחד ל-REST של Firestore
// מספיק: ~1KB, בלי ספריות. אם הרשת נופלת, נשארת הטבלה שכתובה ב-HTML
// (שעות הפתיחה הקבועות), אז הדף לעולם לא ריק.
import { firebaseConfig } from "../config.js";

const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];

/* ===== פרטים קטנים ===== */
// קישור למידע משפטי (#privacy וכד') פותח את ה-<details> במקום לגלול לכותרת סגורה.
function openFromHash(){
  const id = location.hash.slice(1); if (!id) return;
  const el = document.getElementById(id);
  if (el && el.tagName === "DETAILS"){
    el.open = true;
    const s = el.querySelector("summary");
    setTimeout(() => { el.scrollIntoView(); if (s) s.focus({ preventScroll: true }); }, 0);
  }
}
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
  const el = document.getElementById(a.getAttribute("href").slice(1));
  if (el && el.tagName === "DETAILS") el.open = true;
});
window.addEventListener("hashchange", openFromHash); openFromHash();

const top = document.getElementById("top");
const onScroll = () => top.classList.toggle("scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

/* ===== שעות ===== */
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const fmt = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
// "09:00–12:00, 16:00–19:00" → [[540,720],[960,1140]]. מקבל גם " · " וגם מקף רגיל.
export function parseDay(line){
  return String(line || "").split(/[,·]/).map(x => x.trim()).filter(Boolean)
    .map(r => r.split(/[–-]/).map(x => x.trim()))
    .filter(p => p.length === 2 && p.every(x => /^\d{1,2}:\d{2}$/.test(x)))
    .map(([a, b]) => [toMin(a), toMin(b)]).filter(([a, b]) => b > a);
}

// מה שכתוב ב-HTML הוא ברירת המחדל; מה שמגיע מ-public/hours מחליף אותו.
const tbody = document.getElementById("hours");
let hours = [...tbody.querySelectorAll("tr")].map(tr => parseDay(tr.querySelector("td").textContent));

function renderTable(){
  tbody.replaceChildren();
  hours.forEach((ranges, i) => {
    const tr = document.createElement("tr"); tr.dataset.d = i;
    const th = document.createElement("th"); th.scope = "row"; th.textContent = DAYS[i];
    const td = document.createElement("td");
    if (ranges.length){ td.dir = "ltr"; td.textContent = ranges.map(([a, b]) => fmt(a) + "–" + fmt(b)).join(" · "); }
    else { td.className = "closed"; td.textContent = "סגור"; }
    tr.append(th, td); tbody.append(tr);
  });
}

// "פתוח עכשיו · עד 12:00" / "נפתח היום ב־16:00" / "נפתח מחר ב־09:00" — לפי שעון ישראל,
// גם למי שגולש מחו"ל.
function now(){
  try {
    const o = {};
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" })
      .formatToParts(new Date()).forEach(x => o[x.type] = x.value);
    return { d: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(o.weekday), m: (+o.hour) * 60 + (+o.minute), y: +o.year, mo: +o.month, day: +o.day };
  } catch { const n = new Date(); return { d: n.getDay(), m: n.getHours() * 60 + n.getMinutes(), y: n.getFullYear(), mo: n.getMonth() + 1, day: n.getDate() }; }
}
/* השעות לפי תאריך, לא רק לפי יום בשבוע. public/hours מחזיק את השבוע
   הנוכחי ואת הבא בשדה weeks (מפתח = יום ראשון של השבוע). בלי זה, שיגור
   של השבוע הבא ביום חמישי הציג ביום שישי את שעות השישי של השבוע הבא,
   וסגירה מוקדמת של היום לא הייתה משנה את "פתוח עכשיו". */
let byWeek = {};
const p2 = (n) => String(n).padStart(2, "0");
function weekKey(t, plus){
  const x = new Date(Date.UTC(t.y, t.mo - 1, t.day + plus));
  x.setUTCDate(x.getUTCDate() - x.getUTCDay());
  return `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}`;
}
const hoursOn = (t, plus) => {
  const w = byWeek[weekKey(t, plus)];
  return (w || hours)[(t.d + plus) % 7] || [];
};
function renderStatus(){
  const t = now();
  tbody.querySelectorAll("tr").forEach(tr => tr.classList.toggle("today", +tr.dataset.d === t.d));
  const el = document.getElementById("status"), label = el.querySelector("span");
  el.classList.remove("open");
  const todays = hoursOn(t, 0);
  const open = todays.find(([a, b]) => t.m >= a && t.m < b);
  if (open){ el.classList.add("open"); label.textContent = "פתוח עכשיו · עד " + fmt(open[1]); return; }
  const later = todays.find(([a]) => a > t.m);
  if (later){ label.textContent = "נפתח היום ב־" + fmt(later[0]); return; }
  for (let i = 1; i <= 7; i++){
    const h = hoursOn(t, i), d = (t.d + i) % 7;
    if (h.length){ label.textContent = "נפתח " + (i === 1 ? "מחר" : "ביום " + DAYS[d]) + " ב־" + fmt(h[0][0]); return; }
  }
  label.textContent = "שעות פתיחה";
}
renderStatus();

// public/hours: { days: [7 מחרוזות], range: "20.9 – 26.9", weeks: { "2026-09-20": [7 מחרוזות], … } }
const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/public/hours?key=${firebaseConfig.apiKey}`;
const strs = (arr) => Array.isArray(arr) && arr.length === 7 ? arr.map(v => parseDay(v.stringValue || "")) : null;
fetch(url).then(r => r.ok ? r.json() : null).then(d => {
  const fields = d && d.fields; if (!fields) return;
  const top = strs(fields.days && fields.days.arrayValue && fields.days.arrayValue.values);
  const wm = fields.weeks && fields.weeks.mapValue && fields.weeks.mapValue.fields;
  byWeek = {};
  for (const [k, v] of Object.entries(wm || {})){
    const w = strs(v.arrayValue && v.arrayValue.values);
    if (w) byWeek[k] = w;
  }
  // הטבלה: השבוע שבו אנחנו נמצאים, אם פורסם; אחרת מה שבשדה days.
  const key = weekKey(now(), 0);
  let range = fields.range && fields.range.stringValue;
  if (byWeek[key]){
    hours = byWeek[key];
    const [y, m, dd] = key.split("-").map(Number), a = new Date(Date.UTC(y, m - 1, dd)), b = new Date(Date.UTC(y, m - 1, dd + 6));
    range = `${a.getUTCDate()}.${a.getUTCMonth() + 1} – ${b.getUTCDate()}.${b.getUTCMonth() + 1}`;
  } else if (top) hours = top;
  else return;
  renderTable(); renderStatus();
  const note = document.getElementById("hours-note");
  if (range && note){
    const b = document.createElement("b"); b.textContent = "השעות לשבוע " + range + ". ";
    note.prepend(b);
  }
}).catch(() => {});
setInterval(renderStatus, 60000);
