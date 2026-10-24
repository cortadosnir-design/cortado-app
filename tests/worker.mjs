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
t("מטא: יחס תמונה", "The aspect ratio is not supported.", /תמונה/);
t("מטא: סוג מדיה", "(#9004) The media type is not supported", /תמונה/);
t("מטא: קודק", "video codec is not supported", /תמונה/);
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
  const block = wsrc.slice(wsrc.indexOf("const META_KEYS"), wsrc.indexOf("\n}\n", wsrc.indexOf("async function withMeta(")) + 2);
  const mk = (fsGet) => new Function("fsGet", block + "\nreturn { withMeta };")(fsGet);
  let calls = 0;
  const doc = { FB_PAGE_ID: "111", FB_PAGE_TOKEN: "tokDoc", IG_USER_ID: "ig1", pageName: "קפה" };
  const { withMeta } = mk(async () => { calls++; return doc; });
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
  console.log(`\n${pass2} עברו · ${fail2} נכשלו`);
  if (fail2) process.exitCode = 1;
}

/* ── שעות מהבוט (בוט קורטדו): הבקשה, הפורמטים, והפרסום בלי דפדפן ── */
{
  console.log("\nשעות מהבוט (בוט קורטדו)");
  const a = wsrc.indexOf("const BOT_DAYS"), z = wsrc.indexOf("\n}\n", wsrc.indexOf("async function botHours(")) + 2;
  const mk = (deps) => new Function("fail", "hebrew", "fsGet", "fsPatch", "withMeta", "setFacebookHours", "setGoogleHours", "graph", "gbEnv",
    wsrc.slice(a, z) + "\nreturn { botPlan, botHours, rollingWeek, rollingText };")(
    (c, m, s = 400) => Object.assign(new Error(m), { code: c, status: s }), (m) => m,
    deps.fsGet, deps.fsPatch, async (e) => e, deps.fb, deps.gb, deps.graph || (async () => ({ hours: deps.fbShown || {} })), async (e) => e);
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

  // מה שדף העגלה קורא מהמסמך הזה נבדק ב-tests/hours.mjs (מחרוזת לכל יום, בלי מערך בתוך מערך).
  ok("days במסמך: שבע מחרוזות", plan.doc.days.length === 7 && plan.doc.days.every(x => typeof x === "string"));

  // הפרסום עצמו, מול Firestore ומטא מזויפים.
  const run = async ({ env = {}, key = "k".repeat(40), docs = {}, fbFails = false, today, shifts } = {}) => {
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
    const req = new Request("https://x/hours/bot", { method: "POST", headers: { "x-bot-key": key }, body: JSON.stringify({ week: wk, days: DAYS7, shifts }) });
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
  ok("בוט בלי סידור לא מוחק את הסידור הקיים", !("botShifts" in week.fields));
  const withRoster = await run({ shifts: [
    { day: 6, start: "09:00", end: "13:00", people: [" אלונה ", "", "x".repeat(40)], open: true },
    { day: 6, start: "13:00", end: "14:00", people: [], open: false, note: "קיפול" },
    { day: 9, start: "09:00", end: "10:00" }, { day: 1, start: "12:00", end: "10:00" }] });
  const rw = withRoster.writes.find(w => w.path === "weeks/w" + withRoster.wk).fields.botShifts;
  const rp = withRoster.writes.find(w => w.path === "botpeople/w" + withRoster.wk);
  ok("השעות מהסידור על השבוע, מנוקות ובלי שמות (weeks נקרא לכולם)", rw.length === 2 && !("people" in rw[0]) && rw[1].open === false && rw[1].note === "קיפול", JSON.stringify(rw));
  ok("השמות במסמך נפרד, שורה לכל משמרת", !!rp && rp.fields.people.join("|") === "אלונה, " + "x".repeat(30) + "|", JSON.stringify(rp && rp.fields.people));
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
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/hours/bot"') > 0 && wsrc.indexOf('"/hours/bot"') < wsrc.indexOf('return json({ error: "not_found" }, cors, 404)'));
  ok("רענון הלילה נבדק לפני אימות המשתמש", wsrc.indexOf('"/hours/refresh"') > 0 && wsrc.indexOf('"/hours/refresh"') < wsrc.indexOf('return json({ error: "not_found" }, cors, 404)'));
  ok("אין נתיב שמפרסם שעות מחוץ לבוט", !/"\/hours\/(google|facebook)"/.test(wsrc));
  ok("אין נתיב שמתזמן פוסטים מחוץ לבוט", !wsrc.includes('"/publish/schedule"'));
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
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/team/bot"') > 0 && wsrc.indexOf('"/team/bot"') < wsrc.indexOf('return json({ error: "not_found" }, cors, 404)'));
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── עריכת הצוות מהבוט: הוספה, טלפון, עזיבה ── */
{
  console.log("\nעריכת הצוות מהבוט");
  let p = 0, f = 0; const ok = (m, c, x) => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${m}${x ? "  " + x : ""}`); };
  const a = wsrc.indexOf("async function botTeamSet("), z = wsrc.indexOf("\n}\n", a) + 2;
  const auth = (env, req) => { if (req.headers.get("x-bot-key") !== env.BOT_KEY) throw Object.assign(new Error("x"), { status: 403 }); };
  const docs = { "abc": { name: "נגה", phone: "0541111111", active: true } }, wrote = [];
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const docId = (v) => { if (!/^[A-Za-z0-9_-]{1,60}$/.test(v)) throw new Error("bad id"); return v; };
  const b64url = (buf) => Buffer.from(buf).toString("base64url");
  const set = new Function("botAuth", "fsList", "fsPatch", "fail", "docId", "b64url", wsrc.slice(a, z) + "\nreturn botTeamSet;")(auth,
    async () => Object.entries(docs).map(([_id, d]) => ({ _id, ...d })), async (_e, path, body) => wrote.push({ path, body }), fail, docId, b64url);
  const req = (key, body) => new Request("https://x/team/bot/set", { method: "POST", headers: { "x-bot-key": key }, body: JSON.stringify(body) });
  const r1 = await set({ BOT_KEY: "k" }, req("k", { name: " נגה ", phone: "054-222-2222" }));
  ok("עובד קיים: מעדכן את אותו מסמך לפי השם", wrote[0].path === "roster/abc" && wrote[0].body.phone === "0542222222" && !r1.created && !("active" in wrote[0].body), JSON.stringify(wrote[0]));
  const r2 = await set({ BOT_KEY: "k" }, req("k", { name: "דנה", phone: "0503333333" }));
  ok("עובד חדש: מסמך חדש, פעיל", r2.created && wrote[1].path.startsWith("roster/") && wrote[1].path !== "roster/abc" && wrote[1].body.active === true);
  await set({ BOT_KEY: "k" }, req("k", { name: "נגה", active: false }));
  ok("עזיבה: active=false בלי לגעת בטלפון", wrote[2].body.active === false && !("phone" in wrote[2].body));
  let bad = false; try { await set({ BOT_KEY: "k" }, req("k", { name: "x", phone: "12" })); } catch (e){ bad = e.code === "bad_request"; }
  ok("טלפון קצר מדי נדחה", bad && wrote.length === 3);
  let denied = false; try { await set({ BOT_KEY: "k" }, req("nope", { name: "x" })); } catch (e){ denied = e.status === 403; }
  ok("מפתח שגוי: נדחה בלי לכתוב", denied && wrote.length === 3);
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/team/bot/set"') > 0 && wsrc.indexOf('"/team/bot/set"') < wsrc.indexOf('return json({ error: "not_found" }, cors, 404)'));
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── התור של הבוט לאפליקציה: רק במפתח של הבוט, מנוקה ── */
{
  console.log("\nהתור של הבוט");
  let p = 0, f = 0; const ok = (m, c, x) => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${m}${x ? "  " + x : ""}`); };
  const a = wsrc.indexOf("async function botQueue("), z = wsrc.indexOf("\n}\n", a) + 2;
  const auth = (env, req) => { if (req.headers.get("x-bot-key") !== env.BOT_KEY) throw Object.assign(new Error("x"), { status: 403 }); };
  const wrote = [];
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const botQueue = new Function("botAuth", "fsPatch", "fail", wsrc.slice(a, z) + "\nreturn botQueue;")(auth, async (_e, path, body) => wrote.push({ path, body }), fail);
  const req = (key, body) => new Request("https://x/queue/bot", { method: "POST", headers: { "x-bot-key": key }, body: JSON.stringify(body) });
  await botQueue({ BOT_KEY: "k" }, req("k", { items: [{ kind: "סטורי", at: "2026-10-24T18:30", label: "elections.png" }, { kind: "ריל", at: "לא שעה" }, { kind: "x".repeat(50), at: "2026-10-25T10:00", label: "y".repeat(500) }] }));
  const items = wrote[0] && wrote[0].body.items;
  ok("נשמר ל-botqueue/now", wrote.length === 1 && wrote[0].path === "botqueue/now");
  ok("שעה לא תקינה לא נכנסת, ומחרוזות מקוצרות", items.length === 2 && items[0].label === "elections.png" && items[1].kind.length === 20 && items[1].label.length === 120, JSON.stringify(items.map(x => x.kind.length)));
  let denied = false; try { await botQueue({ BOT_KEY: "k" }, req("nope", { items: [] })); } catch (e){ denied = e.status === 403; }
  ok("מפתח שגוי: נדחה בלי לכתוב", denied && wrote.length === 1);
  let tooMany = false; try { await botQueue({ BOT_KEY: "k" }, req("k", { items: Array(51).fill({ kind: "a", at: "2026-10-25T10:00" }) })); } catch (e){ tooMany = e.code === "bad_request"; }
  ok("יותר מ-50 נדחה", tooMany && wrote.length === 1);
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/queue/bot"') > 0 && wsrc.indexOf('"/queue/bot"') < wsrc.indexOf('return json({ error: "not_found" }, cors, 404)'));
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
  const out = await botPost({ BOT_KEY: "k" }, req({ text: "בוקר בשניר", image: "data:image/jpeg;base64,AQID", at, tags: ["galilback"] }));
  ok("מסמך הפוסט נכתב לפני הפרסום, עם התאריך בשעון ישראל", writes.length === 1 && /^posts\/b/.test(writes[0][0]) && writes[0][1].date === "2026-10-09" && writes[0][1].time === "08:00" && writes[0][1].source === "bot", JSON.stringify(writes[0]));
  ok("הפרסום מקבל את אותו מזהה, טקסט, תמונה, זמן ותיוג", sched[0].postId === writes[0][0].slice(6) && sched[0].text === "בוקר בשניר" && sched[0].image === "data:image/jpeg;base64,AQID" && sched[0].at === at && out.fbPostId === "1_2" && JSON.stringify(sched[0].tags) === '["galilback"]');

  // תיוג על התמונה באינסטגרם: user_tags, והכיתוב נשאר נקי. תיוג שנדחה: יוצא בלי, והסיבה חוזרת
  {
    const src = wsrc.slice(wsrc.indexOf("const cleanTags"), wsrc.indexOf("/* ===== ריל: וידאו מהבוט")) + wsrc.slice(wsrc.indexOf("async function igPublishFromPhoto("), wsrc.indexOf("\n}\n", wsrc.indexOf("async function igPublishFromPhoto(")) + 2);
    const run = async (tagFails) => { const calls = [];
      const fn = new Function("graph", "igReady", "hebrew", "fail", src + "\nreturn igPublishFromPhoto;")(async (_e, path, params = {}, method = "POST") => { calls.push([path, params]);
        if (method === "GET") return { images: [{ width: 1080, source: "https://cdn/big" }] };
        if (path.endsWith("/media")){ if (tagFails && params.user_tags) throw new Error("tag no"); return { id: "c1" }; }
        return { id: "ig9" }; }, async () => true, (m) => m, (code, m) => Object.assign(new Error(m), { code }));
      return { out: await fn({ IG_USER_ID: "I" }, "ph1", "בוקר", ["galilback", "galil.elion"]), calls }; };
    const good = await run(false), c = good.calls.find(x => x[0] === "I/media")[1];
    ok("פוסט תמונה: user_tags על התמונה והכיתוב נקי", good.out.id === "ig9" && c.caption === "בוקר" && JSON.parse(c.user_tags).map(u => u.username).join() === "galilback,galil.elion" && good.out.igTagged.length === 2);
    const bad = await run(true);
    ok("תיוג נדחה: הפוסט יוצא בלי תיוג, והסיבה מדווחת", bad.out.id === "ig9" && bad.out.igTagError === "tag no" && !bad.out.igTagged.length && bad.calls.filter(x => x[0] === "I/media").length === 2);
  }
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
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/post/bot"') > 0 && wsrc.indexOf('"/post/bot"') < wsrc.indexOf('return json({ error: "not_found" }, cors, 404)'));
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── ריל מהבוט: פייסבוק ואינסטגרם מאותו קובץ, ותור כשאינסטגרם עוד מעבד ── */
{
  console.log("\nריל מהבוט");
  let p = 0, f = 0; const ok = (m, c, x) => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${m}${x ? "  " + x : ""}`); };
  const a = wsrc.indexOf("async function igReady("), z = wsrc.indexOf("\n}\n", wsrc.indexOf("async function botReel(")) + 2;
  const fail = (code, m, status = 400) => Object.assign(new Error(m), { code, status });
  const auth = (env, req) => { if (req.headers.get("x-bot-key") !== env.BOT_KEY) throw fail("forbidden", "x", 403); };
  const mk = ({ igStatus = ["FINISHED"], fbFails = false } = {}) => {
    const calls = [], uploads = [], writes = [];
    const graph = async (_e, path, params = {}, method = "POST") => {
      calls.push([method, path, params]);
      if (path.endsWith("/video_reels") && params.upload_phase === "start"){ if (fbFails) throw new Error("fb no"); return { video_id: "v1" }; }
      if (path.endsWith("/video_reels")) return { success: true };
      if (path.endsWith("/media")) return { id: "c1" };
      if (path.endsWith("/media_publish")) return { id: "ig9" };
      if (method === "GET") return { status_code: igStatus.length > 1 ? igStatus.shift() : igStatus[0] };
      throw new Error("unexpected " + path);
    };
    const realFetch = globalThis.fetch;
    const fakeFetch = async (url, init) => { uploads.push([String(url), init.headers.file_size, init.headers.authorization]); return Response.json({ success: true }); };
    const fn = new Function("botAuth", "withMeta", "fsPatch", "graph", "hebrew", "fail", "GRAPH", "fetch", "sleep",
      wsrc.slice(a, z) + "\nreturn { botReel, igReady };")(auth, async (e) => e, async (_e, path, fields) => { writes.push([path, fields]); },
      graph, (m) => m, fail, "https://graph.facebook.com/v21.0", fakeFetch, async () => {});
    return { ...fn, calls, uploads, writes, realFetch };
  };
  const env = { BOT_KEY: "k", FB_PAGE_ID: "P", FB_PAGE_TOKEN: "T", IG_USER_ID: "I" };
  const meta = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
  const req = (o = {}, { key = "k", type = "video/mp4", body = new Uint8Array([1, 2, 3, 4]) } = {}) =>
    new Request("https://x/post/bot/reel", { method: "POST", body, headers: { "x-bot-key": key, "content-type": type, "x-reel": meta(o) } });

  const t1 = mk();
  const out = await t1.botReel(env, req({ text: "בוקר בשניר ☕" }));
  ok("פייסבוק ואינסטגרם יצאו, והטקסט העברי עבר בכותרת", out.fbVideoId === "v1" && out.igPostId === "ig9" && t1.calls.find(c => c[1] === "I/media")[2].caption === "בוקר בשניר ☕", JSON.stringify(out));
  ok("הקובץ עצמו עלה פעמיים ל-rupload, עם הגודל והטוקן", JSON.stringify(t1.uploads.map(u => u[0]).sort()) === JSON.stringify(["https://rupload.facebook.com/ig-api-upload/v21.0/c1", "https://rupload.facebook.com/video-upload/v21.0/v1"]) && t1.uploads.every(u => u[1] === "4" && u[2] === "OAuth T"));
  ok("ריל לאינסטגרם נוצר כ-REELS resumable ומופיע גם בפיד", (({ media_type, upload_type, share_to_feed }) => media_type === "REELS" && upload_type === "resumable" && share_to_feed === "true")(t1.calls.find(c => c[1] === "I/media")[2]));
  ok("פייסבוק מסיים ב-PUBLISHED עם הטקסט", t1.calls.some(c => c[2].upload_phase === "finish" && c[2].video_state === "PUBLISHED" && c[2].description === "בוקר בשניר ☕"));
  ok("מסמך הפוסט: נכתב לפני, ובסוף done", t1.writes[0][1].status === "ready" && t1.writes[0][1].kind === "reel" && t1.writes.at(-1)[1].status === "done");

  const tg = mk();
  const tagged = await tg.botReel(env, req({ text: "בוקר", tags: ["@galilback", "galil.elion", "bad name!"] }));
  ok("תיוג בריל: שורת @ בסוף הכיתוב של אינסטגרם בלבד, פייסבוק נקי, שם לא תקין לא נכנס",
    tg.calls.find(c => c[1] === "I/media")[2].caption === "בוקר\n\n@galilback @galil.elion" && tg.calls.some(c => c[2].upload_phase === "finish" && c[2].description === "בוקר")
    && JSON.stringify(tagged.igTagged) === JSON.stringify(["galilback", "galil.elion"]));

  const t2 = mk({ igStatus: ["IN_PROGRESS"] });
  const slow = await t2.botReel(env, req({ text: "x" }));
  ok("אינסטגרם עוד מעבד: נכנס לתור עם הקונטיינר, ולא מפורסם", slow.igPending === true && slow.igContainer === "c1" && !slow.igPostId && t2.writes.at(-1)[1].status === "scheduled" && t2.writes.at(-1)[1].publishAt > 0);

  const t3 = mk({ fbFails: true });
  const half = await t3.botReel(env, req({ text: "x" }));
  ok("פייסבוק נכשל: אינסטגרם בכל זאת יוצא, והשגיאה מדווחת", half.fbError === "fb no" && half.igPostId === "ig9");

  const t4 = mk();
  const fbOnly = await t4.botReel({ ...env, IG_USER_ID: "" }, req({ text: "x" }));
  ok("בלי חשבון אינסטגרם: פייסבוק בלבד, עם סיבה", fbOnly.fbVideoId === "v1" && /לא מחובר/.test(fbOnly.igSkipped) && !t4.calls.some(c => c[1] === "/media"));
  const noIg = await mk().botReel(env, req({ text: "x", noIg: true }));
  ok("noIg: אינסטגרם לא נוגע", /פייסבוק בלבד/.test(noIg.igSkipped) && !noIg.igPostId);

  let e1 = null; try { await mk().botReel(env, req({}, { type: "image/jpeg" })); } catch (e){ e1 = e; }
  ok("לא וידאו: נדחה", e1 && e1.code === "bad_request");
  const t5 = mk(); let e2 = null; try { await t5.botReel(env, req({}, { key: "nope" })); } catch (e){ e2 = e; }
  ok("מפתח שגוי: נדחה בלי לכתוב ובלי להעלות", e2 && e2.status === 403 && !t5.writes.length && !t5.uploads.length);
  let e3 = null; try { await mk({ igStatus: ["ERROR"] }).igReady(env, "c1"); } catch (e){ e3 = e; }
  ok("קונטיינר ERROR: זורק ולא נתקע", e3 && e3.code === "meta_error");

  // הקרון: ריל בתור מתפרסם רק כשהקונטיינר FINISHED
  const pd = wsrc.slice(wsrc.indexOf("async function publishDue("), wsrc.indexOf("\n}\n", wsrc.indexOf("async function publishDue(")) + 2);
  const runDue = async (status, failPatch = () => false) => { const g = mk({ igStatus: [status] }); const patches = [];
    const fn = new Function("fsQuery", "fsPatch", "dueNow", "igReady", "igPublishFromPhoto", "graph", "hebrew", pd + "\nreturn publishDue;")(
      async () => [{ id: "r1", fields: { igPending: true, publishAt: 1, igContainer: "c1", text: "x" } }],
      async (_e, path, x) => { if (failPatch(x)) throw new Error("firestore 503"); patches.push(x); },
      (docs) => docs, g.igReady, async () => { throw new Error("photo path"); }, async (...a) => (g.calls.push(a), a[1].endsWith("/media_publish") ? { id: "ig9" } : { status_code: status }), (m) => m);
    return { res: await fn({ FIREBASE_SA: "{}", IG_USER_ID: "I" }), patches }; };
  const wait = await runDue("IN_PROGRESS");
  ok("קרון: ריל שעוד מעבד נשאר בתור בלי לספור ניסיון", wait.patches.length === 0 && wait.res.results[0].waiting === true);
  const done = await runDue("FINISHED");
  ok("קרון: ריל מוכן מתפרסם ויוצא מהתור", done.patches[0].igPending === false && done.patches[1].igPostId === "ig9");
  // כתיבת ה-igPostId נכשלת אחרי שפורסם: הפוסט כבר מחוץ לתור, ואף כתיבה לא מחזירה אותו
  const flaky = await runDue("FINISHED", (x) => "igPostId" in x);
  ok("קרון: כתיבה שנכשלת אחרי פרסום לא מחזירה לתור", flaky.patches.length === 1 && flaky.patches[0].igPending === false && flaky.res.results[0].ok === true);
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/post/bot/reel"') > 0 && wsrc.indexOf('"/post/bot/reel"') < wsrc.indexOf('return json({ error: "not_found" }, cors, 404)'));
  ok("השרת מודיע לבוט שהוא יודע ריל", /reels: true/.test(wsrc.slice(wsrc.indexOf("async function publishState("), wsrc.indexOf("async function publishState(") + 600)));
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── סטורי מהבוט: תמונה אחת, סטורי לפייסבוק ולאינסטגרם, תיוג שלא עובר לא מפיל ── */
{
  console.log("\nסטורי מהבוט");
  let p = 0, f = 0; const ok = (m, c, x) => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${m}${x ? "  " + x : ""}`); };
  const a = wsrc.indexOf("async function botStory("), z = wsrc.indexOf("\n}\n", a) + 2;
  const tagSrc = wsrc.slice(wsrc.indexOf("const cleanTags"), wsrc.indexOf("/* ===== ריל: וידאו מהבוט")); // עוזרי התיוג המשותפים לפוסט, ריל וסטורי
  const fail = (code, m, status = 400) => Object.assign(new Error(m), { code, status });
  const auth = (env, req) => { if (req.headers.get("x-bot-key") !== env.BOT_KEY) throw fail("forbidden", "x", 403); };
  const mk = ({ tagFails = false, fbFails = false } = {}) => {
    const calls = [], uploads = [];
    const graph = async (_e, path, params = {}, method = "POST") => {
      calls.push([method, path, params]);
      if (path.endsWith("/photo_stories")){ if (fbFails) throw new Error("fb no"); return { success: true, post_id: "s1" }; }
      if (method === "GET") return { images: [{ width: 500, source: "https://cdn/small" }, { width: 1080, source: "https://cdn/big" }] };
      if (path.endsWith("/media")){ if (tagFails && params.user_tags) throw new Error("tag no"); return { id: "c1" }; }
      if (path.endsWith("/media_publish")) return { id: "ig9" };
      throw new Error("unexpected " + path);
    };
    const fn = new Function("botAuth", "withMeta", "graph", "graphUpload", "dataUrlToBlob", "igReady", "hebrew", "fail", tagSrc + wsrc.slice(a, z) + "\nreturn botStory;")(
      auth, async (e) => e, graph, async (_e, path, fields, file) => { uploads.push([path, fields, file.type]); return { id: "ph1" }; },
      (u) => { const m = /^data:([^;]+);base64,(.+)$/.exec(String(u || "")); return m ? new Blob([Buffer.from(m[2], "base64")], { type: m[1] }) : null; },
      async () => true, (m) => m, fail);
    return { botStory: fn, calls, uploads };
  };
  const env = { BOT_KEY: "k", FB_PAGE_ID: "P", FB_PAGE_TOKEN: "T", IG_USER_ID: "I" };
  const TAGS = ["@galiluz.north", "galil.elion", "@galilgolan_travel_culture", "@galilback"];
  const req = (o, key = "k") => new Request("https://x/post/bot/story", { method: "POST", headers: { "x-bot-key": key }, body: JSON.stringify(o) });
  const img = "data:image/jpeg;base64,AQID";

  const t1 = mk();
  const out = await t1.botStory(env, req({ image: img, tags: TAGS }));
  ok("פייסבוק ואינסטגרם יצאו כסטורי", out.ok && out.fbStoryId === "s1" && out.igStoryId === "ig9", JSON.stringify(out));
  ok("התמונה עלתה פעם אחת לעמוד, לא מפורסמת", t1.uploads.length === 1 && t1.uploads[0][0] === "P/photos" && t1.uploads[0][1].published === "false");
  const c = t1.calls.find(x => x[1] === "I/media")[2];
  ok("אינסטגרם: STORIES, הכתובת הגדולה, ותיוג ארבעת החשבונות בלי @", c.media_type === "STORIES" && c.image_url === "https://cdn/big"
    && JSON.stringify(JSON.parse(c.user_tags).map(u => u.username)) === JSON.stringify(["galiluz.north", "galil.elion", "galilgolan_travel_culture", "galilback"]));
  ok("פייסבוק: photo_stories מאותה תמונה", t1.calls.some(x => x[1] === "P/photo_stories" && x[2].photo_id === "ph1"));

  const t2 = mk({ tagFails: true });
  const untagged = await t2.botStory(env, req({ image: img, tags: TAGS }));
  ok("תיוג נדחה: הסטורי יוצא בלי תיוג, והסיבה מדווחת", untagged.igStoryId === "ig9" && untagged.igTagError === "tag no" && !untagged.igTagged.length);

  const half = await mk({ fbFails: true }).botStory(env, req({ image: img }));
  ok("פייסבוק נכשל: אינסטגרם בכל זאת יוצא", half.fbError === "fb no" && half.igStoryId === "ig9" && half.ok);
  const fbOnly = await mk().botStory({ ...env, IG_USER_ID: "" }, req({ image: img }));
  ok("בלי חשבון אינסטגרם: פייסבוק בלבד, עם סיבה", fbOnly.fbStoryId === "s1" && /לא מחובר/.test(fbOnly.igSkipped));
  const t3 = mk(); let e1 = null; try { await t3.botStory(env, req({ image: "https://x/y.jpg" })); } catch (e){ e1 = e; }
  ok("בלי data URL של תמונה: נדחה בלי להעלות", e1 && e1.code === "bad_request" && !t3.uploads.length);
  const t4 = mk(); let e2 = null; try { await t4.botStory(env, req({ image: img }, "nope")); } catch (e){ e2 = e; }
  ok("מפתח שגוי: נדחה בלי להעלות", e2 && e2.status === 403 && !t4.uploads.length);
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/post/bot/story"') > 0 && wsrc.indexOf('"/post/bot/story"') < wsrc.indexOf('return json({ error: "not_found" }, cors, 404)'));
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

