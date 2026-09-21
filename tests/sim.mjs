// סימולציה: האפליקציה האמיתית (app.js וכל המודולים), מנהל מחובר, Firestore מזויף.
// עוברים על שבוע של הבעלים ומודדים: נגיעות, שדות, החלטות שהאפליקציה זרקה עליו.
//   node tests/sim.mjs
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { spawn } from "child_process";
import { buildFullCore } from "./fullcore.mjs";
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = process.env.PORT || 8902;
const PAGE = `http://127.0.0.1:${PORT}/sim.html`;

/* ── הכנה ── */
buildFullCore();
let html = readFileSync(ROOT + "index.html", "utf8");
html = html.replace("</head>", `<script type="importmap">{"imports":{"/core.js":"/tests/stubs/core-full.js"}}</script></head>`);
writeFileSync(ROOT + "sim.html", html);
const server = spawn("npx", ["--yes", "http-server", ROOT, "-p", String(PORT), "-s"], { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));

/* ── מדידה ── */
const report = [];
const errors = [];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/ERR_CERT|ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });

let J = null;                       // המסע הנוכחי
const dialogs = [];
page.on("dialog", async (d) => { dialogs.push(d.message()); if (J) J.asks.push("חלון: " + d.message()); await d.accept(); });
function journey(name){ J = { name, taps: 0, fields: 0, tabs: 0, asks: [], notes: [], shots: [] }; report.push(J); return J; }
const tap  = async (sel) => { J.taps++; await page.click(sel); await page.waitForTimeout(120); };
const type = async (sel, v) => { J.fields++; await page.fill(sel, v); };
const pick = async (sel, v) => { J.fields++; J.asks.push("בחירה: " + sel); await page.selectOption(sel, v); };
const tab  = async (name) => { J.tabs++; J.taps++; await page.click("#tab-" + name); await page.waitForTimeout(250); };
const note = (t) => J.notes.push(t);
const shot = async (name) => { const p = `/tmp/claude-0/sim-${name}.png`; await page.screenshot({ path: p }); J.shots.push(p); };
// "עם הבוהן": כמה אלמנטים אינטראקטיביים גלויים, וכמה מהם בתוך המסך בלי לגלול
const onScreen = () => page.evaluate(() => {
  const H = window.innerHeight; let all = 0, fold = 0;
  for (const n of document.querySelectorAll("button,input,select,textarea,a.btn,summary")){
    if (n.hidden || n.closest("[hidden]") || n.offsetParent === null) continue;
    all++; const r = n.getBoundingClientRect(); if (r.top >= 0 && r.bottom <= H) fold++;
  }
  return { all, fold };
});
const nowBar = () => page.evaluate(() => { const n = document.getElementById("now"); if (!n || n.hidden) return null;
  const b = n.querySelector("button.primary"); const r = n.getBoundingClientRect();
  return { title: (n.querySelector("b,strong,.nowtitle") || n).textContent.trim().slice(0, 60), primary: b ? b.textContent.trim() : "", visible: r.top >= 0 && r.bottom <= window.innerHeight }; });

