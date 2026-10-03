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
  const full = await withMeta({ FB_PAGE_ID: "9", FB_PAGE_TOKEN: "tokEnv", FIREBASE_SA: "{}" });
  ok("מוגדר בלוח → לא נוגעים ב-Firestore", full.FB_PAGE_TOKEN === "tokEnv" && calls === 0);
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
  const mk = (deps) => new Function("fail", "hebrew", "fsGet", "fsPatch", "withMeta", "setFacebookHours", "setGoogleHours",
    wsrc.slice(a, z) + "\nreturn { botPlan, botHours };")(
    (c, m, s = 400) => Object.assign(new Error(m), { code: c, status: s }), (m) => m,
    deps.fsGet, deps.fsPatch, async (e) => e, deps.fb, deps.gb);
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
  const nofb = await run({ fbFails: true });
  ok("פייסבוק לא מחובר: הדף עדיין מתעדכן והסיבה חוזרת", nofb.res.page === "ok" && /לא מחובר/.test(nofb.res.facebook));
  const curWeekLiveNext = await run({ today: "cur", docs: (() => { const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const x = new Date(t + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - x.getUTCDay() + 7); return { ["weeks/w" + x.toISOString().slice(0, 10)]: { launchedAt: "2026-01-01T00:00:00Z" } }; })() });
  ok("השבוע הנוכחי כשהבא כבר חי: פייסבוק לא נדרס", curWeekLiveNext.res.facebook === "skip" && curWeekLiveNext.fbCalls.length === 0 && curWeekLiveNext.res.page === "ok");
  const wrong = await run({ key: "nope" });
  ok("מפתח שגוי: 403 ושום כתיבה", wrong.err && wrong.err.status === 403 && wrong.writes.length === 0 && wrong.fbCalls.length === 0);
  const unset = await run({ env: { BOT_KEY: "" }, key: "" });
  ok("בלי BOT_KEY בשרת: סגור, גם למפתח ריק", unset.err && unset.err.code === "not_configured" && unset.writes.length === 0);
  ok("הנתיב נבדק לפני אימות המשתמש", wsrc.indexOf('"/hours/bot"') > 0 && wsrc.indexOf('"/hours/bot"') < wsrc.indexOf("await requireUser(request, env)"));
  const fsBlock = wsrc.slice(wsrc.indexOf("function toFs(v){"), wsrc.indexOf("function fromFs("));
  const toFs = new Function(fsBlock + "\nreturn toFs;")();
  ok("תאריך נכתב כ-timestamp ולא כמפה ריקה", toFs(new Date("2026-10-03T11:00:00Z")).timestampValue === "2026-10-03T11:00:00.000Z");
  console.log(`\n${p} עברו · ${f} נכשלו`);
  if (f) process.exitCode = 1;
}
