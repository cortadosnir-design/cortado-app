// מפענח סידור שהודבק כטקסט, בלי AI: שורה לכל משמרת, כמו שהבעלים כותב בוואטסאפ.
//   "שני 17:00–19:00 נוגה" · "שלישי 9-13, 17-19 אלה, ליה" · "ראשון ורביעי סגור" · "נגה סטנד ביי"
// מחזיר משמרות (day 0–6, start, end, people, open), ימים סגורים ושורות שלא הובנו. הטבלה בדף היא מה שקובע.
// הכלל: הימים נקראים רק לפני השעה הראשונה, והשמות רק אחריה ("שני" אחרי השעות הוא שם, לא יום).
export const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const STANDBY = /סטנד[\s-]?ביי|סטנדביי|כוננות|כונן|לא שעת פתיחה/;
const RANGE_SRC = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?`;
const RANGE = new RegExp(RANGE_SRC);
const DAY_WORD = String.raw`ו?(?:יום\s+)?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|[אבגדהוש]['׳])`;

// העגלה לא פותחת לפני 07:00, אז "5-7" הוא 17:00–19:00
export const hm = (h, m) => { const n = +h >= 1 && +h <= 6 ? +h + 12 : +h; return `${String(n).padStart(2, "0")}:${m || "00"}`; };
const ok = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

function daysIn(text) {
  const found = [];
  const re = /(?:^|[\s,·(])ו?(?:יום\s+)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|[אבגדהוש]['׳])(?=$|[\s,·:.)\d-])/g;
  for (const m of text.matchAll(re)) {
    const w = m[1], i = DAYS.indexOf(w) >= 0 ? DAYS.indexOf(w) : LETTERS.indexOf(w[0]);
    if (i >= 0 && !found.includes(i)) found.push(i);
  }
  return found;
}

function cleanName(s) {
  return s
    .replace(/\([^)]*\)/g, " ")
    .replace(new RegExp(RANGE_SRC, "g"), " ")
    .replace(/מ[־-]?\s*\d{1,2}[:.]\d{2}/g, " ")
    .replace(/\d{1,2}[:.]\d{2}/g, " ")
    .replace(/\d{1,2}\.\d{1,2}(\.\d{2,4})?/g, " ")
    .replace(STANDBY, " ")
    .replace(/(?:^|\s)ב(?=\s|$)/g, " ")
    .replace(/[^֐-׿a-zA-Z'׳"\s-]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^ו(?=[֐-׿]{2})/, "").trim();
}
// "נוגה, אלה סטנד ביי" → פתוח: נוגה · סטנד ביי: אלה
function peopleIn(text) {
  const open = [], standby = [];
  for (const part of text.split(/[,·/]|\s+ו(?=[֐-׿]{2})/)) {
    const name = cleanName(part);
    if (name && name.length <= 30 && !/^(סגור|משמרת|סידור|לשבוע|הבא|השבוע|ו)$/.test(name)) (STANDBY.test(part) ? standby : open).push(name);
  }
  return { open, standby };
}

// "שני סגור, שלישי 17-19": פסיק שאחריו יום עם שעה או "סגור" פותח קטע חדש. "אלה, שני" נשאר שם.
function segments(line) {
  const parts = line.split(new RegExp(`[,;]\\s*(?=${DAY_WORD}(?:\\s|$))`));
  const out = [];
  for (const p of parts) {
    if (out.length && !RANGE.test(p) && !/סגור/.test(p)) out[out.length - 1] += `, ${p}`;
    else out.push(p);
  }
  return out;
}

export function parseWeek(text) {
  const shifts = [], closed = new Set(), skipped = [];
  let lastDay = null;
  // "אלה, ליה. נגה סטנד ביי": משפט שני באותה שורה הוא שורת המשך של אותו יום
  const lines = String(text || "").split(/\r?\n/).flatMap((l) => l.split(/\.\s+(?=[֐-׿])/)).flatMap(segments);
  for (const raw of lines) {
    const line = raw.replace(/\*/g, "").trim();
    if (!line) continue;
    const r = RANGE.exec(line);
    const head = r ? line.slice(0, r.index) : line;
    const days = daysIn(head);

    if (!r && /סגור/.test(line) && !/לא\s+סגור/.test(line)) {
      if (days.length) { days.forEach((d) => closed.add(d)); lastDay = days[0]; continue; }
    }
    const targets = days.length ? days : lastDay !== null ? [lastDay] : [];
    if (r && targets.length) {
      // טווחים צמודים: "9-13, 17-19" (או "ו", "+") הם שתי משמרות. שעה אחרי שם שייכת לאדם
      const ranges = [[r[1], r[2], r[3], r[4]]];
      let tail = line.slice(r.index + r[0].length);
      for (let m; (m = new RegExp(`^\\s*(?:,|ו|\\+|&)\\s*${RANGE_SRC}`).exec(tail)); tail = tail.slice(m[0].length)) ranges.push([m[1], m[2], m[3], m[4]]);
      const { open, standby } = peopleIn(tail);
      const wholeStandby = STANDBY.test(head) || (!open.length && !standby.length && STANDBY.test(tail));
      let bad = false;
      for (const [h1, m1, h2, m2] of ranges) {
        const start = hm(h1, m1);
        let end = hm(h2, m2);
        if (end <= start && +h2 < 12) end = hm(+h2 + 12, m2); // "5-7" ו-"10-2": הסוף אחרי הצהריים
        if (!ok(start) || !ok(end) || end <= start) { bad = true; continue; }
        for (const day of targets) {
          if (wholeStandby) shifts.push({ day, start, end, people: [...open, ...standby], open: false });
          else {
            if (open.length || !standby.length) shifts.push({ day, start, end, people: [...open], open: true });
            if (standby.length) shifts.push({ day, start, end, people: [...standby], open: false });
          }
          closed.delete(day);
        }
      }
      if (bad) skipped.push(raw);
      lastDay = targets[0];
      continue;
    }
    if (!r && STANDBY.test(line) && targets.length) {
      // "נגה בסטנד ביי" בשורה משלה: אותן שעות כמו המשמרת האחרונה של היום, לא שעת פתיחה
      const prev = [...shifts].reverse().find((s) => s.day === targets[0]);
      const { open, standby } = peopleIn(line);
      if (prev) { shifts.push({ day: prev.day, start: prev.start, end: prev.end, people: [...open, ...standby], open: false }); continue; }
    }
    if (days.length && !r) { lastDay = days[0]; if (!/^(יום\s+)?\S+\s*[:·]?\s*$/.test(line)) skipped.push(raw); continue; }
    if (!/^(סידור|לו"ז|השעות|☕)/.test(line)) skipped.push(raw);
  }
  return { shifts, closed: [...closed], skipped };
}
