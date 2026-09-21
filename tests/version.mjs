// גרסה אחת, שני קבצים. אם הם נפרדים — ה-Service Worker לא מתחלף,
// והאפליקציה ממשיכה להיראות אותו דבר אחרי כל דחיפה.
import { readFileSync } from "fs";
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const cfg = /APP_VERSION\s*=\s*"([^"]+)"/.exec(read("config.js"));
const sw  = /VERSION\s*=\s*"([^"]+)"/.exec(read("sw.js"));
const html = /<meta name="app-build" content="([^"]+)">/.exec(read("index.html"));
let pass = 0, fail = 0;
const ok = (n, c, x="") => c ? (pass++, console.log("  ✓ " + n + (x?"  "+x:""))) : (fail++, console.log("  ✗ " + n + "  " + x));
console.log("\n14. גרסת הבנייה");
ok("APP_VERSION מוגדר ב-config.js", !!cfg, cfg && cfg[1]);
ok("VERSION מוגדר ב-sw.js", !!sw, sw && sw[1]);
ok("השניים זהים", !!cfg && !!sw && cfg[1] === sw[1], `${cfg && cfg[1]} מול ${sw && sw[1]}`);
ok("app-build מוגדר ב-index.html", !!html, html && html[1]);
ok("שלושתם זהים", !!cfg && !!html && cfg[1] === html[1], `${cfg && cfg[1]} מול ${html && html[1]}`);
ok("app.js מזהה ערבוב גרסאות", /meta\[name="app-build"\]/.test(read("app.js")) && /location\.reload/.test(read("app.js")));
ok("שם המטמון נגזר מהגרסה", /CACHE\s*=\s*"cortado-shell-"\s*\+\s*VERSION/.test(read("sw.js")));

/* רשימת ה-SHELL חייבת לכסות כל מודול שהאפליקציה מייבאת. שלושה קבצים
   (weather, season, people) נשכחו בה, ופתיחה קרה בלי רשת נשברה בשקט —
   כי המאזין הרגיל ממילא שומר אותם אחרי הביקור המקוון הראשון. */
const swSrc = read("sw.js");
const shell = new Set([...swSrc.matchAll(/"\.\/([a-z0-9-]+\.js)"/g)].map(m => m[1]));
const imported = new Set();
for (const f of ["app.js", ...shell])
  try { for (const m of read(f).matchAll(/from\s+"\.\/([a-z0-9-]+\.js)"/g)) imported.add(m[1]); } catch {}
const missing = [...imported].filter(f => !shell.has(f)).sort();
ok("כל מודול שמיובא נמצא ב-SHELL", missing.length === 0, missing.join(", "));
ok("ה-Service Worker מקשיב להודעת skip", /addEventListener\("message"/.test(swSrc) && /skipWaiting/.test(swSrc));

/* ללא skipWaiting אוטומטי, "רענן" חייב לחכות ל-controllerchange.
   רענון מיד אחרי postMessage מוגש עדיין ע"י ה-SW הישן, והבאנר חוזר. */
const appSrc = read("app.js");
const reloadBlock = appSrc.slice(appSrc.indexOf('$("reloadNow")'));
ok('"רענן" מחכה ל-controllerchange לפני הרענון',
  reloadBlock.includes("controllerchange") && reloadBlock.includes("postMessage")
  && reloadBlock.indexOf("controllerchange") < reloadBlock.indexOf("postMessage"));
ok("ה-SW לא קורא ל-skipWaiting בהתקנה (זה מה שגרם לערבוב הגרסאות)",
  !/install[\s\S]{0,200}?skipWaiting/.test(swSrc));
ok("רק תשובה תקינה נכנסת למטמון", /res\.ok/.test(swSrc));

/* לוח החגים נגמר בשקט. כשהתאריך האחרון עובר, חלונות הביקוש ב-season.js
   מתרוקנים ואין שום סימן — רק שהאפליקציה מפסיקה להזכיר את סוכות. */
const holidays = [...read("playbook.js").matchAll(/\["(\d{4}-\d{2}-\d{2})","([^"]+)"/g)];
const last = holidays.map(m => m[1]).sort().pop();
const monthsLeft = last ? (new Date(last) - Date.now()) / (30 * 864e5) : -1;
ok("לוח החגים מכסה לפחות 3 חודשים קדימה", monthsLeft >= 3,
  last ? `אחרון: ${last} (${monthsLeft.toFixed(1)} חודשים)` : "אין חגים כלל");
ok("ראש השנה קיים בלוח (season.js מסתמך עליו)", holidays.some(m => m[2].startsWith("ראש השנה")));

// z.js חייב לקרוא את החגים מ-playbook ולא להחזיק רשימה משלו.
ok("z.js לא מחזיק רשימת חגים משלו", !/^const HOLIDAYS = \[/m.test(read("z.js")));

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
