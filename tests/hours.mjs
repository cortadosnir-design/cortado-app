/* דף השעות הציבורי: מה שנכתב, ומה שהדף קורא.

   הבדיקה הזו נולדה מבאג אמיתי שהמשתמש ראה במסך: "דף הנחיתה — העדכון
   נכשל. נסה שוב." בכל שיגור, מאז שהדף נולד. הסיבה לא הייתה הרשאות ולא
   רשת: המסמך הכיל `days` כמערך של מערכים, ו-Firestore דוחה מערך בתוך
   מערך עוד לפני שהבקשה יוצאת ("Nested arrays are not supported").
   ה-Firestore המזויף של הבדיקות לא אוכף את זה, ולכן הבדיקה כאן אוכפת
   בעצמה — על המסמך שהקוד האמיתי מייצר.

   בנוסף, הכותב והקורא היו בשני פורמטים שונים: hours.js חיפש מפה בשם
   `hours` שאיש לא כתב, ולכן גם שיגור שהיה מצליח היה מצייר "סגור" בכל יום. */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { spawn } from "child_process";
import { buildFullCore } from "./fullcore.mjs";
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = process.env.HOURS_PORT || 8904;

buildFullCore();
writeFileSync(ROOT + "hourstest.html", readFileSync(ROOT + "index.html", "utf8")
  .replace("</head>", `<script type="importmap">{"imports":{"/core.js":"/tests/stubs/core-full.js"}}</script></head>`));
const server = spawn("npx", ["--yes", "http-server", ROOT, "-p", String(PORT), "-s"], { cwd: ROOT, stdio: "ignore" });
const cleanup = () => { try { server.kill(); } catch {} try { unlinkSync(ROOT + "hourstest.html"); } catch {} };
await new Promise(r => setTimeout(r, 2500));

const pad = (n) => String(n).padStart(2, "0");
const t = new Date(), ws = new Date(t.getFullYear(), t.getMonth(), t.getDate());
ws.setDate(ws.getDate() - ws.getDay());
if (t.getDay() >= 5) ws.setDate(ws.getDate() + 7);
const WID = `w${ws.getFullYear()}-${pad(ws.getMonth()+1)}-${pad(ws.getDate())}`;

let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n + (x ? "  " + x : "")))
                               : (fail++, console.log("  ✗ " + n + "  " + x));

