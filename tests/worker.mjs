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
