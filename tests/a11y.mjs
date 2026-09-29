// נגישות: כל מסך של האפליקציה האמיתית (app.js וכל המודולים) + דף העובד + דף השעות.
// axe-core (WCAG 2.1 AA) בבהיר ובכהה, יעדי מגע, רוחב 320 (זום 400%), מקלדת.
//   node tests/a11y.mjs     (צריך playwright ו-axe-core, גלובלית זה בסדר)
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { spawn, execSync } from "child_process";
import { buildFullCore } from "./fullcore.mjs";
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }
const GLOBAL = execSync("npm root -g").toString().trim();
let AXE;
for (const p of ["../node_modules/axe-core/axe.min.js", GLOBAL + "/axe-core/axe.min.js"]){
  try { AXE = readFileSync(p.startsWith("/") ? p : new URL(p, import.meta.url), "utf8"); break; } catch {}
}
if (!AXE){ console.log("⚠️  axe-core לא מותקן (npm i -g axe-core). מדלג."); process.exit(0); }

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = process.env.PORT || 8903;
const BASE = `http://127.0.0.1:${PORT}`;

buildFullCore();
let html = readFileSync(ROOT + "index.html", "utf8");
html = html.replace("</head>", `<script type="importmap">{"imports":{"/core.js":"/tests/stubs/core-full.js"}}</script></head>`);
writeFileSync(ROOT + "a11y.html", html);
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

async function axe(page, label){
  await page.addScriptTag({ content: AXE });
  const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }))
    .violations.map(x => `${x.id}(${x.nodes.length}): ${x.nodes.slice(0, 2).map(n => n.target.join(" ")).join(" | ")}`));
  ok(!v.length, `axe · ${label}`, v.join(" ; "));
}
// יעד מגע: 44×44 לכל פקד שעומד לבד. קישור בתוך שורת טקסט פטור (WCAG 2.5.8).
async function taps(page, label){
  const small = await page.evaluate(() => [...document.querySelectorAll("button,input:not([type=hidden]),select,textarea,summary,a.btn,[role=tab]")]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && e.offsetParent !== null && (r.height < 40 || r.width < 24); })
    .filter(e => !(e.type === "checkbox" && e.closest("label")))
    .map(e => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""} "${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 18)}" ${Math.round(e.getBoundingClientRect().height)}px`));
  ok(!small.length, `יעדי מגע · ${label}`, [...new Set(small)].slice(0, 6).join(" ; "));
}

/* ── האפליקציה של המנהל ── */
console.log("\nהאפליקציה");
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
watch(page); page.on("dialog", d => d.accept());
await page.goto(`${BASE}/a11y.html`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#tabs:not([hidden])", { timeout: 8000 });
await page.evaluate(() => { window.__api = {}; });
// שבוע עם תוכן, כדי שיהיו טבלאות, כפתורים ושורות אמיתיות לבדוק
for (const i of [0, 4]) { await page.click(`#planner .planday:nth-child(${i + 1}) input[type=checkbox]`); await page.waitForTimeout(150); }
await page.evaluate(() => {
  window.__seed("roster", "tokAAA", { name: "נועה", phone: "0501111111", active: true });
  window.__fire();
});
await page.waitForTimeout(300);

const TABS = await page.evaluate(() => [...document.querySelectorAll("#tabs [role=tab]")].filter(t => !t.hidden).map(t => t.id.replace("tab-", "")));
// "הפצה" היא מסך בתוך קריאייטיב (מתג תוכן | הפצה), לא כפתור בסרגל.
const VIEWS = [...TABS, "reach"];
const go = async (t) => t === "reach"
  ? (await page.click("#tab-creative"), await page.click('#p-creative .subbtn[data-view="reach"]'))
  : page.click("#tab-" + t);
