// בדיקת שכבת התרגום בוורקר, על הקוד האמיתי: חותכים את הקטע ומריצים אותו.
import { readFileSync } from "fs";
const src = readFileSync(new URL("../worker/src/index.js", import.meta.url), "utf8");
const from = src.indexOf("const HEBREW_RE");
const to   = src.indexOf("\n", src.indexOf("}", src.indexOf("function hebrew(")));
const block = src.slice(from, src.indexOf("\n}", src.indexOf("function hebrew(")) + 2);
const hebrew = new Function(block + "\nreturn hebrew;")();

let pass = 0, fail = 0;
const t = (name, input, re) => {
  const out = hebrew(input);
  const good = re.test(out) && /[֐-׿]/.test(out) && !/[a-zA-Z]{6,}/.test(out.replace(/Gemini|Cloudflare|Google|AI Studio|Meta|API|GEMINI_MODEL/g, ""));
  good ? (pass++, console.log("  ✓ " + name + "  → " + out.slice(0, 62)))
       : (fail++, console.log("  ✗ " + name + "  → " + out));
};
console.log("\n13. שגיאות השרת בעברית");
t("מכסה לדקה", "429 You exceeded your current quota. Please retry in 21.35s", /21|22|דקה|מכסה/);
t("מכסה יומית", "RESOURCE_EXHAUSTED: quota exceeded for GenerateRequestsPerDay", /יומית|מחר/);
t("מפתח לא תקין", "API key not valid. Please pass a valid API key.", /מפתח|Cloudflare/);
t("אין הרשאה למודל", "PERMISSION_DENIED: caller does not have permission", /הרשאה|מפתח/);
t("חסימת בטיחות", "Candidate was blocked due to SAFETY", /בטיחות|ניסוח|חסמ/);
t("מודל נעלם", "models/gemini-3.8-flash is not found for API version v1beta", /מודל/);
t("טוקן מטא פג", "Error validating access token: Session has expired", /טוקן|פייסבוק|פג/);
t("שגיאה לא מוכרת", "ECONNRESET socket hang up", /נסה|שוב|רשת|משהו/);
t("כבר בעברית עובר כמו שהוא", "רק המנהל יכול לבצע את הפעולה הזו.", /^רק המנהל/);
t("ריק", "", /משהו|נסה/);
console.log(`\n${pass} עברו · ${fail} נכשלו`);
if (fail) process.exitCode = 1;

/* ── תזמון: החישובים שאפשר לבדוק בלי רשת ── */
const wsrc = readFileSync(new URL("../worker/src/index.js", import.meta.url), "utf8");
const cut = (name, from) => { const a = wsrc.indexOf(from); return wsrc.slice(a, wsrc.indexOf("\n}\n", a) + 2); };
const helpers = new Function(
  "fail",
  cut("publishWhen", "function publishWhen(") + "\n" +
  wsrc.slice(wsrc.indexOf("const MIN_AHEAD"), wsrc.indexOf("function dataUrlToBlob")) + "\n" +
  wsrc.slice(wsrc.indexOf("const dueNow ="), wsrc.indexOf("// הקרון: מה שממתין")) + "\n" +
  "return { publishWhen, dueNow };"
)((c, m) => Object.assign(new Error(m), { code: c }));

let p2 = 0, f2 = 0;
const ok2 = (n, c, x = "") => c ? (p2++, console.log("  ✓ " + n + (x ? "  " + x : ""))) : (f2++, console.log("  ✗ " + n + "  " + x));
console.log("\n15. תזמון פוסטים");
const NOW = 1_700_000_000;
ok2("זמן שעבר → מפרסם עכשיו", helpers.publishWhen((NOW - 3600) * 1000, NOW) === 0);
ok2("בעוד 3 דקות → עכשיו (מטא דורשת 10)", helpers.publishWhen((NOW + 180) * 1000, NOW) === 0);
ok2("בעוד שעה → מתוזמן", helpers.publishWhen((NOW + 3600) * 1000, NOW) === NOW + 3600);
ok2("בלי זמן → עכשיו", helpers.publishWhen(0, NOW) === 0);
let threw = false;
try { helpers.publishWhen((NOW + 60 * 24 * 3600) * 1000, NOW); } catch { threw = true; }
ok2("מעבר ל-30 יום → נדחה", threw);

const q = [
  { id: "a", fields: { igPending: true, publishAt: Date.now() - 60000 } },
  { id: "b", fields: { igPending: true, publishAt: Date.now() + 3600000 } },
  { id: "c", fields: { igPending: false, publishAt: Date.now() - 60000 } },
  { id: "d", fields: { igPending: true } },
];
const due = helpers.dueNow(q).map(x => x.id);
ok2("התור מוציא רק מה שהגיע זמנו", due.length === 1 && due[0] === "a", due.join(",") || "ריק");
console.log(`\n${p2} עברו · ${f2} נכשלו`);
if (f2) process.exitCode = 1;

/* ── חיבור העמוד: מה שבלוח של Cloudflare מנצח, מה שחסר מגיע מ-secrets/meta ── */
{
  const block = wsrc.slice(wsrc.indexOf("const META_KEYS"), wsrc.indexOf("\n}\n", wsrc.indexOf("async function withMeta(")) + 2)
    + "\n" + wsrc.slice(wsrc.indexOf("const choosePage"), wsrc.indexOf("\n", wsrc.indexOf("const choosePage")));
  const mk = (fsGet) => new Function("fsGet", block + "\nreturn { withMeta, choosePage };")(fsGet);
  let calls = 0;
  const doc = { FB_PAGE_ID: "111", FB_PAGE_TOKEN: "tokDoc", IG_USER_ID: "ig1", pageName: "קפה" };
  const { withMeta, choosePage } = mk(async () => { calls++; return doc; });
  console.log("\n13ב. חיבור עמוד הפייסבוק");
  let pass2 = 0, fail2 = 0;
  const ok = (n, c, x = "") => c ? (pass2++, console.log("  ✓ " + n + (x ? "  " + x : ""))) : (fail2++, console.log("  ✗ " + n + "  " + x));
  const full = await withMeta({ FB_PAGE_ID: "9", FB_PAGE_TOKEN: "tokEnv", IG_USER_ID: "igE", FIREBASE_SA: "{}" });
  ok("הכול מוגדר בלוח → לא נוגעים ב-Firestore", full.FB_PAGE_TOKEN === "tokEnv" && calls === 0);
  const fbOnly = await withMeta({ FB_PAGE_ID: "9", FB_PAGE_TOKEN: "tokEnv", FIREBASE_SA: "{}" });
  ok("פייסבוק בלוח, אינסטגרם רק במסמך → אינסטגרם נטען, הפייסבוק מהלוח נשאר", fbOnly.IG_USER_ID === "ig1" && fbOnly.FB_PAGE_TOKEN === "tokEnv" && fbOnly.FB_PAGE_ID === "9" && calls === 1);
  calls = 0;
  const filled = await withMeta({ FIREBASE_SA: "{}", GEMINI_API_KEY: "g" });
  ok("חסר בלוח → מגיע מ-secrets/meta", filled.FB_PAGE_ID === "111" && filled.FB_PAGE_TOKEN === "tokDoc" && filled.IG_USER_ID === "ig1" && calls === 1);
  ok("שאר המשתנים נשמרים", filled.GEMINI_API_KEY === "g");
  const mixed = await withMeta({ FIREBASE_SA: "{}", IG_USER_ID: "igEnv" });
  ok("ערך בלוח מנצח ערך במסמך", mixed.IG_USER_ID === "igEnv" && mixed.FB_PAGE_ID === "111");
  const noSa = await withMeta({ GEMINI_API_KEY: "g" });
  ok("בלי FIREBASE_SA → כמו שהיה, בלי קריאה", !noSa.FB_PAGE_ID && calls === 2);
  const broken = mk(async () => { throw new Error("boom"); });
  const b2 = await broken.withMeta({ FIREBASE_SA: "{}" });
  ok("Firestore נופל → ממשיכים בלי חיבור, לא קורסים", !b2.FB_PAGE_TOKEN);
  const empty = mk(async () => null);
  ok("אין מסמך → כמו שהיה", !(await empty.withMeta({ FIREBASE_SA: "{}" })).FB_PAGE_ID);
  const one = [{ id: "1", name: "א" }], two = [{ id: "1", name: "א" }, { id: "2", name: "ב" }];
  ok("עמוד אחד נבחר לבד", choosePage(one) === one[0]);
  ok("כמה עמודים בלי בחירה → אין שמירה", choosePage(two) === null);
  ok("כמה עמודים עם pageId → הנבחר", choosePage(two, 2) === two[1]);
  console.log(`\n${pass2} עברו · ${fail2} נכשלו`);
  if (fail2) process.exitCode = 1;
}

