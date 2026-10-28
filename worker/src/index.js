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

   // uid → { at, ok }

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") return json({ ok: true }, cors);
      // בוט קורטדו (בוט הוואטסאפ) מזדהה במפתח משותף, לא במשתמש Firebase.
      if (url.pathname === "/hours/bot") return json(await botHours(env, request), cors);
      if (url.pathname === "/hours/refresh") return json(await refreshHours(env, request), cors);
      if (url.pathname === "/team/bot") return json(await botTeam(env, request), cors);
      if (url.pathname === "/team/bot/set") return json(await botTeamSet(env, request), cors);
      if (url.pathname === "/queue/bot") return json(await botQueue(env, request), cors);
      if (url.pathname === "/post/bot") return json(await botPost(env, request), cors);
      if (url.pathname === "/insights/bot") return json(await botInsights(env, request), cors);
      if (url.pathname === "/post/bot/reel") return json(await botReel(env, request), cors);
      if (url.pathname === "/post/bot/story") return json(await botStory(env, request), cors);
      if (url.pathname === "/post/bot/carousel") return json(await botCarousel(env, request), cors);
      // בחירת שיר לריל מהבוט (28.10.2026): אותו חיפוש של instagram_audio, בלי חיפוש = טרנדים
      if (url.pathname === "/post/bot/songs"){ botAuth(env, request); const b = await request.json().catch(() => ({})); return json(await mcpInstagramAudio(await withMeta(env), b), cors); }
      // מחבר Claude לנתוני פייסבוק ואינסטגרם (קריאה בלבד). המפתח בנתיב, ראה MCP למטה.
      if (url.pathname.startsWith("/mcp/")) return await mcp(env, request, url.pathname.slice(5));
      // חיבור חד-פעמי של פרופיל העסק בגוגל. נשמר רק אם מייסד אישר בגוגל.
      if (url.pathname === "/google/connect") return await googleConnect(env, request);
      if (url.pathname === "/google/callback") return await googleCallback(env, url);
      // הממשק בדפדפן הוסר ב-23.10.2026 (commit 1c53ba1), ואיתו הנתיבים שדרשו התחברות
      return json({ error: "not_found" }, cors, 404);
    } catch (e) {
      const code = e.status || 500;
      // שום טקסט באנגלית לא יוצא מכאן. hebrew() מתרגם.
      // detail הוא הטקסט הגולמי של השירות החיצוני — הוא מכיל נתיבי Firestore,
      // זהויות IAM ומזהי trace של Meta, ולכן הוא יוצא רק כש-DEBUG דולק.
      const raw = e.message || String(e);
      if (String(env.DEBUG || "") !== "1") console.error("worker", raw);
      return json({ error: e.code || "error", message: hebrew(raw),
        ...(String(env.DEBUG || "") === "1" ? { detail: raw } : {}) }, cors, code);
    }
  },

  // הקרון: כל עשר דקות. מפרסם לאינסטגרם את מה שהגיע זמנו.
  // לאינסטגרם אין תזמון ב-API — כל "תזמון" בעולם הוא תור שמחכה לדקה. זה התור שלנו.
  async scheduled(event, env, ctx){
    ctx.waitUntil(withMeta(env).then(publishDue).catch(e => console.error("cron", e && e.message)));
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

/* מזהה מסמך שנכנס לתוך נתיב URL. הרשימה הלבנה היא ההגנה: '/' ו-'..'
   מנורמלים בידי fetch ומאפשרים לצאת מהקולקציה. ריק = לא לכתוב כלום. */
function docId(v){
  const s = String(v == null ? "" : v);
  if (!s) return "";
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(s)) throw fail("bad_request", "מזהה לא תקין.");
  return s;
}
// מזהה של פייסבוק/אינסטגרם: ספרות, ולפעמים <pageId>_<postId>.
const graphId = (v) => /^[0-9]{1,30}(_[0-9]{1,30})?$/.test(String(v || "")) ? String(v) : "";

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
  [/(gemini|\bmodels?\b)[\s\S]*(no longer available|not found|is not supported|deprecated)/i,
    // כאן מגיעים רק אחרי שכל MODEL_CHAIN נכשל, ולא בהכרח בגלל הגדרה ידנית.
    () => "אף מודל של Gemini לא נענה — כנראה השתנו שמות המודלים. אם הגדרת GEMINI_MODEL " +
          "ב-Cloudflare, מחק אותו; אחרת צריך לעדכן את רשימת המודלים בשרת."],
  // ── מטא ──
  [/Session has expired|OAuthException|access token|code.*190/i,
    () => "הטוקן של עמוד הפייסבוק פג. צריך לשים טוקן עמוד חדש ב-FB_PAGE_TOKEN בהגדרות של Cloudflare."],
  [/\(#200\)|requires .* permission|insufficient permission/i,
    () => "לאפליקציית הפייסבוק חסרה הרשאה לפעולה הזו. צריך להוסיף אותה ב-Graph API Explorer ולחבר מחדש."],
  [/\(#4\)|\(#17\)|too many calls|request limit reached/i,
    () => "פייסבוק חסמה זמנית בגלל יותר מדי בקשות. נסה שוב בעוד כמה דקות."],
  [/media|image.*(invalid|unsupported)|Unsupported post request|aspect ratio|codec/i,
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

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/* ---------- Meta: פייסבוק ואינסטגרם ---------- */
/* ===== חיבור העמוד נשמר בשרת, לא בלוח של Cloudflare =====
   "חבר עמוד" באפליקציה מחליף טוקן משתמש קצר בטוקן עמוד ארוך. עד היום הוא
   הציג את התוצאה וביקש להעתיק אותה ידנית ל-Cloudflare — צעד שאף אחד לא
   עשה, ולכן "עמוד הפייסבוק עוד לא מחובר" נשאר על המסך. עכשיו הוא נשמר
   ב-Firestore (secrets/meta), שאף לקוח לא יכול לקרוא (הכלל סגור), וה-Worker
   קורא אותו עם חשבון השירות. מה שמוגדר בלוח של Cloudflare עדיין מנצח —
   כך אפשר להחליף עמוד או לנתק בלי למחוק כלום. */
const META_KEYS = ["FB_PAGE_ID", "FB_PAGE_TOKEN", "IG_USER_ID"];
async function withMeta(env){
  // כל מפתח שחסר בלוח מגיע מהמסמך. קודם, עמוד שהוגדר בלוח עצר כאן, ו-IG_USER_ID שבמסמך לא נטען אף פעם.
  if (META_KEYS.every(k => env[k]) || !env.FIREBASE_SA) return env;
  let d = null;
  try { d = await fsGet(env, "secrets/meta"); } catch {}
  if (!d) return env;
  const out = { ...env };
  for (const k of META_KEYS) if (!out[k] && d[k]) out[k] = String(d[k]);
  return out;
}

async function graph(env, path, params, method = "POST", base = GRAPH){
  if (!env.FB_PAGE_TOKEN) throw fail("not_configured", "חסר טוקן של עמוד הפייסבוק בשרת.", 500);
  const q = new URLSearchParams({ ...params, access_token: env.FB_PAGE_TOKEN });
  // GET ו-DELETE נושאים את הטוקן בשאילתה; POST בגוף. DELETE עם גוף
  // מוחזר על ידי Graph כבקשה בלי הרשאה.
  const inQuery = method === "GET" || method === "DELETE";
  const r = await fetch(`${base}/${path}${inQuery ? "?" + q : ""}`,
    method === "GET" ? {} : inQuery ? { method } : { method, body: q });
  const data = await r.json();
  if (!r.ok || data.error) throw fail("meta_error", data.error?.message || "Meta דחה את הבקשה.", 502);
  return data;
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
  // חיתוך אורך לבדו לא מספיק: fetch מנרמל '..' בנתיב, ולכן postId כמו
  // "../members/<uid>" היה הופך את ה-PATCH לכתיבה למסמך אחר לגמרי — עם
  // חשבון השירות, שעוקף את firestore.rules במלואם.
  const id = docId(b.postId);
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
  const tags = cleanTags(b.tags);
  const out = { fbPostId: fb.post_id || fb.id || "", fbPhotoId: image ? (fb.id || "") : "",
    publishAt: (when || now) * 1000, igPending: false, igPostId: "", igSkipped: "", igError: "", igTagged: [], igTagError: "", tags };

  // 2. אינסטגרם — עכשיו, או בתור לקרון
  // noIg: הלקוח ביקש פייסבוק בלבד. נבדק ראשון, לפני כל סיבה אחרת לדלג,
  // כדי שהסיבה שתוצג תהיה הבחירה ולא "חסר חשבון".
  if (b.noIg) out.igSkipped = "פייסבוק בלבד — לפי הבחירה באפליקציה";
  else if (!image) out.igSkipped = "אינסטגרם דורש תמונה";
  else if (!env.IG_USER_ID) out.igSkipped = "חשבון האינסטגרם לא מחובר לשרת";
  else if (!when){
    try { const ig = await igPublishFromPhoto(env, out.fbPhotoId, text, tags); Object.assign(out, { igPostId: ig.id, igTagged: ig.igTagged, igTagError: ig.igTagError }); }
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
async function igPublishFromPhoto(env, photoId, caption, tags = []){
  if (!photoId) throw fail("bad_request", "אין תמונה לאינסטגרם.");
  const ph = await graph(env, photoId, { fields: "images" }, "GET");
  const src = (ph.images || []).slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0];
  if (!src || !src.source) throw fail("meta_error", "פייסבוק לא החזיר כתובת לתמונה.", 502);
  const c = await igImageContainer(env, { image_url: src.source, caption: caption || "" }, tags);
  // מטא מבקשת לחכות ל-FINISHED לפני הפרסום. בלי זה, לפעמים "Media ID is not available".
  if (!(await igReady(env, c.id, 6, 2000))) throw fail("meta_error", "אינסטגרם עוד מעבד את התמונה. ננסה שוב בעוד כמה דקות.", 502);
  const p = await graph(env, `${env.IG_USER_ID}/media_publish`, { creation_id: c.id });
  return { id: String(p.id), igTagged: c.tagged, igTagError: c.tagError };
}

// קונטיינר של אינסטגרם מוכן לפרסום? FINISHED = כן, IN_PROGRESS = עוד לא, ERROR/EXPIRED = לא יהיה.
async function igReady(env, id, tries = 1, waitMs = 0){
  for (let i = 0; i < tries; i++){
    if (i) await sleep(waitMs);
    const s = await graph(env, id, { fields: "status_code,status" }, "GET");
    if (s.status_code === "FINISHED" || s.status_code === "PUBLISHED") return true;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED")
      throw fail("meta_error", `אינסטגרם לא קיבל את הקובץ: ${s.status || s.status_code}`, 502);
  }
  return false;
}

// תיוג באינסטגרם (הבעלים, 24.10.2026: בכל פרסום). שמות משתמש בלבד; שם לא תקין לא נכנס
const cleanTags = v => (Array.isArray(v) ? v : []).map(t => String(t).trim().replace(/^@/, "")).filter(t => /^[\w.]{1,30}$/.test(t)).slice(0, 20);
// תמונה: user_tags על התמונה, והכיתוב נשאר נקי. תיוג שאינסטגרם דוחה (חשבון שחוסם תיוג, שם שהשתנה) לא מפיל את הפרסום: יוצא בלי, והסיבה מדווחת
// xy: פריט בקרוסלה חייב מיקום לכל תיוג. התגים נפרשים על התמונה בשורות של 4, כדי שלא ייערמו בנקודה אחת
async function igImageContainer(env, params, tags, xy = false){
  const out = { tagged: [], tagError: "" };
  let c;
  const tag = (username, i) => xy ? { username, x: +(0.14 + 0.24 * (i % 4)).toFixed(2), y: +(0.2 + 0.2 * Math.floor(i / 4)).toFixed(2) } : { username };
  if (tags.length) try { c = (await graph(env, `${env.IG_USER_ID}/media`, { ...params, user_tags: JSON.stringify(tags.map(tag)) })).id; out.tagged = tags; }
    catch (e){ out.tagError = hebrew(e.message); }
  c ||= (await graph(env, `${env.IG_USER_ID}/media`, params)).id;
  return { id: String(c), ...out };
}
// וידאו: אין user_tags, ולכן התיוג הוא שורת @ בסוף הכיתוב של אינסטגרם בלבד (פייסבוק נשאר נקי)
const withMentions = (caption, tags) => tags.length ? `${caption || ""}\n\n${tags.map(t => "@" + t).join(" ")}`.trim() : (caption || "");

/* ===== ריל: וידאו מהבוט, ישר לפייסבוק ולאינסטגרם =====
   אין לנו אחסון, ולכן הקובץ עצמו עולה למטא (resumable upload), לכל רשת בנפרד.
   כאן רק "עכשיו". את התזמון מחזיק הבוט: מזהה המדיה של וואטסאפ אצלו תקף 7 ימים.
   הגוף הוא הקובץ כמו שהוא (בלי multipart ובלי base64, שעולים זמן מעבד),
   והטקסט בכותרת x-reel: JSON ב-base64, כי כותרת לא מקבלת עברית. */
const GRAPH_VER = GRAPH.split("/").pop();
// מוזיקה מהספרייה של אינסטגרם (Audio API, 27.10.2026) קיימת רק מ-v22. רק הקריאות של המוזיקה עוברות לשם; השאר נשאר על GRAPH
const GRAPH_AUDIO = GRAPH.replace(/v[\d.]+$/, "v22.0");
// audio מהבוט: { id, volume, video_volume } או רק המזהה. video_volume ברירת מחדל 0, כי בריל הבנוי כבר יש מוזיקה משלו;
// קליפ עם סאונד אמיתי (רעשי רקע) שולח video_volume נמוך, למשל 25, כדי שיישמע מתחת לשיר
function audioConf(a){
  const id = String((a && a.id) || (typeof a === "string" || typeof a === "number" ? a : "")).trim();
  if (!/^\d{5,25}$/.test(id)) return "";
  const v = (x, d) => Math.max(0, Math.min(100, Math.round(Number(x ?? d)) || 0));
  return JSON.stringify({ audio_id: id, audio_volume: v(a && a.volume, 100), video_volume: v(a && a.video_volume, 0) });
}
const MAX_REEL_BYTES = 40 * 1024 * 1024; // כמו MAX_VIDEO_MB בבוט: זיכרון ה-Worker 128MB

async function rupload(env, path, bytes){
  const r = await fetch(`https://rupload.facebook.com/${path}`, { method: "POST", body: bytes, headers: {
    authorization: "OAuth " + env.FB_PAGE_TOKEN, offset: "0", file_size: String(bytes.byteLength),
    "content-type": "application/octet-stream" } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error || data.success === false)
    throw fail("meta_error", data.error?.message || data.debug_info?.message || `ההעלאה למטא נכשלה (${r.status}).`, 502);
  return data;
}
async function fbReel(env, bytes, description){
  const s = await graph(env, `${env.FB_PAGE_ID}/video_reels`, { upload_phase: "start" });
  await rupload(env, `video-upload/${GRAPH_VER}/${s.video_id}`, bytes);
  await graph(env, `${env.FB_PAGE_ID}/video_reels`, { upload_phase: "finish", video_id: s.video_id, video_state: "PUBLISHED", description: description || "" });
  return String(s.video_id);
}
// מחזיר את מזהה הקונטיינר. מפרסמים רק אחרי שהוא FINISHED.
async function igReelContainer(env, bytes, caption, extra = {}){
  const base = extra.audio_configuration ? GRAPH_AUDIO : GRAPH;
  const c = await graph(env, `${env.IG_USER_ID}/media`, { media_type: "REELS", upload_type: "resumable", caption: caption || "", share_to_feed: "true", ...extra }, "POST", base);
  await rupload(env, `ig-api-upload/${base.split("/").pop()}/${c.id}`, bytes);
  return String(c.id);
}

// אחד מעשרת השירים הטרנדיים בספרייה, באקראי, כדי שלא יחזור אותו שיר בכל ריל
async function trendingSong(env){
  const r = await graph(env, "ig_audio", { audio_type: "music", user_id: env.IG_USER_ID }, "GET", GRAPH_AUDIO);
  const top = (r.audio || r.data || []).slice(0, 10).filter(t => audioConf(t.audio_id || t.id));
  const t = top[Math.floor(Math.random() * top.length)];
  return t ? { id: String(t.audio_id || t.id), title: [t.title, t.display_artist].filter(Boolean).join(" – ") } : null;
}

async function botReel(env, request){
  botAuth(env, request);
  env = await withMeta(env);
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) throw fail("not_configured", "עמוד הפייסבוק עוד לא מחובר לשרת.", 501);
  let meta = {};
  try { meta = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(request.headers.get("x-reel") || ""), ch => ch.charCodeAt(0)))); } catch {}
  const type = (request.headers.get("content-type") || "").split(";")[0];
  if (!/^video\//.test(type)) throw fail("bad_request", "אין קובץ וידאו.");
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw fail("bad_request", "אין קובץ וידאו.");
  if (bytes.byteLength > MAX_REEL_BYTES) throw fail("bad_request", "הסרטון גדול מ-40MB.");
  const text = String(meta.text || "").slice(0, 2200), tags = cleanTags(meta.tags);
  const collab = cleanTags(meta.collaborators).slice(0, 3); // ריל משותף (25.10.2026): מופיע גם אצל השותף, אחרי שהוא מאשר את ההזמנה
  const id = "r" + Date.now().toString(36);
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }).format(new Date());
  await fsPatch(env, `posts/${id}`, { text, date: local.slice(0, 10), time: local.slice(11, 16), source: "bot", kind: "reel", status: "ready", hasMedia: true });

  // שיר מהספרייה של אינסטגרם. לפייסבוק אין: שם יוצא הסאונד שבקובץ.
  // בלי שיר שנבחר (סרטון ששלחו לבוט): שיר טרנדי, כדי שאף ריל לא יוצא בלי מוזיקה (הבעלים, 28.10.2026: "חייב שיהיה מוזיקה").
  // keepSound=false: בקובץ כבר יש מוזיקה, ולכן היא מושתקת מתחת לשיר; אחרת הסאונד המקורי נשמע בשקט מתחתיו
  let audio = audioConf(meta.audio), song = null;
  if (!audio && meta.audio == null && env.IG_USER_ID && !meta.noIg){
    song = await trendingSong(env).catch(() => null);
    if (song) audio = audioConf({ id: song.id, video_volume: meta.keepSound === false ? 0 : 30 });
  }
  const out = { id, fbVideoId: "", fbError: "", igPostId: "", igPending: false, igSkipped: "", igError: "", igTagged: [], igCollab: [], igCollabError: "", igAudio: "", igAudioTitle: "", igAudioError: "" };
  // כל רשת מקבלת את הקובץ בעצמה, וכישלון של אחת לא עוצר את השנייה
  await Promise.all([
    // noFb (27.10.2026): אינסטגרם בלבד, למשל ריל עם שיר מהספרייה שבפייסבוק היה יוצא בלי השיר
    meta.noFb ? null : fbReel(env, bytes, text).then(v => { out.fbVideoId = v; }, e => { out.fbError = hebrew(e.message); }),
    (async () => {
      if (meta.noIg) return void (out.igSkipped = "פייסבוק בלבד, לפי הבחירה");
      if (!env.IG_USER_ID) return void (out.igSkipped = "חשבון האינסטגרם לא מחובר לשרת");
      try {
        const caption = withMentions(text, tags).slice(0, 2200);
        // שותף שנדחה לא מפיל: הריל יוצא בלי, והסיבה מדווחת. שיר שנדחה כן: הריל לא עולה לאינסטגרם בלי השיר שנבחר
        // (הבעלים, 27.10.2026: "שלא יצא מצב שהסרטון נמצא עם שיר אחר ברקע")
        const opt = { ...(collab.length && { collaborators: JSON.stringify(collab) }), ...(audio && { audio_configuration: audio }) };
        let c = "", collabErr = null;
        while (!c) try { c = await igReelContainer(env, bytes, caption, opt); }
          catch (e){
            if (opt.collaborators){ collabErr = e; delete opt.collaborators; }
            // שיר שנבחר אוטומטית ונדחה: יוצא עם הסאונד שבקובץ. שיר שנבחר בכוונה ונדחה: לא עולה (הכלל של 27.10.2026)
            else if (opt.audio_configuration && song){ out.igAudioError = hebrew(e.message); delete opt.audio_configuration; }
            else if (opt.audio_configuration){ out.igAudioError = hebrew(e.message); throw new Error("השיר נדחה, אז הריל לא עלה לאינסטגרם"); }
            else throw e;
          }
        if (collabErr) out.igCollabError = hebrew(collabErr.message);
        if (opt.collaborators) out.igCollab = collab;
        if (opt.audio_configuration) Object.assign(out, { igAudio: JSON.parse(audio).audio_id, igAudioTitle: song ? song.title : "" });
        out.igTagged = tags;
        // עד 3 דקות כאן. עוד לא מוכן: נכנס לתור, והקרון מפרסם כשיהיה FINISHED (קונטיינר פג אחרי 24 שעות)
        if (await igReady(env, c, 18, 10000)) out.igPostId = String((await graph(env, `${env.IG_USER_ID}/media_publish`, { creation_id: c })).id);
        else Object.assign(out, { igPending: true, igContainer: c });
      } catch (e){ out.igError = hebrew(e.message); out.igCollab = []; }
    })(),
  ]);
  const status = out.igPending ? "scheduled" : (out.fbVideoId || out.igPostId) ? "done" : "cancelled";
  try { await fsPatch(env, `posts/${id}`, { ...out, status, publishAt: Date.now() }); }
  catch (e){ out.saveError = hebrew(e.message); }
  return { ok: true, ...out };
}

