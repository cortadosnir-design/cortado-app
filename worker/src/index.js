// קורטדו אופרציה — השרת (Cloudflare Worker, תוכנית חינמית).
// מאמת את המשתמש מול Firebase, כותב פוסטים עם Gemini, מפרסם לפייסבוק ולאינסטגרם,
// ומעדכן שעות פתיחה בעמוד הפייסבוק. כל הסודות נשמרים כאן, לא באפליקציה.

const GRAPH = "https://graph.facebook.com/v21.0";
// מי רשאי. אפשר להוסיף מנהלים בלי פריסה מחדש: משתנה OWNER_EMAILS בלוח של Cloudflare,
// מופרד בפסיקים. הרשימה כאן היא ברירת המחדל אם המשתנה לא הוגדר.
const DEFAULT_OWNERS = ["cortado.snir@gmail.com", "limormelman@gmail.com"];
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
        case "/ai/analyze":  requireOwner(owner); return json(await aiAnalyze(env, body), cors);
        case "/publish/facebook":  requireOwner(owner); return json(await publishFacebook(env, body), cors);
        case "/publish/instagram": requireOwner(owner); return json(await publishInstagram(env, body), cors);
        case "/publish/schedule":  requireOwner(owner); return json(await schedulePost(env, body), cors);
        case "/publish/state":     requireOwner(owner); return json(await publishState(env), cors);
        case "/insights/posts":    requireOwner(owner); return json(await postInsights(env, body), cors);
        case "/hours/facebook":    requireOwner(owner); return json(await setFacebookHours(env, body), cors);
        case "/hours/google":      requireOwner(owner); return json(await setGoogleHours(env, body), cors);
        case "/status":            requireOwner(owner); return json(await status(env), cors);
        case "/setup/pages":       requireOwner(owner); return json(await setupPages(env, body), cors);
        default: return json({ error: "not_found" }, cors, 404);
      }
    } catch (e) {
      const code = e.status || 500;
      // שום טקסט באנגלית לא יוצא מכאן. hebrew() מתרגם, ו-detail נשמר לניפוי בלבד.
      const raw = e.message || String(e);
      return json({ error: e.code || "error", message: hebrew(raw), detail: raw }, cors, code);
    }
  },

  // הקרון: כל עשר דקות. מפרסם לאינסטגרם את מה שהגיע זמנו.
  // לאינסטגרם אין תזמון ב-API — כל "תזמון" בעולם הוא תור שמחכה לדקה. זה התור שלנו.
  async scheduled(event, env, ctx){
    ctx.waitUntil(publishDue(env).catch(e => console.error("cron", e && e.message)));
  },
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

/* ---------- תרגום שגיאות ----------
   גוגל ומטא עונות באנגלית טכנית. המשתמש לא אמור לראות אותה לעולם.
   כל הודעה שיוצאת מהשרת עוברת כאן. מה שכבר בעברית עובר כמו שהוא;
   מה שמוכר מתורגם למשהו שאפשר לפעול לפיו; מה שלא מוכר מקבל נוסח כללי,
   והטקסט המקורי נשמר בשדה detail שלא מוצג. */
const HEBREW_RE = /[֐-׿]/;

// כמה שניות להמתין, לפי מה שגוגל עצמה אומרת ("Please retry in 21.35s").
function retrySeconds(msg){
  const m = /retry in ([\d.]+)s/i.exec(msg) || /retryDelay[""\s:]+([\d.]+)s/i.exec(msg);
  return m ? Math.max(1, Math.ceil(parseFloat(m[1]))) : 0;
}

