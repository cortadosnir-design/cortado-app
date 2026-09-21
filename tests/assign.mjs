/* שיבוץ ידני של המנהל, על הקוד האמיתי.

   שני באגים אמיתיים נתפסו כאן, ולכן הקובץ קיים:
   1. רשימת העובדים מגיעה ממאזין של ops, בדרך כלל *אחרי* שהלוח כבר צויר —
      וכל "מקום פנוי" נשאר טקסט מת, בלי שום דרך לשבץ.
   2. כשהרשימות ריקות (אין עובדים ואין חברי צוות) הלוח נפל חזרה לטקסט
      "מקום פנוי", כלומר דווקא מי שהכי צריך לשבץ ידנית לא יכול היה.

   ה-harness של ui.mjs מחליף את shifts.js בדמה, ולכן אף בדיקה קיימת לא
   נוגעת במסלול הזה. כאן רץ index.html האמיתי עם כל המודולים, ורק
   Firebase מזויף — אותה שיטה כמו sim.mjs. */
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
const errors = [], dialogs = [];
let promptAnswer = "";
const newPage = async () => {
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  p.on("pageerror", e => errors.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
  p.on("dialog", async d => { dialogs.push(d.message()); d.type() === "prompt" ? await d.accept(promptAnswer) : await d.accept(); });
  await p.goto(PAGE, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#tabs:not([hidden])", { timeout: 10000 });
  await p.waitForTimeout(400);
  return p;
};
// טקסטים וערכים של רשימה אחת, לפי סדר
const optsOf = (p, nth = 0) => p.evaluate((n) => {
  const s = document.querySelectorAll("#board select.slot")[n];
  return s ? [...s.options].map(o => ({ text: o.text, value: o.value })) : [];
}, nth);
const valueFor = async (p, nth, startsWith) =>
  ((await optsOf(p, nth)).find(o => o.text.startsWith(startsWith)) || {}).value;

const WEEK = { phase: "open", shifts: [
  { id: "s1", day: 2, start: "09:00", end: "12:00", need: 2 },
  { id: "s2", day: 2, start: "11:00", end: "14:00", need: 1 },
] };

console.log("\n27. שיבוץ ידני של המנהל");
let page;
try {
  page = await newPage();

  // שני עובדים פעילים, אחד מושבת, חבר צוות עם גוגל, ואותו אדם בשתי הרשימות.
  // השבוע נזרע *אחרי* הטעינה, כמו שזה קורה באמת: המאזינים כבר יושבים.
  await page.evaluate((WEEK_WID) => {
    const [WEEK, WID] = WEEK_WID;
    window.__seed("roster", "tokA", { name: "נועה", phone: "0501111111", email: "noa@x.com", active: true });
    window.__seed("roster", "tokB", { name: "יובל", phone: "0502222222", active: true });
    window.__seed("roster", "tokC", { name: "מושבת", active: false });
    window.__seed("members", "uidNoa", { name: "נועה", email: "noa@x.com" });
    window.__seed("members", "uidDan", { name: "דן", email: "dan@x.com" });
    window.__seed("weeks", WID, WEEK);
    window.__seed("availability", WID + "_tokB", { week: WID, token: "tokB", name: "יובל", days: { 2: "no" } });
    window.__seed("availability", WID + "_uidNoa", { week: WID, uid: "uidNoa", days: { 2: "yes" } });
    window.__fire();
  }, [WEEK, WID]);
  await page.waitForTimeout(500);

  const count = await page.evaluate(() => document.querySelectorAll("#board select.slot").length);
  const opts = await optsOf(page, 0);
  const texts = opts.map(o => o.text);
  ok("כל מקום פנוי הוא רשימת שמות אצל המנהל", count === 3, `${count} רשימות (2+1)`);
  ok("ברשימה גם עובד עם קוד אישי וגם חבר צוות עם גוגל",
     texts.some(x => x.startsWith("נועה")) && texts.some(x => x.startsWith("דן")), texts.join(" · "));
  ok("מי שנמצא בשתי הרשימות מופיע פעם אחת, לפי הקוד האישי",
     texts.filter(x => x.startsWith("נועה")).length === 1 &&
     (await valueFor(page, 0, "נועה")) !== undefined, texts.join(" · "));
  ok("עובד מושבת לא ברשימה", !texts.some(x => x.startsWith("מושבת")), texts.join(" · "));
  ok('מי שסימן "יכול" ראשון, מי שסימן "לא" אחרון',
     texts[1].startsWith("נועה") && texts[texts.length - 2].includes("סימן שלא"), texts.join(" · "));
  ok("זמינות שנשלחה עם גוגל מוצמדת לעובד שלה", texts[1].includes("יכול"), texts[1]);
  ok("המנהל יכול לשבץ את עצמו", texts.some(x => x.startsWith("סניר")), texts.join(" · "));
  ok('"שם אחר" תמיד בסוף הרשימה', texts[texts.length - 1].startsWith("שם אחר"), texts[texts.length - 1]);

  await page.selectOption("#board select.slot >> nth=0", await valueFor(page, 0, "נועה"));
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
  ok("מי שכבר משובץ במשמרת לא מוצע בה שוב",
     !(await optsOf(page, 0)).some(o => o.text.startsWith("נועה")), (await optsOf(page, 0)).map(o => o.text).join(" · "));

  // שם חופשי: מי שאינו ברשימה בכלל
  promptAnswer = "דודו המתנדב";
  await page.selectOption("#board select.slot >> nth=0", "__free__");
  await page.waitForTimeout(400);
  const freeDoc = await page.evaluate(() => {
    const s = window.__store.signups || {};
    const id = Object.keys(s).find(k => k.includes("_n"));
    return { id, data: s[id], shown: [...document.querySelectorAll("#board .person .nm")].map(n => n.textContent) };
  });
  ok("שם חופשי נשמר כשיבוץ", !!freeDoc.data && freeDoc.data.name === "דודו המתנדב", JSON.stringify(freeDoc.data));
  ok("שם חופשי בלי קוד אישי ובלי uid",
     !!freeDoc.data && !("token" in freeDoc.data) && !("uid" in freeDoc.data), JSON.stringify(freeDoc.data));
  ok("שם חופשי מופיע בלוח", freeDoc.shown.includes("דודו המתנדב"), freeDoc.shown.join(","));

  // חפיפה באותו יום: נועה כבר ב-09:00–12:00, וכאן משבצים אותה ל-11:00–14:00.
  const before = dialogs.length;
  await page.selectOption("#board select.slot >> nth=0", await valueFor(page, 0, "נועה"));
  await page.waitForTimeout(400);
  ok("שתי משמרות חופפות באותו יום שואלות לפני",
     dialogs.slice(before).some(d => d.includes("כבר במשמרת")), dialogs[dialogs.length-1] || "");
  ok("אחרי אישור השיבוץ נכתב", await page.evaluate((WID) => !!(window.__store.signups || {})[`${WID}_s2_tokA`], WID));

  await page.evaluate((WID) => { window.__store.weeks[WID].phase = "locked"; window.__fire(); }, WID);
  await page.waitForTimeout(400);
  ok("בשבוע נעול אין שיבוץ ידני", await page.evaluate(() => document.querySelectorAll("#board select.slot").length) === 0);
  await page.close();

  // לוח בלי שום רשימה: אין עובדים ואין חברי צוות — ועדיין אפשר לשבץ.
  page = await newPage();
  await page.evaluate((WEEK_WID) => {
    const [WEEK, WID] = WEEK_WID;
    window.__seed("weeks", WID, WEEK);
    window.__fire();
  }, [WEEK, WID]);
  await page.waitForTimeout(500);
  const bare = (await optsOf(page, 0)).map(o => o.text);
  ok("בלי עובדים ובלי חברי צוות עדיין יש איך לשבץ", bare.length >= 2, bare.join(" · "));
  ok("והשם החופשי שם", bare.some(x => x.startsWith("שם אחר")), bare.join(" · "));
  promptAnswer = "אורח";
  await page.selectOption("#board select.slot >> nth=0", "__free__");
  await page.waitForTimeout(400);
  ok("גם בלי רשימות השם נכנס למשמרת",
     (await page.evaluate(() => [...document.querySelectorAll("#board .person .nm")].map(n => n.textContent))).includes("אורח"));

  ok("בלי שגיאות בקונסולה", errors.length === 0, errors.slice(0,3).join(" | "));
} catch (e){
  fail++; console.log("  ✗ הבדיקה נפלה  " + e.message);
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
await b.close();
cleanup();
process.exit(fail ? 1 : 0);