/* ===== סטורי עם מוזיקה (28.10.2026, הבעלים: "חייב שיהיה מוזיקה בכל הסטטוסים") =====
   סרטון קצר מהתמונה, עם המוזיקה בתוך הקובץ: ל-API אין שיר מהספרייה בסטורי. הגוף הוא הקובץ, ה-x-story כמו x-reel.
   אותו קובץ עולה לכל רשת בנפרד, וכישלון של אחת לא עוצר את השנייה. */
async function botVideoStory(env, request){
  env = await withMeta(env);
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) throw fail("not_configured", "עמוד הפייסבוק עוד לא מחובר לשרת.", 501);
  let meta = {};
  try { meta = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(request.headers.get("x-story") || ""), ch => ch.charCodeAt(0)))); } catch {}
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw fail("bad_request", "אין קובץ וידאו לסטורי.");
  if (bytes.byteLength > MAX_REEL_BYTES) throw fail("bad_request", "הסרטון גדול מ-40MB.");
  const tags = cleanTags(meta.tags);
  const out = { fbStoryId: "", fbError: "", igStoryId: "", igSkipped: "", igError: "", igTagged: [], igTagError: "", video: true };
  await Promise.all([
    (async () => {
      const s = await graph(env, `${env.FB_PAGE_ID}/video_stories`, { upload_phase: "start" });
      await rupload(env, `video-upload/${GRAPH_VER}/${s.video_id}`, bytes);
      const r = await graph(env, `${env.FB_PAGE_ID}/video_stories`, { upload_phase: "finish", video_id: s.video_id });
      out.fbStoryId = String(r.post_id || s.video_id);
    })().catch(e => { out.fbError = hebrew(e.message); }),
    (async () => {
      if (!env.IG_USER_ID) return void (out.igSkipped = "חשבון האינסטגרם לא מחובר לשרת");
      try {
        const c = await igImageContainer(env, { media_type: "STORIES", upload_type: "resumable" }, tags);
        Object.assign(out, { igTagged: c.tagged, igTagError: c.tagError });
        await rupload(env, `ig-api-upload/${GRAPH_VER}/${c.id}`, bytes);
        if (!(await igReady(env, c.id, 18, 5000))) throw fail("meta_error", "אינסטגרם עוד מעבד את הסרטון, והסטורי לא פורסם.", 502);
        out.igStoryId = String((await graph(env, `${env.IG_USER_ID}/media_publish`, { creation_id: c.id })).id);
      } catch (e){ out.igError = hebrew(e.message); out.igTagged = []; }
    })(),
  ]);
  return { ok: !!(out.fbStoryId || out.igStoryId), ...out };
}

