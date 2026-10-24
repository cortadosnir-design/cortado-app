// מפענח סידור שהודבק כטקסט, בלי AI: שורה לכל משמרת, כמו שהבעלים כותב בוואטסאפ.
//   "שני 17:00–19:00 נוגה" · "שלישי 9-13 אלה, ליה" · "ראשון ורביעי סגור" · "נגה סטנד ביי"
// מחזיר משמרות (day 0–6, start, end, people, open), ימים סגורים ושורות שלא הובנו. הטבלה בדף היא מה שקובע.
export const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const STANDBY = /סטנד[\s-]?ביי|סטנדביי|כוננות|כונן|לא שעת פתיחה/;
const RANGE = /(\d{1,2})(?:[:.](\d{2}))?\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?/;

const hm = (h, m) => `${String(+h).padStart(2, "0")}:${m || "00"}`;
const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

function daysIn(line) {
  const found = [];
  const re = /(?:^|[\s,·(])ו?(?:יום\s+)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|[אבגדהוש]['׳])(?=$|[\s,·:.)\d-])/g;
  for (const m of line.matchAll(re)) {
    const w = m[1], i = DAYS.indexOf(w) >= 0 ? DAYS.indexOf(w) : LETTERS.indexOf(w[0]);
    if (i >= 0 && !found.includes(i)) found.push(i);
  }
  return found;
}

function namesIn(text) {
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(RANGE, " ")
    .replace(/מ[־-]?\s*\d{1,2}[:.]\d{2}/g, " ")
    .replace(/\d{1,2}[:.]\d{2}/g, " ")
    .replace(/\d{1,2}\.\d{1,2}(\.\d{2,4})?/g, " ")
    .replace(STANDBY, " ")
    .replace(/(?:^|\s)(?:יום\s+)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?=\s|$)/g, " ")
    .replace(/(?:^|\s)ב(?=\s|$)/g, " ")
    .split(/[,·/]|\s+ו(?=[֐-׿])/)
    .map((s) => s.replace(/[^֐-׿a-zA-Z'׳"\s-]/g, " ").replace(/\s+/g, " ").trim())
    .map((s) => s.replace(/^ו(?=[֐-׿]{2})/, "").trim())
    .filter((s) => s && s.length <= 30 && !/^(סגור|משמרת|סידור|לשבוע|הבא|השבוע|ו)$/.test(s));
}

export function parseWeek(text) {
  const shifts = [], closed = new Set(), skipped = [];
  let lastDay = null;
  // "אלה, ליה. נגה סטנד ביי": משפט שני באותה שורה הוא שורת המשך של אותו יום
  const lines = String(text || "").split(/\r?\n/).flatMap((l) => l.split(/\.\s+(?=[\u0590-\u05FF])/));
  for (const raw of lines) {
    const line = raw.replace(/\*/g, "").trim();
    if (!line) continue;
    const days = daysIn(line);
    if (/סגור/.test(line) && !RANGE.test(line)) {
      if (days.length) { days.forEach((d) => closed.add(d)); lastDay = days[0]; continue; }
    }
    const r = RANGE.exec(line);
    const day = days.length ? days[0] : lastDay;
    if (r && day !== null) {
      const start = hm(r[1], r[2]), end = hm(r[3], r[4]);
      if (!ok(start) || !ok(end) || end <= start) { skipped.push(raw); continue; }
      // השם והשעות האישיות אחרי הטווח הראשון שייכים לאנשים, לא למשמרת
      const rest = line.slice(r.index + r[0].length);
      shifts.push({ day, start, end, people: namesIn(rest), open: !STANDBY.test(line) });
      closed.delete(day);
      lastDay = day;
      continue;
    }
    if (!r && STANDBY.test(line) && day !== null) {
      // "נגה בסטנד ביי" בשורה משלה: אותן שעות כמו המשמרת האחרונה של היום, לא שעת פתיחה
      const prev = [...shifts].reverse().find((s) => s.day === day);
      if (prev) { shifts.push({ day, start: prev.start, end: prev.end, people: namesIn(line), open: false }); continue; }
    }
    if (days.length && !r) { lastDay = days[0]; if (!/^(יום\s+)?\S+\s*[:·]?\s*$/.test(line)) skipped.push(raw); continue; }
    if (!/^(סידור|לו"ז|השעות|☕)/.test(line)) skipped.push(raw);
  }
  return { shifts, closed: [...closed], skipped };
}