const ERROR_MAP = [
  // ── מכסה וקצב ──
  [/quota exceeded|exceeded [^.]*quota|RESOURCE_EXHAUSTED|rate ?limit|too many requests/i, (msg) => {
    const s = retrySeconds(msg);
    const daily = /per day|daily|PerDay/i.test(msg);
    if (daily) return "נגמרה המכסה היומית של Gemini. היא מתאפסת מחר, או שאפשר לשדרג את התוכנית בגוגל.";
    return s
      ? `הגעת למכסה החינמית של Gemini. נסה שוב בעוד ${s} שניות — מה שכתבת נשמר.`
      : "הגעת למכסה החינמית של Gemini. נסה שוב בעוד דקה — מה שכתבת נשמר.";
  }],
  // ── מפתח ──
  [/API[_ ]?key not valid|API_KEY_INVALID|invalid api key/i,
    () => "מפתח ה-AI בשרת לא תקין. צריך להחליף אותו בהגדרות של Cloudflare."],
  [/PERMISSION_DENIED|does not have access|caller does not have permission/i,
    () => "למפתח ה-AI אין הרשאה למודל הזה. בדוק את המפתח ב-Google AI Studio."],
  // ── סינון תוכן ──
  [/SAFETY|blocked|content filter|PROHIBITED_CONTENT/i,
    () => "גוגל חסמה את הבקשה בגלל מסנן התוכן. נסה לנסח אחרת."],
  // ── מודל ──
  [/no longer available|NOT_FOUND|not found|is not supported|deprecated/i,
    // כאן מגיעים רק אחרי שכל MODEL_CHAIN נכשל, ולא בהכרח בגלל הגדרה ידנית.
    () => "אף מודל של Gemini לא נענה — כנראה השתנו שמות המודלים. אם הגדרת GEMINI_MODEL " +
          "ב-Cloudflare, מחק אותו; אחרת צריך לעדכן את רשימת המודלים בשרת."],
  // ── מטא ──
  [/Session has expired|OAuthException|access token|code.*190/i,
    () => "הטוקן של עמוד הפייסבוק פג. צריך לחבר את העמוד מחדש בלשונית הפצה."],
  [/\(#200\)|requires .* permission|insufficient permission/i,
    () => "לאפליקציית הפייסבוק חסרה הרשאה לפעולה הזו. צריך להוסיף אותה ב-Graph API Explorer ולחבר מחדש."],
  [/\(#4\)|\(#17\)|too many calls|request limit reached/i,
    () => "פייסבוק חסמה זמנית בגלל יותר מדי בקשות. נסה שוב בעוד כמה דקות."],
  [/media|image.*(invalid|unsupported)|Unsupported post request/i,
    () => "מטא דחתה את התמונה. נסה תמונה אחרת, רצוי JPG."],
  // ── רשת ──
  [/fetch failed|network|ETIMEDOUT|ECONNRESET|timeout/i,
    () => "לא הצלחתי להגיע לשרת החיצוני. נסה שוב בעוד רגע."],
];

function hebrew(msg){
  const s = String(msg || "");
  if (!s) return "משהו השתבש. נסה שוב.";
  if (HEBREW_RE.test(s)) return s;              // כבר בעברית — לא נוגעים
  for (const [re, make] of ERROR_MAP) if (re.test(s)) return make(s);
  return "משהו השתבש מול שירות חיצוני. נסה שוב, ואם זה חוזר — ספר לי מה עשית.";
}

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

  // מה שעבד. בלי זה המודל יודע רק מה כבר נאמר, ולא מה הצליח.
  const best = Array.isArray(b.best) ? b.best.filter(x => x && x.text).slice(0, 4) : [];
  if (best.length)
    out.push("הפוסטים שהגיעו להכי הרבה אנשים. למד מהם מה עובד כאן — הפתיחה, האורך, סוג הזווית. אל תעתיק אותם:\n" +
      best.map(x => `[${x.reach} חשיפות · ${x.format || ""} · ${x.pillar || ""}]\n${String(x.text).slice(0,300)}`).join("\n\n"));

  // היומן: מה באמת קרה בעגלה. זו העובדה היחידה שיש למודל על המציאות,
  // והיא מה שמפריד בין פוסט שנשען על משהו שקרה לבין פוסט מהדמיון.
  const logs = Array.isArray(b.logs) ? b.logs.filter(l => l && l.date).slice(0, 21) : [];
  if (logs.length){
    const lines = logs.map(l => [
      l.date,
      l.customers != null ? `${l.customers} לקוחות` : "",
      l.peak ? `עומס ב-${l.peak}` : "",
      l.weather || "",
      l.promo ? `מבצע: ${l.promo}` : "",
    ].filter(Boolean).join(" · "));
    out.push("יומן המשמרות האחרונות — עובדות מהעגלה, מהחדש לישן:\n" + lines.join("\n") +
      "\n\nהשתמש בזה כדי להישען על משהו שבאמת קרה: יום שהיה עמוס, מזג אוויר שהשפיע, מבצע שעבד. " +
      "אל תצטט מספרים מהיומן בפוסט עצמו ואל תמציא מהם מסקנות שלא נמצאות שם.");
  }

  // תחזית. לעגלה פתוחה מזג האוויר קובע כמה אנשים יבואו, ולכן הוא שייך לתוכן:
  // יום בהיר הוא הזמנה, שרב הוא סיבה לדבר על צל וקר, וגשם הוא יום אחר לגמרי.
  const wx = Array.isArray(b.weather) ? b.weather.filter(w => w && w.date).slice(0, 7) : [];
  if (wx.length){
    const names = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
    out.push("תחזית מזג האוויר לשבוע בעגלה:\n" +
      wx.map(w => `${names[w.day] || ""} ${w.date}: ${w.label}, ${w.tmax}°${w.rain >= 30 ? `, ${w.rain}% גשם` : ""}`).join("\n") +
      "\n\nהתייחס לזה רק אם זה מוסיף משהו אמיתי לפוסט. אל תכתוב תחזית ואל תבטיח מזג אוויר.");
  }
  if (b.weatherImpact) out.push(String(b.weatherImpact).slice(0, 300));

  // חלונות ביקוש. עגלה ליד הבניאס חיה ממטיילים, והם מגיעים בחלונות:
  // חול המועד הוא שבוע, חופש גדול הוא חודשיים, סופ״ש ארוך הוא שלושה ימים.
  const season = Array.isArray(b.season) ? b.season.filter(s => s && s.label).slice(0, 4) : [];
  if (season.length){
    out.push("מי מגיע לאזור בתקופה הזו:\n" +
      season.map(s => `${s.soon ? "מתקרב — " : ""}${s.label} (${s.from} עד ${s.to})${s.note ? ": " + s.note : ""}`).join("\n") +
      "\n\nבחלון כזה הפוסט שמביא אנשים בפועל הוא 'מתי ואיפה' — שעות ואיך מגיעים. " +
      "אל תכתוב 'חג שמח' ואל תברך. תן מידע שימושי למי שמתכנן טיול.");
  }

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
// עומס זמני אצל גוגל. לא שבור — פשוט צריך לנסות שוב.
const MODEL_BUSY = /high demand|overloaded|UNAVAILABLE|try again later|temporarily/i;
// מכסה שנגמרה. המגבלה החינמית היא לכל מודל בנפרד, ולכן שווה לנסות את הבא בשרשרת
// לפני שמוותרים — לא "שגיאה אמיתית" שצריך לעצור בגללה.
const MODEL_QUOTA = /exceeded your current quota|RESOURCE_EXHAUSTED|rate ?limit/i;
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function callGemini(env, model, parts, wantJson, temperature = 0.9){
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature, ...(wantJson ? { responseMimeType: "application/json" } : {}) }
    })
  });
  return { r, data: await r.json().catch(() => ({})) };
}