/* ===== סטורי מהבוט: "מחר בעגלה", בלי "כן" (הבעלים, 17.10.2026) =====
   התמונה עולה פעם אחת לעמוד כתמונה לא מפורסמת. ממנה סטורי לפייסבוק, ומהכתובת שלה ב-CDN סטורי לאינסטגרם
   (אין לנו אחסון משלנו). כל ערוץ מדווח לבד, וכישלון של אחד לא עוצר את השני. */
async function botStory(env, request){
  botAuth(env, request);
  if (/^video\//.test(request.headers.get("content-type") || "")) return botVideoStory(env, request);
  const b = await request.json().catch(() => ({}));
  env = await withMeta(env);
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) throw fail("not_configured", "עמוד הפייסבוק עוד לא מחובר לשרת.", 501);
  const image = dataUrlToBlob(b.image);
  if (!image || !/^image\//.test(image.type)) throw fail("bad_request", "אין תמונה לסטורי.");
  if (image.size > 8 * 1024 * 1024) throw fail("bad_request", "התמונה גדולה מ-8MB.");
  const tags = cleanTags(b.tags);
  const photo = String((await graphUpload(env, `${env.FB_PAGE_ID}/photos`, { published: "false" }, image)).id);
  const out = { fbStoryId: "", fbError: "", igStoryId: "", igSkipped: "", igError: "", igTagged: [], igTagError: "" };
  await Promise.all([
    graph(env, `${env.FB_PAGE_ID}/photo_stories`, { photo_id: photo })
      .then(r => { out.fbStoryId = String(r.post_id || r.id || ""); }, e => { out.fbError = hebrew(e.message); }),
    (async () => {
      if (!env.IG_USER_ID) return void (out.igSkipped = "חשבון האינסטגרם לא מחובר לשרת");
      try {
        const ph = await graph(env, photo, { fields: "images" }, "GET");
        const src = (ph.images || []).slice().sort((x, y) => (y.width || 0) - (x.width || 0))[0];
        if (!src || !src.source) throw fail("meta_error", "פייסבוק לא החזיר כתובת לתמונה.", 502);
        const c = await igImageContainer(env, { image_url: src.source, media_type: "STORIES" }, tags);
        Object.assign(out, { igTagged: c.tagged, igTagError: c.tagError });
        if (!(await igReady(env, c.id, 10, 3000))) throw fail("meta_error", "אינסטגרם עוד מעבד את התמונה, והסטורי לא פורסם.", 502);
        out.igStoryId = String((await graph(env, `${env.IG_USER_ID}/media_publish`, { creation_id: c.id })).id);
      } catch (e){ out.igError = hebrew(e.message); out.igTagged = []; }
    })(),
  ]);
  return { ok: !!(out.fbStoryId || out.igStoryId), ...out };
}

/* ===== קרוסלה מהבוט (24.10.2026): 2 עד 10 תמונות, אותו סדר בשתי הרשתות (10 = המקסימום של אינסטגרם דרך ה-API).
   כל תמונה עולה לעמוד בלי פרסום. פייסבוק מקבל פוסט אחד עם כולן, ואינסטגרם את הכתובות שלהן מה-CDN של פייסבוק (אין לנו אחסון).
   tags[i] = מי מתויג בתמונה i. collaborators = עד 3 שותפים לפוסט באינסטגרם. תיוג או שותף שנדחים לא מפילים: יוצא בלי, והסיבה מדווחת ===== */
async function botCarousel(env, request){
  botAuth(env, request);
  const b = await request.json().catch(() => ({}));
  env = await withMeta(env);
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) throw fail("not_configured", "עמוד הפייסבוק עוד לא מחובר לשרת.", 501);
  const imgs = (Array.isArray(b.images) ? b.images : []).map(dataUrlToBlob);
  if (imgs.length < 2 || imgs.length > 10 || imgs.some(x => !x || !/^image\//.test(x.type) || x.size > 8 * 1024 * 1024))
    throw fail("bad_request", "קרוסלה צריכה 2 עד 10 תמונות, כל אחת עד 8MB.");
  const text = String(b.text || "").slice(0, 2200);
  const tags = imgs.map((_, i) => cleanTags(Array.isArray(b.tags) ? b.tags[i] : []));
  const collab = cleanTags(b.collaborators).slice(0, 3);
  const photos = [];
  for (const im of imgs) photos.push(String((await graphUpload(env, `${env.FB_PAGE_ID}/photos`, { published: "false" }, im)).id)); // אחת אחרי השנייה: הסדר נשמר
  const out = { fbPostId: "", fbError: "", igPostId: "", igSkipped: "", igError: "", igTagged: [], igTagError: "", igCollab: [], igCollabError: "" };
  await Promise.all([
    graph(env, `${env.FB_PAGE_ID}/feed`, { message: text, ...Object.fromEntries(photos.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })])) })
      .then(r => { out.fbPostId = String(r.id || ""); }, e => { out.fbError = hebrew(e.message); }),
    (async () => {
      if (b.noIg) return void (out.igSkipped = "פייסבוק בלבד");
      if (!env.IG_USER_ID) return void (out.igSkipped = "חשבון האינסטגרם לא מחובר לשרת");
      try {
        const kids = [];
        for (let i = 0; i < photos.length; i++){
          const ph = await graph(env, photos[i], { fields: "images" }, "GET");
          const src = (ph.images || []).slice().sort((x, y) => (y.width || 0) - (x.width || 0))[0];
          if (!src || !src.source) throw fail("meta_error", "פייסבוק לא החזיר כתובת לתמונה.", 502);
          const c = await igImageContainer(env, { image_url: src.source, is_carousel_item: "true" }, tags[i], true);
          out.igTagged.push(...c.tagged); out.igTagError ||= c.tagError;
          kids.push(c.id);
        }
        for (const k of kids) if (!(await igReady(env, k, 10, 3000))) throw fail("meta_error", "אינסטגרם עוד מעבד את התמונות, והקרוסלה לא פורסמה.", 502);
        const base = { media_type: "CAROUSEL", children: kids.join(","), caption: text };
        let parent = "";
        if (collab.length) try { parent = String((await graph(env, `${env.IG_USER_ID}/media`, { ...base, collaborators: JSON.stringify(collab) })).id); out.igCollab = collab; }
          catch (e){ out.igCollabError = hebrew(e.message); }
        parent ||= String((await graph(env, `${env.IG_USER_ID}/media`, base)).id);
        if (!(await igReady(env, parent, 10, 3000))) throw fail("meta_error", "אינסטגרם עוד מעבד את הקרוסלה, והיא לא פורסמה.", 502);
        out.igPostId = String((await graph(env, `${env.IG_USER_ID}/media_publish`, { creation_id: parent })).id);
      } catch (e){ out.igError = hebrew(e.message); out.igTagged = []; out.igCollab = []; }
    })(),
  ]);
  return { ok: !!(out.fbPostId || out.igPostId), ...out };
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
      let igPostId;
      // ריל שעלה וחיכה לעיבוד. עוד לא מוכן: הקרון הבא יבדוק שוב
      if (d.fields.igContainer && !(await igReady(env, d.fields.igContainer))) { results.push({ id: d.id, ok: false, waiting: true }); continue; }
      // יוצא מהתור לפני הפרסום: כתיבה שנכשלת אחרי הפרסום לא תפרסם אותו שוב בקרון הבא
      await fsPatch(env, `posts/${d.id}`, { igPending: false });
      if (d.fields.igContainer)
        igPostId = String((await graph(env, `${env.IG_USER_ID}/media_publish`, { creation_id: d.fields.igContainer })).id);
      else { const ig = await igPublishFromPhoto(env, d.fields.fbPhotoId, text, cleanTags(d.fields.tags)); igPostId = ig.id; await fsPatch(env, `posts/${d.id}`, { igTagged: ig.igTagged, igTagError: ig.igTagError }).catch(() => {}); }
      await fsPatch(env, `posts/${d.id}`, { igPostId, igError: "" }).catch(() => {});
      results.push({ id: d.id, ok: true });
    } catch (e){
      // עוד ניסיון או שניים בעשר הדקות הבאות; אחרי זה יוצא מהתור, והסיבה גלויה באפליקציה
      const tries = Number(d.fields.igTries || 0) + 1;
      // נכשל כאן? הפוסט מדולג ולא נעצרים שאר הפוסטים בתור
      await fsPatch(env, `posts/${d.id}`, { igTries: tries, igError: hebrew(e.message), igPending: tries < 3 }).catch(() => {});
      results.push({ id: d.id, ok: false, error: e.message });
    }
  }
  return { checked: pending.length, results };
}

async function publishState(env){
  // pageId יוצא החוצה בכוונה: הוא מזהה ציבורי (facebook.com/<id> עובד לכל
  // אחד), והפוסטר בונה ממנו את ה-QR. כתובת לפי מזהה לא נשברת כששם
  // המשתמש של העמוד משתנה.
  // reels: השרת יודע לקבל ריל ב-/post/bot/reel. בוט שמדבר עם שרת ישן לא מציע ריל.
  return { facebook: !!(env.FB_PAGE_TOKEN && env.FB_PAGE_ID), instagram: !!env.IG_USER_ID,
    queue: !!env.FIREBASE_SA, reels: true, carousel: true, pageId: env.FB_PAGE_ID || "", igUser: env.IG_USER_ID || "" };
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
    const id = docId(p.id);
    if (!id) continue;
    // המזהים האלה נכנסים ישירות לנתיב של Graph. בלי בדיקת צורה, ערך כמו
    // "me?fields=access_token&x=" משנה את הבקשה שנשלחת עם טוקן העמוד.
    const fbId = graphId(p.fbPostId), igId = graphId(p.igPostId);
    const parts = [];
    if (fbId) parts.push(await fbPostNumbers(env, fbId).catch(() => null));
    if (igId) parts.push(await igPostNumbers(env, igId).catch(() => null));
    const got = parts.filter(Boolean);
    if (!got.length){ out.push({ id, error: "לא התקבלו מספרים" }); continue; }
    const sum = (k) => got.reduce((n, x) => n + num(x[k]), 0);
    out.push({ id, reach: sum("reach"), likes: sum("likes"), saves: sum("saves"), sources: got.length });
  }
  return { posts: out, at: Date.now() };
}