/* ── שעות מגוגל: periods של Places API → טווחים לכל יום ── */
{
  console.log("\nשעות מגוגל (Places API)");
  const a = wsrc.indexOf("const hm = (t)"), z = wsrc.indexOf("async function readGoogleHours");
  const placeRanges = new Function(wsrc.slice(a, z) + "\nreturn placeRanges;")();
  const P = (d, oh, om, ch, cm, date) => ({ open: { day: d, hour: oh, minute: om, ...(date ? { date } : {}) }, close: { day: d, hour: ch, minute: cm } });
  const r = placeRanges([P(1, 9, 0, 12, 0), P(6, 9, 0, 12, 0), P(6, 16, 0, 19, 30), P(0, 7, 5, 14, 0, { year: 2026, month: 10, day: 4 })]);
  let p = 0, f = 0; const ok = (m, c, x) => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${m}${x ? "  " + x : ""}`); };
  ok("יום עם טווח אחד", r.byDay[1].join() === "09:00–12:00", r.byDay[1].join());
  ok("שני טווחים באותו יום, דקות נשמרות", r.byDay[6].join(", ") === "09:00–12:00, 16:00–19:30", r.byDay[6].join(", "));
  ok("יום בלי period = סגור", r.byDay[2].length === 0);
  ok("אפס מוביל בדקות", r.byDay[0][0] === "07:05–14:00", r.byDay[0][0]);
  ok("לפי תאריך כשגוגל שולחת תאריך", r.byDate["2026-10-04"] && r.byDate["2026-10-04"][0] === "07:05–14:00");
  ok("בלי close = כל היום", placeRanges([{ open: { day: 3, hour: 0, minute: 0 } }]).byDay[3][0] === "00:00–23:59");
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── שעות מהבוט (שולה): הבקשה, הפורמטים, והפרסום בלי דפדפן ── */
{
  console.log("\nשעות מהבוט (שולה)");
  const a = wsrc.indexOf("const BOT_DAYS"), z = wsrc.indexOf("\n}\n", wsrc.indexOf("async function botHours(")) + 2;
  const mk = (deps) => new Function("fail", "hebrew", "fsGet", "fsPatch", "withMeta", "setFacebookHours", "setGoogleHours", "graph",
    wsrc.slice(a, z) + "\nreturn { botPlan, botHours, rollingWeek, rollingText };")(
    (c, m, s = 400) => Object.assign(new Error(m), { code: c, status: s }), (m) => m,
    deps.fsGet, deps.fsPatch, async (e) => e, deps.fb, deps.gb, deps.graph || (async () => ({ hours: deps.fbShown || {} })));
  let p = 0, f = 0; const ok = (m, c, x) => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${m}${x ? "  " + x : ""}`); };
  const throws = async (fn, code) => { try { await fn(); return false; } catch (e){ return e.code === code; } };

  // הסקר של 3.10.2026: שני עד חמישי אחר הצהריים, שישי בוקר, שבת בוקר ואחר הצהריים.
  const DAYS7 = [[], [["16:30","19:00"]], [["16:30","19:00"]], [["16:30","19:00"]], [["16:30","19:00"]],
    [["09:00","12:00"]], [["09:00","13:00"], ["16:00","19:00"]]];
  const { botPlan } = mk({});
  const plan = botPlan({ week: "2026-10-04", days: DAYS7 }, "2026-10-03");   // שבת → השבוע הבא
  ok("השבוע הבא מתקבל", plan.week === "2026-10-04" && plan.cur === "2026-09-27");
  ok("השבוע הנוכחי מתקבל", botPlan({ week: "2026-10-04", days: DAYS7 }, "2026-10-07").cur === "2026-10-04");
  ok("יום סגור הוא חריגה של סגור, לא היעדר חריגה", plan.override["0"].closed === true && plan.override["6"].ranges.length === 2);
  ok("שבוע רחוק נדחה", await throws(() => botPlan({ week: "2026-10-18", days: DAYS7 }, "2026-10-03"), "bad_request"));
  ok("תאריך שאינו יום ראשון נדחה", await throws(() => botPlan({ week: "2026-10-05", days: DAYS7 }, "2026-10-03"), "bad_request"));
  ok("שישה ימים נדחים", await throws(() => botPlan({ week: "2026-10-04", days: DAYS7.slice(1) }, "2026-10-03"), "bad_request"));
  const bad = (day) => throws(() => botPlan({ week: "2026-10-04", days: [day, [], [], [], [], [], []] }, "2026-10-03"), "bad_request");
  ok("סוף לפני התחלה נדחה", await bad([["19:00","16:30"]]));
  ok("שעה בלי אפס מוביל נדחית", await bad([["9:00","12:00"]]));
  ok("טווחים חופפים נדחים", await bad([["09:00","13:00"], ["12:00","19:00"]]));

  // הפורמטים חייבים להיות זהים למה שהאפליקציה עצמה כותבת: מריצים את הקוד האמיתי של shifts.js.
  const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const core = read("core.js"), shifts = read("shifts.js");
  const app = new Function("serverTimestamp", "S",
    (core.slice(core.indexOf("export const DAYS ="), core.indexOf("export const holidayOn"))
      + shifts.slice(shifts.indexOf("const parseRange"), shifts.indexOf("export const hoursDoc = ()"))).replace(/^export /gm, "")
    + "\nreturn { hoursByDayOf, hoursDocOf, fromYmd };")(() => "TS", {});
  const data = { hoursOverride: plan.override };
  const theirs = app.hoursDocOf(data, app.fromYmd("2026-10-04")); delete theirs.at;
  ok("מסמך השעות זהה למה ש-shifts.js כותב", JSON.stringify(theirs) === JSON.stringify(plan.doc), JSON.stringify(plan.doc.days));
  ok("החתימה זהה ל-sigOf, ולכן אפליקציה פתוחה לא תפרסם שוב", JSON.stringify(app.hoursByDayOf(data)) === plan.sig);

  // הפרסום עצמו, מול Firestore ומטא מזויפים.
  const run = async ({ env = {}, key = "k".repeat(40), docs = {}, fbFails = false, today } = {}) => {
    const writes = [], fbCalls = [];
    const { botHours } = mk({
      fsGet: async (_e, path) => docs[path] || null,
      fsPatch: async (_e, path, fields) => { writes.push({ path, fields }); return true; },
      fb: async (_e, b) => { fbCalls.push(b.hours); if (fbFails) throw Object.assign(new Error("x"), { code: "not_configured" }); return { ok: true }; },
      gb: async () => { throw Object.assign(new Error("x"), { code: "not_configured" }); },
    });
    const wk = (() => { const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
      const x = new Date(t + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - x.getUTCDay() + (today === "cur" ? 0 : 7)); return x.toISOString().slice(0, 10); })();
    // השבוע הנוכחי כבר פורסם (המצב הרגיל), אלא אם הבדיקה אומרת אחרת.
    const curWk = (() => { const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
      const x = new Date(t + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.toISOString().slice(0, 10); })();
    if (!("public/hours" in docs)) docs["public/hours"] = { weeks: { [curWk]: DAYS7.map(d => d.map(r => r.join("–")).join(", ")) } };
    const req = new Request("https://x/hours/bot", { method: "POST", headers: { "x-bot-key": key }, body: JSON.stringify({ week: wk, days: DAYS7 }) });
    let res = null, err = null;
    try { res = await botHours({ BOT_KEY: "k".repeat(40), FIREBASE_SA: "{}", ...env }, req); } catch (e){ err = e; }
    return { res, err, writes, fbCalls, wk };
  };
  const good = await run();
  const page = good.writes.find(w => w.path === "public/hours"), week = good.writes.find(w => w.path === "weeks/w" + good.wk);
  ok("מפרסם לדף הנחיתה, לפי שבוע", !!page && page.fields.weeks[good.wk][6] === "09:00–13:00, 16:00–19:00" && page.fields.from === good.wk);
  ok("days הוא שבע מחרוזות, לא מערך בתוך מערך", page.fields.days.length === 7 && page.fields.days.every(x => typeof x === "string"));
  ok("מעדכן את פייסבוק, בלי ימים סגורים", good.fbCalls.length === 1 && !("sun" in good.fbCalls[0]) && good.fbCalls[0].sat.length === 2);
  ok("רושם חריגה, חתימה ושיגור על מסמך השבוע", !!week && week.fields.sync.sig === plan.sig && week.fields.sync.page === "ok"
    && week.fields.sync.facebook === "ok" && week.fields.launchedAt instanceof Date && week.fields.phase === "availability");
  ok("גוגל נשארת ידנית, והטקסט המוכן חוזר", good.res.google === "manual" && /שעות העגלה/.test(good.res.text) && !week.fields.googleAt);
  const noCur = await run({ docs: { "public/hours": null } });
  ok("השבוע הנוכחי לא פורסם: הדף מתעדכן, פייסבוק לא נדרס", noCur.res.page === "ok" && noCur.res.facebook === "skip" && noCur.fbCalls.length === 0);
  const nofb = await run({ fbFails: true });
  ok("פייסבוק לא מחובר: הדף עדיין מתעדכן והסיבה חוזרת", nofb.res.page === "ok" && /לא מחובר/.test(nofb.res.facebook));
  // החלון המתגלגל: ביום חמישי, אחרי פרסום של השבוע הבא, חמישי–שבת עדיין של השבוע הנוכחי.
  {
    const { rollingWeek, rollingText } = mk({});
    const CUR = ["", "08:00–12:00", "08:00–12:00", "08:00–12:00", "08:00–12:00", "07:00–11:00", "09:00–13:00, 16:00–19:00"];
    const NXT = ["10:00–14:00", "16:30–19:00", "16:30–19:00", "16:30–19:00", "16:30–19:00", "09:00–12:00", ""];
    const thu = rollingWeek({ "2026-10-04": CUR, "2026-10-11": NXT }, "2026-10-08");   // חמישי
    ok("חמישי, שישי ושבת נשארים של השבוע הנוכחי", JSON.stringify(thu.pairs[4]) === '[["08:00","12:00"]]' && thu.pairs[5][0][0] === "07:00" && thu.pairs[6].length === 2);
    ok("ראשון עד רביעי כבר של השבוע הבא", thu.pairs[0][0][0] === "10:00" && thu.pairs[1][0][0] === "16:30" && thu.unknown.length === 0);
    const noNext = rollingWeek({ "2026-10-04": CUR }, "2026-10-08");
    ok("שבוע הבא לא פורסם: אותו יום מהשבוע הנוכחי, ומסומן", noNext.complete && noNext.unknown.join() === "0,1,2,3" && noNext.pairs[1][0][0] === "08:00");
    ok("השבוע הנוכחי לא פורסם: לא שלם, ופייסבוק לא נוגעים", !rollingWeek({ "2026-10-11": NXT }, "2026-10-08").complete);
    const txt = rollingText(noNext);
    ok("הטקסט לגוגל מתחיל היום, עם תאריכים, ואומר מה עוד לא פורסם", /^☕ שעות העגלה · 7 הימים הקרובים\n\nחמישי 8\.10: 08:00–12:00/.test(txt) && /ראשון 11\.10: סגור \(השבוע הזה עוד לא פורסם\)/.test(txt), txt.split("\n")[2]);
    const sat = rollingWeek({ "2026-10-04": CUR, "2026-10-11": NXT }, "2026-10-10");   // שבת
    ok("בשבת רק השבת עצמה של השבוע הנוכחי", sat.pairs[6].length === 2 && sat.pairs[5][0][0] === "09:00");
  }
  const thuRun = await run({ today: "cur" });
  ok("פרסום של השבוע הנוכחי מעדכן את פייסבוק בחלון המתגלגל", thuRun.res.facebook === "ok" && thuRun.fbCalls.length === 1 && thuRun.res.page === "ok");
  ok("קריאה חוזרת מהדף ומפייסבוק מדווחת", typeof thuRun.res.pageCheck === "string" && typeof thuRun.res.facebookCheck === "string");
  ok("שלושה טווחים ביום נדחים (פייסבוק וגוגל מחזיקים שניים)", await bad([["08:00","10:00"], ["11:00","13:00"], ["16:00","19:00"]]));
  const recFails = await (async () => { const writes = []; const { botHours } = mk({
      fsGet: async () => null,
      fsPatch: async (_e, path, fields) => { if (path.startsWith("weeks/")) throw new Error("boom"); writes.push(path); return true; },
      fb: async () => ({ ok: true, hours: {} }), gb: async () => { throw Object.assign(new Error("x"), { code: "not_configured" }); } });
    const wk = good.wk;
    return botHours({ BOT_KEY: "k".repeat(40), FIREBASE_SA: "{}" }, new Request("https://x/hours/bot", { method: "POST", headers: { "x-bot-key": "k".repeat(40) }, body: JSON.stringify({ week: wk, days: DAYS7 }) })); })();
  ok("רישום על מסמך השבוע שנכשל לא מסתיר שהשעות כבר יצאו", recFails.ok === true && recFails.page === "ok" && /boom/.test(recFails.record));
  const wrong = await run({ key: "nope" });
  ok("מפתח שגוי: 403 ושום כתיבה", wrong.err && wrong.err.status === 403 && wrong.writes.length === 0 && wrong.fbCalls.length === 0);
  const unset = await run({ env: { BOT_KEY: "" }, key: "" });
  ok("בלי BOT_KEY בשרת: סגור, גם למפתח ריק", unset.err && unset.err.code === "not_configured" && unset.writes.length === 0);
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/hours/bot"') > 0 && wsrc.indexOf('"/hours/bot"') < wsrc.indexOf("await requireUser(request, env)"));
  ok("רענון הלילה נבדק לפני אימות המשתמש", wsrc.indexOf('"/hours/refresh"') > 0 && wsrc.indexOf('"/hours/refresh"') < wsrc.indexOf("await requireUser(request, env)"));
  ok("האפליקציה כבר לא מפרסמת שעות בעצמה, וה-410 נבדק לפני אימות המשתמש",
    /"\/hours\/google"\)\s*throw fail\("moved"/.test(wsrc) && wsrc.indexOf('"/hours/google"') < wsrc.indexOf("await requireUser(request, env)"));
  const fsBlock = wsrc.slice(wsrc.indexOf("function toFs(v){"), wsrc.indexOf("function fromFs("));
  const toFs = new Function(fsBlock + "\nreturn toFs;")();
  ok("תאריך נכתב כ-timestamp ולא כמפה ריקה", toFs(new Date("2026-10-03T11:00:00Z")).timestampValue === "2026-10-03T11:00:00.000Z");
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── הצוות לבוט: שמות וטלפונים, רק במפתח של הבוט ── */
{
  console.log("\nהצוות לבוט");
  let p = 0, f = 0; const ok = (m, c, x) => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${m}${x ? "  " + x : ""}`); };
  const a = wsrc.indexOf("async function botTeam("), z = wsrc.indexOf("\n}\n", a) + 2;
  const auth = (env, req) => { if (req.headers.get("x-bot-key") !== env.BOT_KEY) throw Object.assign(new Error("x"), { status: 403 }); };
  let listed = 0;
  const botTeam = new Function("botAuth", "fsList", wsrc.slice(a, z) + "\nreturn botTeam;")(auth, async (_e, col) => (listed++, col === "roster" ? [
    { name: " נגה ", phone: "054-312-0000", active: true }, { name: "אורי", phone: "" }, { name: "עזב", phone: "0501111111", active: false }, { phone: "0502222222" }] : []));
  const req = (key) => new Request("https://x/team/bot", { method: "POST", headers: { "x-bot-key": key } });
  const out = await botTeam({ BOT_KEY: "k" }, req("k"));
  ok("פעילים בלבד, שם מנוקה וטלפון בספרות", JSON.stringify(out.team) === JSON.stringify([{ name: "נגה", phone: "0543120000" }, { name: "אורי", phone: "" }]), JSON.stringify(out.team));
  let denied = false; try { await botTeam({ BOT_KEY: "k" }, req("nope")); } catch (e){ denied = e.status === 403; }
  ok("מפתח שגוי: נדחה בלי לקרוא את הרשימה", denied && listed === 1);
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/team/bot"') > 0 && wsrc.indexOf('"/team/bot"') < wsrc.indexOf("await requireUser(request, env)"));
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── פוסט מהבוט ── */
{
  console.log("\nפוסט מהבוט");
  let p = 0, f = 0; const ok = (m, c, x) => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${m}${x ? "  " + x : ""}`); };
  const a = wsrc.indexOf("async function botPost("), z = wsrc.indexOf("\n}\n", a) + 2;
  const writes = [], sched = [];
  const auth = (env, req) => { if (req.headers.get("x-bot-key") !== env.BOT_KEY) throw Object.assign(new Error("x"), { status: 403 }); };
  const botPost = new Function("botAuth", "withMeta", "publishState", "fsPatch", "schedulePost", wsrc.slice(a, z) + "\nreturn botPost;")(
    auth, async (e) => ({ ...e, FB_PAGE_ID: "1" }), async (e) => ({ facebook: !!e.FB_PAGE_ID, instagram: false }),
    async (_e, path, fields) => { writes.push([path, fields]); }, async (_e, b) => { sched.push(b); return { fbPostId: "1_2", igSkipped: "x" }; });
  const req = (body, key = "k") => new Request("https://x/post/bot", { method: "POST", headers: { "x-bot-key": key }, body: JSON.stringify(body) });
  const st = await botPost({ BOT_KEY: "k" }, req({ check: true }));
  ok("check: רק מה מחובר, בלי לפרסם", st.facebook === true && st.instagram === false && !writes.length && !sched.length);
  const at = Date.parse("2026-10-09T05:00:00Z");
  const out = await botPost({ BOT_KEY: "k" }, req({ text: "בוקר בשניר", image: "data:image/jpeg;base64,AQID", at }));
  ok("מסמך הפוסט נכתב לפני הפרסום, עם התאריך בשעון ישראל", writes.length === 1 && /^posts\/b/.test(writes[0][0]) && writes[0][1].date === "2026-10-09" && writes[0][1].time === "08:00" && writes[0][1].source === "bot", JSON.stringify(writes[0]));
  ok("הפרסום מקבל את אותו מזהה, טקסט, תמונה וזמן", sched[0].postId === writes[0][0].slice(6) && sched[0].text === "בוקר בשניר" && sched[0].image === "data:image/jpeg;base64,AQID" && sched[0].at === at && out.fbPostId === "1_2");
  let denied = false; try { await botPost({ BOT_KEY: "k" }, req({ text: "x" }, "nope")); } catch (e){ denied = e.status === 403; }
  ok("מפתח שגוי: נדחה בלי לכתוב", denied && writes.length === 1);
  const failing = new Function("botAuth", "withMeta", "publishState", "fsPatch", "schedulePost", wsrc.slice(a, z) + "\nreturn botPost;")(
    auth, async (e) => e, async () => ({}), async (_e, path, fields) => { writes.push([path, fields]); }, async () => { throw new Error("meta said no"); });
  let thrown = ""; try { await failing({ BOT_KEY: "k" }, req({ text: "x", at })); } catch (e){ thrown = e.message; }
  ok("פרסום שנכשל: השגיאה עולה, והמסמך מסומן מבוטל ולא נשאר מוכן", thrown === "meta said no" && writes.at(-1)[1].status === "cancelled" && writes.at(-2)[1].status === "ready", JSON.stringify(writes.slice(-2)));
  const lister = new Function("botAuth", "withMeta", "publishState", "fsPatch", "schedulePost", "fsQuery", "postInsights", "fail", wsrc.slice(a, z) + "\nreturn botPost;")(
    auth, async (e) => e, async () => ({}), async () => {}, async () => {},
    async (_e, col, wh) => (col === "posts" && wh[0][2] === "2026-10-11" && wh[1][2] === "2026-10-17" ? [
      { id: "b", fields: { date: "2026-10-16", time: "08:00", status: "scheduled", text: "שישי", fbPostId: "1_2" } },
      { id: "a", fields: { date: "2026-10-11", time: "10:00", status: "done", text: "ראשון", igPostId: "9" } },
      { id: "c", fields: { date: "2026-10-13", status: "cancelled", text: "בוטל" } }, { id: "d", fields: { date: "2026-10-15", status: "ready", text: "לא תוזמן" } }] : []),
    async (_e, b) => ({ posts: b.posts.map(x => ({ id: x.id, reach: x.id === "a" ? 120 : 40, likes: 3, saves: 1 })) }),
    (c, m) => Object.assign(new Error(m), { code: c }));
  const wk = await lister({ BOT_KEY: "k" }, req({ from: "2026-10-11", to: "2026-10-17" }));
  ok("רשימת השבוע: רק מה שתוזמן או יצא, לפי סדר, בלי מספרים", JSON.stringify(wk.posts.map(x => [x.id, x.date, x.reach])) === JSON.stringify([["a", "2026-10-11", undefined], ["b", "2026-10-16", undefined]]), JSON.stringify(wk.posts));
  const st2 = await lister({ BOT_KEY: "k" }, req({ from: "2026-10-11", to: "2026-10-17", stats: true }));
  ok("stats: המספרים ממטא לכל פוסט", st2.posts[0].reach === 120 && st2.posts[1].reach === 40);
  let bad = ""; try { await lister({ BOT_KEY: "k" }, req({ from: "../x" })); } catch (e){ bad = e.code; }
  ok("תאריך לא תקין נדחה", bad === "bad_request");
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/post/bot"') > 0 && wsrc.indexOf('"/post/bot"') < wsrc.indexOf("await requireUser(request, env)"));
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── גוגל לפי תאריך (specialHours), עם בדיקה בלי כתיבה ── */
{
  console.log("\nגוגל לפי תאריך");
  let p = 0, f = 0; const ok = (m, c, x) => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${m}${x ? "  " + x : ""}`); };
  const a = wsrc.indexOf("const GB_API"), z = wsrc.indexOf("\n}\n", wsrc.indexOf("async function setGoogleHours(")) + 2;
  const helpers = wsrc.slice(wsrc.indexOf("const plusDays ="), wsrc.indexOf("\n", wsrc.indexOf("const sundayOfYmd =")));
  const calls = [];
  let shown = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push([init.method || "GET", String(url), typeof init.body === "string" ? JSON.parse(init.body) : null]);
    if (String(url).includes("oauth2")) return Response.json({ access_token: "t", expires_in: 3600 });
    if (init.method === "PATCH") { shown = JSON.parse(init.body).specialHours.specialHourPeriods; return Response.json({}); }
    return Response.json({ specialHours: { specialHourPeriods: shown } });
  };
  const g = new Function("fail", "hebrew", "fetch", helpers + "\n" + wsrc.slice(a, z) + "\nreturn { setGoogleHours, googleDates, specialPeriods };")(
    (c, m, s) => Object.assign(new Error(m), { code: c, status: s }), (m) => m, fakeFetch);
  const GB = { GB_LOCATION: "locations/1", GB_CLIENT_ID: "c", GB_CLIENT_SECRET: "s", GB_REFRESH_TOKEN: "r" };
  // חמישי 8.10: השבוע הנוכחי פורסם, הבא עוד לא
  const weeks = { "2026-10-04": ["", "16:30–19:00", "16:30–19:00", "16:30–19:00", "16:30–19:00", "09:00–12:00", "09:00–13:00, 16:00–19:00"] };
  const days = g.googleDates(weeks, "2026-10-08");
  ok("רק ימים שפורסמו, מהיום קדימה", JSON.stringify(days.map(x => x.date)) === JSON.stringify(["2026-10-08", "2026-10-09", "2026-10-10"]), JSON.stringify(days.map(x => x.date)));
  const per = g.specialPeriods(days);
  ok("שבת עם שני טווחים = שתי תקופות באותו תאריך", per.filter(x => x.startDate.day === 10).length === 2 && per.find(x => x.startDate.day === 10).openTime.hours === 9);
  ok("יום סגור = closed", JSON.stringify(g.specialPeriods([{ date: "2026-10-11", ranges: [] }])) === JSON.stringify([{ startDate: { year: 2026, month: 10, day: 11 }, endDate: { year: 2026, month: 10, day: 11 }, closed: true }]));

  // בלי GB_LIVE: קוראים בלבד, ומחזירים מה ישתנה
  shown = [{ startDate: { year: 2026, month: 10, day: 10 }, endDate: { year: 2026, month: 10, day: 10 }, openTime: { hours: 16 }, closeTime: { hours: 19 } },
    { startDate: { year: 2026, month: 12, day: 25 }, endDate: { year: 2026, month: 12, day: 25 }, closed: true },
    { startDate: { year: 2026, month: 10, day: 1 }, endDate: { year: 2026, month: 10, day: 1 }, closed: true }];
  const dry = await g.setGoogleHours(GB, { weeks, today: "2026-10-08" });
  ok("בדיקה בלי כתיבה: אין PATCH", dry.dry === true && !calls.some(c => c[0] === "PATCH"));
  ok("ומה ישתנה, יום יום", /08\.10: עכשיו לפי השעות הקבועות → 16:30–19:00/.test(dry.text) && /10\.10: עכשיו 16:00–19:00 → 09:00–13:00, 16:00–19:00/.test(dry.text), dry.text);

  // GB_LIVE=1: כותבים את החלון, שומרים חג עתידי, מוחקים עבר, וקוראים חזרה
  const live = await g.setGoogleHours({ ...GB, GB_LIVE: "1" }, { weeks, today: "2026-10-08" });
  const patch = calls.find(c => c[0] === "PATCH");
  ok("רק specialHours, לא השעות הקבועות", /updateMask=specialHours$/.test(patch[1]) && !("regularHours" in patch[2]));
  const sent = patch[2].specialHours.specialHourPeriods.map(x => `${x.startDate.month}/${x.startDate.day}`);
  ok("החג ב-25.12 נשאר, 1.10 שעבר ירד", sent.includes("12/25") && !sent.includes("10/1") && sent.filter(x => x === "10/10").length === 2, sent.join(" "));
  ok("קריאה חוזרת תואמת", live.check === "ok" && live.days === 3);
  shown = []; // גוגל "בלע" את העדכון
  const g2 = new Function("fail", "hebrew", "fetch", helpers + "\n" + wsrc.slice(a, z) + "\nreturn { setGoogleHours };")((c, m) => Object.assign(new Error(m), { code: c }), (m) => m,
    async (url, init = {}) => (String(url).includes("oauth2") ? Response.json({ access_token: "t" }) : init.method === "PATCH" ? Response.json({}) : Response.json({ specialHours: { specialHourPeriods: [] } })));
  const bad = await g2.setGoogleHours({ ...GB, GB_LIVE: "1" }, { weeks, today: "2026-10-08" });
  ok("קריאה חוזרת לא תואמת → נאמר במפורש", /גוגל מציג שעות אחרות ב-2026-10-08/.test(bad.check), bad.check);
  let nc = ""; try { await g.setGoogleHours({}, { weeks, today: "2026-10-08" }); } catch (e){ nc = e.code; }
  ok("בלי המשתנים: not_configured (הבוט שולח טקסט להדבקה)", nc === "not_configured");
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── מקצה לקצה: כל השרת כמודול, עם fetch מזויף לגוגל, ל-Firestore ולמטא ── */
{
  console.log("\nמקצה לקצה (fetch מזויף)");
  let p = 0, f = 0; const ok = (m, c, x) => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${m}${x ? "  " + x : ""}`); };
  const { subtle } = crypto;
  const kp = await subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await subtle.exportKey("jwk", kp.publicKey)), kid: "k1" };
  const b64 = (x) => Buffer.from(x).toString("base64url");
  const tok = async (kid = "k1") => {
    const now = Math.floor(Date.now() / 1000), h = b64(JSON.stringify({ alg: "RS256", kid }));
    const pl = b64(JSON.stringify({ aud: "proj", iss: "https://securetoken.google.com/proj", exp: now + 3600, iat: now, sub: "u1",
      email: "cortado.snir@gmail.com", email_verified: true, firebase: { sign_in_provider: "google.com" } }));
    return `${h}.${pl}.${b64(await subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(h + "." + pl)))}`;
  };
  const pem = "-----BEGIN PRIVATE KEY-----\n" + Buffer.from(await subtle.exportKey("pkcs8", kp.privateKey)).toString("base64") + "\n-----END PRIVATE KEY-----";
  const env = { FIREBASE_PROJECT_ID: "proj", FIREBASE_SA: JSON.stringify({ client_email: "sa@proj.iam.gserviceaccount.com", private_key: pem }),
    FB_PAGE_ID: "111", FB_PAGE_TOKEN: "T", IG_USER_ID: "222", BOT_KEY: "k".repeat(40) };
  const toFs = new Function(wsrc.slice(wsrc.indexOf("function toFs(v){"), wsrc.indexOf("function fromFs(")) + "\nreturn toFs;")();

  // Firestore מזויף: updateTime מתקדם בכל כתיבה, ו-currentDocument נאכף כמו באמיתי.
  const db = {}, hook = {}, graphCalls = [], fsPatches = [], fbHours = [];
  let ver = 0, jwks = 0;
  const put = (path, obj) => { db[path] = { fields: { ...(db[path]?.fields || {}), ...Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFs(v)])) }, t: `2026-10-07T00:00:00.${String(++ver).padStart(6, "0")}Z` }; };
  const val = (path, k) => { const x = db[path]?.fields[k]; return x && (x.stringValue ?? x.booleanValue ?? (x.integerValue != null ? +x.integerValue : x.arrayValue ? x.arrayValue.values : x.mapValue)); };
  const fsDoc = (path) => ({ name: "projects/proj/databases/(default)/documents/" + path, fields: db[path].fields, updateTime: db[path].t });
  async function firestore(url, o){
    const path = decodeURIComponent(url.pathname.split("/documents/")[1] || "");
    if (url.pathname.endsWith(":runQuery"))
      return Response.json(Object.keys(db).filter(k => k.startsWith("posts/") && db[k].fields.igPending?.booleanValue === true).map(k => ({ document: fsDoc(k) })));
    if ((o.method || "GET") === "GET"){ if (hook.get) await hook.get(path); }
    if ((o.method || "GET") === "GET") return db[path] ? Response.json(fsDoc(path)) : new Response("{}", { status: 404 });
    fsPatches.push(path + url.search);
    if (hook.patch){ const r = await hook.patch(path, url); if (r) return r; }
    const pre = url.searchParams.get("currentDocument.updateTime"), none = url.searchParams.get("currentDocument.exists") === "false";
    if ((pre && db[path]?.t !== pre) || (none && db[path]))
      return Response.json({ error: { code: 400, status: "FAILED_PRECONDITION", message: "the stored version does not match the required base version" } }, { status: 400 });
    db[path] = { fields: { ...(db[path]?.fields || {}), ...JSON.parse(o.body).fields }, t: `2026-10-07T00:00:00.${String(++ver).padStart(6, "0")}Z` };
    return Response.json(fsDoc(path));
  }
  async function graphApi(url, o){
    const path = url.pathname.replace(/^\/v[\d.]+\//, ""), m = o.method || "GET";
    graphCalls.push(`${m} ${path}${url.searchParams.get("metric") ? "?" + url.searchParams.get("metric") : ""}`);
    if (m === "POST" && path === "111") fbHours.push(JSON.parse(new URLSearchParams(o.body).get("hours")));
    if (hook.graph){ const r = await hook.graph(path, url, m); if (r) return r; }
    if (path.endsWith("/photos")) return Response.json({ id: "333", post_id: "111_444" });
    if (url.searchParams.get("fields") === "images") return Response.json({ images: [{ width: 1, source: "https://x/i.jpg" }] });
    if (path.endsWith("/media")) return Response.json({ id: "C1" });
    if (path.endsWith("/media_publish")) return Response.json({ id: "IG" + graphCalls.length });
    return Response.json({ id: "1", success: true });
  }
  const realFetch = globalThis.fetch, realErr = console.error, realNow = Date.now, logged = [];
  globalThis.fetch = async (u, o = {}) => {
    const url = new URL(String(u));
    if (url.pathname.includes("jwk/securetoken")){ jwks++; return Response.json({ keys: [jwk] }); }
    if (url.host === "oauth2.googleapis.com") return Response.json({ access_token: "sa", expires_in: 3600 });
    if (url.host === "firestore.googleapis.com") return firestore(url, o);
    if (url.host === "graph.facebook.com") return graphApi(url, o);
    throw new Error("unexpected fetch " + u);
  };
  console.error = (...a) => logged.push(a.join(" "));
  try {
    const W = (await import("data:text/javascript," + encodeURIComponent(wsrc + "\n//e2e"))).default;
    const call = async (path, body, headers = {}, e = env) => {
      const r = await W.fetch(new Request("https://w" + path, { method: body ? "POST" : "GET",
        headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }), e);
      return { status: r.status, body: await r.json() };
    };
    const auth = { authorization: "Bearer " + await tok() };
    const cron = async () => { let job; W.scheduled({}, env, { waitUntil: (x) => { job = x; } }); await job; };
    const igPublishes = () => graphCalls.filter(c => c.endsWith("/media_publish")).length;

    // 3. נתיבי השעות הישנים: 410 גם בלי כניסה
    ok("‏/hours/facebook בלי טוקן → 410, לא 401", (await call("/hours/facebook", {})).status === 410);
    ok("‏/hours/google בלי טוקן → 410", (await call("/hours/google", {})).status === 410);

    // 4. טוקן משובש → 401, לא 500
    const bad1 = await call("/publish/state", null, { authorization: "Bearer a.b.c" });
    const bad2 = await call("/publish/state", null, { authorization: "Bearer " + b64("null") + "." + b64("null") + ".x" });
    const bad3 = await call("/publish/state", null, { authorization: "Bearer " + (await tok()).replace(/\.[^.]+$/, ".!!!") });
    ok("טוקן משובש → 401 unauthenticated", [bad1, bad2, bad3].every(r => r.status === 401 && r.body.error === "unauthenticated"), [bad1, bad2, bad3].map(r => r.status).join(","));

    // 5. kid לא מוכר לא מושך את רשימת המפתחות בכל בקשה
    ok("טוקן תקין עובר", (await call("/publish/state", null, auth)).status === 200);
    const j0 = jwks;
    for (let i = 0; i < 5; i++) await call("/publish/state", null, { authorization: "Bearer " + await tok("bogus" + i) });
    ok("חמישה kid מומצאים בתוך דקה → אף רענון", jwks === j0, String(jwks - j0));
    Date.now = () => realNow() + 61e3;
    const r5 = await call("/publish/state", null, { authorization: "Bearer " + await tok("bogus") });
    await call("/publish/state", null, { authorization: "Bearer " + await tok("bogus2") });
    Date.now = realNow;
    ok("אחרי דקה → רענון אחד, ועדיין 401", jwks === j0 + 1 && r5.status === 401, String(jwks - j0));

    // 2. ביטול: הזמן והמזהים מהמסמך, לא מהבקשה
    const future = Date.now() + 3600e3;
    put("posts/p1", { publishAt: future, fbPostId: "111_222", fbPhotoId: "333", igPending: true });
    graphCalls.length = 0;
    const c1 = await call("/publish/cancel", { postId: "p1", at: future, fbPostId: "111_999", fbPhotoId: "111/subscribed_apps" }, auth);
    ok("מוחק רק את מה שבמסמך", c1.status === 200 && JSON.stringify(graphCalls) === JSON.stringify(["DELETE 111_222", "DELETE 333"]), JSON.stringify(graphCalls));
    ok("והתור של אינסטגרם נסגר", val("posts/p1", "igPending") === false && val("posts/p1", "status") === "cancelled");
    put("posts/p2", { publishAt: Date.now() - 60e3, fbPostId: "111_5" });
    graphCalls.length = 0;
    const c2 = await call("/publish/cancel", { postId: "p2", at: future, fbPostId: "111_5" }, auth);
    ok("פוסט שכבר עלה לא נמחק, גם כשהבקשה טוענת זמן עתידי", c2.status === 400 && !graphCalls.length);
    const c3 = await call("/publish/cancel", { postId: "nope", at: future, fbPostId: "111_5" }, auth);
    ok("פוסט שלא בתור → 404 בלי מחיקה", c3.status === 404 && !graphCalls.length);
    const { FIREBASE_SA, ...noSa } = env;
    const c4 = await call("/publish/cancel", { postId: "p9", at: future, fbPostId: "111_7", fbPhotoId: "111/subscribed_apps" }, auth, noSa);
    ok("בלי חשבון שירות: רק מזהים בצורה של Graph", c4.status === 200 && JSON.stringify(graphCalls) === JSON.stringify(["DELETE 111_7"]), JSON.stringify(graphCalls));

    // 6. השגיאה הגולמית של Firestore הולכת ללוג, לא למשתמש
    hook.patch = (path) => path === "posts/leak" && new Response("projects/proj/databases/(default)/documents/posts/leak PERMISSION_DENIED sa@proj.iam.gserviceaccount.com", { status: 403 });
    const leak = await call("/publish/schedule", { postId: "leak", text: "שלום" }, auth);
    hook.patch = null;
    ok("כתיבה שנכשלה: הודעה כללית, בלי נתיב ובלי חשבון השירות", leak.status === 200 && leak.body.saveError && !/iam|projects\/|PERMISSION/.test(JSON.stringify(leak.body)), leak.body.saveError);
    ok("והטקסט הגולמי נרשם בלוג", logged.some(l => /iam\.gserviceaccount/.test(l)));
    hook.graph = (path, url) => url.searchParams.get("fields") === "name" && Response.json({ error: { message: "Unsupported get request. Object with ID '111' does not exist" } }, { status: 400 });
    const st = await call("/status", null, auth);
    hook.graph = null;
    ok("‏/status: שגיאת פייסבוק בעברית", /[֐-׿]/.test(st.body.facebookError) && !/Object with ID/.test(st.body.facebookError), st.body.facebookError);

    // 7. פרסום מיידי: אינסטגרם לא מוכן → לתור, ופייסבוק לא עולה שוב
    const img = "data:image/jpeg;base64,AQID";
    graphCalls.length = 0;
    hook.graph = (path) => path.endsWith("/media_publish") && Response.json({ error: { code: 9007, message: "Media ID is not available" } }, { status: 400 });
    const now7 = await call("/publish/schedule", { postId: "p7", text: "בוקר", image: img }, auth);
    hook.graph = null;
    ok("נכשל באינסטגרם → igPending, והסיבה נשמרת", now7.body.igPending === true && !!now7.body.igError && val("posts/p7", "igPending") === true && val("posts/p7", "publishAt") <= Date.now(), JSON.stringify(now7.body));
    await cron();
    ok("הקרון מפרסם לאינסטגרם בלבד", !!val("posts/p7", "igPostId") && val("posts/p7", "igPending") === false
      && graphCalls.filter(c => c.endsWith("/photos") || c.endsWith("/feed")).length === 1, JSON.stringify(graphCalls));
    hook.graph = (path) => path.endsWith("/media_publish") && Response.json({ error: { code: 1, message: "An unknown error occurred" } }, { status: 500 });
    const other = await call("/publish/schedule", { postId: "p8", text: "ערב", image: img }, auth);
    hook.graph = (path) => path.endsWith("/media_publish") && Response.json({ error: { code: 100, error_subcode: 2207027, message: "Media is not ready" } }, { status: 400 });
    const sub = await call("/publish/schedule", { postId: "p6", text: "צהריים", image: img }, auth);
    hook.graph = null;
    ok("שגיאה אחרת (אולי אחרי שעלה) → מוצגת, בלי ניסיון חוזר", other.body.igPending === false && !!other.body.igError && val("posts/p8", "igPending") === false);
    ok("error_subcode 2207027 (לא מוכן) → לתור", sub.body.igPending === true && val("posts/p6", "igPending") === true);
    delete db["posts/p6"];

    // 1. הקרון: יצא לאינסטגרם → לא חוזר לתור, ומסמך אחד לא עוצר את השאר
    for (const k of Object.keys(db)) if (k.startsWith("posts/")) delete db[k];
    const claim = (url) => url.search.includes("currentDocument.updateTime");
    put("posts/A", { igPending: true, publishAt: 1000, fbPhotoId: "55", text: "א" });
    hook.patch = (path, url) => path === "posts/A" && !claim(url) && new Response("unavailable", { status: 503 });
    graphCalls.length = 0;
    await cron(); await cron();
    hook.patch = null;
    ok("נתפס לפני הפרסום: גם כששני הרישומים אחריו נכשלו, לא עולה שוב", igPublishes() === 1 && val("posts/A", "igPending") === false && !!db["posts/A"].fields.igClaimedAt?.timestampValue, String(igPublishes()));
    ok("התפיסה היא כתיבה מותנית", fsPatches.some(x => x.startsWith("posts/A") && x.includes("igClaimedAt") && x.includes("currentDocument.updateTime")));
    put("posts/E", { igPending: true, publishAt: 1000, fbPhotoId: "58", text: "ה" });
    put("posts/F", { igPending: true, publishAt: 1000, fbPhotoId: "59", text: "ו" });
    graphCalls.length = 0;
    await Promise.all([cron(), cron()]);
    ok("שני קרונים חופפים: כל פוסט עולה פעם אחת", igPublishes() === 2 && !!val("posts/E", "igPostId") && !!val("posts/F", "igPostId"), String(igPublishes()));
    put("posts/B", { igPending: true, publishAt: 1000, fbPhotoId: "56", text: "ב" });
    put("posts/C", { igPending: true, publishAt: 1000, fbPhotoId: "57", text: "ג" });
    put("posts/D", { igPending: true, publishAt: 1000, fbPhotoId: "me?fields=access_token", text: "ד" });
    hook.graph = (path) => path === "56" && Response.json({ error: { message: "boom" } }, { status: 500 });
    hook.patch = (path, url) => path === "posts/B" && !claim(url) && new Response("down", { status: 503 });
    graphCalls.length = 0;
    await cron();
    hook.graph = hook.patch = null;
    ok("מסמך שנכשל גם ברישום לא עוצר את התור", !!val("posts/C", "igPostId") && val("posts/C", "igPending") === false);
    ok("fbPhotoId שאינו מזהה לא נכנס לנתיב של Graph", !graphCalls.some(c => / me/.test(c)) && val("posts/D", "igTries") === 1, JSON.stringify(graphCalls));

    // 8. חשיפה בפייסבוק: המדד החדש, והישן כגיבוי
    hook.graph = (path, url) => path.endsWith("/insights") && (url.searchParams.get("metric") === "post_total_media_view_unique"
      ? Response.json({ data: [{ name: "post_total_media_view_unique", values: [{ value: 77 }] }] }) : Response.json({ error: { message: "(#100) invalid metric" } }, { status: 400 }));
    const in1 = await call("/insights/posts", { posts: [{ id: "p1", fbPostId: "111_444" }] }, auth);
    ok("post_total_media_view_unique נספר", in1.body.posts[0].reach === 77, JSON.stringify(in1.body.posts[0]));
    hook.graph = (path, url) => path.endsWith("/insights") && (url.searchParams.get("metric") === "post_impressions_unique"
      ? Response.json({ data: [{ name: "post_impressions_unique", values: [{ value: 5 }] }] }) : Response.json({ error: { message: "(#100) invalid metric" } }, { status: 400 }));
    logged.length = 0;
    const in2 = await call("/insights/posts", { posts: [{ id: "p1", fbPostId: "111_444" }] }, auth);
    hook.graph = null;
    ok("המדד החדש נדחה → הישן, והכישלון נרשם בלוג", in2.body.posts[0].reach === 5 && logged.some(l => /fb insights post_total_media_view_unique/.test(l)));

    // 9. שני פרסומי שעות במקביל: כתיבה מותנית, ומיזוג מחדש כשמישהו כתב בינתיים
    const ymdIL = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const sun = (() => { const x = new Date(ymdIL() + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.toISOString().slice(0, 10); })();
    const next = (() => { const x = new Date(sun + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 7); return x.toISOString().slice(0, 10); })();
    const D7 = [[], [["16:30", "19:00"]], [["16:30", "19:00"]], [["16:30", "19:00"]], [["16:30", "19:00"]], [["09:00", "12:00"]], [["09:00", "13:00"], ["16:00", "19:00"]]];
    const NEXT = ["", "08:00–12:00", "08:00–12:00", "08:00–12:00", "08:00–12:00", "07:00–11:00", ""];
    const bot = () => call("/hours/bot", { week: sun, days: D7 }, { "x-bot-key": env.BOT_KEY });
    put("public/hours", { weeks: { [sun]: ["", "", "", "", "", "", ""] }, from: sun });
    let raced = 0;
    hook.patch = (path) => { if (path === "public/hours" && !raced++) put("public/hours", { weeks: { [sun]: ["", "", "", "", "", "", ""], [next]: NEXT } }); };
    fsPatches.length = 0;
    const h1 = await bot();
    hook.patch = null;
    const weeks = val("public/hours", "weeks").fields;
    ok("הכתיבה לדף מותנית ב-updateTime", fsPatches.some(x => x.startsWith("public/hours") && x.includes("currentDocument.updateTime")), fsPatches.find(x => x.startsWith("public/hours")));
    ok("כתיבה מקבילה נדחתה, נקראה מחדש, ושני השבועות נשמרו", h1.body.page === "ok" && h1.body.pageCheck === "ok"
      && weeks[next].arrayValue.values[1].stringValue === "08:00–12:00" && weeks[sun].arrayValue.values[1].stringValue === "16:30–19:00"
      && fsPatches.filter(x => x.startsWith("public/hours")).length === 2, JSON.stringify(Object.keys(weeks)));
    // פרסום מקביל שנכתב אחרינו ולפני הקריאה החוזרת: פייסבוק מקבל את מה שבדף, לא את המיזוג הישן שלנו.
    const OLD = Array(7).fill("10:00–11:00"), FIXED = Array(7).fill("06:00–07:00");
    db["public/hours"] = null; delete db["public/hours"];
    put("public/hours", { weeks: { [sun]: OLD }, from: sun });
    let gets = 0;
    hook.get = (path) => { if (path === "public/hours" && ++gets === 2) put("public/hours", { weeks: { ...Object.fromEntries([[sun, FIXED], [next, D7.map(d => d.map(r => r.join("–")).join(", "))]]) } }); };
    fbHours.length = 0;
    const h2 = await call("/hours/bot", { week: next, days: D7 }, { "x-bot-key": env.BOT_KEY });
    hook.get = null;
    const today = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(ymdIL() + "T12:00:00Z").getUTCDay()];
    ok("פייסבוק מקבל את השעות מהקריאה החוזרת", h2.body.facebook === "ok" && fbHours.at(-1)?.[today + "_1_open"] === "06:00", JSON.stringify(fbHours.at(-1)));
    delete db["public/hours"];
    fsPatches.length = 0;
    await bot();
    ok("מסמך שלא קיים נוצר רק אם הוא עדיין לא קיים", fsPatches.some(x => x.startsWith("public/hours") && x.includes("currentDocument.exists=false")));
    hook.patch = (path) => { if (path === "public/hours") put("public/hours", { at: new Date() }); };
    fsPatches.length = 0;
    const h3 = await bot();
    hook.patch = null;
    ok("מתחרה שלא נגמר: שלושה ניסיונות ואז כישלון גלוי, בלי לולאה", h3.body.page !== "ok" && h3.body.ok === false && fsPatches.filter(x => x.startsWith("public/hours")).length === 3, h3.body.page);
  } finally {
    globalThis.fetch = realFetch; console.error = realErr; Date.now = realNow;
  }
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── כל הקובץ נטען כמודול, כמו ש-wrangler בונה אותו. הבדיקות למעלה חותכות חלקים, ולכן לא תופסות הצהרה כפולה ── */
{
  let err = null;
  try { await import("data:text/javascript," + encodeURIComponent(wsrc)); } catch (e){ err = e; }
  console.log(`\n${err ? "  ✗ השרת לא נטען כמודול: " + err.message : "  ✓ השרת נטען כמודול"}`);
  if (err) process.exitCode = 1;
}
