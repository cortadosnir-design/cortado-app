// קורטדו אופרציה — השרת (Cloudflare Worker, תוכנית חינמית).
// מאמת את המשתמש מול Firebase, כותב פוסטים עם Gemini, מפרסם לפייסבוק ולאינסטגרם,
// ומעדכן שעות פתיחה בעמוד הפייסבוק. כל הסודות נשמרים כאן, לא באפליקציה.

const GRAPH = "https://graph.facebook.com/v21.0";
// מי רשאי. אפשר להוסיף מנהלים בלי פריסה מחדש: משתנה OWNER_EMAILS בלוח של Cloudflare,
// מופרד בפסיקים. הרשימה כאן היא ברירת המחדל אם המשתנה לא הוגדר.
const DEFAULT_OWNERS = ["cortado.snir@gmail.com"];
const ownersOf = (env) => ((env.OWNER_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean).length
  ? (env.OWNER_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  : DEFAULT_OWNERS);

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") return json({ ok: true }, cors);
      const user = await requireUser(request, env);
      const owner = ownersOf(env).includes((user.email || "").toLowerCase());
      const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};

      switch (url.pathname) {
        case "/ai/post":     requireOwner(owner); return json(await aiPost(env, body), cors);
        case "/ai/week":     requireOwner(owner); return json(await aiWeek(env, body), cors);
        case "/ai/brief":    requireOwner(owner); return json(await aiBrief(env, body), cors);
        case "/ai/angle":    requireOwner(owner); return json(await aiAngle(env, body), cors);
        case "/ai/insights": requireOwner(owner); return json(await aiInsights(env, body), cors);
        case "/publish/facebook":  requireOwner(owner); return json(await publishFacebook(env, body), cors);
        case "/publish/instagram": requireOwner(owner); return json(await publishInstagram(env, body), cors);
        case "/hours/facebook":    requireOwner(owner); return json(await setFacebookHours(env, body), cors);
        case "/status":            requireOwner(owner); return json(await status(env), cors);
        case "/setup/pages":       requireOwner(owner); return json(await setupPages(env, body), cors);
        default: return json({ error: "not_found" }, cors, 404);
      }
    } catch (e) {
      const code = e.status || 500;
      return json({ error: e.code || "error", message: e.message || String(e) }, cors, code);
    }
  }
};

