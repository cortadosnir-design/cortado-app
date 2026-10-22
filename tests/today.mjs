/* "היום": שינוי שעות ליום אחד בלחיצה, ומה שהלקוח רואה.

   ללקוחות השעות יוצאות רק דרך בוט קורטדו. האפליקציה כותבת חריגה על מסמך
   השבוע ולא נוגעת ב-public/hours — והבדיקה שומרת על שני הצדדים.

   השעון של הדפדפן קבוע: רביעי 23.9.2026, 10:40, שעון ישראל. כך "פתוח עכשיו"
   ושורת השעות לסגירה מוקדמת צפויים מראש. */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { spawn } from "child_process";
import { buildFullCore } from "./fullcore.mjs";
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = process.env.TODAY_PORT || 8906;
const NOW = new Date("2026-09-23T10:40:00+03:00");
const CUR = "w2026-09-20";

buildFullCore();
writeFileSync(ROOT + "todaytest.html", readFileSync(ROOT + "index.html", "utf8")
  .replace("</head>", `<script type="importmap">{"imports":{"/core.js":"/tests/stubs/core-full.js"}}</script></head>`));
const server = spawn("npx", ["--yes", "http-server", ROOT, "-p", String(PORT), "-s", "-c-1"], { cwd: ROOT, stdio: "ignore" });
const cleanup = () => { try { server.kill(); } catch {} try { unlinkSync(ROOT + "todaytest.html"); } catch {} };
await new Promise(r => setTimeout(r, 2500));

let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n + (x ? "  " + x : "")))
                               : (fail++, console.log("  ✗ " + n + "  " + x));

