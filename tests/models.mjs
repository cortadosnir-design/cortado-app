// בחירת מודל Gemini, על הקוד האמיתי: חותכים את הקטע מהוורקר ומריצים אותו
// מול רשימת מודלים מזויפת. בלי זה, שינוי שם אצל גוגל מפיל את כל פיצ'רי ה-AI.
import { readFileSync } from "fs";
const src = readFileSync(new URL("../worker/src/index.js", import.meta.url), "utf8");
const from = src.indexOf("let MODELS_CACHE");
const to = src.indexOf("const MODEL_GONE");
if (from < 0 || to < 0) { console.log("  ✗ לא מצאתי את קטע בחירת המודל"); process.exit(1); }
const block = src.slice(from, to).replace(/^export /gm, "");

let fetchImpl = async () => ({ ok: false, json: async () => ({}) });
const mod = new Function("fetch", block + "\nreturn { listModels, modelScore, dropModelCache };")((...a) => fetchImpl(...a));

let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n + "  " + x));
console.log("\n25. בחירת מודל Gemini");

const reply = (names) => async () => ({ ok: true, json: async () => ({
  models: names.map(n => ({ name: "models/" + n, supportedGenerationMethods: ["generateContent"] })) }) });

mod.dropModelCache();
fetchImpl = reply(["gemini-2.5-flash", "gemini-4.1-flash", "gemini-4.1-pro", "gemini-4.2-flash-preview", "gemini-4.1-flash-lite"]);
let list = await mod.listModels({ GEMINI_API_KEY: "k" });
ok("הגרסה החדשה והיציבה נבחרת ראשונה", list[0] === "gemini-4.1-flash", list.join(", "));
ok("flash לפני pro באותה גרסה", list.indexOf("gemini-4.1-flash") < list.indexOf("gemini-4.1-pro"));
ok("preview נדחק אחורה למרות שהוא חדש יותר", list.indexOf("gemini-4.2-flash-preview") > list.indexOf("gemini-4.1-flash"));
ok("lite נדחק אחורי flash רגיל", list.indexOf("gemini-4.1-flash-lite") > list.indexOf("gemini-4.1-flash"));
ok("גרסה ישנה אחרונה", list[list.length - 1] === "gemini-2.5-flash", list.join(", "));

mod.dropModelCache();
fetchImpl = reply(["gemini-4.1-flash", "text-embedding-005", "gemini-embedding-001", "imagen-4.0", "gemini-2.5-flash-tts", "gemini-4.1-flash-live"]);
list = await mod.listModels({ GEMINI_API_KEY: "k" });
ok("מודלים שאינם שיחה מסוננים", list.length === 1 && list[0] === "gemini-4.1-flash", list.join(", "));

mod.dropModelCache();
fetchImpl = async () => ({ ok: true, json: async () => ({ models: [
  { name: "models/gemini-4.1-flash", supportedGenerationMethods: ["generateContent"] },
  { name: "models/gemini-4.1-caption", supportedGenerationMethods: ["countTokens"] }] }) });
list = await mod.listModels({ GEMINI_API_KEY: "k" });
ok("מודל שלא תומך ב-generateContent מסונן", list.length === 1, list.join(", "));

// המטמון: קריאה שנייה לא פונה לגוגל שוב
mod.dropModelCache();
let calls = 0;
fetchImpl = async (...a) => { calls++; return reply(["gemini-4.1-flash"])(...a); };
await mod.listModels({ GEMINI_API_KEY: "k" });
await mod.listModels({ GEMINI_API_KEY: "k" });
ok("הרשימה נשמרת במטמון", calls === 1, `${calls} פניות`);
mod.dropModelCache();
await mod.listModels({ GEMINI_API_KEY: "k" });
ok("ניקוי המטמון מאלץ בירור מחדש", calls === 2, `${calls} פניות`);

// כשגוגל נופלת: לא קורסים, מחזירים ריק כדי שהקוד ייפול לרשימה שבקוד
mod.dropModelCache();
fetchImpl = async () => { throw new Error("network down"); };
ok("רשת נופלת → רשימה ריקה, בלי חריגה", (await mod.listModels({ GEMINI_API_KEY: "k" })).length === 0);
mod.dropModelCache();
fetchImpl = async () => ({ ok: false, json: async () => ({ error: { message: "API key not valid" } }) });
ok("מפתח לא תקין → רשימה ריקה", (await mod.listModels({ GEMINI_API_KEY: "bad" })).length === 0);

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