/* ── המחבר ל-Claude (/mcp/<מפתח>): מפתח, פרוטוקול, וימים/פוסטים ממטא מעוצבים לשורות ── */
{
  const a = wsrc.indexOf("const MCP_KEY_SHA256"), z = wsrc.indexOf("/* ===== Firestore מהשרת");
  const key = "test-key";
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)))].map(b => b.toString(16).padStart(2, "0")).join("");
  const block = wsrc.slice(a, z).replace(/const MCP_KEY_SHA256 = "[0-9a-f]+"/, `const MCP_KEY_SHA256 = "${hash}"`);
  const sameStr = (x, y) => x === y;
  const ENV = { FB_PAGE_ID: "p1", FB_PAGE_TOKEN: "t", IG_USER_ID: "ig1" };
  const calls = [];
  const graph = async (env, path, params) => {
    calls.push([path, params]);
    if (path === "p1/insights"){
      if (params.metric === "page_views_total") throw new Error("(#100) The value must be a valid insights metric");
      return { data: [{ name: params.metric, values: [{ value: 5, end_time: "2026-10-08T07:00:00+0000" }, { value: 7, end_time: "2026-10-09T07:00:00+0000" }] }] };
    }
    if (path === "ig1/insights" && params.metric_type) return { data: [{ name: "views", total_value: { value: 11 } }, { name: "total_interactions", total_value: { value: 2 } }, { name: "accounts_engaged", total_value: { value: 1 } }] };
    if (path === "ig1/insights") return { data: [{ name: params.metric, values: [{ value: 40, end_time: "2026-10-08T07:00:00+0000" }] }] };
    if (path === "p1/published_posts"){
      if (/post_media_view/.test(params.fields)) throw new Error("(#100) invalid metric post_media_view");
      return { data: [
        { id: "p1_1", created_time: "2026-10-07T05:02:08+0000", message: "יום קצר בצפון", permalink_url: "https://fb/p1", attachments: { data: [{ media_type: "album" }] },
          shares: { count: 4 }, reactions: { summary: { total_count: 9 } }, comments: { summary: { total_count: 0 } }, insights: { data: [{ name: "post_impressions_unique", values: [{ value: 131 }] }] } },
        { id: "p1_99", created_time: "2026-10-08T09:03:45+0000", message: "", permalink_url: "https://fb/dup", reactions: { summary: { total_count: 0 } }, comments: { summary: { total_count: 0 } } } ] };
    }
    if (path === "p1/video_reels") return { data: [
      { id: "99", description: "4 עצירות", created_time: "2026-10-08T09:03:45+0000", permalink_url: "/reel/99/", video_insights: { data: [{ name: "blue_reels_play_count", values: [{ value: 119 }] }, { name: "post_video_likes_by_reaction_type", values: [{ value: { REACTION_LIKE: 2, REACTION_LOVE: 1 } }] }] } },
      { id: "50", description: "ישן", created_time: "2026-09-01T09:00:00+0000", permalink_url: "/reel/50/" } ] };
    if (path === "ig1/media" && params.after === "c2") return { data: [{ id: "m2", caption: "ריל ישן", media_type: "VIDEO", media_product_type: "REELS", timestamp: "2026-10-09T05:00:00+0000", permalink: "https://ig/m2", like_count: 1, comments_count: 0 }] };
    if (path === "ig1/media") return { data: [{ id: "m1", caption: "דוכנים", media_type: "IMAGE", media_product_type: "FEED", timestamp: "2026-10-10T06:02:26+0000", permalink: "https://ig/m1", like_count: 8, comments_count: 0,
      insights: { data: [{ name: "reach", values: [{ value: 169 }] }, { name: "views", values: [{ value: 376 }] }, { name: "total_interactions", values: [{ value: 8 }] }] } }],
      paging: { cursors: { after: "c2" }, next: "https://graph/next" } };
    if (path === "p1") return { name: "קפה קורטדו", followers_count: 5 };
    if (path === "ig1" && /business_discovery/.test(params.fields)){
      if (/private_person/.test(params.fields)) throw new Error("(#110) Cannot query users by their username");
      return { business_discovery: { username: params.fields.match(/username\((\S+?)\)/)[1], name: "שותף", followers_count: params.fields.includes("big") ? 5000 : 300, media_count: 40 } };
    }
    if (path === "ig1") return { username: "cortado_snir", followers_count: 672, media_count: 9 };
    throw new Error("unexpected " + path);
  };
  const m = new Function("fail", "graph", "withMeta", "sameStr", "ilToday", block + "\nreturn { mcp };")(
    (c, msg) => Object.assign(new Error(msg), { code: c }), graph, async (e) => e, sameStr, () => "2026-10-14");
  const call = async (body, k = key, method = "POST") => {
    const r = await m.mcp(ENV, new Request("https://x/mcp/" + k, { method, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }), k);
    return { status: r.status, body: r.status === 200 ? await r.json() : null };
  };
  let p = 0, f = 0;
  const ok = (n, c, x = "") => c ? (p++, console.log("  ✓ " + n)) : (f++, console.log("  ✗ " + n + "  " + x));
  console.log("\n17. המחבר ל-Claude: פייסבוק ואינסטגרם ישירות ממטא");
  ok("מפתח שגוי → 404", (await call({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "nope")).status === 404);
  ok("GET → 405", (await call(null, key, "GET")).status === 405);
  const init = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  ok("initialize מחזיר גרסה ויכולת כלים", init.body.result.protocolVersion === "2025-06-18" && init.body.result.capabilities.tools);
  ok("התראה → 202 בלי גוף", (await call({ jsonrpc: "2.0", method: "notifications/initialized" })).status === 202);
  const list = await call({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  ok("חמישה כלים של מטא ושניים של גוגל", list.body.result.tools.map(t => t.name).join() === "account,facebook_daily,instagram_daily,posts,instagram_accounts,google_reviews,google_reply");
  const tool = async (name, args = {}) => (await call({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } })).body.result;

  const fb = (await tool("facebook_daily", { since: "2026-10-07", until: "2026-10-08" })).structuredContent;
  ok("פייסבוק: יום לפי end_time פחות יום", fb.rows[0].day === "2026-10-07" && fb.rows[0].views === 5 && fb.rows[1].views === 7, JSON.stringify(fb.rows));
  ok("מדד שמטא דחתה → הערה, לא נפילה", fb.notes.length === 1 && /page_views_total/.test(fb.notes[0]) && fb.rows[0].page_views === undefined, JSON.stringify(fb.notes));
  calls.length = 0;
  const longFb = (await tool("facebook_daily", { since: "2025-01-01", until: "2026-10-14" })).structuredContent;
  ok("טווח ארוך מוגבל ל-90 יום", longFb.since === "2026-07-17" && longFb.rows.length === 90);

  calls.length = 0;
  const ig = (await tool("instagram_daily", {})).structuredContent;
  ok("אינסטגרם: ברירת מחדל 28 יום עד היום", ig.since === "2026-09-17" && ig.until === "2026-10-14" && ig.rows.length === 28);
  ok("אינסטגרם: הגעה יומית וסכומים לכל יום", ig.rows.find(r => r.day === "2026-10-07").reach === 40 && ig.rows[0].views === 11 && ig.rows[0].interactions === 2);
  ok("אינסטגרם: לא יותר מ-40 בקשות למטא (תקרת Workers 50)", calls.length <= 40, String(calls.length));

  const posts = (await tool("posts", { since: "2026-10-07", until: "2026-10-14" })).structuredContent;
  const byId = Object.fromEntries(posts.rows.map(r => [r.id, r]));
  ok("פוסט פייסבוק: גרסת שדות חלופית כשמדד נדחה", byId.p1_1 && byId.p1_1.reach === 131 && byId.p1_1.kind === "carousel" && byId.p1_1.interactions === 13, JSON.stringify(byId.p1_1));
  ok("ריל: צפיות ולייקים, כתובת מלאה, בלי כפילות בפוסטים", byId["99"].views === 119 && byId["99"].likes === 3 && byId["99"].url === "https://www.facebook.com/reel/99/" && !byId.p1_99);
  ok("ריל מחוץ לטווח לא נכנס", !byId["50"]);
  ok("אינסטגרם: צפיות והגעה", byId.m1.views === 376 && byId.m1.reach === 169 && byId.m1.at === "2026-10-10T06:02:26.000Z");
  ok("ממוין מהחדש לישן", posts.rows[0].id === "m1");
  ok("אינסטגרם: עמוד שני של media נכנס, כריל", byId.m2 && byId.m2.kind === "reel", JSON.stringify(Object.keys(byId)));
  ok("אינסטגרם: הערה כשמטא מחזירה פחות ממה שיש בחשבון", posts.notes.some(n => /2 media items, the account holds 9/.test(n)), JSON.stringify(posts.notes));

  const who = (await tool("instagram_accounts", { usernames: ["@small", "big", "private_person"] })).structuredContent;
  ok("חשבונות אחרים: ממוינים לפי עוקבים, חשבון פרטי מקבל הערה ולא מפיל", who.rows[0].username === "big" && who.rows[0].followers === 5000 && who.rows[1].username === "small" && who.rows[2].followers === null && who.notes.length === 1, JSON.stringify(who));
  const acc = (await tool("account")).structuredContent;
  ok("חשבון: עוקבים בשתי הרשתות, ומספר הפריטים באינסטגרם", acc.rows[0].followers === 5 && acc.rows[1].followers === 672 && acc.rows[1].media_count === 9);
  const noIg = await m.mcp({ FB_PAGE_ID: "p1", FB_PAGE_TOKEN: "t" }, new Request("https://x/mcp/" + key, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "instagram_daily" } }) }), key);
  const nb = await noIg.json();
  ok("בלי אינסטגרם בשרת → שגיאה ברורה, לא קריסה", nb.result.isError && /IG_USER_ID/.test(nb.result.content[0].text));
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}

