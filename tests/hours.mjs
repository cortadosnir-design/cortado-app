/* דף השעות הציבורי: מה שנכתב, ומה שהדף קורא.

   הבדיקה הזו נולדה מבאג אמיתי שהמשתמש ראה במסך: "דף הנחיתה — העדכון
   נכשל. נסה שוב." בכל שיגור, מאז שהדף נולד. הסיבה לא הייתה הרשאות ולא
   רשת: המסמך הכיל `days` כמערך של מערכים, ו-Firestore דוחה מערך בתוך
   מערך עוד לפני שהבקשה יוצאת ("Nested arrays are not supported").
   ה-Firestore המזויף של הבדיקות לא אוכף את זה, ולכן הבדיקה כאן אוכפת
   בעצמה — על המסמך שהקוד האמיתי מייצר.

   בנוסף, הכותב והקורא היו בשני פורמטים שונים: דף השעות הישן חיפש מפה
   בשם `hours` שאיש לא כתב, ולכן גם שיגור שהיה מצליח היה מצייר "סגור"
   בכל יום. היום הקורא הוא דף הנחיתה, cafe/cafe.js. */
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

  /* דף הנחיתה (cafe/) — הדף שגוגל מאנדקסת. השעות בו מגיעות מאותו מסמך,
     דרך REST של Firestore בלי SDK; כאן הבקשה נתפסת ומקבלת את המסמך שנכתב. */
  const cafe = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const cafeErrors = [];
  cafe.on("pageerror", e => cafeErrors.push(e.message));
  cafe.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) cafeErrors.push(m.text()); });
  let restHit = "";
  await cafe.route(/firestore\.googleapis\.com/, (route) => {
    restHit = route.request().url();
    const fields = { days: { arrayValue: { values: res.doc.days.map(s => ({ stringValue: s })) } }, range: { stringValue: res.doc.range } };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fields }) });
  });
  await cafe.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await cafe.goto(`http://127.0.0.1:${PORT}/cafe/`, { waitUntil: "domcontentloaded" });
  await cafe.waitForTimeout(900);
  const cf = await cafe.evaluate(() => ({
    rows: [...document.querySelectorAll("#hours tr")].map(tr => tr.children[0].textContent + ": " + tr.children[1].textContent),
    today: document.querySelectorAll("#hours tr.today").length,
    status: document.querySelector("#status span").textContent,
    note: document.getElementById("hours-note").textContent,
    inline: [...document.querySelectorAll("script")].filter(s => !s.src && s.type !== "application/ld+json").length,
    ld: (() => { try { return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent); } catch { return null; } })(),
    imgs: [...document.images].map(i => i.getAttribute("src")),
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  ok("דף הנחיתה מושך את השעות מ-public/hours דרך REST", restHit.includes("/documents/public/hours"), restHit);
  ok("הטבלה בדף הנחיתה היא מה ש\"שגר\" כתב", cf.rows[2] === "שלישי: 09:00–12:00 · 16:00–19:00" && cf.rows[0] === "ראשון: סגור", cf.rows.join(" · "));
  ok("היום מסומן בטבלה", cf.today === 1);
  ok("תווית המצב מחושבת", /פתוח עכשיו|נפתח/.test(cf.status), cf.status);
  ok("השבוע שהשעות שייכות לו כתוב ליד הטבלה", cf.note.startsWith("השעות לשבוע"), cf.note.slice(0, 40));
  ok("בלי סקריפט inline (CSP, CLAUDE.md §5)", cf.inline === 0, String(cf.inline));
  ok("JSON-LD של בית קפה עם שעות ומיקום", !!cf.ld && cf.ld["@type"] === "CafeOrCoffeeShop" && cf.ld.openingHoursSpecification.length >= 7 && !!cf.ld.geo);
  ok("התמונות הן קבצים, לא data:", cf.imgs.length >= 10 && cf.imgs.every(x => x.startsWith("img/")), cf.imgs.join(","));
  ok("בלי גלילה אופקית", cf.over <= 0, cf.over + "px");
  ok("בלי שגיאות בקונסולה בדף הנחיתה", cafeErrors.length === 0, cafeErrors.slice(0, 2).join(" | "));
  if (process.env.CAFE_SHOT) await cafe.screenshot({ path: process.env.CAFE_SHOT, fullPage: true });
  await cafe.setViewportSize({ width: 390, height: 844 });
  await cafe.waitForTimeout(200);
  ok("בלי גלילה אופקית בטלפון", await cafe.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0);
  if (process.env.CAFE_SHOT) await cafe.screenshot({ path: process.env.CAFE_SHOT.replace(".png", "-mobile.png"), fullPage: true });
  await cafe.close();
  const sitemap = readFileSync(ROOT + "sitemap.xml", "utf8");
  ok("דף הנחיתה ב-sitemap", sitemap.includes("/cortado-app/cafe/"));
  ok("robots.txt מצביע על ה-sitemap", /Sitemap:/.test(readFileSync(ROOT + "robots.txt", "utf8")));

  /* הכותב והקורא לא יכולים להיפרד שוב: זו בדיקה סטטית על הקוד עצמו. */
  const reader = readFileSync(ROOT + "cafe/cafe.js", "utf8");
  ok("דף הנחיתה קורא את השדה days", /fields\.days\b/.test(reader));
  ok("דף הנחיתה קורא את הטווח לכותרת", /fields\.range\b/.test(reader));
  ok("hours.html מפנה לדף הנחיתה", /http-equiv="refresh"[^>]*cafe\//.test(readFileSync(ROOT + "hours.html", "utf8")));
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
