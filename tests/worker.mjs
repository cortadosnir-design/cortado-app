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
process.exit(fail ? 1 : 0);