/* ── ביקורות בגוגל: חיבור חד-פעמי (רק מייסד), קריאה וכתיבת תשובה ── */
{
  const a = wsrc.indexOf("const GB_KEYS"), z = wsrc.indexOf("/* ===== קריאת השעות מגוגל");
  const store = {}, sent = [];
  let who = "cortado.snir@gmail.com";
  const jwt = (o) => "h." + Buffer.from(JSON.stringify(o)).toString("base64url") + ".s";
  const fetch = async (u, o = {}) => {
    u = String(u); sent.push([u, o]);
    const res = (b, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => b });
    if (u.includes("oauth2.googleapis.com/token")) return res({ refresh_token: "R", access_token: "A", id_token: jwt({ email: who, email_verified: true }) });
    if (u.endsWith("/v1/accounts")) return res({ accounts: [{ name: "accounts/1" }] });
    if (u.includes("accounts/1/locations?")) return res({ locations: [{ name: "locations/9", title: "קפה קורטדו" }] });
    if (u.includes("/reviews?")) return res({ averageRating: 5, totalReviewCount: 3, reviews: [
      { reviewId: "rev_aaaaaa", reviewer: { displayName: "D B" }, starRating: "FIVE", comment: "מומלץ מאוד", createTime: "2026-10-17T07:50:00Z" },
      { reviewId: "rev_bbbbbb", reviewer: { displayName: "דור" }, starRating: "FIVE", comment: "", createTime: "2026-10-03T11:00:00Z", reviewReply: { comment: "תודה" } } ] });
    if (u.includes("/reply")) return res({ comment: JSON.parse(o.body).comment });
    throw new Error("unexpected " + u);
  };
  const fsGet = async (env, path) => store[path] || null;
  const fsPatch = async (env, path, f) => { store[path] = { ...(store[path] || {}), ...f }; return true; };
  const g = new Function("fail", "fsGet", "fsPatch", "sameStr", "ownersOf", "DEFAULT_OWNERS", "b64url", "GB_API", "gbAccessToken", "fetch",
    wsrc.slice(a, z) + "\nreturn { googleConnect, googleCallback, gbReviews, gbReply, gbEnv };")(
    (c, m) => Object.assign(new Error(m), { code: c }), fsGet, fsPatch, (x, y) => x === y, () => ["cortado.snir@gmail.com"], ["cortado.snir@gmail.com"],
    () => "STATE", "https://gb", async () => "A", fetch);
  const ENV = { FIREBASE_SA: "x" };
  let p = 0, f = 0;
  const ok = (n, c, x = "") => c ? (p++, console.log("  ✓ " + n)) : (f++, console.log("  ✗ " + n + "  " + x));
  console.log("\n18. ביקורות בגוגל");
  const notYet = await g.gbReviews(ENV).catch(e => e);
  ok("לפני החיבור → not_configured עם הקישור", notYet.code === "not_configured" && /google\/connect/.test(notYet.message));
  const form = await g.googleConnect(ENV, new Request("https://x/google/connect"));
  ok("בלי client → טופס", form.status === 200 && /Client ID/.test(await form.text()));
  const bad = await g.googleConnect(ENV, new Request("https://x/google/connect", { method: "POST", body: new URLSearchParams({ id: "nope", secret: "1234567890" }) }));
  ok("client ID לא תקין → 400", bad.status === 400);
  const go = await g.googleConnect(ENV, new Request("https://x/google/connect", { method: "POST", body: new URLSearchParams({ id: "abc.apps.googleusercontent.com", secret: "SECRET12345" }) }));
  ok("client תקין → הפניה לגוגל עם offline ו-state", go.status === 302 && /access_type=offline/.test(go.headers.get("location")) && store["secrets/google_pending"].state === "STATE");
  ok("state שגוי → לא נשמר כלום", (await g.googleCallback(ENV, new URL("https://x/google/callback?code=c&state=WRONG"))).status === 400 && !store["secrets/google"]);
  who = "stranger@gmail.com";
  ok("מישהו שאינו מייסד → 403 ולא נשמר", (await g.googleCallback(ENV, new URL("https://x/google/callback?code=c&state=STATE"))).status === 403 && !store["secrets/google"]);
  who = "cortado.snir@gmail.com";
  const done = await g.googleCallback(ENV, new URL("https://x/google/callback?code=c&state=STATE"));
  const sg = store["secrets/google"] || {};
  ok("מייסד → נשמרים טוקן, חשבון ומיקום", done.status === 200 && sg.GB_REFRESH_TOKEN === "R" && sg.GB_ACCOUNT === "accounts/1" && sg.GB_LOCATION === "locations/9" && sg.GB_CLIENT_SECRET === "SECRET12345", JSON.stringify(sg));
  ok("הממתין נמחק", store["secrets/google_pending"].secret === "");
  // 19.10.2026: refresh token ישן בלוח של Cloudflare לא מתערבב עם client חדש מהחיבור
  const ge = await g.gbEnv({ ...ENV, GB_CLIENT_ID: "old", GB_CLIENT_SECRET: "old", GB_REFRESH_TOKEN: "old", GB_ACCOUNT: "old", GB_LOCATION: "old" });
  ok("החיבור מנצח את הלוח", ge.GB_REFRESH_TOKEN === "R" && ge.GB_CLIENT_SECRET === "SECRET12345" && ge.GB_LOCATION === "locations/9", JSON.stringify(ge));
  const rv = await g.gbReviews(ENV);
  ok("ביקורות: רק בלי תשובה, עם כוכבים כמספר", rv.rows.length === 1 && rv.rows[0].id === "rev_aaaaaa" && rv.rows[0].stars === 5 && rv.total === 3, JSON.stringify(rv));
  ok("ביקורות: הכתובת לפי החשבון והמיקום", sent.some(([u]) => u.includes("/v4/accounts/1/locations/9/reviews?")));
  ok("כל הביקורות כשמבקשים", (await g.gbReviews(ENV, { unansweredOnly: false })).rows.length === 2);
  const rep = await g.gbReply(ENV, { reviewId: "rev_aaaaaa", comment: "תודה רבה" });
  const put = sent.find(([u]) => u.endsWith("/reviews/rev_aaaaaa/reply"));
  ok("תשובה: PUT עם הטקסט", rep.ok && put && put[1].method === "PUT" && JSON.parse(put[1].body).comment === "תודה רבה");
  ok("תשובה ריקה או מזהה שבור → נדחה", (await g.gbReply(ENV, { reviewId: "rev_aaaaaa", comment: " " }).catch(e => e)).code === "bad_request"
    && (await g.gbReply(ENV, { reviewId: "../x", comment: "a" }).catch(e => e)).code === "bad_request");
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