console.log("\n29. היום");
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Jerusalem", locale: "he-IL" });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text()); });
  const dialogs = [];
  page.on("dialog", async d => { dialogs.push(d.message()); await d.accept(); });
  await page.goto(`http://127.0.0.1:${PORT}/todaytest.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#tabs:not([hidden])", { timeout: 10000 });
  await page.waitForTimeout(400);

  await page.evaluate(({ CUR }) => {
    window.__seed("roster", "t1", { token: "t1", name: "דנה", phone: "050-1111111", active: true });
    window.__seed("roster", "t2", { token: "t2", name: "יואב", phone: "050-2222222", active: true });
    window.__seed("weeks", CUR, { phase: "locked", sync: { page: "ok", at: { seconds: 1 } }, shifts: [
      { id: "a", day: 0, start: "09:00", end: "12:00", need: 1 },
      { id: "d", day: 3, start: "09:30", end: "12:30", need: 1 },
      { id: "e", day: 4, start: "09:30", end: "12:30", need: 1 },
    ] });
    window.__seed("signups", `${CUR}_d_t1`, { week: CUR, shift: "d", token: "t1", name: "דנה" });
    window.__fire();
  }, { CUR });
  await page.waitForTimeout(2200);

  const pub = () => page.evaluate(() => JSON.parse(JSON.stringify((window.__store.public || {}).hours || null)));
  const week = (id) => page.evaluate((id) => (window.__store.weeks || {})[id] || null, id);

  // 1. האפליקציה לא מפרסמת שעות בעצמה
  const closed = () => page.evaluate(() => window.__apiCalls.filter(c => /^\/hours\/(facebook|google)$/.test(c.path)).length);
  ok("האפליקציה לא כותבת את public/hours — רק הבוט", await pub() === null);
  ok("לא קורא ל-/hours/facebook ול-/hours/google (410 בשרת)", await closed() === 0);
  const ovOf = async (d) => { const x = (await week(CUR)).hoursOverride; return x && x[d] ? JSON.stringify(x[d]) : ""; };

  // 2. כרטיס היום
  const card = () => page.evaluate(() => {
    const c = document.getElementById("todayCard");
    return { hidden: c.hidden, big: (c.querySelector(".tbig") || {}).textContent, line: (c.querySelector(".tline") || {}).textContent,
      kick: (c.querySelector(".tkick") || {}).textContent, buttons: [...c.querySelectorAll(".todayacts button")].map(b => b.textContent),
      chips: [...c.querySelectorAll(".tchips button")].map(b => b.textContent), toast: (c.querySelector(".todaytoast") || {}).textContent || "",
      wa: [...c.querySelectorAll(".todaytoast a")].map(a => a.href), sync: (c.querySelector(".tsync") || {}).textContent || "",
      top: c.getBoundingClientRect().top };
  });
  let c = await card();
  ok("כרטיס היום מופיע ראשון במסך", !c.hidden && c.top < 200, "top=" + Math.round(c.top));
  ok("\"פתוח עכשיו · עד 12:30\"", /פתוח עכשיו/.test(c.kick) && c.big === "עד 12:30", c.kick + " | " + c.big);
  ok("מי בעגלה היום", /דנה/.test(c.line), c.line);
  ok("שלוש פעולות: סוגרים מוקדם / נשארים עוד", c.buttons.includes("סוגרים מוקדם") && c.buttons.includes("נשארים עוד"), c.buttons.join(" · "));
  ok("שורת הסנכרון מראה מה הבוט פרסם", /דף העגלה ✓/.test(c.sync), c.sync);

  // 3. סוגרים מוקדם: שתי נגיעות
  await page.click("#todayCard .todayacts button:has-text('סוגרים מוקדם')");
  c = await card();
  ok("השעות לסגירה: עכשיו, ואז כל חצי שעה עד הסגירה", c.chips.join(",") === "עכשיו,11:00,11:30,12:00", c.chips.join(","));
  await page.click("#todayCard .tchips button:has-text('11:00')");
  await page.waitForTimeout(300);
  let w = await week(CUR);
  ok("נשמר כחריגה ליום, בלי לגעת במשמרת", JSON.stringify(w.hoursOverride) === '{"3":{"ranges":["09:30–11:00"]}}' && w.shifts.find(s => s.id === "d").end === "12:30",
     JSON.stringify(w.hoursOverride));
  ok("השיבוץ של דנה לא נמחק", await page.evaluate((k) => !!(window.__store.signups || {})[k], `${CUR}_d_t1`));
  c = await card();
  ok("המסך מתעדכן מיד: עד 11:00", c.big === "עד 11:00", c.big);
  ok("הודעה עם \"בטל\"", /11:00/.test(c.toast) && /בטל/.test(c.toast), c.toast);
  ok("וואטסאפ מוכן לדנה, עם השעה", c.wa.some(h => h.includes("972501111111") && decodeURIComponent(h).includes("11:00")), c.wa.join(" "));
  ok("בלי חלון \"אתה בטוח?\"", dialogs.length === 0, dialogs.join(" | "));
  await page.waitForTimeout(1800);
  ok("שורת הסנכרון אומרת שללקוחות זה יוצא דרך הבוט", /בוט קורטדו/.test((await card()).sync), (await card()).sync);
  ok("ועדיין לא נכתב public/hours", await pub() === null);
  ok("בלוח המשמרות רואים שהיום שונה ללקוחות", await page.evaluate(() => [...document.querySelectorAll("#board .tov")].some(n => n.textContent.includes("09:30–11:00"))));

  // 4. בטל מחזיר בדיוק את מה שהיה
  await page.click("#todayCard .todaytoast button:has-text('בטל')");
  await page.waitForTimeout(1900);
  w = await week(CUR);
  ok("בטל מוחק את החריגה", !w.hoursOverride || !w.hoursOverride["3"], JSON.stringify(w.hoursOverride));

  // 5. נשארים עוד
  await page.click("#todayCard .todayacts button:has-text('נשארים עוד')");
  await page.click("#todayCard .tchips button:has-text('עד 13:30')");
  await page.waitForTimeout(1900);
  ok("נשארים עוד שעה: 09:30–13:30", await ovOf(3) === '{"ranges":["09:30–13:30"]}', await ovOf(3));
  await page.click("#todayCard .tov button:has-text('חזרה לרגיל')");
  await page.waitForTimeout(1900);
  ok("\"חזרה לרגיל\" בלחיצה אחת", await ovOf(3) === "", await ovOf(3));

  // 5ב. מישהו לא מגיע: שתי נגיעות להוריד, נגיעה אחת לשבץ מחליף
  await page.click("#todayCard .todayacts button:has-text('מישהו לא מגיע')");
  await page.click("#todayCard .tchips button:has-text('בלי דנה')");
  await page.waitForTimeout(300);
  ok("השיבוץ של דנה להיום ירד", await page.evaluate((k) => !(window.__store.signups || {})[k], `${CUR}_d_t1`));
  c = await card();
  ok("מוצע מחליף, עם וואטסאפ לשאול", /מי מחליף את דנה/.test(c.chips.join(" ") + (await page.textContent("#todayCard .tchips"))) &&
     await page.evaluate(() => [...document.querySelectorAll("#todayCard .tswap a")].some(a => a.href.includes("972502222222"))));
  await page.click("#todayCard .tswap button:has-text('שבץ')");
  await page.waitForTimeout(300);
  ok("יואב משובץ לאותה משמרת, באותו פורמט כמו שיבוץ ידני", await page.evaluate((k) => { const d = (window.__store.signups || {})[k]; return !!d && d.token === "t2" && d.shift === "d"; }, `${CUR}_d_t2`));
  c = await card();
  ok("המסך מראה את יואב בעגלה", /יואב/.test(c.line) && !/דנה/.test(c.line), c.line);
  ok("השעות לא זזו כשהחלפנו אנשים", await ovOf(3) === "");

  // 5ג. שעות קבועות: נערכות באפליקציה
  await page.evaluate(() => { document.getElementById("hoursTools").open = true; document.getElementById("regBox").open = true; });
  const reg0 = await page.inputValue("#regForm input[data-day='3']");
  ok("השעות הקבועות מוצגות לעריכה", reg0 === "09:30–12:30", reg0);
  await page.fill("#regForm input[data-day='0']", "08:00-11:00");
  await page.fill("#regForm input[data-day='1']", "בוקר");
  await page.click("#regSave");
  ok("טעות הקלדה נעצרת עם שם היום", /שני/.test(await page.textContent("#regStatus")), await page.textContent("#regStatus"));
  await page.fill("#regForm input[data-day='1']", "");
  await page.click("#regSave");
  await page.waitForTimeout(300);
  const regDoc = await page.evaluate(() => (window.__store.brand || {}).hours);
  ok("נשמר ל-brand/hours, שורה ליום", regDoc && regDoc.days[0] === "08:00–11:00" && regDoc.days[1] === "" && regDoc.days[3] === "09:30–12:30", JSON.stringify(regDoc && regDoc.days));

  // 6. שינוי שעה בלוח הניהול נשמר על המשמרת, בלי לפרסם מהאפליקציה
  const sel = page.locator("#planner .planday").nth(4).locator("select.timesel").nth(1);
  await sel.selectOption("13:00");
  await page.waitForTimeout(2000);
  ok("שינוי משמרת בחמישי נשמר", await page.evaluate((CUR) => window.__store.weeks[CUR].shifts.find(s => s.id === "e").end, CUR) === "13:00");
  ok("ועדיין בלי public/hours ובלי נתיבי השעות הסגורים", await pub() === null && await closed() === 0);

  // 6א. התחלה שעוברת את הסיום גוררת את הסיום איתה (ולא חוזרת בשקט ל-13:00)
  const thu = () => page.evaluate((CUR) => window.__store.weeks[CUR].shifts.filter(s => s.day === 4).map(s => s.start + "–" + s.end).join(","), CUR);
  await page.locator("#planner .planday").nth(4).locator("select.timesel").nth(0).selectOption("16:00");
  await page.waitForTimeout(300);
  ok("התחלה אחרי הסיום מזיזה את הסיום ושומרת על האורך", await thu() === "16:00–19:30", await thu());
  await page.locator("#planner .planday").nth(4).locator("select.timesel").nth(1).selectOption("13:00");
  await page.waitForTimeout(300);
  ok("סיום לפני ההתחלה מזיז את ההתחלה אחורה", await thu() === "09:30–13:00", await thu());
  await page.waitForTimeout(2000);

  // 6ב. שבת נסגרה: ביטול הפוסטר שלה בלחיצה, בלי שיחזור בסנכרון
  await page.evaluate(async ({ CUR }) => {
    const W = await import("/weekly.js");
    window.__api["/publish/cancel"] = { deleted: ["fb6"], failed: [] };
    window.__seed("posts", "poster-" + CUR + "-6", { kind: "poster", week: CUR, date: "2026-09-26", status: "scheduled",
      at: new Date("2026-09-26T08:00:00+03:00").getTime(), hoursKey: W.hoursKey(), fbPostId: "fb6", fbPhotoId: "ph6" });
    window.__fire();
  }, { CUR });
  await page.waitForTimeout(400);
  // הפוסטר הישן הושבת: מה שעוד בתור מבוטל לבד, בלי לחיצה ובלי אישור
  const cc = await page.evaluate(() => window.__apiCalls.filter(c => c.path === "/publish/cancel").map(c => c.body));
  ok("הפוסטר הישן של שבת מבוטל לבד", cc.length === 1 && cc[0].fbPostId === "fb6" && cc[0].postId === "poster-" + CUR + "-6", JSON.stringify(cc));
  const post6 = await page.evaluate((id) => window.__store.posts[id], "poster-" + CUR + "-6");
  ok("הפוסטר מסומן כמבוטל", post6.status === "cancelled" && post6.igPending === false, post6.status);
  ok("אין כפתורי ביטול שנשארו", (await page.$$("#wkPlan .wkrow button")).length === 0);
  ok("כפתור השיגור מוסתר", await page.locator("#wkSend").isHidden());
  ok("לא נוצר פוסטר חדש במקומו", await page.evaluate(() => !window.__apiCalls.some(c => c.path === "/publish/schedule" && /-6$/.test(c.body.postId))));

  // 6ג. הסנכרון האוטומטי: פוסטר של שבת עם שעות ישנות (מלפני שנסגרה) מבוטל לבד, ולא נבנה "סגור" במקומו
  await page.evaluate(({ CUR }) => {
    window.__apiCalls.length = 0;
    window.__seed("posts", "poster-" + CUR + "-6", { kind: "poster", week: CUR, date: "2026-09-26", status: "scheduled",
      at: new Date("2026-09-26T08:00:00+03:00").getTime(), hoursKey: "ישן", fbPostId: "fb7", fbPhotoId: "ph7" });
    window.__fire();
  }, { CUR });
  await page.waitForTimeout(800);
  const cc2 = await page.evaluate(() => window.__apiCalls.filter(c => c.path === "/publish/cancel").map(c => c.body.fbPostId));
  ok("הסנכרון מבטל לבד את פוסטר השבת הישן", cc2.length === 1 && cc2[0] === "fb7", JSON.stringify(cc2));
  ok("ולא מתזמן פוסטר 'סגור' במקומו", await page.evaluate(() => !window.__apiCalls.some(c => c.path === "/publish/schedule" && /-6$/.test(c.body.postId))));
  ok("הפוסטר מסומן כמבוטל אחרי הסנכרון", await page.evaluate((id) => window.__store.posts[id].status, "poster-" + CUR + "-6") === "cancelled");
  ok("ההודעה לא מדווחת על כישלון", !/נכשל/.test(await page.textContent("#wkStatus")), await page.textContent("#wkStatus"));

  // 7א. הדבקת שעות לשבוע (מהפלייר): משמרות קיימות נשמרות עם השיבוצים
  await page.evaluate(() => { document.getElementById("hoursTools").open = true; document.getElementById("pasteBox").open = true; });
  await page.waitForTimeout(100);
  const pre = await page.inputValue("#weekPaste");
  ok("השדה נפתח עם השעות של השבוע", pre.split("\n").length === 7 && pre.split("\n")[3] === "09:30–12:30", JSON.stringify(pre));
  await page.fill("#weekPaste", "סגור\nבוקר\n\n\n\n\n");
  await page.click("#weekPasteApply");
  ok("טעות נעצרת עם שם היום", /שני/.test(await page.textContent("#pasteStatus")), await page.textContent("#pasteStatus"));
  await page.fill("#weekPaste", ["יום א 16:00-19:00", "09:30-12:30, 16:00-19:00", "סגור", "יום ד 09:30 - 12:30 16:00 - 19:00",
    "09:30–12:30, 16:00–19:30", "שישי: 09:00-12:00", "16:00-19:00"].join("\n"));
  const nd = dialogs.length;
  await page.click("#weekPasteApply");
  await page.waitForTimeout(2200);
  ok("יש אישור עם סיכום לפני העדכון", dialogs.length === nd + 1 && /חמישי: 09:30–12:30, 16:00–19:30/.test(dialogs[nd]), dialogs[nd]);
  const wk = await week(CUR);
  const byDay = [0,1,2,3,4,5,6].map(i => wk.shifts.filter(s => s.day === i).sort((a, b) => a.start.localeCompare(b.start)).map(s => s.start + "–" + s.end).join(", "));
  ok("השעות של השבוע הן בדיוק מה שהודבק", JSON.stringify(byDay) === JSON.stringify(["16:00–19:00", "09:30–12:30, 16:00–19:00", "", "09:30–12:30, 16:00–19:00", "09:30–12:30, 16:00–19:30", "09:00–12:00", "16:00–19:00"]), JSON.stringify(byDay));
  ok("המשמרת של רביעי שמרה את המזהה שלה", wk.shifts.some(s => s.id === "d" && s.day === 3 && s.start === "09:30"));
  ok("בלי שגיאות בקונסולה", errors.length === 0, errors.slice(0, 2).join(" | "));

  // 8. דף העגלה קורא לפי תאריך
  const rest = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(rest) } }
    : v && typeof v === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rest(x)])) } }
    : { stringValue: String(v) };
  // "days" העליון בכוונה שגוי: הדף חייב להעדיף את המפה לפי תאריך.
  const docBody = { fields: { days: rest(["", "", "", "", "", "", ""]), range: rest("x"),
    weeks: rest({ "2026-09-20": ["", "", "", "09:30–11:00", "", "", ""], "2026-09-27": ["07:00–08:00", "", "", "", "", "", ""] }) } };
  const cafe = await ctx.newPage();
  await cafe.clock.setFixedTime(NOW);
  await cafe.route(/firestore\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(docBody) }));
  await cafe.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await cafe.goto(`http://127.0.0.1:${PORT}/cafe/`, { waitUntil: "domcontentloaded" });
  await cafe.waitForTimeout(700);
  const cf = await cafe.evaluate(() => ({
    status: document.querySelector("#status span").textContent,
    wed: [...document.querySelectorAll("#hours tr")][3].children[1].textContent,
    note: document.getElementById("hours-note").textContent.slice(0, 30) }));
  ok("דף העגלה: \"פתוח עכשיו · עד 11:00\" מתוך השבוע של היום", cf.status === "פתוח עכשיו · עד 11:00", cf.status);
  ok("הטבלה היא של השבוע הנוכחי", cf.wed === "09:30–11:00" && cf.note.startsWith("השעות לשבוע 20.9 – 26.9"), cf.wed + " | " + cf.note);
  await cafe.clock.setFixedTime(new Date("2026-09-23T12:00:00+03:00"));
  await cafe.reload({ waitUntil: "domcontentloaded" }); await cafe.waitForTimeout(700);
  const st2 = await cafe.evaluate(() => document.querySelector("#status span").textContent);
  ok("אחרי הסגירה — הפתיחה הבאה נלקחת מהשבוע הבא", st2 === "נפתח ביום ראשון ב־07:00", st2);
  await cafe.close();
} catch (e){
  fail++; console.log("  ✗ הבדיקה נפלה  " + e.message);
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
await b.close();
cleanup();
process.exit(fail ? 1 : 0);