async function gemini(env, prompt, { json: wantJson = false, images = [], temperature = 0.9 } = {}){
  if (!env.GEMINI_API_KEY) throw fail("not_configured", "חסר מפתח Gemini בשרת.", 500);
  const pics = images.length ? await imageParts(images) : [];
  const parts = [{ text: prompt }, ...pics];

  // שלוש סיבות שונות לכישלון, שלוש תגובות שונות:
  //   "המודל לא קיים"  → לעבור למודל הבא בשרשרת
  //   "המודל עמוס"     → להמתין רגע ולנסות שוב, ורק אז לעבור הלאה
  //   כל השאר (מכסה, מפתח, בקשה שגויה) → לעצור מיד, אין טעם לנסות שוב
  const asked = modelOf(env);
  const tries = [asked, ...MODEL_CHAIN.filter(m => m !== asked)];
  let r, data, model, stop = false;
  for (const m of tries){
    model = m;
    for (let attempt = 0; attempt < 2; attempt++){
      ({ r, data } = await callGemini(env, m, parts, wantJson, temperature));
      if (r.ok) break;
      const msg = String(data.error?.message || "");
      if (MODEL_BUSY.test(msg) && attempt === 0){ await sleep(900); continue; }  // עומס: פעם אחת שוב
      // מודל שנעלם או מכסה שנגמרה → לנסות את הבא בשרשרת. רק השאר הוא שגיאה אמיתית.
      if (!MODEL_GONE.test(msg) && !MODEL_BUSY.test(msg) && !MODEL_QUOTA.test(msg)) stop = true;
      break;
    }
    if (r.ok || stop) break;
  }
  if (!r.ok){
    // הודעה שאפשר להבין ממנה מה לעשות, במקום טקסט טכני באנגלית.
    const msg = String(data.error?.message || "");
    if (MODEL_BUSY.test(msg)) throw fail("ai_busy", "השרת של גוגל עמוס כרגע. נסי שוב בעוד דקה — מה שכתבת נשמר.", 503);
    if (MODEL_QUOTA.test(msg)) throw fail("ai_quota", hebrew(msg), 429);
    throw fail("ai_error", hebrew(msg), 502);
  }
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
    // כשיש תמונה, היא העובדה החזקה ביותר שיש לכותב על הפוסט הזה.
    b.photos && b.photos.length
      ? "מצורפת התמונה שתתפרסם עם הפוסט. הסתכל עליה וכתוב על מה שבאמת רואים בה — " +
        "פרט אחד קונקרטי משם שווה יותר מכל תיאור כללי. אל תתאר את התמונה במילים, תישען עליה."
      : "",
    'החזר JSON בלבד: {"text":"טקסט הפוסט","hashtags":["#..."],"shoot":"מה לצלם, משפט אחד"}. 8–12 האשטגים בעברית, לא יותר.',
  ].filter(Boolean).join("\n\n");
  const r = await gemini(env, prompt, { json: true, images: b.photos });
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