await page.goto(PAGE, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#tabs:not([hidden])", { timeout: 8000 });
await page.waitForTimeout(500);
await page.evaluate(() => { window.__api = {}; });

/* ═══ מסע 1: פותחים את האפליקציה ═══ */
{
  journey("פתיחה: מה עושים עכשיו?");
  const nb = await nowBar(); const sc = await onScreen();
  note(nb ? `שורת "עכשיו": "${nb.title}" · כפתור: "${nb.primary}" · ${nb.visible ? "בתוך המסך" : "מחוץ למסך"}` : 'אין שורת "עכשיו" על המסך');
  note(`${sc.all} פקדים גלויים בלשונית, ${sc.fold} מהם בלי לגלול`);
  await shot("open");
}

/* ═══ מסע 2: לבנות את השבוע ═══ */
{
  journey("שבוע חדש: ימים, אישור, נעילה");
  // 4 ימים פתוחים. כל סימון = משמרת ברירת מחדל 06:30–11:00
  for (const i of [0, 2, 4, 5]) await tap(`#planner .planday:nth-child(${i + 1}) input[type=checkbox]`);
  const sh = await page.evaluate(() => (window.__store.weeks && Object.values(window.__store.weeks)[0] || {}).shifts || []);
  note(`4 נגיעות → ${sh.length} משמרות עם שעות ברירת מחדל ${sh[0] && sh[0].start}–${sh[0] && sh[0].end}`);
  note('לא לחצתי "כמו שבוע שעבר" — בשבוע הראשון אין ממה להעתיק. משבוע 2 זו נגיעה אחת.');
  // שעה שונה ביום שישי — שני שדות זמן
  await type("#planner .planday:nth-child(6) input[type=time] >> nth=0", "07:30");
  await page.keyboard.press("Tab"); await page.waitForTimeout(150);
  // הצוות עונה (מדמים שני עובדים)
  const wid = await page.evaluate(() => "w" + Object.keys(window.__store.weeks)[0].slice(1));
  await page.evaluate((wid) => {
    window.__seed("roster", "tokAAA", { name: "נועה", phone: "0501111111", active: true });
    window.__seed("roster", "tokBBB", { name: "יובל", phone: "0502222222", active: true });
    window.__seed("availability", wid + "_tokAAA", { week: wid, token: "tokAAA", name: "נועה", days: { 0: "yes", 2: "yes", 4: "maybe", 5: "yes" } });
    window.__seed("availability", wid + "_tokBBB", { week: wid, token: "tokBBB", name: "יובל", days: { 0: "no", 2: "yes", 4: "yes", 5: "yes" } });
    window.__fire();
  }, wid);
  await page.waitForTimeout(300);
  const before = dialogs.length;
  await tap("#approveBtn");                          // אשר ופתח לשיבוץ
  await page.waitForTimeout(300);
  note(dialogs.length > before ? "האישור זרק חלון אישור" : "האישור עבר בלי חלון");
  // העובדים משתבצים (מדמים)
  await page.evaluate((wid) => {
    const shifts = Object.values(window.__store.weeks)[0].shifts;
    const who = { 0: "tokAAA", 2: "tokBBB", 4: "tokBBB", 5: "tokAAA" };
    for (const s of shifts) window.__seed("signups", `${wid}_${s.id}_${who[s.day]}`, { week: wid, shift: s.id, token: who[s.day] });
    window.__fire();
  }, wid);
  await page.waitForTimeout(300);
  await tap("#phaseBar button.primary");             // נעל
  await page.waitForTimeout(400);
  const ph = await page.evaluate(() => Object.values(window.__store.weeks)[0].phase);
  note(`השבוע ב-${ph}. סה"כ 3 פאזות (זמינות → פתוח → נעול) = 2 לחיצות אישור נפרדות של המנהל.`);
  await shot("locked");
}

/* ═══ מסע 3: לשגר שעות ═══ */
{
  journey("שגר: שעות הפתיחה בכל מקום");
  await page.evaluate(() => { window.__api["/hours/facebook"] = { ok: true }; window.__api["/hours/google"] = { fail: "not_configured גוגל עוד לא מחוברת" }; });
  await tap("#launchBtn");
  await page.waitForTimeout(700);
  const rows = await page.evaluate(() => [...document.querySelectorAll(".launchrow")].map(r => r.className.replace("launchrow ", "") + ": " + r.querySelector("b").textContent));
  note("תוצאות: " + rows.join(" · "));
  const manual = rows.filter(r => r.startsWith("manual")).length;
  note(`${manual} ערוצים נשארים ידניים (העתק → פתח → הדבק → חזור → "עדכנתי ✓" = ~5 נגיעות לכל אחד, מחוץ לאפליקציה)`);
  await tap("#launchList button.primary");           // עדכנתי ✓
  await shot("launched");
}

/* ═══ מסע 4: פוסט אחד ═══ */
{
  journey("קריאייטיב: פוסט אחד מאפס עד מוכן");
  await page.evaluate(() => {
    window.__api["/ai/post"] = { text: "הבוקר הראשון עם סוודר. הקיטור עולה מהמכונה ואפשר לראות אותו מהספסל.", hashtags: ["#קורטדו", "#קיבוץשניר"] };
  });
  await tab("creative");
  const nb = await nowBar(); const sc = await onScreen();
  note(`בכניסה: ${sc.all} פקדים גלויים, ${sc.fold} בלי לגלול`);
  const hero = await page.textContent(".nextup button.primary");
  note(`הכפתור הגדול: "${hero}"`);
  if (/ספר לי/.test(hero)){ await tap(".nextup .link"); note('בחרתי "לכתוב בלי זה" — השיחה השבועית היא 3–4 שאלות נוספות (לא נמדדו כאן)'); }
  else await tap(".nextup button.primary");
  await page.waitForTimeout(300);
  const fields = await page.evaluate(() => [...document.querySelectorAll("#composer input,#composer textarea,#composer select")].filter(n => n.offsetParent !== null).length);
  note(`במסך הכתיבה: ${fields} שדות גלויים`);
  await tap("#aiWrite");
  await page.waitForTimeout(300);
  await tap("#saveReady");                            // ייחסם — שער ההוספה
  await page.waitForTimeout(200);
  const gate = await page.textContent("#compStatus");
  if (/משפט/.test(gate)){ note("נחסם: " + gate.slice(0, 50)); J.asks.push("שער: משפט משלך"); }
  await type("#cLine", "דני לקח כפול, כרגיל.");
  await tap("#saveReady");
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => Object.values(window.__store.posts || {}).length);
  note(`נשמר: ${saved} פוסט. סה"כ מהלשונית עד "מוכן": ${J.taps} נגיעות, ${J.fields} שדה מוקלד.`);
  await shot("post");
  await tap("#closeComposer");
}