for (const scheme of ["light", "dark"]){
  await page.emulateMedia({ colorScheme: scheme });
  for (const t of VIEWS){
    await go(t); await page.waitForTimeout(350);
    await axe(page, `${t} (${scheme === "dark" ? "כהה" : "בהיר"})`);
    if (scheme === "light") await taps(page, t);
  }
}
await page.emulateMedia({ colorScheme: "light" });

console.log("\nזום 400% (רוחב 320)");
await page.setViewportSize({ width: 320, height: 700 });
for (const t of VIEWS){
  await go(t); await page.waitForTimeout(250);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(w <= 321, `בלי גלילה לצדדים · ${t}`, w > 321 ? `${w}px` : "");
}
await page.setViewportSize({ width: 390, height: 844 });

console.log("\nמקלדת");
await page.click("#tab-" + TABS[0]); await page.focus("#tab-" + TABS[0]);
await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(200);
ok(await page.evaluate((n) => document.activeElement.id === "tab-" + n && !document.getElementById("p-" + n).hidden, TABS[1]),
  "חץ עובר ללשונית הבאה ופותח אותה");
await page.keyboard.press("End");
ok(await page.evaluate((n) => document.activeElement.id === "tab-" + n, TABS[TABS.length - 1]), "End ללשונית האחרונה");
await page.keyboard.press("Home");
ok(await page.evaluate((n) => document.activeElement.id === "tab-" + n, TABS[0]), "Home ללשונית הראשונה");
ok(await page.evaluate(() => [...document.querySelectorAll("#tabs [role=tab]")].filter(t => t.tabIndex === 0).length === 1),
  "רק הלשונית הפעילה בסדר הטאב");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("#tabs:not([hidden])");
await page.keyboard.press("Tab");
ok(await page.evaluate(() => /דלג/.test(document.activeElement.textContent || "")), "טאב ראשון = דלג לתוכן");
await page.keyboard.press("Enter"); await page.waitForTimeout(150);
ok(await page.evaluate(() => document.activeElement.id === "main"), "הדילוג מביא לתוכן");
// הניווט התחתון לא מסתיר את מה שבפוקוס
const hidden = await page.evaluate(async () => {
  const nav = document.getElementById("tabs").getBoundingClientRect();
  if (getComputedStyle(document.getElementById("tabs")).position !== "fixed") return 0;
  let n = 0;
  window.scrollTo(0, 0);
  for (const e of [...document.querySelectorAll("#p-shifts button, #p-shifts input")].filter(e => e.offsetParent && !e.disabled && e.getBoundingClientRect().top > innerHeight).slice(0, 6)){
    e.focus(); await new Promise(r => setTimeout(r, 400));
    const r = e.getBoundingClientRect(); if (r.bottom > nav.top + 1 || r.top < 0) n++;
  }
  return n;
});
ok(hidden === 0, "הניווט התחתון לא מכסה פקד בפוקוס", hidden ? `${hidden} מוסתרים` : "");
ok(!errors.length, "בלי שגיאות בקונסולה", errors.slice(0, 3).join(" | "));

/* ── דף העגלה (דף הנחיתה, כולל השעות) ── */
console.log("\nדף העגלה");
const hp = await b.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }); watch(hp);
await hp.route("**/firebasejs/**", r => r.fulfill({ status: 200, contentType: "application/javascript",
  body: r.request().url().includes("firestore")
    ? `export const getFirestore=()=>({});export const doc=()=>({});export const onSnapshot=(r,ok)=>{setTimeout(()=>ok({exists:()=>true,data:()=>({from:"2026-09-27",to:"2026-10-03",days:["09:30–12:30","","","","09:30–12:30","09:00–12:00",""]})}),0);return()=>{};};export const getDoc=async()=>({exists:()=>false});`
    : `export const initializeApp=()=>({});` }));
await hp.goto(`${BASE}/cafe/`, { waitUntil: "domcontentloaded" }); await hp.waitForTimeout(1500);
await axe(hp, "cafe/");

await b.close();
server.kill();
try { unlinkSync(ROOT + "a11y.html"); } catch {}
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
