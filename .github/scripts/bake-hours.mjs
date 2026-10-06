#!/usr/bin/env node
/* אופה את שעות השבוע הנוכחי מתוך public/hours אל cafe/index.html.

   הדפדפן ממלא את טבלת השעות ב-JavaScript (cafe/cafe.js), אבל מנועי חיפוש
   ועוזרי AI קוראים את ה-HTML בלי להריץ אותו, ומצאו טבלה ריקה. הם לקחו את
   השעות מאתרי אינדקס, וכל אחד מהם מפרסם לוח אחר.

   שעות קבועות ב-HTML כבר היו כאן פעם, והתיישנו. לכן מה שנאפה מתוארך:
     · data-week על ה-<tbody> — יום ראשון של השבוע שהשעות שייכות לו.
     · "השעות לשבוע 4.10 – 10.10." ליד הטבלה.
     · validFrom / validThrough על כל שורה ב-JSON-LD.
   שבוע שלא פורסם נאפה כטבלה ריקה, ו-cafe.js מוחק בדפדפן שעות של שבוע שעבר.

   מריץ: .github/workflows/hours.yml, פעם בשעה.   ידנית: node .github/scripts/bake-hours.mjs */
import { readFileSync, writeFileSync } from "fs";
import { pathToFileURL } from "url";

const ROOT = new URL("../..", import.meta.url).pathname;
const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// אותו פענוח ואותו פורמט כמו ב-cafe/cafe.js, שלא נטען ב-Node כי הוא נוגע ב-document.
// tests/hours.mjs משווה את הטבלה האפויה לטבלה שהדף מצייר מאותו מסמך.
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const fmt = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const parseDay = (line) => String(line || "").split(/[,·]/).map(x => x.trim()).filter(Boolean)
  .map(r => r.split(/[–-]/).map(x => x.trim()))
  .filter(p => p.length === 2 && p.every(x => /^\d{1,2}:\d{2}$/.test(x)))
  .map(([a, b]) => [toMin(a), toMin(b)]).filter(([a, b]) => b > a);

/** התאריך בישראל, YYYY-MM-DD. ה-runner של GitHub רץ ב-UTC. */
export const ilToday = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
export const plusDays = (ymd, n) => { const x = new Date(ymd + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const sundayOf = (ymd) => plusDays(ymd, -new Date(ymd + "T12:00:00Z").getUTCDay());
const dm = (ymd) => `${+ymd.slice(8)}.${+ymd.slice(5, 7)}`;

function swap(html, re, to){
  if (!re.test(html)) throw new Error("לא נמצא ב-cafe/index.html: " + re);
  return html.replace(re, to);
}

/** html של דף הנחיתה + מסמך public/hours (כפי ש-REST של Firestore מחזיר) + התאריך בישראל
    ← אותו html עם שעות השבוע, או בלי שעות בכלל אם השבוע לא פורסם. */
export function bake(html, doc, today){
  const week = sundayOf(today), through = plusDays(week, 6);
  const vals = doc?.fields?.weeks?.mapValue?.fields?.[week]?.arrayValue?.values;
  const days = Array.isArray(vals) && vals.length === 7 ? vals.map(v => parseDay(v.stringValue)) : null;

  const rows = DAYS.map((name, i) => {
    const td = !days ? '<td dir="ltr"></td>'
      : days[i].length ? `<td dir="ltr">${days[i].map(([a, b]) => fmt(a) + "–" + fmt(b)).join(" · ")}</td>`
      : '<td class="closed">סגור</td>';
    return `          <tr data-d="${i}"><th scope="row">${name}</th>${td}</tr>`;
  }).join("\n");
  html = swap(html, /<tbody id="hours"[^>]*>[\s\S]*?<\/tbody>/,
    `<tbody id="hours"${days ? ` data-week="${week}"` : ""}>\n${rows}\n        </tbody>`);

  html = swap(html, /(<p class="hours-note" id="hours-note">)(?:<b>[^<]*<\/b>)?/,
    `$1${days ? `<b>השעות לשבוע ${dm(week)} – ${dm(through)}. </b>` : ""}`);

  const LD = /(<script type="application\/ld\+json">\n)([\s\S]*?)(\n<\/script>)/;
  const ld = JSON.parse(LD.exec(html)?.[2] ?? "null");
  if (!ld || ld["@type"] !== "CafeOrCoffeeShop") throw new Error("ה-JSON-LD של העגלה לא נמצא");
  delete ld.openingHoursSpecification;
  if (days) ld.openingHoursSpecification = days.flatMap((ranges, i) => ranges.map(([a, b]) => ({
    "@type": "OpeningHoursSpecification", dayOfWeek: EN_DAYS[i], opens: fmt(a), closes: fmt(b), validFrom: week, validThrough: through })));
  return html.replace(LD, (_, open, __, close) => open + JSON.stringify(ld, null, 1) + close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  const cfg = readFileSync(ROOT + "config.js", "utf8");
  const pick = (k) => new RegExp(k + ':\\s*"([^"]+)"').exec(cfg)[1];
  const url = `https://firestore.googleapis.com/v1/projects/${pick("projectId")}/databases/(default)/documents/public/hours?key=${pick("apiKey")}`;
  const r = await fetch(url);
  // רשת שנפלה: לא נוגעים בקובץ. מה שכבר נאפה מתוארך, והריצה הבאה תנסה שוב.
  if (!r.ok){ console.error("public/hours לא נקרא: HTTP " + r.status); process.exit(1); }
  const today = ilToday(), path = ROOT + "cafe/index.html";
  const before = readFileSync(path, "utf8"), after = bake(before, await r.json(), today);
  if (after === before){ console.log("אין שינוי בשעות."); process.exit(0); }
  writeFileSync(path, after);
  const sm = ROOT + "sitemap.xml";
  writeFileSync(sm, readFileSync(sm, "utf8").replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${today}</lastmod>`));
  console.log("השעות נאפו לשבוע " + sundayOf(today) + (after.includes("data-week=") ? "." : ": השבוע לא פורסם, הטבלה ריקה."));
}