/* ===== MCP: Claude קורא את פייסבוק ואינסטגרם ישירות (קריאה בלבד) =====
   הבעלים ביקש דשבורד שמחובר ישר למטא, בלי Metricool (14.10.2026). השרת כבר מחזיק את טוקן העמוד,
   אז הוא משמש כמחבר: Claude (והדשבורד) קוראים כאן, והשרת שואל את Graph API.
   הכניסה: /mcp/<מפתח>. בקוד שמור רק ה-SHA-256 של המפתח (המאגר ציבורי), והמפתח עצמו נמסר לבעלים.
   החלפת מפתח = החלפת ה-hash כאן. אין כאן שום כתיבה למטא.
   מגבלת Workers החינמי: 50 בקשות חוץ לבקשה אחת, ולכן הטווחים מוגבלים (פייסבוק 90 יום, אינסטגרם 30). */
const MCP_KEY_SHA256 = "eee833db388b0dd21265103af8026cfdc2a590e697c196dd2e82b5b35dd09bee";
const MCP_TOOLS = [
  { name: "account", description: "Current state of the cart's Facebook page and Instagram account: name, followers, and whether Instagram is connected to the server.",
    inputSchema: { type: "object", properties: {} } },
  { name: "facebook_daily", description: "Facebook page metrics per day (Meta Page Insights): views, engagements, page_views, follows, unfollows. Rows: {day, ...}. Range up to 90 days; default the last 28 days.",
    inputSchema: { type: "object", properties: { since: { type: "string", description: "YYYY-MM-DD" }, until: { type: "string", description: "YYYY-MM-DD, inclusive" } } } },
  { name: "instagram_daily", description: "Instagram account metrics per day (Meta Instagram Insights): reach, views, interactions, accounts_engaged, follower_gain. Rows: {day, ...}. Range up to 30 days; default the last 28 days.",
    inputSchema: { type: "object", properties: { since: { type: "string", description: "YYYY-MM-DD" }, until: { type: "string", description: "YYYY-MM-DD, inclusive" } } } },
  { name: "posts", description: "Every Facebook post and reel and every Instagram post and reel published in the range, with views, reach, likes, comments, shares, saves and interactions. Range up to 90 days; default the last 28 days.",
    inputSchema: { type: "object", properties: { since: { type: "string", description: "YYYY-MM-DD" }, until: { type: "string", description: "YYYY-MM-DD, inclusive" } } } },
  { name: "instagram_accounts", description: "Followers and post counts of other Instagram accounts (partners, neighbours, local pages, competing cafes), to decide whom to tag: the partner's followers are the cart's new audience. With recent=N, also each account's N latest posts (date, reel/photo/carousel, likes, comments, link, caption start) for a weekly competitor scan. Only business or creator accounts answer; a personal account returns an error. Up to 20 usernames.",
    inputSchema: { type: "object", properties: { usernames: { type: "array", items: { type: "string" }, description: "Instagram usernames, without @" }, recent: { type: "number", description: "0-12 latest posts per account, default 0" } }, required: ["usernames"] } },
  { name: "instagram_audio", description: "Music from Instagram's own library that the cart's account may attach to a reel through the API (licensed for third-party use, so safe for a business account). Without query: what is trending now. Each track: audio_id (put it in an auto reel row as audio: {id, volume, video_volume}), title, artist, seconds, preview (audio link that expires in about 1.5 days, for listening only, never baked into a video), link. The selection can differ from the Instagram app.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Song, artist or mood; empty = trending" }, limit: { type: "number", description: "1-50, default 20" } } } },
  { name: "google_reviews", description: "Google reviews of the cart (Google Business Profile), newest first: id, reviewer name, stars, text, date, and the owner's reply if any. Default: only reviews without a reply.",
    inputSchema: { type: "object", properties: { unanswered_only: { type: "boolean", description: "default true" }, limit: { type: "number", description: "1-50, default 30" } } } },
  { name: "google_reply", description: "Publish (or replace) the owner's public reply to one Google review. Only after the owner approved the exact text.",
    inputSchema: { type: "object", properties: { review_id: { type: "string" }, comment: { type: "string", description: "The reply text, up to 4000 characters" } }, required: ["review_id", "comment"] } },
];
const dayShift = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
function mcpRange(a, maxDays){
  const ok = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !isNaN(Date.parse(v));
  const until = ok(a.until) ? String(a.until) : ilToday();
  let since = ok(a.since) ? String(a.since) : dayShift(until, -27);
  if (since > until) throw fail("bad_request", "since is after until");
  if (since < dayShift(until, -(maxDays - 1))) since = dayShift(until, -(maxDays - 1));
  return { since, until };
}
// Meta מסמנת יום לפי end_time בסופו (חצות שעון פסיפיק), ולכן היום עצמו הוא יום אחד לפני.
const insightDay = (endTime) => new Date(Date.parse(endTime) - 864e5).toISOString().slice(0, 10);
// שאילתה עם כמה גרסאות שדות: מטא משנה ומבטלת מדדים, ומדד אחד שבוטל מפיל את כל הבקשה.
async function graphFirst(env, path, variants, base){
  const errors = [];
  for (const fields of variants){
    try { return { data: await graphPages(env, path, { ...base, fields }), fields, errors }; }
    catch (e){ errors.push(e.message); }
  }
  throw new Error(errors[errors.length - 1]);
}
// Graph returns 25–100 items a page; a 90-day range of posts can run past one page, and a page that is cut
// silently drops the oldest posts from the dashboard. Follows the cursor, at most 5 pages.
async function graphPages(env, path, params, maxPages = 5){
  const first = await graph(env, path, params, "GET");
  const all = first.data || [];
  let after = first.paging && first.paging.cursors && first.paging.next ? first.paging.cursors.after : null;
  for (let i = 1; after && i < maxPages; i++){
    const page = await graph(env, path, { ...params, after }, "GET");
    all.push(...(page.data || []));
    after = page.paging && page.paging.cursors && page.paging.next ? page.paging.cursors.after : null;
  }
  return { ...first, data: all };
}
const insightVal = (ins, name) => {
  const row = ((ins && ins.data) || []).find(m => m.name === name);
  if (!row) return null;
  const v = row.total_value ? row.total_value.value : (row.values && row.values[0] ? row.values[0].value : null);
  return typeof v === "number" ? v : (v && typeof v === "object" ? Object.values(v).reduce((s, x) => s + (Number(x) || 0), 0) : null);
};

async function mcpAccount(env){
  const out = { rows: [], notes: [] };
  const fb = await graph(env, env.FB_PAGE_ID, { fields: "name,followers_count,fan_count,link" }, "GET");
  out.rows.push({ network: "facebook", name: fb.name, followers: fb.followers_count ?? fb.fan_count ?? null, url: fb.link || "" });
  if (!env.IG_USER_ID) out.notes.push("Instagram is not connected to the server (IG_USER_ID missing). Reconnect the page in the app to link it.");
  else {
    const ig = await graph(env, env.IG_USER_ID, { fields: "username,followers_count,follows_count,media_count" }, "GET");
    out.rows.push({ network: "instagram", name: ig.username, followers: ig.followers_count ?? null, media_count: ig.media_count ?? null, url: "https://www.instagram.com/" + ig.username + "/" });
  }
  return out;
}

async function mcpFacebookDaily(env, a){
  const { since, until } = mcpRange(a, 90);
  const metrics = { views: "page_media_view", engagements: "page_post_engagements", page_views: "page_views_total",
    follows: "page_daily_follows_unique", unfollows: "page_daily_unfollows_unique" };   // page_impressions_unique בוטל במטא (נבדק 14.10.2026)
  const days = new Map();
  for (let d = since; d <= until; d = dayShift(d, 1)) days.set(d, { day: d });
  const notes = [];
  await Promise.all(Object.entries(metrics).map(async ([col, metric]) => {
    try {
      const r = await graph(env, `${env.FB_PAGE_ID}/insights`, { metric, period: "day", since, until: dayShift(until, 1) }, "GET");
      for (const v of ((r.data || [])[0] || {}).values || []){
        const row = days.get(insightDay(v.end_time));
        if (row) row[col] = typeof v.value === "number" ? v.value : null;
      }
    } catch (e){ notes.push(`${col} (${metric}): ${e.message}`); }
  }));
  return { since, until, rows: [...days.values()], notes };
}

async function mcpInstagramDaily(env, a){
  if (!env.IG_USER_ID) throw fail("not_configured", "Instagram is not connected to the server (IG_USER_ID missing).");
  const { since, until } = mcpRange(a, 30);
  const days = new Map();
  for (let d = since; d <= until; d = dayShift(d, 1)) days.set(d, { day: d });
  const notes = [];
  const series = async (col, metric) => {
    try {
      const r = await graph(env, `${env.IG_USER_ID}/insights`, { metric, period: "day", since, until: dayShift(until, 1) }, "GET");
      for (const v of ((r.data || [])[0] || {}).values || []){
        const row = days.get(insightDay(v.end_time));
        if (row) row[col] = typeof v.value === "number" ? v.value : null;
      }
    } catch (e){ notes.push(`${col} (${metric}): ${e.message}`); }
  };
  // views, interactions, accounts_engaged קיימים רק כסכום לטווח, אז שואלים כל יום לחוד (בקשה אחת ליום).
  // היום הראשון בודק איזו קבוצת מדדים מטא מקבלת, ושאר הימים משתמשים בה: ניסיון חוזר לכל יום היה עובר את תקרת ה-50.
  let metric = "views,total_interactions,accounts_engaged";
  const totals = async (d) => {
    const r = await graph(env, `${env.IG_USER_ID}/insights`, { metric, metric_type: "total_value", period: "day", since: d, until: dayShift(d, 1) }, "GET");
    const row = days.get(d);
    row.views = insightVal(r, "views");
    if (metric !== "views"){ row.interactions = insightVal(r, "total_interactions"); row.accounts_engaged = insightVal(r, "accounts_engaged"); }
  };
  const [first, ...rest] = [...days.keys()];
  try { await totals(first); }
  catch (e){
    notes.push(`interactions, accounts_engaged: ${e.message}`);
    metric = "views";
    try { await totals(first); } catch (e2){ notes.push(`views: ${e2.message}`); metric = ""; }
  }
  await Promise.all([series("reach", "reach"), series("follower_gain", "follower_count"),
    ...(metric ? rest.map(d => totals(d).catch(e => notes.push(`${d}: ${e.message}`))) : [])]);
  return { since, until, rows: [...days.values()], notes: [...new Set(notes)].slice(0, 10) };
}

