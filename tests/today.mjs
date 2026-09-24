/* "היום" ושעות שמתפרסמות לבד.

   הבעיה שהבדיקה הזו שומרת עליה: בעל העסק שינה שעה בטלפון, והלקוח המשיך
   לראות את הישנה — כי דף העגלה ופייסבוק התעדכנו רק בלחיצה על "שגר".
   וסגירה מוקדמת "רק להיום" לא הייתה קיימת בכלל.

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
const CUR = "w2026-09-20", NEXT = "w2026-09-27";

buildFullCore();
writeFileSync(ROOT + "todaytest.html", readFileSync(ROOT + "index.html", "utf8")
  .replace("</head>", `<script type="importmap">{"imports":{"/core.js":"/tests/stubs/core-full.js"}}</script></head>`));
const server = spawn("npx", ["--yes", "http-server", ROOT, "-p", String(PORT), "-s", "-c-1"], { cwd: ROOT, stdio: "ignore" });
const cleanup = () => { try { server.kill(); } catch {} try { unlinkSync(ROOT + "todaytest.html"); } catch {} };
await new Promise(r => setTimeout(r, 2500));

let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n + (x ? "  " + x : "")))
                               : (fail++, console.log("  ✗ " + n + "  " + x));

console.log("\n29. היום, ושעות שמתפרסמות לבד");
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
    window.__api["/hours/facebook"] = { ok: true };
    window.__api["/hours/google"] = { fail: "not_configured גוגל עוד לא מחוברת" };
    window.__seed("roster", "t1", { token: "t1", name: "דנה", phone: "050-1111111", active: true });
    window.__seed("roster", "t2", { token: "t2", name: "יואב", phone: "050-2222222", active: true });
    window.__seed("weeks", CUR, { phase: "locked", shifts: [
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

  // 1. בלי שום לחיצה, השבוע הנוכחי כבר בדף העגלה ובפייסבוק
  let p = await pub();
  ok("השבוע הנוכחי מתפרסם לבד, בלי \"שגר\"", !!p && p.weeks && p.weeks["2026-09-20"] && p.weeks["2026-09-20"][3] === "09:30–12:30",
     JSON.stringify(p && p.weeks));
  ok("השדות הישנים (days/range) עדיין נכתבים — דף ישן במטמון לא נשבר", p && Array.isArray(p.days) && p.days[3] === "09:30–12:30" && typeof p.range === "string");
  ok("פייסבוק קיבל את השעות", await page.evaluate(() => window.__apiCalls.some(c => c.path === "/hours/facebook" && c.body.hours.wed)));
  const w1 = await week(CUR);
  ok("מה שפורסם נרשם על השבוע (בלי לולאה)", !!(w1.sync && w1.sync.sig), JSON.stringify(w1.sync && w1.sync.page));
  const fbCalls = await page.evaluate(() => window.__apiCalls.filter(c => c.path === "/hours/facebook").length);
  await page.waitForTimeout(1600);
  ok("אין פרסום חוזר כשהשעות לא השתנו", await page.evaluate(() => window.__apiCalls.filter(c => c.path === "/hours/facebook").length) === fbCalls);

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
  ok("שורת הסנכרון אומרת שהכול מעודכן", /דף העגלה ✓/.test(c.sync) && /פייסבוק ✓/.test(c.sync), c.sync);

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
  p = await pub();
  ok("דף העגלה קיבל את הסגירה המוקדמת לבד", p.weeks["2026-09-20"][3] === "09:30–11:00" && p.days[3] === "09:30–11:00", p.weeks["2026-09-20"][3]);
  ok("שאר הימים לא זזו", p.weeks["2026-09-20"][4] === "09:30–12:30" && p.weeks["2026-09-20"][0] === "09:00–12:00");
  ok("בלוח המשמרות רואים שהיום שונה ללקוחות", await page.evaluate(() => [...document.querySelectorAll("#board .tov")].some(n => n.textContent.includes("09:30–11:00"))));

  // 4. בטל מחזיר בדיוק את מה שהיה
  await page.click("#todayCard .todaytoast button:has-text('בטל')");
  await page.waitForTimeout(1900);
  w = await week(CUR); p = await pub();
  ok("בטל מוחק את החריגה", !w.hoursOverride || !w.hoursOverride["3"], JSON.stringify(w.hoursOverride));
  ok("ודף העגלה חוזר ל-12:30", p.weeks["2026-09-20"][3] === "09:30–12:30", p.weeks["2026-09-20"][3]);

  // 5. נשארים עוד
  await page.click("#todayCard .todayacts button:has-text('נשארים עוד')");
  await page.click("#todayCard .tchips button:has-text('עד 13:30')");
  await page.waitForTimeout(1900);
  p = await pub();
  ok("נשארים עוד שעה: 09:30–13:30 בדף העגלה", p.weeks["2026-09-20"][3] === "09:30–13:30", p.weeks["2026-09-20"][3]);
  await page.click("#todayCard .tov button:has-text('חזרה לרגיל')");
  await page.waitForTimeout(1900);
  p = await pub();
  ok("\"חזרה לרגיל\" בלחיצה אחת", p.weeks["2026-09-20"][3] === "09:30–12:30", p.weeks["2026-09-20"][3]);

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
  ok("השעות לא זזו כשהחלפנו אנשים", (await pub()).weeks["2026-09-20"][3] === "09:30–12:30");

  // 5ג. שעות קבועות: נערכות באפליקציה
  await page.evaluate(() => { document.getElementById("regBox").open = true; });
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

  // 6. שינוי שעה בלוח הניהול מתפרסם בלי "שגר"
  const sel = page.locator("#planner .planday").nth(4).locator("select.timesel").nth(1);
  await sel.selectOption("13:00");
  await page.waitForTimeout(2000);
  p = await pub();
  ok("שינוי משמרת בחמישי מגיע לדף העגלה לבד", p.weeks["2026-09-20"][4] === "09:30–13:00", p.weeks["2026-09-20"][4]);
  ok("וגם לפייסבוק", await page.evaluate(() => { const c = window.__apiCalls.filter(c => c.path === "/hours/facebook").pop(); return JSON.stringify(c.body.hours.thu) === '[["09:30","13:00"]]'; }));

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
  const btns = await page.$$eval("#wkPlan .wkrow button", bs => bs.map(b => b.textContent));
  ok("כפתור ביטול מופיע רק ליד היום שיש לו פוסטר בתור", btns.length === 1 && btns[0] === "בטל את הפוסט", JSON.stringify(btns));
  const before = dialogs.length;
  await page.evaluate(() => document.querySelector("#wkPlan .wkrow button").click());
  await page.waitForTimeout(500);
  ok("יש אישור לפני מחיקה", dialogs.length === before + 1 && /שבת/.test(dialogs[dialogs.length - 1]), dialogs[dialogs.length - 1]);
  const cc = await page.evaluate(() => window.__apiCalls.filter(c => c.path === "/publish/cancel").map(c => c.body));
  ok("השרת התבקש למחוק את הפוסט של שבת", cc.length === 1 && cc[0].fbPostId === "fb6" && cc[0].postId === "poster-" + CUR + "-6", JSON.stringify(cc));
  const post6 = await page.evaluate((id) => window.__store.posts[id], "poster-" + CUR + "-6");
  ok("הפוסטר מסומן כמבוטל", post6.status === "cancelled" && post6.igPending === false, post6.status);
  ok("והכפתור נעלם", (await page.$$("#wkPlan .wkrow button")).length === 0);
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

  // 7. השבוע הבא: לא מתפרסם עד שננעל, ואז לא מוחק את השבוע הנוכחי
  await page.evaluate(({ NEXT }) => {
    window.__seed("weeks", NEXT, { phase: "open", shifts: [{ id: "n1", day: 5, start: "08:00", end: "11:00", need: 1 }] });
    window.__fire();
  }, { NEXT });
  await page.waitForTimeout(1800);
  p = await pub();
  ok("שבוע הבא פתוח לשיבוץ — עוד לא בדף", !p.weeks["2026-09-27"], Object.keys(p.weeks).join(","));
  await page.evaluate(({ NEXT }) => {
    const w = window.__store.weeks[NEXT]; window.__seed("weeks", NEXT, { ...w, phase: "locked" }); window.__fire();
  }, { NEXT });
  await page.waitForTimeout(1900);
  p = await pub();
  ok("נעילת השבוע הבא מפרסמת אותו לבד", p.weeks["2026-09-27"] && p.weeks["2026-09-27"][5] === "08:00–11:00", JSON.stringify(p.weeks["2026-09-27"]));
  ok("והשבוע הנוכחי נשאר בדף (שישי-שבת לא נמחקים)", p.weeks["2026-09-20"][4] === "09:30–13:00" && p.from === "2026-09-20", p.from);
  ok("אין מערך בתוך מערך", !JSON.stringify(p.weeks).includes("[["));
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