/* ═══ מסע 5: ייצוא למתזמן ═══ */
{
  journey("ייצוא: מהאפליקציה למתזמן");
  await page.evaluate(() => { document.getElementById("exportCard").open = true; });
  await tap("#exportCsv");
  await page.waitForTimeout(200);
  const st = await page.textContent("#exportStatus");
  note("אחרי ההורדה: " + st.slice(0, 70));
  note('ואז מחוץ לאפליקציה: לפתוח מתזמן, לייבא CSV, להעלות תמונה ידנית לכל פוסט, לחזור ולסמן "תוזמן ✓" לכל פוסט');
  await tap("#exportList button.primary");           // תוזמן ✓
  const s = await page.evaluate(() => Object.values(window.__store.posts)[0].status);
  note(`סטטוס אחרי הסימון: ${s}. "פורסם" הוא עוד סימון ידני אחרי שהפוסט באמת יצא.`);
}

/* ═══ מסע 6: להוסיף עובד ═══ */
{
  journey("צוות: להוסיף עובד ולשלוח קישור");
  await tab("team");
  await page.evaluate(() => { document.getElementById("teamAdd").open = true; });
  await type("#tName", "מאיה"); await type("#tPhone", "0503333333");
  const optional = await page.evaluate(() => ["tEmail", "tRole"].filter(id => document.getElementById(id).offsetParent !== null).length);
  note(`${optional} שדות אופציונליים מוצגים באותו משקל כמו החובה`);
  await tap("#tSave");
  await page.waitForTimeout(300);
  const n = await page.evaluate(() => Object.keys(window.__store.roster || {}).length);
  note(`בסגל: ${n}. הקישור האישי נוצר לבד; השליחה בוואטסאפ היא נגיעה אחת נוספת.`);
}

/* ═══ מסע 7: יומן משמרת ═══ */
{
  journey("יומן: דיווח אחרי משמרת");
  await tab("log");
  const f = await page.evaluate(() => [...document.querySelectorAll("#p-log input,#p-log select")].filter(n => n.offsetParent !== null).map(n => n.id));
  note(`${f.length} שדות: ${f.join(", ")}`);
  const pre = await page.evaluate(() => ({ date: document.getElementById("lDate").value, weather: document.getElementById("lWeather").value }));
  note(`מולא מראש: תאריך=${pre.date || "ריק"} · מזג אוויר=${pre.weather || "ריק"}`);
  await type("#lCustomers", "38"); await type("#lPeak", "09:30");
  await tap("#lSave");
  await page.waitForTimeout(300);
  const ok = await page.evaluate(() => Object.keys(window.__store.log || {}).length);
  note(ok ? "נשמר עם 2 שדות בלבד" : "לא נשמר: " + (await page.textContent("#logStatus")));
}

/* ── דוח ── */
console.log("\n════════ סימולציה: שבוע של הבעלים ════════");
let T = 0, F = 0, A = 0;
for (const j of report){
  T += j.taps; F += j.fields; A += j.asks.length;
  console.log(`\n▶ ${j.name}\n   ${j.taps} נגיעות · ${j.fields} שדות · ${j.asks.length} החלטות נדרשו`);
  j.notes.forEach(n => console.log("   – " + n));
  j.asks.forEach(a => console.log("   ? " + a));
}
console.log(`\nסה"כ: ${T} נגיעות · ${F} שדות · ${A} החלטות שהאפליקציה זרקה על המנהל`);
console.log(errors.length ? "\nשגיאות JS:\n" + [...new Set(errors)].join("\n") : "\nאין שגיאות JS");
await b.close(); server.kill();
try { unlinkSync(ROOT + "sim.html"); } catch {}
