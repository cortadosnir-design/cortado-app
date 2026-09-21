/* שיבוץ ידני של המנהל, על הקוד האמיתי.

   הבדיקה הזו נולדה מבאג אמיתי שנתפס בכתיבה: רשימת העובדים מגיעה
   ממאזין של ops, ולעיתים קרובות *אחרי* שהלוח כבר צויר — כך שכל
   "מקום פנוי" נשאר טקסט מת, בלי שום דרך לשבץ, עד שמשהו אחר גרם
   לציור מחדש. אף בדיקה קיימת לא נגעה בזה: ה-harness של ui.mjs מחליף
   את shifts.js בדמה.

   כאן רץ index.html האמיתי עם כל המודולים, ורק Firebase מזויף —
   אותה שיטה כמו sim.mjs. */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { spawn } from "child_process";
import { buildFullCore } from "./fullcore.mjs";
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = process.env.ASSIGN_PORT || 8903;
const PAGE = `http://127.0.0.1:${PORT}/assign.html`;

buildFullCore();
writeFileSync(ROOT + "assign.html", readFileSync(ROOT + "index.html", "utf8")
  .replace("</head>", `<script type="importmap">{"imports":{"/core.js":"/tests/stubs/core-full.js"}}</script></head>`));
const server = spawn("npx", ["--yes", "http-server", ROOT, "-p", String(PORT), "-s"], { cwd: ROOT, stdio: "ignore" });
const cleanup = () => { try { server.kill(); } catch {} try { unlinkSync(ROOT + "assign.html"); } catch {} };
await new Promise(r => setTimeout(r, 2500));

// אותו חישוב כמו defaultWeekStart: יום ראשון של השבוע, ומיום שישי הבא.
const pad = (n) => String(n).padStart(2, "0");
const t = new Date(), ws = new Date(t.getFullYear(), t.getMonth(), t.getDate());
ws.setDate(ws.getDate() - ws.getDay());
if (t.getDay() >= 5) ws.setDate(ws.getDate() + 7);
const WID = `w${ws.getFullYear()}-${pad(ws.getMonth()+1)}-${pad(ws.getDate())}`;

let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n + (x ? "  " + x : "")))
                               : (fail++, console.log("  ✗ " + n + "  " + x));

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [], dialogs = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
page.on("dialog", async d => { dialogs.push(d.message()); await d.accept(); });

console.log("\n27. שיבוץ ידני של המנהל");
try {
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#tabs:not([hidden])", { timeout: 10000 });
  await page.waitForTimeout(400);

  // שני עובדים פעילים, אחד מושבת, חבר צוות עם גוגל, ואותו אדם בשתי הרשימות.
  // השבוע נזרע *אחרי* הטעינה, כמו שזה קורה באמת: המאזינים כבר יושבים.
  await page.evaluate((WID) => {
    window.__seed("roster", "tokA", { name: "נועה", phone: "0501111111", email: "noa@x.com", active: true });
    window.__seed("roster", "tokB", { name: "יובל", phone: "0502222222", active: true });
    window.__seed("roster", "tokC", { name: "מושבת", active: false });
    window.__seed("members", "uidNoa", { name: "נועה", email: "noa@x.com" });
    window.__seed("members", "uidDan", { name: "דן", email: "dan@x.com" });
    window.__seed("weeks", WID, { phase: "open", shifts: [
      { id: "s1", day: 2, start: "09:00", end: "12:00", need: 2 },
      { id: "s2", day: 2, start: "11:00", end: "14:00", need: 1 },
    ] });
    window.__seed("availability", WID + "_tokB", { week: WID, token: "tokB", name: "יובל", days: { 2: "no" } });
    window.__seed("availability", WID + "_uidNoa", { week: WID, uid: "uidNoa", days: { 2: "yes" } });
    window.__fire();
  }, WID);
  await page.waitForTimeout(500);

  const board = await page.evaluate(() => {
    const sels = [...document.querySelectorAll("#board select.slot")];
    return { count: sels.length, opts: sels[0] ? [...sels[0].options].map(o => o.text + "|" + o.value) : [] };
  });
  ok("כל מקום פנוי הוא רשימת שמות אצל המנהל", board.count === 3, `${board.count} רשימות (2+1)`);
  ok("ברשימה גם עובד עם קוד אישי וגם חבר צוות עם גוגל",
     board.opts.some(o => o.startsWith("נועה")) && board.opts.some(o => o.startsWith("דן")), board.opts.join(" · "));
  ok("מי שנמצא בשתי הרשימות מופיע פעם אחת, לפי הקוד האישי",
     board.opts.filter(o => o.startsWith("נועה")).length === 1 && board.opts.some(o => o.endsWith("|tokA")), board.opts.join(" · "));
  ok("עובד מושבת לא ברשימה", !board.opts.some(o => o.startsWith("מושבת")), board.opts.join(" · "));
  ok('מי שסימן "יכול" ראשון, מי שסימן "לא" אחרון',
     (board.opts[1] || "").startsWith("נועה") && (board.opts[board.opts.length-1] || "").includes("סימן שלא"), board.opts.join(" · "));
  ok("זמינות שנשלחה עם גוגל מוצמדת לעובד שלה", (board.opts[1] || "").includes("יכול"), board.opts[1] || "");

  await page.selectOption("#board select.slot >> nth=0", "tokA");
  await page.waitForTimeout(400);
  const wrote = await page.evaluate((WID) => {
    const s = window.__store.signups || {};
    return { data: s[`${WID}_s1_tokA`], all: Object.keys(s),
      shown: [...document.querySelectorAll("#board .person .nm")].map(n => n.textContent),
      left: document.querySelectorAll("#board select.slot").length };
  }, WID);
  ok("נכתב signup במזהה של שיבוץ עצמי", !!wrote.data, wrote.all.join(","));
  ok("אותם שדות בדיוק כמו בשיבוץ עצמי",
     !!wrote.data && wrote.data.token === "tokA" && wrote.data.shift === "s1" && wrote.data.week === WID && !!wrote.data.at,
     JSON.stringify(wrote.data));
  ok("השם מופיע בלוח", wrote.shown.includes("נועה"), wrote.shown.join(","));
  ok("המקום הפנוי ירד מהלוח", wrote.left === 2, String(wrote.left));

  const opts0 = await page.evaluate(() => [...document.querySelectorAll("#board select.slot")[0].options].map(o => o.value));
  ok("מי שכבר משובץ במשמרת לא מוצע בה שוב", !opts0.includes("tokA"), opts0.join(","));

  const before = dialogs.length;
  await page.selectOption("#board select.slot >> nth=1", "tokA");   // 11:00–14:00 חופף ל-09:00–12:00
  await page.waitForTimeout(400);
  ok("שתי משמרות חופפות באותו יום שואלות לפני", dialogs.length > before, dialogs[dialogs.length-1] || "");
  ok("אחרי אישור השיבוץ נכתב", await page.evaluate((WID) => !!(window.__store.signups || {})[`${WID}_s2_tokA`], WID));

  await page.evaluate((WID) => { window.__store.weeks[WID].phase = "locked"; window.__fire(); }, WID);
  await page.waitForTimeout(400);
  ok("בשבוע נעול אין שיבוץ ידני", await page.evaluate(() => document.querySelectorAll("#board select.slot").length) === 0);

  ok("בלי שגיאות בקונסולה", errors.length === 0, errors.slice(0,3).join(" | "));
} catch (e){
  fail++; console.log("  ✗ הבדיקה נפלה  " + e.message);
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
await b.close();
cleanup();
process.exit(fail ? 1 : 0);
