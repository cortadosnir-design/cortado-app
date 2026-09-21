// מזג אוויר. לעגלה פתוחה זה לא פיצ'ר — זה מה שקובע כמה אנשים יבואו.
// היומן כבר מתעד מזג אוויר בדיעבד; כאן מסתכלים קדימה, ומצליבים מול מה שהיה.
//
// Open-Meteo: בלי מפתח, בלי חשבון, עם CORS. קריאה אחת לשבוע, נשמרת לשלוש שעות.
import { S, ymd, addDays, on, emit, DAYS_SHORT } from "./core.js";
import { PLACE } from "./config.js";
import * as Season from "./season.js";

const CACHE_KEY = "cortado.weather.v1";
const CACHE_MS = 3 * 60 * 60 * 1000;

// קודי WMO. מקובצים לפי מה שמשנה לעגלה, לא לפי דיוק מטאורולוגי.
const CODES = [
  [[0], "בהיר", "☀️", "good"],
  [[1, 2], "מעונן חלקית", "🌤️", "good"],
  [[3], "מעונן", "☁️", "ok"],
  [[45, 48], "ערפל", "🌫️", "ok"],
  [[51, 53, 55, 56, 57], "טפטוף", "🌦️", "ok"],
  [[61, 63, 80, 81], "גשם", "🌧️", "bad"],
  [[65, 82], "גשם חזק", "🌧️", "bad"],
  [[66, 67], "גשם קפוא", "🌧️", "bad"],
  [[71, 73, 75, 77, 85, 86], "שלג", "❄️", "bad"],
  [[95, 96, 99], "סופת רעמים", "⛈️", "bad"],
];
function decode(code){
  for (const [list, label, icon, grade] of CODES) if (list.includes(code)) return { label, icon, grade };
  return { label: "לא ידוע", icon: "•", grade: "ok" };
}

// חום קיצוני משנה את התמונה גם ביום בהיר. שרב בעמק החולה מרוקן את העגלה.
function adjust(day){
  if (day.tmax >= 38) return { ...day, label: "שרב", icon: "🥵", grade: "bad" };
  if (day.tmax >= 34 && day.grade === "good") return { ...day, grade: "ok" };
  return day;
}

let cache = null;
let cacheAt = 0;               // העותק בזיכרון מזדקן בדיוק כמו זה שב-sessionStorage
let lastFail = 0;              // אין רשת? לא מנסים שוב בכל רינדור.
const RETRY_MS = 60 * 1000;

function readCache(){
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && Date.now() - o.at < CACHE_MS ? o.days : null;
  } catch { return null; }
}
function writeCache(days){
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), days })); } catch {}
}

/** התחזית לשבעה ימים, מהיום. מחזיר [] אם אין רשת — התחזית היא בונוס, לא תלות. */
export async function load(){
  /* בלי בדיקת הגיל כאן, העותק בזיכרון חי לנצח: האפליקציה מותקנת כ-PWA
     ונשארת פתוחה, וברביעי היא עדיין הציגה את התחזית של ראשון — כלומר
     ימים שכבר עברו, ו-prefillWeather מילא את היומן בתחזית מתה. */
  if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const cached = readCache();
  if (cached){ cache = cached; cacheAt = Date.now(); emit("weather", cache); return cache; }
  if (Date.now() - lastFail < RETRY_MS) return [];

  const p = new URLSearchParams({
    latitude: String(PLACE.lat), longitude: String(PLACE.lon),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
    timezone: "Asia/Jerusalem", forecast_days: "7",
  });
  try {
    const r = await fetch("https://api.open-meteo.com/v1/forecast?" + p);
    if (!r.ok){ lastFail = Date.now(); return []; }
    const d = (await r.json()).daily;
    if (!d || !Array.isArray(d.time)){ lastFail = Date.now(); return []; }
    cache = d.time.map((date, i) => adjust({
      date,
      ...decode(d.weather_code[i]),
      tmax: Math.round(d.temperature_2m_max[i]),
      tmin: Math.round(d.temperature_2m_min[i]),
      rain: d.precipitation_probability_max[i] ?? 0,
      wind: Math.round(d.wind_speed_10m_max[i] ?? 0),
    }));
    cacheAt = Date.now();
    writeCache(cache);
    emit("weather", cache);
    return cache;
  } catch { lastFail = Date.now(); return []; }
}

/** התחזית ליום מסוים (Date או YYYY-MM-DD), או null אם הוא מחוץ לטווח. */
export function on_(date){
  const key = typeof date === "string" ? date : ymd(date);
  return (cache || []).find(d => d.date === key) || null;
}
export { on_ as forDate };

/** התחזית לשבוע שמוצג כרגע, שבעה ימים מיום ראשון. */
export function forWeek(){
  return [0,1,2,3,4,5,6].map(i => on_(addDays(S.weekStart, i)));
}