// business_discovery: Meta answers for business and creator accounts only, one request per username.
async function mcpInstagramAccounts(env, a){
  if (!env.IG_USER_ID) throw fail("not_configured", "Instagram is not connected to the server (IG_USER_ID missing).");
  const names = [...new Set((a.usernames || []).map(u => String(u).replace(/^@/, "").trim()).filter(Boolean))].slice(0, 20);
  const rows = [], notes = [];
  // recent (25.10.2026): סריקת המתחרים בכל סוף שבוע. מטא לא נותנת צפיות של חשבון אחר, רק לייקים ותגובות
  const n = Math.max(0, Math.min(12, Math.floor(Number(a.recent) || 0)));
  const media = n ? `,media.limit(${n}){caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink}` : "";
  for (const u of names){
    try {
      const r = await graph(env, env.IG_USER_ID, { fields: `business_discovery.username(${u}){username,name,followers_count,media_count${media}}` }, "GET");
      const b = r.business_discovery || {};
      rows.push({ username: b.username || u, name: b.name || "", followers: b.followers_count ?? null, media: b.media_count ?? null,
        ...(n ? { recent: (b.media?.data || []).map(m => ({ at: m.timestamp, kind: m.media_product_type === "REELS" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : m.media_type === "VIDEO" ? "video" : "photo",
          likes: m.like_count ?? null, comments: m.comments_count ?? null, url: m.permalink || "", caption: String(m.caption || "").slice(0, 200) })) } : {}) });
    } catch (e){ rows.push({ username: u, name: "", followers: null, media: null }); notes.push(`${u}: ${e.message}`); }
  }
  rows.sort((x, y) => (y.followers || 0) - (x.followers || 0));
  return { rows, notes };
}

async function mcpInstagramAudio(env, a){
  if (!env.IG_USER_ID) throw fail("not_configured", "Instagram is not connected to the server.");
  const q = String(a.query || "").trim().slice(0, 100);
  const n = Math.max(1, Math.min(50, Number(a.limit) || 20));
  const r = await graph(env, "ig_audio", { audio_type: "music", user_id: env.IG_USER_ID, ...(q && { search_query: q }) }, "GET", GRAPH_AUDIO);
  const rows = (r.audio || r.data || []).slice(0, n).map(t => ({ audio_id: String(t.audio_id || t.id || ""), title: t.title || "", artist: t.display_artist || "",
    seconds: t.duration_in_ms ? Math.round(t.duration_in_ms / 1000) : null, preview: t.download_url || "", link: t.on_platform_audio_preview_link || "" }));
  return { query: q || "trending", rows };
}

async function mcpPosts(env, a){
  const { since, until } = mcpRange(a, 90);
  const from = since + "T00:00:00Z", to = dayShift(until, 1) + "T00:00:00Z";
  const inRange = (t) => { const s = new Date(Date.parse(String(t).replace(/\+0000$/, "Z"))).toISOString(); return s >= from && s < to; };
  const rows = [], notes = [];
  const base = { since, until: dayShift(until, 1), limit: "100" };

  const fbCore = "id,created_time,message,permalink_url,status_type,attachments{media_type},shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";
  try {
    const { data, fields, errors } = await graphFirst(env, `${env.FB_PAGE_ID}/published_posts`,
      // post_impressions_unique בוטל במטא; היורש של "כמה אנשים ראו" הוא post_total_media_view_unique
      [fbCore + ",insights.metric(post_media_view,post_total_media_view_unique)", fbCore + ",insights.metric(post_media_view)",
       fbCore + ",insights.metric(post_impressions_unique)", fbCore], base);
    if (!fields.includes("insights")) notes.push("facebook posts: Meta refused post insights, so views and reach are missing (" + (errors[0] || "") + ")");
    for (const p of data.data || []){
      const media = p.attachments && p.attachments.data && p.attachments.data[0] && p.attachments.data[0].media_type || "";
      const likes = p.reactions && p.reactions.summary ? p.reactions.summary.total_count : 0;
      const comments = p.comments && p.comments.summary ? p.comments.summary.total_count : 0;
      const shares = p.shares ? p.shares.count : 0;
      rows.push({ id: p.id, network: "facebook", kind: media === "album" ? "carousel" : media === "video" ? "video" : "photo",
        at: p.created_time, text: String(p.message || "").slice(0, 300), url: p.permalink_url || "",
        views: insightVal(p.insights, "post_media_view"), reach: insightVal(p.insights, "post_total_media_view_unique") ?? insightVal(p.insights, "post_impressions_unique"),
        likes, comments, shares, saves: null, interactions: likes + comments + shares });
    }
  } catch (e){ notes.push("facebook posts: " + e.message); }

  try {
    const r = await graphPages(env, `${env.FB_PAGE_ID}/video_reels`, { fields: "id,description,created_time,permalink_url,video_insights", limit: "50" });
    for (const v of r.data || []){
      if (!inRange(v.created_time)) continue;
      const vi = v.video_insights;
      const likes = insightVal(vi, "post_video_likes_by_reaction_type") ?? 0;
      const url = v.permalink_url ? (v.permalink_url.startsWith("http") ? v.permalink_url : "https://www.facebook.com" + v.permalink_url) : "";
      // ריל מופיע לפעמים גם בפוסטים של העמוד: מחליפים את השורה הכפולה בשורת הריל, שיש לה את מספרי הצפייה.
      // the wrapping post carries a different id but the same permalink
      const dup = rows.findIndex(x => x.network === "facebook" && (x.id.endsWith("_" + v.id) || (url && x.url === url)));
      if (dup >= 0) rows.splice(dup, 1);
      rows.push({ id: v.id, network: "facebook", kind: "reel", at: v.created_time, text: String(v.description || "").slice(0, 300), url,
        views: insightVal(vi, "blue_reels_play_count"), reach: insightVal(vi, "post_total_media_view_unique") ?? insightVal(vi, "post_impressions_unique"),
        likes, comments: null, shares: null, saves: null, interactions: likes });
    }
  } catch (e){ notes.push("facebook reels: " + e.message); }

  if (!env.IG_USER_ID) notes.push("Instagram is not connected to the server (IG_USER_ID missing).");
  else try {
    const core = "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count";
    const { data, fields } = await graphFirst(env, `${env.IG_USER_ID}/media`,
      [core + ",insights.metric(reach,views,saved,shares,total_interactions)", core + ",insights.metric(reach,saved,shares)", core], base);
    if (!fields.includes("insights")) notes.push("instagram posts: Meta refused media insights, so reach and views are missing");
    // What Meta lists against what the account holds: a gap here means media the API does not return
    // (deleted, or cross-posted from Facebook), not a dashboard bug.
    const total = (data.data || []).length;
    const ig = await graph(env, env.IG_USER_ID, { fields: "media_count" }, "GET").catch(() => ({}));
    if (typeof ig.media_count === "number" && total < ig.media_count) notes.push(`instagram posts: Meta lists ${total} media items, the account holds ${ig.media_count}; the rest are not returned by the API (deleted or cross-posted from Facebook)`);
    for (const m of data.data || []){
      if (!inRange(m.timestamp)) continue;
      const likes = m.like_count ?? 0, comments = m.comments_count ?? 0;
      const saves = insightVal(m.insights, "saved"), shares = insightVal(m.insights, "shares");
      rows.push({ id: m.id, network: "instagram",
        kind: m.media_product_type === "REELS" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : m.media_type === "VIDEO" ? "video" : "photo",
        at: m.timestamp, text: String(m.caption || "").slice(0, 300), url: m.permalink || "",
        views: insightVal(m.insights, "views"), reach: insightVal(m.insights, "reach"), likes, comments, shares, saves,
        interactions: insightVal(m.insights, "total_interactions") ?? likes + comments + (saves || 0) + (shares || 0) });
    }
  } catch (e){ notes.push("instagram posts: " + e.message); }

  const iso = (t) => new Date(Date.parse(String(t).replace(/\+0000$/, "Z"))).toISOString();
  rows.forEach(r => { r.at = iso(r.at); });
  rows.sort((x, y) => (y.at < x.at ? -1 : 1));
  return { since, until, rows, notes };
}