/* ---------- עזרים ---------- */
function json(data, headers, status = 200){
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}
function corsHeaders(request, env){
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  const h = { "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "authorization,content-type", "vary": "Origin" };
  if (ok) h["access-control-allow-origin"] = origin;   // מקור לא מוכר: בלי כותרת בכלל
  return h;
}
function fail(code, message, status = 400){ const e = new Error(message); e.code = code; e.status = status; return e; }
function requireOwner(owner){ if (!owner) throw fail("forbidden", "רק המנהל יכול לבצע את הפעולה הזו.", 403); }

/* ---------- אימות Firebase (בלי ספריות) ---------- */
let jwkCache = { at: 0, keys: null };
async function requireUser(request, env){
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw fail("unauthenticated", "חסר טוקן כניסה.", 401);
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw fail("unauthenticated", "טוקן לא תקין.", 401);
  const header = JSON.parse(b64urlDecode(h)), payload = JSON.parse(b64urlDecode(p));
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== env.FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`)
    throw fail("unauthenticated", "הטוקן לא שייך לפרויקט הזה.", 401);
  if (!payload.exp || payload.exp < now) throw fail("unauthenticated", "פג תוקף הכניסה. היכנס שוב.", 401);
  if (header.alg !== "RS256") throw fail("unauthenticated", "אלגוריתם חתימה לא נתמך.", 401);
  if (!payload.sub || typeof payload.sub !== "string") throw fail("unauthenticated", "טוקן חסר מזהה משתמש.", 401);
  if (payload.iat && payload.iat > now + 60) throw fail("unauthenticated", "טוקן מהעתיד.", 401);
  if (payload.email_verified !== true) throw fail("unauthenticated", "המייל לא מאומת.", 401);
  if (payload.firebase && payload.firebase.sign_in_provider && payload.firebase.sign_in_provider !== "google.com")
    throw fail("unauthenticated", "כניסה נתמכת רק עם חשבון גוגל.", 401);
  if (Date.now() - jwkCache.at > 6 * 3600e3 || !jwkCache.keys){
    const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    jwkCache = { at: Date.now(), keys: (await r.json()).keys };
  }
  let jwk = jwkCache.keys.find(k => k.kid === header.kid);
  if (!jwk){ // גוגל מחליפה מפתחות: מרעננים פעם אחת לפני שנכשלים
    const r = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
    jwkCache = { at: Date.now(), keys: (await r.json()).keys };
    jwk = jwkCache.keys.find(k => k.kid === header.kid);
  }
  if (!jwk) throw fail("unauthenticated", "מפתח חתימה לא מוכר.", 401);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw fail("unauthenticated", "חתימת הטוקן לא תקינה.", 401);
  return { uid: payload.sub, email: payload.email, name: payload.name };
}
function b64urlToBytes(s){ s = s.replace(/-/g, "+").replace(/_/g, "/"); s += "=".repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function b64urlDecode(s){ return new TextDecoder().decode(b64urlToBytes(s)); }

/* ---------- Gemini ---------- */
const BRAND = `אתה הקופירייטר של "קפה קורטדו", עגלת קפה קטנה בקיבוץ שניר, בעמק החולה שבגליל העליון.
הקהל: תושבי האזור ומטיילים שמתכננים סופ״ש בצפון.
הסגנון: חם, קליל, שכונתי, כמו בריסטה שמדבר עם לקוח קבוע. עברית פשוטה וקצרה.
בלי קלישאות שיווקיות, בלי סימני קריאה כפולים, עד 2 אימוג'ים.
המשפט הראשון חייב לעצור את הגלילה — לא "שלום לכולם" ולא פתיחה גנרית.
באזור הזה הסיפור מנצח את הקפה: המקום, הנוף, האנשים, הדרך אליכם.
אל תמציא מחירים, מבצעים, שעות, כתובות או אירועים שלא נמסרו לך במפורש.`;

// בונה את חלק ההנחיה שנשען על מה שהמערכת למדה מהמנהל. זה מה שגורם
// לטקסט להישמע כמוהם ולא כמו AI גנרי.
function memoryBlock(b){
  const m = b.memory || {};
  const out = [];
  if (Array.isArray(b.voice) && b.voice.length) out.push("כללי כתיבה:\n- " + b.voice.slice(0, 8).join("\n- "));
  if (m.tone) out.push(`הטון שהבעלים הגדיר: ${String(m.tone).slice(0, 500)}`);
  if (Array.isArray(m.facts) && m.facts.length)
    out.push("עובדות על העסק (השתמש רק באלה):\n- " + m.facts.slice(0, 20).map(s => String(s).slice(0,200)).join("\n- "));
  if (Array.isArray(m.likes) && m.likes.length)
    out.push("תמיד לעשות:\n- " + m.likes.slice(0, 20).map(s => String(s).slice(0,200)).join("\n- "));
  if (Array.isArray(m.avoid) && m.avoid.length)
    out.push("אף פעם לא:\n- " + m.avoid.slice(0, 20).map(s => String(s).slice(0,200)).join("\n- "));
  const samples = Array.isArray(m.samples) ? m.samples.filter(x => x && x.text).slice(-5) : [];
  if (samples.length)
    out.push("פוסטים שהבעלים כתב בעצמו. זה הקול. חקה את המקצב, אורך המשפטים והמילים שלו, לא את התוכן:\n" +
      samples.map((x,i) => `--- ${i+1} ---\n${String(x.text).slice(0,500)}`).join("\n"));
  const ex = Array.isArray(m.examples) ? m.examples.slice(-5) : [];
  if (ex.length){
    out.push("דוגמאות לתיקונים שהבעלים עשה על טיוטות קודמות. למד מהן את הקול שלו וכתוב ישר בסגנון ה'אחרי':\n" +
      ex.map((e,i) => `--- ${i+1} ---\nלפני: ${String(e.before||"").slice(0,400)}\nאחרי: ${String(e.after||"").slice(0,400)}`).join("\n"));
  }
  const recent = Array.isArray(b.recent) ? b.recent.filter(r => r && r.text).slice(0, 5) : [];
  if (recent.length)
    out.push("פוסטים אחרונים שפורסמו — אל תחזור על אותה זווית:\n" +
      recent.map(r => `${r.date || ""} (${r.pillar || ""}): ${String(r.text).slice(0,150)}`).join("\n"));
  return out.join("\n\n");
}

const hoursLine = (b) => Array.isArray(b.hours)
  ? b.hours.map((h,i) => `${["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"][i]}: ${h && h.length ? h.join(", ") : "סגור"}`).join("\n")
  : "";

// תמונות (data URL מהדפדפן, או קישור חיצוני) הופכות לחלקי inlineData. זה מה שמאפשר למודל
// באמת להסתכל על מה שצולם השבוע, במקום לנחש מתוך שמות קבצים.
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
async function imageParts(urls){
  const list = (Array.isArray(urls) ? urls : []).filter(u => typeof u === "string"
    && (u.startsWith("https://") || u.startsWith("data:image/"))).slice(0, MAX_IMAGES);
  const parts = [];
  await Promise.all(list.map(async (u) => {
    try {
      // תמונה שנשלחה ישירות מהדפדפן (בלי אחסון) מגיעה כ-data URL ומוכנה כבר.
      if (u.startsWith("data:image/")){
        const m = u.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
        if (!m || m[2].length * 0.75 > MAX_IMAGE_BYTES) return;
        parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
        return;
      }
      const r = await fetch(u);
      if (!r.ok) return;
      const type = (r.headers.get("content-type") || "").split(";")[0];
      if (!type.startsWith("image/")) return;
      const buf = await r.arrayBuffer();
      if (buf.byteLength > MAX_IMAGE_BYTES) return;
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      parts.push({ inlineData: { mimeType: type, data: btoa(bin) } });
    } catch {}
  }));
  return parts;
}

// גוגל מוציאה דגמים משימוש מדי כמה חודשים, ואז כל הכפתורים החכמים מפסיקים לעבוד
// בבת אחת. שלוש שכבות הגנה כדי שזה לא יקרה שוב:
//   1. ברירת מחדל עדכנית
//   2. מיפוי של שמות שהוצאו משימוש — כך שגם משתנה ישן בלוח של Cloudflare נרפא לבד
//   3. ניסיון חוזר אוטומטי אם השרת בכל זאת עונה "המודל לא זמין"
// שרשרת נפילה: מנסים לפי הסדר עד שאחד עונה. הראשון הוא העדכני.
const MODEL_CHAIN = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"];
const CURRENT_MODEL = MODEL_CHAIN[0];
// שמות שכבר לא נפתחים למפתחות חדשים, או שהוצאו משימוש לגמרי.
const RETIRED_MODELS = {
  "gemini-2.5-flash": CURRENT_MODEL,
  "gemini-2.5-flash-latest": CURRENT_MODEL,
  "gemini-2.0-flash": CURRENT_MODEL,
  "gemini-1.5-flash": CURRENT_MODEL,
  "gemini-1.5-pro": CURRENT_MODEL,
};
function modelOf(env){
  const asked = String(env.GEMINI_MODEL || "").trim().replace(/^models\//, "");
  if (!asked) return CURRENT_MODEL;
  return RETIRED_MODELS[asked] || asked;
}
const MODEL_GONE = /no longer available|not found|is not supported|NOT_FOUND|deprecated|does not have access/i;

async function callGemini(env, model, parts, wantJson){
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.9, ...(wantJson ? { responseMimeType: "application/json" } : {}) }
    })
  });
  return { r, data: await r.json().catch(() => ({})) };
}

async function gemini(env, prompt, { json: wantJson = false, images = [] } = {}){
  if (!env.GEMINI_API_KEY) throw fail("not_configured", "חסר מפתח Gemini בשרת.", 500);
  const pics = images.length ? await imageParts(images) : [];
  const parts = [{ text: prompt }, ...pics];

  // המודל המבוקש קודם, ואחריו השרשרת — כל אחד מנוסה פעם אחת, רק אם
  // השגיאה היא "המודל לא זמין". שגיאה אמיתית (מכסה, מפתח) עוצרת מיד.
  const tries = [modelOf(env), ...MODEL_CHAIN.filter(m => m !== modelOf(env))];
  let r, data, model;
  for (const m of tries){
    model = m;
    ({ r, data } = await callGemini(env, m, parts, wantJson));
    if (r.ok) break;
    if (!MODEL_GONE.test(String(data.error?.message || ""))) break;
  }
  if (!r.ok) throw fail("ai_error", data.error?.message || "Gemini לא ענה.", 502);
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  if (!text) throw fail("ai_empty", "לא התקבל טקסט.", 502);
  if (!wantJson) return text.trim();
  try { return JSON.parse(text); } catch { throw fail("ai_json", "התשובה לא הייתה בפורמט הצפוי.", 502); }
}

// מה שמסגיר שמכונה כתבה. חוקים קשיחים לכל הכתיבה.
const HUMAN_RULE = `כללי כתיבה קשיחים:
- אורך: WORDS מילים. לא יותר. קצר מנצח.
- בלי קו מפריד ארוך (—). פסיק או נקודה.
- בלי שלשות (X, Y ו-Z). שניים מספיקים.
- בלי "לא רק... אלא...".
- בלי אימוג'י של ממשק (✅🚀💡👉🔥). לכל היותר אימוג'י אחד של רגש, ועדיף בלי.
- בלי מילים ריקות: חוויה, מושלם, פינוק, בלתי נשכח, מחכים לכם, קסום, מדהים.
- פרט אחד קונקרטי לפחות: שעה, שם, מזג אוויר, מה קרה. בלי פרט - אין פוסט.
- הבעלים יוסיף משפט אישי משלו בסוף. אל תמציא פרטים אישיים, השאר לו מקום.`;
const humanRule = (b) => HUMAN_RULE.replace("WORDS", Array.isArray(b.words) && b.words.length === 2 ? `${b.words[0]}–${b.words[1]}` : "20–25");

const FORMAT_RULE = {
  reel: "זה כיתוב לריל של 7–15 שניות. 2–3 שורות. הווידאו מספר, הטקסט רק מסגרת.",
  carousel: "זו קרוסלה. שורה פותחת ואז 3–4 שורות קצרות, שורה לכל שקופית.",
  static: "זה פוסט תמונה רגיל. 2–4 שורות קצרות.",
  story: "זה סטורי. משפט אחד או שניים, ישיר מאוד.",
};

async function aiPost(env, b){
  const prompt = [
    BRAND, memoryBlock(b),
    "כתוב פוסט אחד.",
    b.day ? `יום: ${b.day}.` : "",
    b.date ? `תאריך פרסום: ${b.date}.` : "",
    b.holiday ? `מועד רלוונטי: ${b.holiday}. התייחס אליו בטבעיות, לא בכפייה.` : "",
    b.angle ? `הזווית של היום, כפי שהבעלים הגדיר: ${b.angle}. זה העיקר, בנה סביבה.` : "",
    b.idea ? `הכיוון של הפוסט: ${b.idea}. זה הנושא. אל תסטה ממנו.` : "",
    b.pillar ? `העמוד: ${b.pillar}.${b.pillarNote ? " " + String(b.pillarNote).slice(0, 200) : ""}` : "",
    FORMAT_RULE[b.format] || FORMAT_RULE.static,
    humanRule(b),
    "הפוסט מתפרסם בפייסבוק ובאינסטגרם יחד. כתוב גרסה אחת שעובדת בשתיהן.",
    hoursLine(b) ? `שעות הפתיחה השבוע (אלה העובדות, אל תשנה אותן):\n${hoursLine(b)}` : "",
    b.avoid ? `זו הטיוטה הקודמת. כתוב משהו אחר לגמרי, פתיחה אחרת וזווית אחרת:\n${String(b.avoid).slice(0, 600)}` : "",
    "סיים בקריאה לפעולה אחת קונקרטית או בשאלה אחת. לא בשתיהן.",
    'החזר JSON בלבד: {"text":"טקסט הפוסט","hashtags":["#..."],"shoot":"מה לצלם, משפט אחד"}. 8–12 האשטגים בעברית, לא יותר.',
  ].filter(Boolean).join("\n\n");
  const r = await gemini(env, prompt, { json: true });
  return {
    text: String(r.text || "").trim(),
    hashtags: Array.isArray(r.hashtags) ? r.hashtags.filter(h => typeof h === "string" && h.startsWith("#")).slice(0, 15) : [],
    shoot: String(r.shoot || "").slice(0, 200),
  };
}

// זווית אחת ליום פעילות — מה מיוחד בו.
async function aiAngle(env, b){
  const prompt = [
    BRAND, memoryBlock(b),
    `הצע זווית אחת לתוכן ליום ${b.day || ""} (${b.date || ""}).`,
    b.pillar ? `העמוד: ${b.pillar}.` : "",
    b.holiday ? `מועד: ${b.holiday}.` : "",
    Array.isArray(b.clips) && b.clips.length ? `קליפים שכבר צולמו ומחכים (עדיף לבנות סביב אחד מהם): ${b.clips.slice(0,10).map(String).join(" | ")}` : "",
    "זווית = המשפט שמסביר למה שווה לעצור בעגלה דווקא היום. קונקרטי, לא סיסמה.",
    'החזר JSON בלבד: {"angle":"עד 12 מילים"}.',
  ].filter(Boolean).join("\n\n");
  const r = await gemini(env, prompt, { json: true });
  return { angle: String(r.angle || "").slice(0, 120) };
}

/* ---------- השיחה השבועית ---------- */
// החומר שהמנהלת נתנה: מה שכתבה, מה שצילמה, ומה שענתה עד כה.
// זה מה שהיה חסר לגמרי עד היום, ובלעדיו כל כיוון יוצא גנרי.
function briefBlock(b){
  const out = [];
  const t = String(b.brief || "").trim();
  if (t) out.push(`מה שהמנהלת סיפרה על השבוע (זה החומר הכי חשוב, בנה הכל עליו):\n${t.slice(0, 1200)}`);
  const qa = (Array.isArray(b.answers) ? b.answers : []).filter(x => x && x.q && x.a).slice(0, 8);
  if (qa.length) out.push("מה שכבר שאלת ומה שהיא ענתה:\n" + qa.map(x => `שאלה: ${String(x.q).slice(0,160)}\nתשובה: ${String(x.a).slice(0,200)}`).join("\n"));
  const n = (Array.isArray(b.photos) ? b.photos : []).length;
  if (n) out.push(`מצורפות ${Math.min(n, MAX_IMAGES)} תמונות שצולמו השבוע בעגלה. הסתכל עליהן. הן חומר הגלם.`);
  return out.join("\n\n");
}

// שאלה אחת בכל פעם. הכלל היחיד שחשוב: לשאול רק מה שאי אפשר לדעת בלעדיה.
async function aiBrief(env, b){
  const asked = (Array.isArray(b.answers) ? b.answers : []).length;
  const max = Math.min(5, Math.max(2, +b.max || 4));
  const prompt = [
    BRAND, memoryBlock(b), briefBlock(b),
    `זו שיחה קצרה עם מנהלת העגלה כדי להוציא ממנה חומר לפוסטים של השבוע. כבר נשאלו ${asked} שאלות מתוך ${max} לכל היותר.`,
    "שאל שאלה אחת בלבד, הבאה בתור.",
    "כללים קשיחים לשאלה:",
    "- חייבת להיענות בפחות מחמש שניות. אם היא דורשת מחשבה — היא שאלה גרועה.",
    "- אל תשאל מה שכבר ידוע לך: שעות הפתיחה, תאריכים, חגים, מה פורסם בעבר. אלה כבר אצלך.",
    "- אל תשאל שאלות כלליות כמו 'מה תרצי לפרסם'. שאל על פרט קונקרטי שקרה: מי, מה, מתי, איך היה.",
    "- אם יש תמונות, שאל על משהו שאתה רואה בהן ולא יכול לדעת לבד (מי זה, מה זה, מתי זה היה).",
    "- עברית פשוטה, עד 12 מילים.",
    "הצע 3–4 תשובות קצרות ללחיצה (עד 4 מילים כל אחת), שמכסות את התשובות הסבירות. תמיד אפשר יהיה לכתוב תשובה חופשית.",
    asked >= max - 1 ? "זו השאלה האחרונה. אחריה החזר done=true." : "",
    `אם כבר יש מספיק חומר לארבעה פוסטים שונים, החזר done=true בלי שאלה.`,
    'החזר JSON בלבד: {"done":false,"question":"השאלה","options":["...","...","..."],"why":"למה שאלת, עד 8 מילים"}',
  ].filter(Boolean).join("\n\n");
  const r = await gemini(env, prompt, { json: true, images: b.photos });
  return {
    done: !!r.done,
    question: String(r.question || "").slice(0, 160),
    options: Array.isArray(r.options) ? r.options.filter(x => typeof x === "string").map(s => s.slice(0, 40)).slice(0, 4) : [],
    why: String(r.why || "").slice(0, 80),
  };
}

// שלד לשבוע: כיוון ומה לצלם לכל משבצת ריקה. בלי טקסט. הטקסט נכתב משבצת-משבצת, עם הבעלים.
async function aiWeek(env, b){
  const slots = Array.isArray(b.slots) ? b.slots.slice(0, 8) : [];
  if (!slots.length) throw fail("bad_request", "אין משבצות ריקות.");
  const prompt = [
    BRAND, memoryBlock(b), briefBlock(b),
    "לכל משבצת למטה הצע כיוון אחד (עד 12 מילים) ומה לצלם (משפט אחד). בלי טקסט לפוסט.",
    "כיוון = פרט קונקרטי שמסביר למה הפוסט הזה, השבוע הזה. לא סיסמה.",
    (b.brief || (Array.isArray(b.answers) && b.answers.length))
      ? "הכיוונים חייבים לצאת ממה שהמנהלת סיפרה ומהתמונות. אל תמציא אירועים שלא נמסרו לך."
      : "",
    slots.map(s => `- ${s.key}: ${s.pillar || ""}${s.pillarNote ? " (" + s.pillarNote + ")" : ""} · ${s.day || ""} ${s.date || ""}${s.holiday ? " · מועד: " + s.holiday : ""} · פורמט: ${s.format || ""}`).join("\n"),
    hoursLine(b) ? `שעות הפתיחה השבוע:\n${hoursLine(b)}` : "",
    Array.isArray(b.clips) && b.clips.length ? `קליפים שכבר צולמו: ${b.clips.slice(0,10).map(String).join(" | ")}. עדיף לבנות כיוונים סביבם.` : "",
    "העמוד 'מתי ואיפה' הוא תמיד השעות של הסופ״ש והדרך אליכם. אל תמציא לו זווית אחרת.",
    "ארבעה כיוונים שונים זה מזה. לא אותו רעיון בניסוח אחר.",
    'החזר JSON בלבד: {"slots":[{"key":"s1","angle":"עד 12 מילים","shoot":"מה לצלם"}]}',
  ].filter(Boolean).join("\n\n");
  const r = await gemini(env, prompt, { json: true, images: b.photos });
  const out = Array.isArray(r) ? r : (Array.isArray(r.slots) ? r.slots : []);
  return { slots: out.filter(x => x && x.key).map(x => ({ key: String(x.key), angle: String(x.angle || "").slice(0, 140), shoot: String(x.shoot || "").slice(0, 200) })).slice(0, 8) };
}

async function aiInsights(env, b){
  const prompt = [
    BRAND.split("\n")[0], "אתה יועץ שיווק ותפעול לעגלת הקפה הזו. דבר בעברית, קצר ומעשי.",
    `יומן משמרות (JSON): ${JSON.stringify(b.logs || b.log || []).slice(0, 12000)}`,
    b.posts && b.posts.length ? `ביצועי פוסטים (JSON): ${JSON.stringify(b.posts).slice(0, 5000)}` : "",
    "כתוב 4–6 תובנות: ימים ושעות עומס, מה משפיע על כמות הלקוחות, איזה פורמט ושעת פרסום עובדים, ורעיון אחד ליום החלש.",
    "אל תמציא נתונים. אם הנתונים דלים מכדי להסיק — אמור את זה במפורש בתובנה הראשונה.",
    'החזר JSON בלבד: {"insights":["...","..."]}',
  ].filter(Boolean).join("\n\n");
  const r = await gemini(env, prompt, { json: true });
  const list = Array.isArray(r) ? r : (Array.isArray(r.insights) ? r.insights : []);
  return { insights: list.map(s => String(s)).slice(0, 8) };
}

/* ---------- Meta: פייסבוק ואינסטגרם ---------- */
async function graph(env, path, params, method = "POST"){
  if (!env.FB_PAGE_TOKEN) throw fail("not_configured", "חסר טוקן של עמוד הפייסבוק בשרת.", 500);
  const q = new URLSearchParams({ ...params, access_token: env.FB_PAGE_TOKEN });
  const r = await fetch(`${GRAPH}/${path}${method === "GET" ? "?" + q : ""}`, method === "GET" ? {} : { method, body: q });
  const data = await r.json();
  if (!r.ok || data.error) throw fail("meta_error", data.error?.message || "Meta דחה את הבקשה.", 502);
  return data;
}
async function publishFacebook(env, b){
  if (!env.FB_PAGE_ID) throw fail("not_configured", "חסר מזהה עמוד.", 500);
  if (!b.text && !b.image) throw fail("bad_request", "אין מה לפרסם.");
  const when = b.scheduledAt ? Math.floor(new Date(b.scheduledAt).getTime() / 1000) : null;
  const sched = when && when > Date.now() / 1000 + 600 ? { published: "false", scheduled_publish_time: String(when) } : {};
  const res = b.image
    ? await graph(env, `${env.FB_PAGE_ID}/photos`, { url: b.image, caption: b.text || "", ...sched })
    : await graph(env, `${env.FB_PAGE_ID}/feed`, { message: b.text, ...sched });
  return { id: res.post_id || res.id, scheduled: !!sched.published };
}
async function publishInstagram(env, b){
  if (!env.IG_USER_ID) throw fail("not_configured", "חסר מזהה של חשבון אינסטגרם.", 500);
  if (!b.image) throw fail("bad_request", "אינסטגרם דורש תמונה.");
  const c = await graph(env, `${env.IG_USER_ID}/media`, { image_url: b.image, caption: b.text || "" });
  const p = await graph(env, `${env.IG_USER_ID}/media_publish`, { creation_id: c.id });
  return { id: p.id };
}
// hours: {sun:[["06:30","15:00"]], mon:[], ...}  -> פורמט של פייסבוק
async function setFacebookHours(env, b){
  if (!env.FB_PAGE_ID) throw fail("not_configured", "חסר מזהה עמוד.", 500);
  const hours = {};
  for (const day of ["mon","tue","wed","thu","fri","sat","sun"]){
    (b.hours?.[day] || []).slice(0, 2).forEach(([open, close], i) => { hours[`${day}_${i+1}_open`] = open; hours[`${day}_${i+1}_close`] = close; });
  }
  await graph(env, env.FB_PAGE_ID, { hours: JSON.stringify(hours) });
  return { ok: true, hours };
}
async function status(env){
  const out = { gemini: !!env.GEMINI_API_KEY, facebook: !!(env.FB_PAGE_TOKEN && env.FB_PAGE_ID), instagram: !!env.IG_USER_ID };
  if (out.facebook){ try { const p = await graph(env, env.FB_PAGE_ID, { fields: "name" }, "GET"); out.pageName = p.name; } catch (e){ out.facebookError = e.message; } }
  return out;
}

/* ---------- הגדרה חד-פעמית: מטוקן משתמש קצר → טוקן עמוד ארוך + מזהים ---------- */
async function setupPages(env, b){
  if (!env.FB_APP_ID || !env.FB_APP_SECRET) throw fail("not_configured", "חסרים FB_APP_ID / FB_APP_SECRET בשרת.", 500);
  if (!b.userToken) throw fail("bad_request", "חסר טוקן משתמש מ-Graph API Explorer.");
  const ex = await (await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.FB_APP_ID}&client_secret=${env.FB_APP_SECRET}&fb_exchange_token=${encodeURIComponent(b.userToken)}`)).json();
  if (!ex.access_token) throw fail("meta_error", ex.error?.message || "ההחלפה לטוקן ארוך נכשלה.", 502);
  const pages = await (await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${ex.access_token}`)).json();
  if (!pages.data) throw fail("meta_error", pages.error?.message || "לא נמצאו עמודים.", 502);
  return { pages: pages.data.map(p => ({ FB_PAGE_ID: p.id, name: p.name, FB_PAGE_TOKEN: p.access_token, IG_USER_ID: p.instagram_business_account?.id || null, ig: p.instagram_business_account?.username || null })) };
}