/** משפט אחד על השבוע, או "" אם אין תחזית. למשל: "סופ״ש בהיר, 31°. שלישי גשום." */
export function weekLine(){
  const days = forWeek().filter(Boolean);
  if (!days.length) return "";
  const bad = days.filter(d => d.grade === "bad");
  const max = Math.max(...days.map(d => d.tmax));
  const head = bad.length
    ? `${bad.length === 1 ? "יום אחד" : bad.length + " ימים"} בעייתיים השבוע`
    : "שבוע נוח";
  return `${head} · עד ${max}°`;
}

/* ===== הצלבה מול היומן =====
   השאלה שמעניינת: כמה לקוחות יש בפועל בכל סוג יום. התשובה מגיעה מהיומן שלך,
   לא מהנחה. פחות משלושה ימים מאותו סוג — לא אומרים כלום. */
const LOG_TO_GRADE = { "נעים": "good", "שמש": "good", "חם": "ok", "שרב": "bad", "גשום": "bad", "גשם": "bad", "קר": "ok", "רוח": "ok", "חם מאוד": "bad" };
const MIN_SAMPLE = 3;

export function impact(){
  const buckets = { good: [], ok: [], bad: [] };
  for (const l of (S.logs || [])){
    const g = LOG_TO_GRADE[l.weather];
    if (g && typeof l.customers === "number") buckets[g].push(l.customers);
  }
  const avg = (a) => a.length ? Math.round(a.reduce((x,y) => x+y, 0) / a.length) : null;
  const good = buckets.good.length >= MIN_SAMPLE ? avg(buckets.good) : null;
  const bad  = buckets.bad.length  >= MIN_SAMPLE ? avg(buckets.bad)  : null;
  if (good == null || bad == null || !good) return null;
  return { good, bad, goodDays: buckets.good.length, badDays: buckets.bad.length,
           drop: Math.round((1 - bad / good) * 100) };
}

/** משפט על ההשפעה בפועל, מהנתונים שלך. "" אם עוד אין מספיק ימים ביומן. */
export function impactLine(){
  const i = impact();
  if (!i || i.drop <= 5) return "";
  return `ביומן שלך: בימים גשומים או שרב מכרת בממוצע ${i.bad} לעומת ${i.good} ביום נוח — ${i.drop}% פחות.`;
}

/** מה שנשלח ל-AI: התחזית לשבוע בשורה אחת לכל יום, בלי מספרים מיותרים. */
export function forAI(){
  return forWeek().map((d, i) => d && ({
    day: i, date: d.date, label: d.label, tmax: d.tmax, rain: d.rain, grade: d.grade,
  })).filter(Boolean);
}

/* ===== תצוגה =====
   שורה אחת מעל לוח המשמרות. שם זה משנה החלטה: כמה אנשים צריך ביום הזה. */
function render(){
  const box = document.getElementById("wx");
  if (!box) return;
  const days = forWeek();
  const season = Season.weekLine(S.weekStart);
  // חלון הביקוש חשוב בפני עצמו. אם אין רשת ואין תחזית — הוא עדיין מוצג.
  if (!days.some(Boolean) && !season){ box.hidden = true; return; }
  box.hidden = false;
  box.textContent = "";
  if (days.some(Boolean)) days.forEach((d, i) => {
    const cell = document.createElement("div");
    cell.className = "wxday" + (d ? " wx-" + d.grade : "");
    if (d){
      cell.title = `${d.label} · ${d.tmin}°–${d.tmax}°${d.rain >= 30 ? ` · ${d.rain}% גשם` : ""}${d.wind >= 30 ? ` · רוח ${d.wind} קמ"ש` : ""}`;
      cell.innerHTML = `<span class="wxd">${DAYS_SHORT[i]}</span><span class="wxi">${d.icon}</span><span class="wxt">${d.tmax}°</span>`;
    } else {
      cell.innerHTML = `<span class="wxd">${DAYS_SHORT[i]}</span><span class="wxi">·</span><span class="wxt">—</span>`;
    }
    box.append(cell);
  });
  // חלון ביקוש, אם יש. "חול המועד סוכות" משנה את השבוע יותר מכל תחזית.
  if (season){
    const s = document.createElement("p");
    s.className = "small wxnote wxseason";
    s.textContent = season;
    box.append(s);
  }
  const note = impactLine();
  if (note){
    const p = document.createElement("p");
    p.className = "small wxnote";
    p.textContent = note;
    box.append(p);
  }
}

export function init(){
  load().then(render);
  // load מחזיר את המטמון מיד כשהוא טרי, ומרענן לבד כשהוא התיישן —
  // ולכן אין צורך לשמור כאן על "כבר טענו".
  on("state", () => load().then(render));
  on("weather", render);
  on("weekchanged", render);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load().then(render); });
}
