// ערבוב גרסאות: HTML חדש לצד JS ישן. בלי הטיפול הזה לשונית חדשה מצוירת
// אבל לא מגיבה ללחיצה, בלי שום שגיאה במסוף. הבדיקה רצה על app.js האמיתי.
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { spawn } from "child_process";
import { buildFullCore } from "./fullcore.mjs";
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = process.env.MIXPORT || 8905;
let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n + "  " + x));
console.log("\n24. ערבוב גרסאות מתוקן לבד");

buildFullCore();
const base = readFileSync(ROOT + "index.html", "utf8")
  .replace("</head>", `<script type="importmap">{"imports":{"/core.js":"/tests/stubs/core-full.js"}}</script></head>`);
// אותו עמוד פעמיים: פעם עם גרסה תואמת, ופעם עם HTML שמכריז על גרסה אחרת
writeFileSync(ROOT + "mix-same.html", base);
writeFileSync(ROOT + "mix-diff.html", base.replace(/<meta name="app-build" content="[^"]+">/, '<meta name="app-build" content="1999-01-01.1">'));
const server = spawn("npx", ["--yes", "http-server", ROOT, "-p", String(PORT), "-s"], { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));

const b = await chromium.launch();
async function run(page){
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  let navs = 0;
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) navs++; });
  await p.goto(`http://127.0.0.1:${PORT}/${page}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  const flags = await p.evaluate(() => { try { return Object.keys(sessionStorage).filter(k => k.startsWith("cortado-fixmix-")); } catch { return []; } });
  await p.close();
  return { navs, flags };
}

const same = await run("mix-same.html");
ok("גרסה תואמת: נטען פעם אחת, בלי רענון", same.navs === 1, `${same.navs} ניווטים`);
ok("גרסה תואמת: לא נשמר סימון", same.flags.length === 0, JSON.stringify(same.flags));

const diff = await run("mix-diff.html");
ok("גרסה שונה: האפליקציה רועננה לבד", diff.navs >= 2, `${diff.navs} ניווטים`);
ok("גרסה שונה: הסימון נרשם, לפי הגרסה שהוכרזה", diff.flags.includes("cortado-fixmix-1999-01-01.1"), JSON.stringify(diff.flags));
ok("הרענון קורה פעם אחת ולא בלולאה", diff.navs === 2, `${diff.navs} ניווטים`);

server.kill();
for (const f of ["mix-same.html", "mix-diff.html"]) { try { unlinkSync(ROOT + f); } catch {} }
await b.close();
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
