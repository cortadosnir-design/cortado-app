/* חוזה הייצוא בין המודולים.

   הבדיקה הזו נולדה מבאג אמיתי: shifts.js הגדיר `const sentKeys` בלי
   `export`, ו-ops.js קרא ל-`Shifts.sentKeys()`. בייבוא מרחב-שמות זה לא
   שגיאת טעינה אלא `undefined` — כלומר TypeError בזמן ריצה, באמצע ציור
   לשונית הצוות, אחרי שהטבלה כבר נוקתה. התוצאה: מסך ריק, והשורות שאחרי
   הקריאה באותו קולבק (drawReminders, emit) לא רצות בכלל.

   אף בדיקת דפדפן לא תפסה את זה, כי ה-harness לא טוען את ops.js.
   כאן זה נבדק סטטית, על כל המודולים, בלי דפדפן. */
import { readFileSync, readdirSync } from "fs";
const ROOT = new URL("..", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");

let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n + (x ? "  " + x : "")))
                               : (fail++, console.log("  ✗ " + n + "  " + x));

const files = readdirSync(ROOT).filter(f => f.endsWith(".js") && f !== "sw.js");

/** כל השמות שמודול מייצא. */
function exportsOf(src){
  const out = new Set();
  // export const/let/function/async function/class NAME
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm))
    out.add(m[1]);
  // export { a, b as c }
  for (const block of src.matchAll(/^export\s*\{([^}]*)\}/gms))
    for (const part of block[1].split(","))
      { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) out.add(n); }
  return out;
}

const exp = {};
for (const f of files) exp[f] = exportsOf(read(f));

console.log("\n25. חוזה הייצוא בין המודולים");

/* 1. ייבוא מרחב-שמות: import * as X from "./m.js"  →  כל X.foo חייב להיות מיוצא. */
let nsBad = [];
for (const f of files){
  const src = read(f);
  for (const m of src.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+"\.\/([a-z-]+\.js)"/g)){
    const [, alias, mod] = m;
    if (!exp[mod]) continue;
    for (const u of src.matchAll(new RegExp("\\b" + alias + "\\.([A-Za-z_$][\\w$]*)", "g")))
      if (!exp[mod].has(u[1])) nsBad.push(`${f}: ${alias}.${u[1]} — ${mod} לא מייצא את זה`);
  }
}
ok("כל שימוש בייבוא מרחב-שמות מכוון לייצוא אמיתי", nsBad.length === 0, nsBad.join(" · "));

/* 2. ייבוא שמי: import { a, b } from "./m.js"  →  כל שם חייב להיות מיוצא. */
let namedBad = [];
for (const f of files){
  const src = read(f);
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/([a-z-]+\.js)"/gs)){
    const mod = m[2];
    if (!exp[mod]) continue;
    for (const part of m[1].split(",")){
      const n = part.trim().split(/\s+as\s+/)[0].trim();
      if (n && !exp[mod].has(n)) namedBad.push(`${f}: ${n} ← ${mod}`);
    }
  }
}
ok("כל ייבוא שמי מכוון לייצוא אמיתי", namedBad.length === 0, namedBad.join(" · "));

/* 3. ייבוא שלא בשימוש — רעש, לא שבירה, אבל מסתיר תלות אמיתית. */
let unused = [];
for (const f of files){
  const src = read(f);
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/[a-z-]+\.js";/gs)){
    const body = src.slice(0, m.index) + src.slice(m.index + m[0].length);
    for (const part of m[1].split(",")){
      const n = part.trim().split(/\s+as\s+/).pop().trim();
      if (n && n !== "$" && !new RegExp("\\b" + n.replace(/\$/g, "\\$") + "\\b").test(body))
        unused.push(`${f}: ${n}`);
    }
  }
}
ok("אין ייבוא מת", unused.length === 0, unused.join(" · "));

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