/* ---------- סוכן ניתוח נתונים ----------
   הבעלים מעלה טבלה (CSV מהקופה, ייצוא מאקסל, או יומן המשמרות מהאפליקציה)
   ושואל בעברית. הדפדפן שולח כותרות, פרופיל של כל עמודה ודגימת שורות;
   כאן המודל עונה עם מספרים מהנתונים בלבד, ובלי להמציא. */
const ANALYST = `אתה אנליסט נתונים של "קפה קורטדו", עגלת קפה קטנה בקיבוץ שניר. אתה עונה לבעלים בעברית פשוטה וישירה.
כללים קשיחים:
- כל מספר שאתה מציין חייב להיגזר מהנתונים שקיבלת. אל תמציא ואל תעגל בלי לומר "בערך".
- אם השאלה לא ניתנת למענה מהעמודות הקיימות, אמור מה חסר במקום לנחש.
- אם קיבלת רק דגימה מהשורות, הסתמך על הפרופיל לסיכומים כלליים, וציין שהחישוב המדויק על דגימה.
- תשובה קצרה: 2–5 משפטים. אם יש השוואה בין קטגוריות, החזר גם טבלה קטנה (עד 8 שורות, עד 4 עמודות).
- סיים בהמלצה מעשית אחת לעגלה, רק אם היא נובעת מהנתונים.
- בלי קו מפריד ארוך (—), בלי אימוג'י.`;