console.log("\n28. דף השעות הציבורי");
const b = await chromium.launch();
try {
  const page = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", async d => await d.accept());
  await page.goto(`http://127.0.0.1:${PORT}/hourstest.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#tabs:not([hidden])", { timeout: 10000 });
  await page.waitForTimeout(400);

  // שבוע נעול: שלישי בוקר וערב, שישי בוקר. שאר הימים סגורים.
  await page.evaluate((WID) => {
    window.__api["/hours/facebook"] = { ok: true };
    window.__api["/hours/google"] = { fail: "not_configured גוגל עוד לא מחוברת" };
    window.__seed("weeks", WID, { phase: "locked", shifts: [
      { id: "s1", day: 2, start: "09:00", end: "12:00", need: 1 },
      { id: "s2", day: 2, start: "16:00", end: "19:00", need: 1 },
      { id: "s3", day: 5, start: "09:00", end: "12:00", need: 1 },
    ] });
    window.__fire();
  }, WID);
  await page.waitForTimeout(400);

  await page.click("#launchBtn");
  await page.waitForTimeout(800);

  const res = await page.evaluate(() => {
    const d = (window.__store.public || {}).hours;
    // Firestore דוחה מערך בתוך מערך. כאן בודקים בדיוק את זה, כי החנות
    // המזויפת מקבלת הכול — ובלי הבדיקה הבאג חוזר בשקט.
    const nested = (v, path = "") => {
      if (Array.isArray(v)){
        for (let i = 0; i < v.length; i++){
          if (Array.isArray(v[i])) return `${path}[${i}]`;
          const r = nested(v[i], `${path}[${i}]`); if (r) return r;
        }
        return "";
      }
      if (v && typeof v === "object" && !v.toDate){
        for (const k of Object.keys(v)){ const r = nested(v[k], path ? `${path}.${k}` : k); if (r) return r; }
      }
      return "";
    };
    return { doc: d, nested: d ? nested(d) : "אין מסמך",
      rows: [...document.querySelectorAll(".launchrow")].map(r => r.className.replace("launchrow ", "") + ":" + r.querySelector("b").textContent) };
  });

  ok("שיגור כותב את מסמך השעות", !!res.doc, JSON.stringify(res.rows));
  ok("אין מערך בתוך מערך — Firestore היה דוחה", res.nested === "", "שדה: " + res.nested);
  ok("דף הנחיתה מסומן כהצליח", res.rows.some(r => r.startsWith("ok:דף הנחיתה")), res.rows.join(" · "));
  ok("שורה אחת לכל שבעת הימים", Array.isArray(res.doc.days) && res.doc.days.length === 7, JSON.stringify(res.doc && res.doc.days));
  ok("כל יום הוא מחרוזת", (res.doc.days || []).every(x => typeof x === "string"), JSON.stringify(res.doc.days));
  ok("יום עם שתי משמרות מאוחד לשורה אחת", res.doc.days[2] === "09:00–12:00, 16:00–19:00", res.doc.days[2]);
  ok("יום סגור הוא מחרוזת ריקה", res.doc.days[0] === "" && res.doc.days[6] === "", JSON.stringify(res.doc.days));
  ok("טווח התאריכים נשמר לכותרת הדף", typeof res.doc.range === "string" && res.doc.range.includes("–"), res.doc.range);
  ok("גם הטקסט להדבקה נשמר", typeof res.doc.text === "string" && res.doc.text.includes("שעות העגלה"), (res.doc.text || "").slice(0, 30));
  ok("בלי שגיאות בקונסולה", errors.length === 0, errors.slice(0,2).join(" | "));
  ok("גם רשימת השעות באפליקציה נעולה לכיוון",
     await page.evaluate(() => getComputedStyle(document.querySelector("#hours dd")).direction) === "ltr");
  await page.close();

  /* והדף עצמו — זה שהלקוח מהרחוב פותח — מצייר את מה שנכתב.
     hours.js מייבא את Firebase ישירות מ-gstatic, ולכן ה-importmap כאן
     מכוון את שתי הכתובות לדמה מקומית. שאר הדף הוא המקור. */
  writeFileSync(ROOT + "hourspage.html", readFileSync(ROOT + "hours.html", "utf8")
    .replace("</head>", `<script type="importmap">{"imports":{
      "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js":"/tests/stubs/fb-hours.js",
      "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js":"/tests/stubs/fb-hours.js"}}</script></head>`));
  const pub = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pub.addInitScript((d) => { window.__hoursDoc = d; }, res.doc);
  await pub.goto(`http://127.0.0.1:${PORT}/hourspage.html`, { waitUntil: "domcontentloaded" });
  await pub.waitForTimeout(600);
  const shown = await pub.evaluate(() => ({
    sub: document.getElementById("sub").textContent,
    rows: [...document.querySelectorAll("#hours dt")].map((dt, i) =>
      dt.textContent + ": " + document.querySelectorAll("#hours dd")[i].textContent),
  }));
  ok("הדף הציבורי מצייר שבעה ימים", shown.rows.length === 7, shown.rows.join(" · "));
  ok("היום הפתוח מוצג עם השעות", shown.rows[2] === "שלישי: 09:00–12:00, 16:00–19:00", shown.rows[2]);
  ok('יום סגור מוצג כ"סגור"', shown.rows[0] === "ראשון: סגור", shown.rows[0]);
  ok("טווח התאריכים בכותרת", shown.sub.includes("20.9") || /\d+\.\d+/.test(shown.sub), shown.sub);
  // הטקסט הלוגי תקין תמיד; מה שמתהפך הוא הציור. הכיוון הנעול הוא מה שנבדק.
  ok("טווחי השעות נעולים לכיוון שמאל-לימין",
     await pub.evaluate(() => getComputedStyle(document.querySelector("#hours dd")).direction) === "ltr");
  await pub.screenshot({ path: process.env.HOURS_SHOT || "/tmp/claude-0/hours-page.png" });
  await pub.close();
  try { unlinkSync(ROOT + "hourspage.html"); } catch {}

  /* הכותב והקורא לא יכולים להיפרד שוב: זו בדיקה סטטית על הקוד עצמו. */
  const reader = readFileSync(ROOT + "hours.js", "utf8");
  ok("דף הנחיתה קורא את השדה days", /\bd\.days\b/.test(reader));
  ok("דף הנחיתה קורא את הטווח לכותרת", /\bd\.range\b/.test(reader));
  ok("דף הנחיתה כבר לא מחפש מפה בשם hours", !/d\.hours\b/.test(reader));
  const writers = ["shifts.js", "launch.js"].map(f => readFileSync(ROOT + f, "utf8"));
  ok("שני הכפתורים כותבים דרך hoursDoc אחד", writers.every(src => !/"public", "hours"\), \{\s*\n/.test(src)),
     "אין כתיבה ישירה עם גוף מסמך משלה");
} catch (e){
  fail++; console.log("  ✗ הבדיקה נפלה  " + e.message);
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
await b.close();
cleanup();
process.exit(fail ? 1 : 0);