async function mcp(env, request, key){
  const h = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)))].map(b => b.toString(16).padStart(2, "0")).join("");
  if (!sameStr(h, MCP_KEY_SHA256)) return new Response("not found", { status: 404 });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  const msg = await request.json().catch(() => null);
  const reply = (body) => new Response(JSON.stringify({ jsonrpc: "2.0", ...body }), { headers: { "content-type": "application/json" } });
  if (!msg || Array.isArray(msg) || typeof msg.method !== "string") return reply({ id: null, error: { code: -32600, message: "Invalid request" } });
  if (msg.id === undefined || msg.id === null) return new Response(null, { status: 202 });   // התראה, בלי תשובה
  const { id, method, params = {} } = msg;
  if (method === "initialize") return reply({ id, result: {
    protocolVersion: params.protocolVersion || "2025-06-18", capabilities: { tools: {} },
    serverInfo: { name: "cortado-meta", version: "1.0.0" },
    instructions: "Facebook and Instagram data for Cafe Cortado (Kibbutz Snir), read-only from Meta's Graph API, plus its Google reviews: read them and publish owner-approved replies." } });
  if (method === "ping") return reply({ id, result: {} });
  if (method === "tools/list") return reply({ id, result: { tools: MCP_TOOLS } });
  if (method !== "tools/call") return reply({ id, error: { code: -32601, message: "Method not found: " + method } });
  const a = params.arguments || {};
  // גוגל לא צריכה את טוקן הפייסבוק. הפונקציות מוגדרות בחלק של גוגל, ונקראות רק כשבוחרים בהן.
  const google = { google_reviews: () => gbReviews(env, { unansweredOnly: a.unanswered_only !== false, limit: a.limit }),
    google_reply: () => gbReply(env, { reviewId: a.review_id, comment: a.comment }) }[params.name];
  const run = { account: mcpAccount, facebook_daily: mcpFacebookDaily, instagram_daily: mcpInstagramDaily, posts: mcpPosts, instagram_accounts: mcpInstagramAccounts, instagram_audio: mcpInstagramAudio }[params.name];
  if (!run && !google) return reply({ id, error: { code: -32602, message: "Unknown tool: " + params.name } });
  try {
    if (google){ const out = await google(); return reply({ id, result: { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out } }); }
    const m = await withMeta(env);
    if (!m.FB_PAGE_TOKEN || !m.FB_PAGE_ID) throw fail("not_configured", "The Facebook page is not connected to the server.");
    const out = await run(m, params.arguments || {});
    return reply({ id, result: { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out } });
  } catch (e){
    return reply({ id, result: { isError: true, content: [{ type: "text", text: e.message || String(e) }] } });
  }
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
  if (v instanceof Date) return { timestampValue: v.toISOString() };
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
  if (!r.ok){ console.error("firestore", r.status, (await r.text()).slice(0, 500)); throw fail("firestore", `העדכון ב-Firestore נכשל (${r.status}).`, 502); }
  return true;
}
// גוף שגיאה של Firestore (נתיב הפרויקט, חשבון השירות) הולך ללוג בלבד: הוא היה חוזר למבקש ונרשם על מסמך שבוע ציבורי
async function fsGet(env, path){
  const tok = await saToken(env);
  const r = await fetch(`${fsBase(env)}/${path}`, { headers: { authorization: "Bearer " + tok } });
  if (r.status === 404) return null;
  if (!r.ok){ console.error("firestore", r.status, (await r.text()).slice(0, 500)); throw fail("firestore", `הקריאה מ-Firestore נכשלה (${r.status}).`, 502); }
  const d = await r.json();
  return Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)]));
}
async function fsList(env, col){
  const tok = await saToken(env);
  const r = await fetch(`${fsBase(env)}/${col}?pageSize=300`, { headers: { authorization: "Bearer " + tok } });
  if (!r.ok){ console.error("firestore", r.status, (await r.text()).slice(0, 500)); throw fail("firestore", `הקריאה מ-Firestore נכשלה (${r.status}).`, 502); }
  return ((await r.json()).documents || []).map(d => ({ _id: String(d.name || "").split("/").pop(),
    ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)])) }));
}
async function fsQuery(env, colName, wheres){
  const tok = await saToken(env);
  const filters = wheres.map(([field, op, value]) => ({ fieldFilter: { field: { fieldPath: field }, op, value: toFs(value) } }));
  const where = filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };
  const r = await fetch(`${fsBase(env)}:runQuery`, { method: "POST",
    headers: { authorization: "Bearer " + tok, "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: colName }], where, limit: 50 } }) });
  if (!r.ok){ console.error("firestore", r.status, (await r.text()).slice(0, 500)); throw fail("firestore", `השאילתה ב-Firestore נכשלה (${r.status}).`, 502); }
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

   מוכן, אבל דורש אישור ידני מגוגל ל-Business Profile API. עד שיאושר
   setGoogleHours מחזיר not_configured, והבוט שולח לבעלים טקסט להדבקה ידנית.

   ביום שהאישור מגיע (הקוטה עולה מ-0 ל-300 QPM), צריך להגדיר ב-Cloudflare:
     GB_LOCATION     — locations/12345678901234567890
     GB_CLIENT_ID    — מ-OAuth client ב-Cloud Console
     GB_CLIENT_SECRET
     GB_REFRESH_TOKEN — נוצר פעם אחת בהסכמת הבעלים, לא פג
   ואז כל פרסום מריץ בדיקה בלי כתיבה ("גוגל מציג עכשיו X, אחרי הפרסום Y").
   רק אחרי שהבעלים ראה שהבדיקה נכונה: GB_LIVE=1, ומאז גוגל מתעדכן לבד. */
const GB_API = "https://mybusinessbusinessinformation.googleapis.com/v1";

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

/* גוגל מקבל שעות לפי תאריך (specialHours) לכל יום שפורסם, מהיום ועד 14 יום קדימה. השעות הקבועות (regularHours)
   לא משתנות: שינוי של שבוע אחד לא הופך לשעות של כל השבועות. שעות מיוחדות של תאריכים אחרים (חג שהבעלים הגדיר
   בגוגל, יום שעוד לא פורסם) נשארות כמו שהן.
   בלי GB_LIVE=1 זו בדיקה בלי כתיבה: מחזיר מה גוגל מציג עכשיו ומה היה נכתב. */
const GB_WINDOW = 14;
function googleDates(weeks, today){
  const out = [];
  for (let i = 0; i < GB_WINDOW; i++){
    const date = plusDays(today, i), line = weeks?.[sundayOfYmd(date)]?.[new Date(date + "T12:00:00Z").getUTCDay()];
    if (line == null) continue;
    out.push({ date, ranges: String(line).split(",").map(x => x.trim()).filter(Boolean).map(r => r.split("–").map(x => x.trim())) });
  }
  return out;
}
const gbDate = (ymd) => ({ year: +ymd.slice(0, 4), month: +ymd.slice(5, 7), day: +ymd.slice(8, 10) });
const gbYmd = (d) => `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
const gbHm = (t) => `${String(t?.hours || 0).padStart(2, "0")}:${String(t?.minutes || 0).padStart(2, "0")}`;
function specialPeriods(days){
  return days.flatMap(({ date, ranges }) => ranges.length
    ? ranges.slice(0, 2).map(([o, c]) => ({ startDate: gbDate(date), endDate: gbDate(date), openTime: gbTime(o), closeTime: gbTime(c) }))
    : [{ startDate: gbDate(date), endDate: gbDate(date), closed: true }]);
}
// תאריך → "09:00–12:00, 17:00–19:00" או "סגור", כדי להשוות ולהציג
function byDate(periods){
  const m = {};
  for (const p of periods || []){
    const d = gbYmd(p.startDate);
    m[d] = p.closed ? "סגור" : [m[d] === "סגור" ? "" : m[d], `${gbHm(p.openTime)}–${gbHm(p.closeTime)}`].filter(Boolean).sort().join(", ");
  }
  return m;
}
async function setGoogleHours(env, { weeks, today }){
  for (const k of ["GB_LOCATION","GB_CLIENT_ID","GB_CLIENT_SECRET","GB_REFRESH_TOKEN"])
    if (!env[k]) throw fail("not_configured",
      "גוגל עוד לא מחוברת. ה-API של Business Profile דורש אישור מגוגל, ואחריו ארבעה משתנים בשרת.", 501);
  const days = googleDates(weeks, today);
  if (!days.length) throw fail("bad_request", "אין אף יום שפורסם לעדכן.");
  const token = await gbAccessToken(env), auth = { authorization: "Bearer " + token };
  const read = async () => {
    const r = await fetch(`${GB_API}/${env.GB_LOCATION}?readMask=specialHours`, { headers: auth });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw fail("google_error", d.error?.message || "לא הצלחתי לקרוא את השעות מגוגל.", 502);
    return d.specialHours?.specialHourPeriods || [];
  };
  const mine = new Set(days.map(x => x.date)), periods = specialPeriods(days);
  const before = await read();
  const keep = before.filter(p => { const d = gbYmd(p.startDate); return d >= today && !mine.has(d); });
  const want = byDate(periods), now = byDate(before);
  const diff = days.map(x => x.date).filter(d => (now[d] || "לפי השעות הקבועות") !== want[d])
    .map(d => `${d.slice(8)}.${+d.slice(5, 7)}: עכשיו ${now[d] || "לפי השעות הקבועות"} → ${want[d]}`);
  if (env.GB_LIVE !== "1") return { dry: true, text: diff.length ? diff.join("\n") : "גוגל כבר מציג את השעות האלה" };
  const r = await fetch(`${GB_API}/${env.GB_LOCATION}?updateMask=specialHours`, {
    method: "PATCH", headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ specialHours: { specialHourPeriods: [...periods, ...keep] } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw fail("google_error", d.error?.message || "גוגל דחתה את העדכון.", 502);
  let check;
  try { const got = byDate(await read()); const bad = [...mine].filter(x => got[x] !== want[x]); check = bad.length ? `גוגל מציג שעות אחרות ב-${bad.join(", ")}` : "ok"; }
  catch (e){ check = "לא הצלחתי לקרוא חזרה מגוגל: " + hebrew(e.message); }
  return { ok: true, days: days.length, check };
}

/* ===== ביקורות בגוגל + חיבור חד-פעמי (17.10.2026) =====
   ה-API אושר ב-12.10.2026. במקום ארבעה סודות שמעתיקים ביד ל-Cloudflare:
   /google/connect — הבעלים מדביקים פעם אחת client ID ו-secret של OAuth client מה-Cloud Console
   (או שהם כבר בלוח), מאשרים בגוגל, והשרת שומר ב-Firestore (secrets/google) את ה-refresh token,
   החשבון והמיקום. נשמר רק אם מי שאישר בגוגל הוא אחד המייסדים, כך שזר לא יכול להחליף את החיבור.
   החיבור מ-/google/connect מנצח את הלוח של Cloudflare: הוא חדש יותר, ואישר אותו מייסד בגוגל.
   (19.10.2026: refresh token ישן בלוח התערבב עם client חדש מהחיבור, וגוגל דחתה את ההתחברות.) */
const GB_KEYS = ["GB_CLIENT_ID", "GB_CLIENT_SECRET", "GB_REFRESH_TOKEN", "GB_ACCOUNT", "GB_LOCATION"];
const GB_REDIRECT = "https://cortado-api.cortado-snir.workers.dev/google/callback";
const GB_SCOPE = "openid email https://www.googleapis.com/auth/business.manage";
async function gbEnv(env){
  if (!env.FIREBASE_SA) return env;
  let d = null;
  try { d = await fsGet(env, "secrets/google"); } catch {}
  if (!d?.GB_REFRESH_TOKEN) return env;
  const out = { ...env };
  for (const k of GB_KEYS) if (d[k]) out[k] = String(d[k]);
  return out;
}
const gbPage = (title, body, status = 200) => new Response(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<body style="font:17px system-ui;max-width:520px;margin:32px auto;padding:0 16px;line-height:1.5"><h2>${title}</h2>${body}</body></html>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
const gbEsc = (s) => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function googleConnect(env, request){
  if (!env.FIREBASE_SA) return gbPage("חסר FIREBASE_SA", "השרת לא יכול לשמור את החיבור.", 500);
  let id = env.GB_CLIENT_ID, secret = env.GB_CLIENT_SECRET;
  if (request.method === "POST"){
    const f = await request.formData().catch(() => null);
    id = String(f?.get("id") || "").trim(); secret = String(f?.get("secret") || "").trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id) || secret.length < 10)
      return gbPage("משהו לא תקין", "ה-Client ID צריך להסתיים ב-apps.googleusercontent.com. <a href='/google/connect'>לנסות שוב</a>", 400);
  }
  if (!id || !secret) return gbPage("חיבור גוגל לעגלה",
    `<p>מדביקים כאן פעם אחת את שני הערכים של ה-OAuth client מ-Google Cloud Console, ואז מאשרים בגוגל עם cortado.snir@gmail.com.</p>
     <form method="post"><p><label>Client ID<br><input name="id" style="width:100%;font-size:16px" autocomplete="off"></label></p>
     <p><label>Client secret<br><input name="secret" style="width:100%;font-size:16px" autocomplete="off"></label></p>
     <p><button style="font-size:17px;padding:8px 20px">המשך לגוגל</button></p></form>
     <p style="color:#666">Redirect URI שצריך להיות מוגדר ב-client:<br><code>${GB_REDIRECT}</code></p>`);
  const state = b64url(crypto.getRandomValues(new Uint8Array(18)));
  // הסוד ממתין כאן עד שהבעלים מאשרים בגוגל. רק אז הוא עובר ל-secrets/google.
  await fsPatch(env, "secrets/google_pending", { state, id, secret, at: new Date().toISOString() });
  const q = new URLSearchParams({ client_id: id, redirect_uri: GB_REDIRECT, response_type: "code", scope: GB_SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, login_hint: DEFAULT_OWNERS[0] });
  return Response.redirect("https://accounts.google.com/o/oauth2/v2/auth?" + q, 302);
}

// accounts → המיקום של העגלה. בדרך כלל יש אחד; כמה — זה שבשם שלו "קורטדו".
async function gbFindLocation(token){
  const auth = { authorization: "Bearer " + token };
  const a = await (await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: auth })).json().catch(() => ({}));
  if (!a.accounts?.length) throw fail("google_error", a.error?.message || "לא נמצא חשבון עסקי בגוגל.", 502);
  const found = [];
  for (const acc of a.accounts){
    const l = await (await fetch(`${GB_API}/${acc.name}/locations?readMask=name,title&pageSize=100`, { headers: auth })).json().catch(() => ({}));
    for (const loc of l.locations || []) found.push({ account: acc.name, location: loc.name, title: loc.title || "" });
  }
  if (!found.length) throw fail("google_error", "לא נמצא אף עסק בחשבון הזה.", 502);
  return found.find(x => /קורטדו|cortado/i.test(x.title)) || found[0];
}

async function googleCallback(env, url){
  const p = await fsGet(env, "secrets/google_pending").catch(() => null);
  if (url.searchParams.get("error")) return gbPage("בוטל", "גוגל לא אישרה: " + gbEsc(url.searchParams.get("error")), 400);
  if (!p || !p.state || !sameStr(String(url.searchParams.get("state") || ""), String(p.state)))
    return gbPage("הקישור פג", "<a href='/google/connect'>להתחיל מחדש</a>", 400);
  const t = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: url.searchParams.get("code") || "", client_id: p.id, client_secret: p.secret,
      redirect_uri: GB_REDIRECT, grant_type: "authorization_code" }) })).json().catch(() => ({}));
  if (!t.refresh_token || !t.id_token) return gbPage("גוגל לא החזירה טוקן", gbEsc(t.error_description || t.error || "") + " <a href='/google/connect'>לנסות שוב</a>", 502);
  // ה-id_token הגיע ישירות מגוגל ב-TLS, אין צורך לאמת חתימה כדי לקרוא ממנו את המייל.
  const seg = t.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const who = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(seg + "===".slice((seg.length + 3) % 4)), c => c.charCodeAt(0))));
  if (!who.email_verified || !ownersOf(env).includes(String(who.email).toLowerCase()))
    return gbPage("החשבון הזה לא מורשה", `אישרת עם ${gbEsc(who.email)}. צריך להתחבר עם ${DEFAULT_OWNERS[0]}.`, 403);
  let where;
  try { where = await gbFindLocation(t.access_token); }
  catch (e){ return gbPage("ההתחברות עברה, אבל העסק לא נמצא", gbEsc(e.message) + "<br>בדרך כלל: צריך להפעיל ב-Cloud Console את My Business Account Management API ו-My Business Business Information API.", 502); }
  await fsPatch(env, "secrets/google", { GB_CLIENT_ID: p.id, GB_CLIENT_SECRET: p.secret, GB_REFRESH_TOKEN: t.refresh_token,
    GB_ACCOUNT: where.account, GB_LOCATION: where.location, title: where.title, by: who.email, at: new Date().toISOString() });
  await fsPatch(env, "secrets/google_pending", { state: "", id: "", secret: "" });
  gbToken = { value: "", exp: 0 };
  return gbPage("גוגל מחוברת ✓", `העסק: <b>${gbEsc(where.title)}</b>. אפשר לסגור את הדף.`);
}

/* ביקורות: ה-API היחיד לביקורות הוא עדיין v4. כוכבים מגיעים כמילה (FIVE). */
const GB_V4 = "https://mybusiness.googleapis.com/v4";
const GB_STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
async function gbReady(env){
  const g = await gbEnv(env);
  for (const k of ["GB_CLIENT_ID", "GB_CLIENT_SECRET", "GB_REFRESH_TOKEN", "GB_ACCOUNT", "GB_LOCATION"])
    if (!g[k]) throw fail("not_configured", "Google is not connected yet. The owner opens https://cortado-api.cortado-snir.workers.dev/google/connect once.");
  return g;
}
async function gbReviews(env, { unansweredOnly = true, limit = 30 } = {}){
  const g = await gbReady(env), token = await gbAccessToken(g);
  const r = await fetch(`${GB_V4}/${g.GB_ACCOUNT}/${g.GB_LOCATION}/reviews?pageSize=50&orderBy=${encodeURIComponent("updateTime desc")}`,
    { headers: { authorization: "Bearer " + token } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw fail("google_error", "Google: " + (d.error?.message || r.status), 502);
  const rows = (d.reviews || []).map(x => ({ id: x.reviewId, name: x.reviewer?.displayName || "", stars: GB_STARS[x.starRating] || null,
    text: x.comment || "", at: x.createTime, reply: x.reviewReply?.comment || null }))
    .filter(x => !unansweredOnly || !x.reply).slice(0, Math.max(1, Math.min(50, Number(limit) || 30)));
  return { rating: d.averageRating ?? null, total: d.totalReviewCount ?? null, rows };
}
async function gbReply(env, { reviewId, comment }){
  const id = String(reviewId || ""), text = String(comment || "").trim();
  if (!/^[\w-]{6,200}$/.test(id)) throw fail("bad_request", "review_id is missing or invalid");
  if (!text || text.length > 4000) throw fail("bad_request", "comment must be 1-4000 characters");
  const g = await gbReady(env), token = await gbAccessToken(g);
  const r = await fetch(`${GB_V4}/${g.GB_ACCOUNT}/${g.GB_LOCATION}/reviews/${id}/reply`, { method: "PUT",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ comment: text }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw fail("google_error", "Google: " + (d.error?.message || r.status), 502);
  return { ok: true, review_id: id, reply: d.comment || text };
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

/* ===== שעות מהבוט (בוט קורטדו, עוזר הוואטסאפ של הבעלים) =====
   הבעלים שולח לבוט את לו"ז השבוע ומאשר ב"כן"; הבוט שולח לכאן שעות לשבעה ימים.
   זה הכותב היחיד של שעות הפתיחה: השעות נכתבות כ-hoursOverride על מסמך השבוע,
   מתפרסמות ל-public/hours (דף העגלה), לפייסבוק ולגוגל, ו-sync נרשם עם מה שיצא.
   דף העגלה (cafe/cafe.js) והאפייה (.github/scripts/bake-hours.mjs) קוראים את
   public/hours בצורה הזו; tests/hours.mjs נופל אם הם נפרדים. */
const BOT_DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const FB_DAY = ["sun","mon","tue","wed","thu","fri","sat"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const plusDays = (ymd, n) => { const x = new Date(ymd + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const sundayOfYmd = (ymd) => plusDays(ymd, -new Date(ymd + "T12:00:00Z").getUTCDay());
const dmOf = (ymd) => `${+ymd.slice(8)}.${+ymd.slice(5, 7)}`;
const botHoursText = (week, days) => `☕ שעות העגלה · ${dmOf(week)}–${dmOf(plusDays(week, 6))}\n\n` +
  days.map((x, i) => `${BOT_DAYS[i]}: ${x.length ? x.join(", ") : "סגור"}`).join("\n") +
  `\n\nקפה קורטדו · קיבוץ שניר`;
// השוואה בזמן קבוע, כדי שאי אפשר יהיה לנחש את המפתח תו אחרי תו.
function sameStr(a, b){
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/* בודק את הבקשה ומחזיר אותה בשלושת הפורמטים שצריך. בלי רשת, ולכן נבדק.
   b = { week: "2026-10-04" (יום ראשון), days: 7 ימים, כל אחד [["16:30","19:00"], ...] } */
function botPlan(b, today){
  const cur = sundayOfYmd(today), week = String((b && b.week) || "");
  if (week !== cur && week !== plusDays(cur, 7))
    throw fail("bad_request", "אפשר לעדכן רק את השבוע הנוכחי או את השבוע הבא.");
  if (!Array.isArray(b.days) || b.days.length !== 7) throw fail("bad_request", "צריך שעות לשבעה ימים.");
  const pairs = b.days.map((list) => {
    if (!Array.isArray(list) || list.length > 2) throw fail("bad_request", "יותר משני טווחי שעות ביום אחד. פייסבוק וגוגל מחזיקים רק שניים.");
    let last = "";
    return list.map((r) => {
      const [a, z] = Array.isArray(r) ? r : [];
      // HH:MM עם אפס מוביל, ולכן השוואת מחרוזות היא השוואת שעות.
      if (!HHMM.test(a) || !HHMM.test(z) || z <= a || a < last) throw fail("bad_request", "טווח שעות לא תקין.");
      last = z;
      return [a, z];
    });
  });
  const days = pairs.map(list => list.map(([a, z]) => `${a}–${z}`));
  return {
    week, cur, pairs, days,
    sig: JSON.stringify(days),
    override: Object.fromEntries(days.map((r, i) => [String(i), r.length ? { ranges: r } : { closed: true }])),
    doc: { week: "w" + week, from: week, to: plusDays(week, 6),
      range: `${dmOf(week)} – ${dmOf(plusDays(week, 6))}`,
      days: days.map(x => x.join(", ")), text: botHoursText(week, days) },
  };
}
// הסידור מהבוט, אחרי ניקוי: עד 40 משמרות, שעה תקינה, עד 12 שמות קצרים.
function botShiftsOf(list){
  return list.slice(0, 40).map(s => ({
    day: Number(s && s.day), start: String(s && s.start || ""), end: String(s && s.end || ""),
    people: (Array.isArray(s && s.people) ? s.people : []).map(x => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 12),
    note: String(s && s.note || "").slice(0, 60), open: !(s && s.open === false),
  })).filter(s => Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 && HHMM.test(s.start) && HHMM.test(s.end) && s.end > s.start);
}
// הבוט מזדהה במפתח משותף. בלי מפתח בשרת: סגור, גם למפתח ריק.
function botAuth(env, request){
  if (!env.BOT_KEY) throw fail("not_configured", "חסר BOT_KEY בשרת.", 501);
  if (!sameStr(request.headers.get("x-bot-key") || "", String(env.BOT_KEY)))
    throw fail("forbidden", "מפתח הבוט לא תקין.", 403);
  if (request.method !== "POST") throw fail("bad_request", "הנתיב הזה מקבל רק POST.", 405);
  if (!env.FIREBASE_SA) throw fail("not_configured", "חסר FIREBASE_SA בשרת, ובלעדיו אי אפשר לכתוב שעות.", 501);
}
const ilToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());

/* ===== חלון מתגלגל: שבעת הימים הקרובים, כל יום מהשבוע שלו =====
   פייסבוק וגוגל מחזיקים סט שעות שבועי אחד, בלי תאריכים. כשפרסמו בחמישי את השבוע הבא
   והחליפו את כל הסט, חמישי–שבת של השבוע הנוכחי הוצגו עם השעות של השבוע הבא.
   כאן כל יום בשבוע מקבל את השעות של המופע הקרוב שלו (היום כלול), והסט מחושב מחדש
   בכל פרסום ובכל לילה (הבוט קורא ל-/hours/refresh אחרי חצות).
   יום ששבוע שלו עוד לא פורסם: אותו יום מהשבוע הנוכחי, כמו שהיה עד עכשיו, ונרשם ב-unknown
   כדי שהבעלים יידע. השבוע הנוכחי לא פורסם בכלל: לא נוגעים בפייסבוק. */
function rollingWeek(weeks, today){
  const cur = sundayOfYmd(today), dow0 = new Date(today + "T12:00:00Z").getUTCDay();
  const pairs = [], dates = [], unknown = [];
  for (let i = 0; i < 7; i++){
    const date = plusDays(today, i), d = (dow0 + i) % 7;
    let line = weeks?.[sundayOfYmd(date)]?.[d];
    if (line == null){ unknown.push(d); line = weeks?.[cur]?.[d]; }
    dates[d] = date;
    pairs[d] = line == null ? null : String(line).split(",").map(x => x.trim()).filter(Boolean).map(r => r.split("–").map(x => x.trim()));
  }
  return { pairs, dates, unknown, complete: pairs.every(Boolean), today, dow0 };
}
function rollingText(r){
  const lines = [];
  for (let i = 0; i < 7; i++){
    const d = (r.dow0 + i) % 7, list = r.pairs[d] || [];
    lines.push(`${BOT_DAYS[d]} ${dmOf(r.dates[d])}: ${list.length ? list.map(x => x.join("–")).join(", ") : "סגור"}${r.unknown.includes(d) ? " (השבוע הזה עוד לא פורסם)" : ""}`);
  }
  return `☕ שעות העגלה · 7 הימים הקרובים\n\n${lines.join("\n")}\n\nקפה קורטדו · קיבוץ שניר`;
}
// מה שפייסבוק מציג אחרי העדכון, מול מה שנשלח. קריאה חוזרת, לא הנחה.
async function checkFacebookHours(env, sent){
  const got = (await graph(env, env.FB_PAGE_ID, { fields: "hours" }, "GET")).hours || {};
  const norm = (o) => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
  return norm(got) === norm(sent) ? "ok" : "פייסבוק מציג שעות אחרות ממה שנשלח";
}
async function publishRolling(env, weeks, today){
  const r = rollingWeek(weeks, today);
  if (!r.complete) return { facebook: "skip", google: "skip", unknown: r.unknown, text: "" };
  const out = { unknown: r.unknown, text: rollingText(r) }, hours = {};
  r.pairs.forEach((list, d) => { if (list.length) hours[FB_DAY[d]] = list; });
  const meta = await withMeta(env);
  try {
    const sent = (await setFacebookHours(meta, { hours })).hours;
    out.facebook = "ok";
    try { out.facebookCheck = await checkFacebookHours(meta, sent); }
    catch (e){ out.facebookCheck = "לא הצלחתי לקרוא חזרה מפייסבוק: " + hebrew(e.message); }
  } catch (e){ out.facebook = e.code === "not_configured" ? "עמוד הפייסבוק עוד לא מחובר." : hebrew(e.message); }
  try {
    const g = await setGoogleHours(await gbEnv(env), { weeks, today });
    if (g.dry) Object.assign(out, { google: "dry", googleDry: g.text });
    else Object.assign(out, { google: "ok", googleCheck: g.check });
  } catch (e){ out.google = e.code === "not_configured" ? "manual" : hebrew(e.message); }
  return out;
}
async function botHours(env, request){
  botAuth(env, request);
  const today = ilToday();
  const body = await request.json().catch(() => ({}));
  const p = botPlan(body, today);
  const now = new Date();
  const data = await fsGet(env, "weeks/w" + p.week);
  const out = { page: "", facebook: "", google: "" };

  // 1. דף הנחיתה. המסמך מחזיק את השבוע הנוכחי ואת הבא, כל אחד בשמו.
  let map = null;
  try {
    const cur = (await fsGet(env, "public/hours")) || {};
    const keep = plusDays(p.cur, -7);
    map = {};
    for (const [k, v] of Object.entries(cur.weeks || {}))
      if (k >= keep && Array.isArray(v) && v.length === 7) map[k] = v;
    map[p.week] = p.doc.days;
    // השדות העליונים הם של השבוע שבו אנחנו נמצאים, אם הוא כבר פורסם.
    const keepTop = p.week !== p.cur && map[p.cur] && cur.from === p.cur;
    await fsPatch(env, "public/hours", { ...(keepTop ? {} : p.doc), weeks: map, at: now });
    out.page = "ok";
    // קריאה חוזרת: מה שהדף יקרא עכשיו הוא בדיוק מה שאושר.
    try {
      const back = await fsGet(env, "public/hours");
      out.pageCheck = JSON.stringify(back?.weeks?.[p.week]) === JSON.stringify(p.doc.days) ? "ok" : "הדף שמר שעות אחרות ממה שנשלח";
    } catch (e){ out.pageCheck = "לא הצלחתי לקרוא חזרה: " + hebrew(e.message); }
  } catch (e){ out.page = hebrew(e.message); }

  // 2. פייסבוק ו-3. גוגל: חלון מתגלגל של שבעת הימים הקרובים.
  if (map) Object.assign(out, await publishRolling(env, map, today));
  else out.facebook = out.google = "skip";

  const patch = { hoursOverride: p.override, updatedAt: now, sync: { sig: p.sig, at: now, page: out.page, facebook: out.facebook, google: out.google } };
  // הסידור נקבע בוואטסאפ עם הבוט, והאפליקציה מציגה אותו. בוט ישן בלי shifts לא מוחק כלום.
  // השעות על השבוע (נקרא לכולם, דף העובד צריך אותו); השמות במסמך נפרד שרק מנהלים קוראים.
  const roster = Array.isArray(body.shifts) ? botShiftsOf(body.shifts) : null;
  if (roster) patch.botShifts = roster.map(({ people, ...s }) => s);
  if (!data) patch.phase = "availability";
  if (out.page === "ok" && !(data && data.launchedAt)) patch.launchedAt = now;
  if (out.google === "ok"){ patch.googleAt = now; patch.googleSig = p.sig; }
  // הרישום על מסמך השבוע הוא הערה, לא הפרסום עצמו. אם הוא נכשל, השעות כבר בחוץ, ואומרים את זה.
  try {
    await fsPatch(env, "weeks/w" + p.week, patch);
    // Firestore לא מקבל מערך בתוך מערך: שורה לכל משמרת, באותו סדר כמו botShifts
    if (roster) await fsPatch(env, "botpeople/w" + p.week, { people: roster.map(s => s.people.join(", ")), at: now });
  }
  catch (e){ out.record = hebrew(e.message); }
  return { ok: out.page === "ok", week: p.week, ...out, text: out.text || p.doc.text };
}
// כל לילה אחרי חצות (הבוט קורא): פייסבוק וגוגל זזים יום קדימה בחלון המתגלגל.
async function refreshHours(env, request){
  botAuth(env, request);
  const today = ilToday();
  const cur = await fsGet(env, "public/hours");
  const out = await publishRolling(env, (cur && cur.weeks) || {}, today);
  return { ok: out.facebook === "ok" || out.facebook === "skip", today, ...out };
}

// פוסט מהבוט, אחרי "כן" של הבעלים על תצוגה מדויקת. check=true רק אומר מה מחובר, כדי שהתצוגה תגיד את האמת.
// המסמך ב-posts נכתב לפני הפרסום: בלעדיו התור של אינסטגרם לא יודע מה לפרסם בזמן שנקבע.
// מסך הבית של מרכז השליטה (24.10.2026): עוקבים, נתונים יומיים, פוסטים וביקורות בקריאה אחת. כל חלק נכשל לבד, בלי להפיל את השאר.
async function botInsights(env, request){
  botAuth(env, request);
  const m = await withMeta(env), today = ilToday(), out = {};
  const run = async (k, fn) => { try { out[k] = await fn(); } catch (e){ out[k] = { error: hebrew(e.message) }; } };
  await Promise.all([
    run("account", () => mcpAccount(m)),
    run("ig", () => mcpInstagramDaily(m, { since: dayShift(today, -13), until: today })),
    run("fb", () => mcpFacebookDaily(m, { since: dayShift(today, -13), until: today })),
    run("posts", () => mcpPosts(m, { since: dayShift(today, -29), until: today })),
    run("reviews", () => gbReviews(env, { unansweredOnly: true, limit: 10 })),
  ]);
  return out;
}
async function botPost(env, request){
  botAuth(env, request);
  const b = await request.json().catch(() => ({}));
  env = await withMeta(env);
  if (b.check) return { ok: true, ...(await publishState(env)) };
  // הפוסטים שתוזמנו או יצאו בטווח תאריכים, מהבוט ומהאפליקציה: לתזכורת המשבצות, ועם stats גם המספרים ממטא
  if (b.from){
    const day = (v) => { const s = String(v || ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw fail("bad_request", "תאריך לא תקין."); return s; };
    const rows = await fsQuery(env, "posts", [["date", "GREATER_THAN_OR_EQUAL", day(b.from)], ["date", "LESS_THAN_OR_EQUAL", day(b.to || b.from)]]);
    const posts = rows.filter(r => ["scheduled", "done"].includes(r.fields.status)).map(r => ({ id: r.id, date: r.fields.date, time: r.fields.time || "",
      text: String(r.fields.text || "").slice(0, 80), fbPostId: r.fields.fbPostId || "", igPostId: r.fields.igPostId || "", igError: r.fields.igError || "" }))
      .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
    const live = posts.filter(x => x.fbPostId || x.igPostId);
    if (!b.stats || !live.length) return { ok: true, posts };
    const nums = (await postInsights(env, { posts: live.map(x => ({ id: x.id, fbPostId: x.fbPostId, igPostId: x.igPostId })) })).posts;
    return { ok: true, posts: posts.map(x => ({ ...x, ...(nums.find(n => n.id === x.id) || {}) })) };
  }
  const at = Number(b.at || 0), text = String(b.text || "").slice(0, 2200);
  const id = "b" + Date.now().toString(36);
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }).format(new Date(at || Date.now()));
  await fsPatch(env, `posts/${id}`, { text, date: local.slice(0, 10), time: local.slice(11, 16), source: "bot", status: "ready", hasMedia: !!b.image });
  try { return { ok: true, id, ...(await schedulePost(env, { postId: id, text, image: b.image || "", at, noIg: !!b.noIg, tags: b.tags })) }; }
  catch (e){ // לא יצא: המסמך לא נשאר "מוכן" באפליקציה ולא תופס משבצת
    await fsPatch(env, `posts/${id}`, { status: "cancelled", igPending: false }).catch(() => {});
    throw e;
  }
}

// הצוות לבוט: שם וטלפון של כל עובד פעיל ב-roster, בשביל קישור אישי למי שהסידור שלו השתנה.
// הטלפונים יוצאים רק במפתח של הבוט, והבוט מציג אותם רק לבעלים.
async function botTeam(env, request){
  botAuth(env, request);
  const team = (await fsList(env, "roster")).filter(x => x.active !== false && x.name)
    .map(x => ({ name: String(x.name).trim(), phone: String(x.phone || "").replace(/\D/g, "") }));
  return { ok: true, team };
}
// מה מחכה לצאת בבוט (סטורי, ריל, פרסום אוטומטי, לו"ז מתוזמן), כדי שהאפליקציה תראה את זה.
// הבוט שולח רק כשהתור משתנה. נשמר כמו שהוא, אחרי ניקוי: רשימה קצרה של מחרוזות קצרות.
async function botQueue(env, request){
  botAuth(env, request);
  const b = await request.json().catch(() => ({}));
  if (!Array.isArray(b.items) || b.items.length > 50) throw fail("bad_request", "items צריך להיות רשימה של עד 50.");
  const clip = (v, n) => String(v || "").slice(0, n);
  const items = b.items.map(x => ({ kind: clip(x && x.kind, 20), at: clip(x && x.at, 16), label: clip(x && x.label, 120) }))
    .filter(x => x.kind && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x.at));
  await fsPatch(env, "botqueue/now", { items, at: new Date() });
  return { ok: true, items: items.length };
}
// רשימת הצוות נערכת מהבוט: עובד חדש, טלפון שהשתנה, או עובד שעזב (active=false). מזוהה לפי השם.
async function botTeamSet(env, request){
  botAuth(env, request);
  const b = await request.json().catch(() => ({}));
  const name = String(b.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!name) throw fail("bad_request", "צריך שם.");
  const phone = b.phone === undefined ? undefined : String(b.phone).replace(/\D/g, "");
  if (phone !== undefined && phone && (phone.length < 9 || phone.length > 15)) throw fail("bad_request", "מספר טלפון לא תקין.");
  const found = (await fsList(env, "roster")).find(x => String(x.name || "").trim() === name);
  const id = found ? found._id : b64url(crypto.getRandomValues(new Uint8Array(15)));
  const patch = { name, at: new Date() };
  if (phone !== undefined) patch.phone = phone;
  if (typeof b.active === "boolean") patch.active = b.active; else if (!found) patch.active = true;
  await fsPatch(env, "roster/" + docId(id), patch);
  return { ok: true, created: !found, name, phone: phone ?? found?.phone ?? "", active: patch.active ?? found?.active !== false };
}