async function aiAnalyze(env, b){
  const columns = Array.isArray(b.columns) ? b.columns.map(String).slice(0, 60) : [];
  const rows = Array.isArray(b.rows) ? b.rows : [];
  const question = String(b.question || "").trim().slice(0, 600);
  if (!columns.length || !rows.length) throw fail("bad_request", "אין נתונים לנתח. העלה קובץ CSV או השתמש ביומן המשמרות.");
  if (!question) throw fail("bad_request", "מה לשאול על הנתונים?");
  const rowsJson = JSON.stringify(rows).slice(0, 45000);
  const history = Array.isArray(b.history) ? b.history.slice(-4) : [];
  const prompt = [
    ANALYST,
    `שם הקובץ: ${String(b.name || "טבלה").slice(0, 80)}`,
    `עמודות: ${JSON.stringify(columns)}`,
    `סה"כ שורות בקובץ: ${Number(b.rowCount) || rows.length}${b.sampled ? ` (נשלחו ${rows.length} מהן כדגימה)` : ""}`,
    b.profile ? `פרופיל העמודות (JSON): ${JSON.stringify(b.profile).slice(0, 8000)}` : "",
    `השורות (JSON, לפי סדר העמודות): ${rowsJson}`,
    history.length ? `שאלות קודמות ותשובותיהן: ${JSON.stringify(history).slice(0, 4000)}` : "",
    `השאלה: ${question}`,
    'החזר JSON בלבד: {"answer":"...", "table":{"columns":["..."],"rows":[["..."]]} או null, "followups":["שאלת המשך 1","שאלת המשך 2"]}',
  ].filter(Boolean).join("\n\n");
  const r = await gemini(env, prompt, { json: true, temperature: 0.2 });
  const table = r && r.table && Array.isArray(r.table.columns) && Array.isArray(r.table.rows)
    ? { columns: r.table.columns.map(String).slice(0, 4), rows: r.table.rows.slice(0, 8).map(row => (Array.isArray(row) ? row : [row]).map(String).slice(0, 4)) }
    : null;
  return {
    answer: String(r?.answer || "").trim() || "לא הצלחתי להסיק תשובה מהנתונים.",
    table,
    followups: (Array.isArray(r?.followups) ? r.followups : []).map(String).filter(Boolean).slice(0, 3),
  };
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

/* ===== תזמון: פוסט אחד, שתי רשתות, נגיעה אחת =====
   פייסבוק יודע לתזמן לבד (scheduled_publish_time). אינסטגרם לא — שם התמונה
   צריכה כתובת ציבורית, ואין לנו אחסון. הפתרון: התמונה עולה לעמוד הפייסבוק
   (זה ממילא הפוסט), ובזמן הפרסום הקרון שולף ממנה כתובת CDN טרייה ומגיש אותה
   לאינסטגרם. מסמך הפוסט ב-Firestore הוא התור. */
const MIN_AHEAD = 10 * 60;              // מטא: לפחות 10 דקות קדימה
const MAX_AHEAD = 30 * 24 * 3600;       // ולכל היותר 30 יום

function dataUrlToBlob(dataUrl){
  const m = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || ""));
  if (!m) return null;
  const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

