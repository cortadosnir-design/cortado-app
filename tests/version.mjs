// גרסה אחת, שני קבצים. אם הם נפרדים — ה-Service Worker לא מתחלף,
// והאפליקציה ממשיכה להיראות אותו דבר אחרי כל דחיפה.
import { readFileSync } from "fs";
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const cfg = /APP_VERSION\s*=\s*"([^"]+)"/.exec(read("config.js"));
const sw  = /VERSION\s*=\s*"([^"]+)"/.exec(read("sw.js"));
let pass = 0, fail = 0;
const ok = (n, c, x="") => c ? (pass++, console.log("  ✓ " + n + (x?"  "+x:""))) : (fail++, console.log("  ✗ " + n + "  " + x));
console.log("\n14. גרסת הבנייה");
ok("APP_VERSION מוגדר ב-config.js", !!cfg, cfg && cfg[1]);
ok("VERSION מוגדר ב-sw.js", !!sw, sw && sw[1]);
ok("השניים זהים", !!cfg && !!sw && cfg[1] === sw[1], `${cfg && cfg[1]} מול ${sw && sw[1]}`);
ok("שם המטמון נגזר מהגרסה", /CACHE\s*=\s*"cortado-shell-"\s*\+\s*VERSION/.test(read("sw.js")));
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
