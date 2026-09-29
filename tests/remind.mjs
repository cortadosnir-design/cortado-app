// תזכורות זמינות, שעת סגירה, "לא אוכל להגיע", וסרגל של 5 לכל היותר.
// האפליקציה האמיתית (app.js וכל המודולים) על Firestore מזויף, ודף העובד על Firebase מזויף.
//   node tests/remind.mjs
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { spawn } from "child_process";
import { buildFullCore } from "./fullcore.mjs";
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = process.env.PORT || 8904;
const BASE = `http://127.0.0.1:${PORT}`;

buildFullCore();
let html = readFileSync(ROOT + "index.html", "utf8");
html = html.replace("</head>", `<script type="importmap">{"imports":{"/core.js":"/tests/stubs/core-full.js"}}</script></head>`);
writeFileSync(ROOT + "remind.html", html);
const server = spawn("npx", ["--yes", "http-server", ROOT, "-p", String(PORT), "-s"], { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${m}${extra ? "  " + extra : ""}`); };
const b = await chromium.launch();
const errors = [];
const watch = (p) => {
  p.on("pageerror", e => errors.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/ERR_CERT|ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
};

/* ── המנהלת ── */
console.log("\nסרגל הניווט");
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
watch(page); page.on("dialog", d => d.accept());
await page.goto(`${BASE}/remind.html`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#tabs:not([hidden])", { timeout: 8000 });
await page.evaluate(() => { window.__api = {}; });
const tabs = await page.evaluate(() => [...document.querySelectorAll("#tabs [role=tab]")].filter(t => !t.hidden).length);
ok(tabs <= 5, "עד 5 כפתורים בסרגל", String(tabs));

console.log("\nתזכורות זמינות");
await page.click("#tab-shifts"); await page.waitForTimeout(200);
for (const i of [0, 4]) { await page.click(`#planner .planday:nth-child(${i + 1}) input[type=checkbox]`); await page.waitForTimeout(150); }
const wid = await page.evaluate(() => Object.keys(window.__store.weeks)[0]);
await page.evaluate((wid) => {
  window.__seed("roster", "tokAAA", { name: "נועה כהן", phone: "0501111111", active: true });
  window.__seed("roster", "tokBBB", { name: "יובל", phone: "0502222222", active: true });
  window.__seed("roster", "tokCCC", { name: "דנה", active: true });                      // בלי טלפון
  window.__seed("availability", wid + "_tokAAA", { week: wid, token: "tokAAA", name: "נועה כהן", days: { 0: "yes" } });
  window.__fire();
}, wid);
await page.waitForTimeout(300);
const btn = await page.evaluate(() => [...document.querySelectorAll("#now button")].map(b => b.textContent));
ok(btn.includes("הזכר ל-2"), "הכפתור הראשי: הזכר ל-2 (רק מי שחסר)", btn.join(" | "));
await page.evaluate(() => [...document.querySelectorAll("#now button")].find(b => b.textContent === "הזכר ל-2").click());
await page.waitForTimeout(200);
const rows = await page.evaluate(() => [...document.querySelectorAll("#now .remind .remindrow b")].map(x => x.textContent));
ok(rows.length === 2 && !rows.includes("נועה כהן"), "ברשימה רק מי שלא שלח", rows.join(", "));
ok(await page.evaluate(() => /עוד לא נקבעה/.test(document.querySelector("#now .remind").textContent)), "מבקש לקבוע שעת סגירה");
await page.evaluate(() => [...document.querySelectorAll("#now .remind button")].find(b => b.textContent === "קבע").click());
await page.waitForTimeout(300);
const availBy = await page.evaluate((wid) => window.__store.weeks[wid].availBy, wid);
ok(/^\d{4}-\d\d-\d\dT20:00$/.test(availBy || ""), "שעת סגירה נשמרת: יומיים מהיום ב-20:00", availBy);
ok(await page.evaluate(() => /נסגר /.test(document.getElementById("now").textContent)), "שורת עכשיו מראה מתי נסגר");

const wa = await page.evaluate(() => { const a = [...document.querySelectorAll("#now .remind a.btn.wa")].find(x => /יובל/.test(decodeURIComponent(x.href))); return a && { href: decodeURIComponent(a.href), text: a.textContent }; });
ok(wa && wa.href.startsWith("https://wa.me/972502222222"), "וואטסאפ ליובל, למספר הנכון", wa && wa.href.slice(0, 40));
ok(wa && /z\.html#tokBBB/.test(wa.href), "ההודעה כוללת את הקישור האישי שלו");
ok(wa && /עד .* ב-20:00/.test(wa.href), "ההודעה כוללת את שעת הסגירה");
ok(wa && wa.text.startsWith("בקשה"), "הראשונה מסומנת 'בקשה'", wa && wa.text);
ok(await page.evaluate(() => [...document.querySelectorAll("#now .remind button")].some(b => /העתק/.test(b.textContent))), "לדנה (בלי טלפון): העתקה במקום וואטסאפ");

// שלוש לחיצות ליובל: בקשה, תזכורת, אחרונה — ואז מפסיקים
const labels = [];
await page.context().route("https://wa.me/**", r => r.fulfill({ status: 200, body: "" }));
page.context().on("page", p => p.close().catch(() => {}));
for (let k = 0; k < 3; k++){
  const t = await page.evaluate(() => { const a = [...document.querySelectorAll("#now .remind a.btn.wa")].find(x => /יובל/.test(decodeURIComponent(x.href))); if (!a) return null; const t = a.textContent; a.click(); return t; });
  labels.push(t); await page.waitForTimeout(250);
}
ok(labels.join("|") === "בקשה בוואטסאפ|תזכורת בוואטסאפ|תזכורת אחרונה בוואטסאפ", "בקשה → תזכורת → תזכורת אחרונה", labels.join(" | "));
const count = await page.evaluate((wid) => (window.__store.weeks[wid].reminded || {}).tokBBB, wid);
ok(count === 3, "נספר על השבוע: 3 ליובל", String(count));
ok(await page.evaluate(() => ![...document.querySelectorAll("#now .remind a.btn.wa")].some(x => /יובל/.test(decodeURIComponent(x.href))) && /מספיק/.test(document.querySelector("#now .remind").textContent)),
  "אחרי 3 אין עוד כפתור ליובל");
ok(await page.evaluate((wid) => (window.__store.weeks[wid].shifts || []).length === 2 && window.__store.weeks[wid].phase === "availability", wid), "השבוע לא נפגע מהכתיבה");

// ביום הסגירה ההודעה אומרת "נסגרת היום"
await page.evaluate((wid) => {
  const d = new Date(); d.setHours(23, 59, 0, 0);
  const p = (n) => String(n).padStart(2, "0");
  window.__seed("weeks", wid, { ...window.__store.weeks[wid], availBy: `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T23:59`, reminded: {} });
  window.__fire();
}, wid);
await page.waitForTimeout(300);
const lastDay = await page.evaluate(() => { const a = [...document.querySelectorAll("#now .remind a.btn.wa")][0]; return a && decodeURIComponent(a.href); });
ok(lastDay && /נסגרת היום ב-23:59/.test(lastDay), "ביום הסגירה: 'נסגרת היום ב-…'");
ok(!errors.length, "בלי שגיאות בקונסולה", errors.slice(0, 3).join(" | "));

/* ── דף העובד ── */
console.log("\nדף העובד");
const now = new Date();
const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate()); sunday.setDate(sunday.getDate() - sunday.getDay());
if (now.getDay() >= 5) sunday.setDate(sunday.getDate() + 7);
const p2 = (n) => String(n).padStart(2, "0");
const W = "w" + `${sunday.getFullYear()}-${p2(sunday.getMonth()+1)}-${p2(sunday.getDate())}`;
const zStub = (docs) => `
const DOCS = ${JSON.stringify(docs)};
export const getFirestore = () => ({});
export const doc = (_db, ...p) => p.join("/");
const snap = (k) => ({ exists: () => k in DOCS, data: () => DOCS[k] });
export const getDoc = async (k) => snap(k);
export const setDoc = async (k, v) => { DOCS[k] = v; };
export const deleteDoc = async (k) => { delete DOCS[k]; };
export const serverTimestamp = () => null;`;
async function zPage(docs){
  const z = await b.newPage({ viewport: { width: 390, height: 844 } }); watch(z);
  await z.route("**/firebasejs/**", r => r.fulfill({ status: 200, contentType: "application/javascript",
    body: r.request().url().includes("firestore") ? zStub(docs) : "export const initializeApp = () => ({});" }));
  await z.goto(`${BASE}/z.html#tokBBBtokBBBtok`, { waitUntil: "domcontentloaded" });
  await z.waitForTimeout(900);
  return z;
}
const future = new Date(now); future.setDate(future.getDate() + 2); future.setHours(20, 0, 0, 0);
const fIso = `${future.getFullYear()}-${p2(future.getMonth()+1)}-${p2(future.getDate())}T20:00`;
const shifts = [0,1,2,3,4,5,6].map(d => ({ id: "s" + d, day: d, start: "00:00", end: "23:59", need: 1 }));
let z = await zPage({ "roster/tokBBBtokBBBtok": { name: "יובל", active: true },
  [`weeks/${W}`]: { phase: "availability", shifts, availBy: fIso } });
const zd = await z.evaluate(() => { const n = document.getElementById("zdeadline"); return n && n.textContent; });
ok(zd && /שלחו עד .* ב-20:00/.test(zd), "העובד רואה עד מתי לשלוח", zd);
await z.close();

const sign = Object.fromEntries(shifts.map(s => [`signups/${W}_${s.id}_tokBBBtokBBBtok`, { week: W, shift: s.id }]));
z = await zPage({ "roster/tokBBBtokBBBtok": { name: "יובל", active: true },
  [`weeks/${W}`]: { phase: "locked", shifts }, ...sign });
const cant = await z.evaluate(() => [...document.querySelectorAll("a.btn.cant")].map(a => decodeURIComponent(a.href)));
ok(cant.length >= 1, "במשמרת שעוד לפניו: 'לא אוכל להגיע'", String(cant.length));
ok(cant[0] && cant[0].startsWith("https://wa.me/972543125466") && /יובל/.test(cant[0]) && /00:00–23:59/.test(cant[0]),
  "וואטסאפ לעגלה עם שם, יום ושעות", cant[0] && cant[0].slice(0, 60));
const ahead = shifts.filter(sh => { const e = new Date(sunday); e.setDate(e.getDate() + sh.day); e.setHours(23, 59, 0, 0); return e > now; }).length;
ok(cant.length === ahead, "לא מוצע על משמרות שכבר נגמרו", `${cant.length}, צפוי ${ahead}`);
await z.close();

await b.close();
server.kill();
try { unlinkSync(ROOT + "remind.html"); } catch {}
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
