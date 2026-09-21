/* מנגנון ההרשאות: מייסד מול מנהל.

   הבדיקות כאן סטטיות על firestore.rules ועל הקוד, בלי דפדפן ובלי
   Firestore אמיתי. הן לא מוכיחות שהכללים עובדים בענן — את זה אפשר רק
   מול המערכת החיה — אבל הן כן תופסות את כל מה שאפשר לשבור בעריכה:
   שדגל admin לא ייפול תחת ידו של מנהל רגיל, שהמייסדים נשארים זהים
   בארבעת המקומות, ושהשרת בודק את אותו מקור שהכללים אוכפים. */
import { readFileSync } from "fs";
const ROOT = new URL("..", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");

let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n + (x ? "  " + x : "")))
                               : (fail++, console.log("  ✗ " + n + "  " + x));

const rules = read("firestore.rules");
const cfg = read("config.js");
const worker = read("worker/src/index.js");
const storage = read("storage.rules");

console.log("\n26. הרשאות: מייסד מול מנהל");

/* ---- הרצפה: המייסדים קבועים בקוד וזהים בכל מקום ---- */
const emailsIn = (src) => [...src.matchAll(/'([^']+@[^']+)'|"([^"]+@[^"]+)"/g)]
  .map(m => (m[1] || m[2]).toLowerCase()).filter(e => e.includes("@"));

const founders = emailsIn((/function isFounder\(\)[\s\S]*?\}/.exec(rules) || [""])[0]).sort();
const inCfg = emailsIn((/FOUNDER_EMAILS = \[[^\]]*\]/.exec(cfg) || [""])[0]).sort();
const inWorker = emailsIn((/DEFAULT_OWNERS = \[[^\]]*\]/.exec(worker) || [""])[0]).sort();
const inStorage = emailsIn((/function isOwner\(\)[\s\S]*?\}/.exec(storage) || [""])[0]).sort();

ok("firestore.rules מגדיר isFounder עם רשימה קבועה", founders.length > 0, founders.join(", "));
ok("config.js · FOUNDER_EMAILS זהה", String(inCfg) === String(founders), `${inCfg} מול ${founders}`);
ok("worker · DEFAULT_OWNERS זהה", String(inWorker) === String(founders), `${inWorker} מול ${founders}`);
ok("storage.rules · isOwner זהה", String(inStorage) === String(founders), `${inStorage} מול ${founders}`);

/* ---- שתי הדרגות ---- */
ok("isOwner מורכב ממייסד או ממנהל", /function isOwner\(\)\s*\{\s*return isFounder\(\)\s*\|\|\s*isAdmin\(\)/.test(rules));
ok("isAdmin נשען על דגל admin במסמך members",
  /function isAdmin\(\)[\s\S]*?members\/\$\(request\.auth\.uid\)[\s\S]*?get\('admin', false\) == true/.test(rules));
ok("isAdmin דורש מייל מאומת", /function isAdmin\(\)[\s\S]*?email_verified == true/.test(rules));

/* ---- הגבול שמגן על הכול: רק מייסד נוגע בדגל admin ---- */
const members = (/match \/members\/\{uid\} \{[\s\S]*?\n    \}/.exec(rules) || [""])[0];
ok("כלל members נמצא", members.length > 0);
ok("יצירה: מנהל רגיל לא יכול ליצור מנהל",
  /allow create:[\s\S]*?isFounder\(\) \|\| !adminOf\(request\.resource\.data\)/.test(members));
ok("עדכון: מנהל רגיל לא יכול לשנות את דגל הניהול",
  /allow update:[\s\S]*?isFounder\(\) \|\| adminOf\(request\.resource\.data\) == adminOf\(resource\.data\)/.test(members));
ok("מחיקה: מנהל רגיל לא יכול להדיח מנהל",
  /allow delete:[\s\S]*?isFounder\(\) \|\| !adminOf\(resource\.data\)/.test(members));
ok("רשימת שדות סגורה על members", /hasOnly\(\['name','email','photo','admin','at'\]\)/.test(members));

/* ---- הממשק לא מציע מה שהכללים ידחו ---- */
const ops = read("ops.js");
ok("כפתור המינוי מוצג למייסד בלבד", /if \(S\.isFounder && !me\)/.test(ops));
ok("אי אפשר להסיר את עצמך", /const me = S\.me && m\.uid === S\.me\.uid/.test(ops));
ok("setAdmin כותב עם merge (לא דורס שם ומייל)", /setAdmin[\s\S]*?\{ admin: makeAdmin \}, \{ merge: true \}/.test(ops));

/* ---- השרת בודק את אותו מקור ---- */
ok("השרת בודק את דגל admin ב-members", /members\/\$\{encodeURIComponent\(uid\)\}/.test(worker));
ok("השרת מצרף את בדיקת המנהל לבדיקת המייסדים", /ownersOf\(env\)\.includes[\s\S]{0,80}isAdminUid\(env, user\.uid\)/.test(worker));
ok("בלי FIREBASE_SA השרת נכשל סגור (מייסדים בלבד)", /if \(!env\.FIREBASE_SA \|\| !uid\) return false;/.test(worker));

/* ---- הדפדפן ---- */
const app = read("app.js");
ok("app.js מפריד isFounder מ-isOwner", /S\.isFounder = .*FOUNDER_EMAILS/.test(app) && /S\.isOwner = m\.exists\(\) && m\.data\(\)\.admin === true/.test(app));

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