// העלאה בינארית לעמוד. graph() עובד עם URLSearchParams; כאן צריך multipart.
async function graphUpload(env, path, fields, file){
  if (!env.FB_PAGE_TOKEN) throw fail("not_configured", "חסר טוקן של עמוד הפייסבוק בשרת.", 500);
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.append(k, String(v));
  fd.append("access_token", env.FB_PAGE_TOKEN);
  fd.append("source", file, "photo.jpg");
  const r = await fetch(`${GRAPH}/${path}`, { method: "POST", body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw fail("meta_error", data.error?.message || "Meta דחה את ההעלאה.", 502);
  return data;
}

// מתי לפרסם: 0 = עכשיו. עבר או קרוב מדי → עכשיו; רחוק מדי → שגיאה.
function publishWhen(atMs, nowSec = Math.floor(Date.now() / 1000)){
  let when = Math.floor(Number(atMs || 0) / 1000);
  if (!when || when < nowSec + MIN_AHEAD) return 0;
  if (when > nowSec + MAX_AHEAD) throw fail("bad_request", "אפשר לתזמן עד 30 יום קדימה.");
  return when;
}

async function schedulePost(env, b){
  if (!env.FB_PAGE_ID) throw fail("not_configured", "עמוד הפייסבוק עוד לא מחובר לשרת.", 501);
  const id = String(b.postId || "").slice(0, 60);
  const text = String(b.text || "").slice(0, 2200);
  const image = b.image ? dataUrlToBlob(b.image) : null;
  if (!text && !image) throw fail("bad_request", "אין מה לפרסם — אין טקסט ואין תמונה.");
  if (image && image.size > 8 * 1024 * 1024) throw fail("bad_request", "התמונה גדולה מ-8MB.");

  const now = Math.floor(Date.now() / 1000);
  const when = publishWhen(b.at, now);
  const sched = when ? { published: "false", scheduled_publish_time: String(when) } : {};

  // 1. פייסבוק — התמונה עולה כאן, וזה גם הפוסט
  const fb = image
    ? await graphUpload(env, `${env.FB_PAGE_ID}/photos`, { caption: text, ...sched }, image)
    : await graph(env, `${env.FB_PAGE_ID}/feed`, { message: text, ...sched });
  const out = { fbPostId: fb.post_id || fb.id || "", fbPhotoId: image ? (fb.id || "") : "",
    publishAt: (when || now) * 1000, igPending: false, igPostId: "", igSkipped: "", igError: "" };

  // 2. אינסטגרם — עכשיו, או בתור לקרון
  if (!image) out.igSkipped = "אינסטגרם דורש תמונה";
  else if (!env.IG_USER_ID) out.igSkipped = "חשבון האינסטגרם לא מחובר לשרת";
  else if (!when){
    try { out.igPostId = await igPublishFromPhoto(env, out.fbPhotoId, text); }
    catch (e){ out.igError = hebrew(e.message); }
  } else if (!env.FIREBASE_SA) out.igSkipped = "תזמון לאינסטגרם דורש את FIREBASE_SA בשרת";
  else out.igPending = true;

  // 3. התור — מסמך הפוסט. אם אין חשבון שירות בשרת, האפליקציה כותבת בעצמה.
  if (id && env.FIREBASE_SA){
    try { await fsPatch(env, `posts/${id}`, { ...out, status: "scheduled" }); out.saved = true; }
    catch (e){ out.saveError = hebrew(e.message); }
  }
  return out;
}

// כתובת CDN טרייה של תמונה שכבר בעמוד → קונטיינר → פרסום. הכתובת חתומה ופגה,
// לכן שולפים אותה ברגע הפרסום ולא בזמן התזמון.
async function igPublishFromPhoto(env, photoId, caption){
  if (!photoId) throw fail("bad_request", "אין תמונה לאינסטגרם.");
  const ph = await graph(env, photoId, { fields: "images" }, "GET");
  const src = (ph.images || []).slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  if (!src || !src.source) throw fail("meta_error", "פייסבוק לא החזיר כתובת לתמונה.", 502);
  const c = await graph(env, `${env.IG_USER_ID}/media`, { image_url: src.source, caption: caption || "" });
  const p = await graph(env, `${env.IG_USER_ID}/media_publish`, { creation_id: c.id });
  return p.id;
}

// מה מהתור הגיע זמנו. נפרד מהרשת כדי שאפשר לבדוק אותו.
const dueNow = (docs, nowMs = Date.now()) =>
  docs.filter(d => d.fields.igPending === true && Number(d.fields.publishAt || 0) > 0 && Number(d.fields.publishAt) <= nowMs);

// הקרון: מה שממתין לאינסטגרם והגיע זמנו
async function publishDue(env){
  if (!env.FIREBASE_SA || !env.IG_USER_ID) return { skipped: true };
  const pending = await fsQuery(env, "posts", [["igPending", "EQUAL", true]]);
  const results = [];
  for (const d of dueNow(pending)){
    const text = [d.fields.text || "", (d.fields.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
    try {
      const igPostId = await igPublishFromPhoto(env, d.fields.fbPhotoId, text);
      await fsPatch(env, `posts/${d.id}`, { igPending: false, igPostId, igError: "" });
      results.push({ id: d.id, ok: true });
    } catch (e){
      // עוד ניסיון או שניים בעשר הדקות הבאות; אחרי זה יוצא מהתור, והסיבה גלויה באפליקציה
      const tries = Number(d.fields.igTries || 0) + 1;
      await fsPatch(env, `posts/${d.id}`, { igTries: tries, igError: hebrew(e.message), igPending: tries < 3 });
      results.push({ id: d.id, ok: false, error: e.message });
    }
  }
  return { checked: pending.length, results };
}

async function publishState(env){
  return { facebook: !!(env.FB_PAGE_TOKEN && env.FB_PAGE_ID), instagram: !!env.IG_USER_ID, queue: !!env.FIREBASE_SA };
}

/* ===== מספרים אמיתיים במקום הקלדה =====
   עד היום הבעלים הקליד חשיפה, לייקים ושמירות לכל פוסט — 4 שדות כפול 12
   פוסטים, כל שבוע — וזה הדלק של כל הלמידה (שעות טובות, מה עבד). מאז
   שהפרסום עובר דרכנו יש לנו את מזהי הפוסטים, ומטא מחזירה את המספרים.

   שני הערוצים נספרים יחד: חשיפה מתחברת, לייקים ושמירות מתחברים. פוסט
   שאחד הערוצים שלו נכשל עדיין מחזיר את מה שיש. */
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const metricOf = (data, name) => {
  const row = (data.data || []).find(m => m.name === name);
  return row ? num((row.values && row.values[0] && row.values[0].value) ?? row.value) : 0;
};

async function fbPostNumbers(env, postId){
  const [ins, eng] = await Promise.all([
    graph(env, `${postId}/insights`, { metric: "post_impressions_unique" }, "GET").catch(() => ({})),
    graph(env, postId, { fields: "likes.summary(true),comments.summary(true),shares" }, "GET").catch(() => ({})),
  ]);
  return {
    reach: metricOf(ins, "post_impressions_unique"),
    likes: num(eng.likes && eng.likes.summary && eng.likes.summary.total_count),
    saves: num(eng.shares && eng.shares.count),      // לפייסבוק אין "שמירות"; שיתוף הוא המקבילה
  };
}
async function igPostNumbers(env, mediaId){
  const ins = await graph(env, `${mediaId}/insights`, { metric: "reach,likes,saved" }, "GET").catch(() => ({}));
  return { reach: metricOf(ins, "reach"), likes: metricOf(ins, "likes"), saves: metricOf(ins, "saved") };
}

async function postInsights(env, b){
  const posts = Array.isArray(b.posts) ? b.posts.slice(0, 30) : [];
  if (!posts.length) throw fail("bad_request", "לא נשלחו פוסטים.");
  if (!env.FB_PAGE_TOKEN) throw fail("not_configured", "עמוד הפייסבוק עוד לא מחובר לשרת.", 501);

  const out = [];
  for (const p of posts){
    const id = String(p.id || "").slice(0, 60);
    if (!id) continue;
    const parts = [];
    if (p.fbPostId) parts.push(await fbPostNumbers(env, String(p.fbPostId)).catch(() => null));
    if (p.igPostId) parts.push(await igPostNumbers(env, String(p.igPostId)).catch(() => null));
    const got = parts.filter(Boolean);
    if (!got.length){ out.push({ id, error: "לא התקבלו מספרים" }); continue; }
    const sum = (k) => got.reduce((n, x) => n + num(x[k]), 0);
    out.push({ id, reach: sum("reach"), likes: sum("likes"), saves: sum("saves"), sources: got.length });
  }
  return { posts: out, at: Date.now() };
}

/* ===== Firestore מהשרת =====
   חשבון השירות חתום כ-JWT → access token → REST. רק לצורך התור.
   האפליקציה עצמה ממשיכה לעבוד דרך ה-SDK, עם הכללים. */
let saTok = { value: "", exp: 0 };
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s) => b64url(new TextEncoder().encode(s));

async function signSaJwt(sa, nowSec){
  const header = b64urlStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlStr(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: nowSec, exp: nowSec + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${b64url(sig)}`;
}
async function saToken(env){
  if (saTok.value && Date.now() < saTok.exp - 60000) return saTok.value;
  const jwt = await signSaJwt(JSON.parse(env.FIREBASE_SA), Math.floor(Date.now() / 1000));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  const data = await r.json();
  if (!data.access_token) throw fail("firestore", "חשבון השירות לא התקבל ב-Google.", 500);
  saTok = { value: data.access_token, exp: Date.now() + (data.expires_in || 3600) * 1000 };
  return saTok.value;
}
const fsBase = (env) => `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// ערכים בפורמט של Firestore REST, לשני הכיוונים
function toFs(v){
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
  return { stringValue: String(v) };
}
function fromFs(f){
  if (!f) return undefined;
  if ("stringValue" in f) return f.stringValue;
  if ("booleanValue" in f) return f.booleanValue;
  if ("integerValue" in f) return Number(f.integerValue);
  if ("doubleValue" in f) return f.doubleValue;
  if ("nullValue" in f) return null;
  if ("timestampValue" in f) return f.timestampValue;
  if ("arrayValue" in f) return (f.arrayValue.values || []).map(fromFs);
  if ("mapValue" in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  return undefined;
}
async function fsPatch(env, path, fields){
  const tok = await saToken(env);
  const mask = Object.keys(fields).map(k => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const r = await fetch(`${fsBase(env)}/${path}?${mask}`, { method: "PATCH",
    headers: { authorization: "Bearer " + tok, "content-type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFs(v)])) }) });
  if (!r.ok) throw fail("firestore", "העדכון ב-Firestore נכשל: " + (await r.text()).slice(0, 200), 502);
  return true;
}
async function fsQuery(env, colName, wheres){
  const tok = await saToken(env);
  const filters = wheres.map(([field, op, value]) => ({ fieldFilter: { field: { fieldPath: field }, op, value: toFs(value) } }));
  const where = filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };
  const r = await fetch(`${fsBase(env)}:runQuery`, { method: "POST",
    headers: { authorization: "Bearer " + tok, "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: colName }], where, limit: 50 } }) });
  if (!r.ok) throw fail("firestore", "השאילתה ב-Firestore נכשלה: " + (await r.text()).slice(0, 200), 502);
  const rows = await r.json();
  return rows.filter(x => x.document).map(x => ({
    id: x.document.name.split("/").pop(),
    fields: Object.fromEntries(Object.entries(x.document.fields || {}).map(([k, v]) => [k, fromFs(v)])),
  }));
}

// hours: {sun:[["06:30","15:00"]], mon:[], ...}  -> פורמט של פייסבוק
/* ---------- שעות בגוגל ----------
   Google Business Profile הוא הערוץ מספר 1 לחיפוש "קפה ליד": מי שנוסע לבניאס
   רואה את הכרטיס בגוגל, לא את עמוד הפייסבוק. שעות שגויות שם שולחות אנשים לעגלה סגורה.

   הנתיב מוכן, אבל דורש אישור ידני מגוגל ל-Business Profile API. עד שיאושר
   הוא מחזיר not_configured והאפליקציה ממשיכה להציע הדבקה ידנית.

   ביום שהאישור מגיע (הקוטה עולה מ-0 ל-300 QPM), צריך להגדיר ב-Cloudflare:
     GB_LOCATION     — locations/12345678901234567890
     GB_CLIENT_ID    — מ-OAuth client ב-Cloud Console
     GB_CLIENT_SECRET
     GB_REFRESH_TOKEN — נוצר פעם אחת בהסכמת הבעלים, לא פג
   ואז זה עובד בלי שינוי קוד. */
const GB_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const GB_DAYS = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];

// refresh token → access token. נשמר בזיכרון ה-Worker עד שפג.
let gbToken = { value: "", exp: 0 };
async function gbAccessToken(env){
  if (gbToken.value && Date.now() < gbToken.exp - 60000) return gbToken.value;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GB_CLIENT_ID, client_secret: env.GB_CLIENT_SECRET,
      refresh_token: env.GB_REFRESH_TOKEN, grant_type: "refresh_token",
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token)
    throw fail("google_auth", "ההתחברות לגוגל נכשלה. צריך להנפיק refresh token חדש.", 502);
  gbToken = { value: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return gbToken.value;
}

// "08:30" → {hours:8, minutes:30}. גוגל משמיטה אפסים.
function gbTime(hhmm){
  const [h, m] = String(hhmm || "").split(":").map(Number);
  const o = {};
  if (h) o.hours = h;
  if (m) o.minutes = m;
  return o;
}

async function setGoogleHours(env, b){
  for (const k of ["GB_LOCATION","GB_CLIENT_ID","GB_CLIENT_SECRET","GB_REFRESH_TOKEN"])
    if (!env[k]) throw fail("not_configured",
      "גוגל עוד לא מחוברת. ה-API של Business Profile דורש אישור מגוגל, ואחריו ארבעה משתנים בשרת.", 501);

  // hours הוא מערך של 7 ימים, כל אחד עד שני טווחים: [["08:00","14:00"], ...]
  const periods = [];
  (Array.isArray(b.hours) ? b.hours : []).forEach((ranges, i) => {
    (ranges || []).slice(0, 2).forEach(([open, close]) => {
      if (!open || !close) return;
      periods.push({ openDay: GB_DAYS[i], closeDay: GB_DAYS[i], openTime: gbTime(open), closeTime: gbTime(close) });
    });
  });
  if (!periods.length) throw fail("bad_request", "אין אף יום פתוח לעדכן.");

  const token = await gbAccessToken(env);
  const r = await fetch(`${GB_API}/${env.GB_LOCATION}?updateMask=regularHours`, {
    method: "PATCH",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ regularHours: { periods } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw fail("google_error", d.error?.message || "גוגל דחתה את העדכון.", 502);
  return { ok: true, days: periods.length };
}

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
