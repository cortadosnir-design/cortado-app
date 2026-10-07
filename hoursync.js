// שעות הפתיחה מתעדכנות לבד, בכל מקום, ברגע ששומרים.
//
// עד עכשיו שינוי שעה נשמר רק על מסמך השבוע. דף העגלה ופייסבוק התעדכנו
// רק כשמישהו לחץ "שגר" — ואחרי השיגור הראשון שום דבר לא אמר שהשעות
// השתנו מאז. בעל העסק משנה שעה בטלפון, והלקוח ממשיך לראות את הישנה.
//
// כאן: מאזינים לשבוע הנוכחי ולשבוע הבא (לא לשבוע שמוצג על המסך — סגירה
// מוקדמת היום חייבת להתפרסם גם כשהמנהל מסתכל על השבוע הבא). כל שינוי
// בשעות של שבוע "חי" מתפרסם לבד אחרי שנייה של שקט:
//   · השבוע הנוכחי — תמיד חי.
//   · השבוע הבא — מרגע שננעל או שוגר.
// מה שכבר פורסם נרשם על מסמך השבוע (sync.sig), ולכן אין לולאה ואין כפילות
// גם כששני מכשירים פתוחים.
import { S, db, ymd, addDays, sundayOf, weekId, fromYmd, api, WORKER_URL, emit, track,
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp } from "./core.js";
import { hoursByDayOf, hoursPairsOf, hoursDocOf } from "./shifts.js";

const FB_DAY = ["sun","mon","tue","wed","thu","fri","sat"];
const WAIT = 1200;

export const weeks = {};         // wid → נתוני השבוע (null = אין מסמך)
const busy = new Set();
const timers = {};
const lastError = {};

export const sigOf = (data) => JSON.stringify(hoursByDayOf(data));
export const curStart = () => sundayOf(new Date());
export const currentWid = () => weekId(curStart());
export const nextWid = () => weekId(addDays(curStart(), 7));
const startOf = (id) => fromYmd(id.slice(1));

/** שבוע שמתפרסם לבד כשהשעות שלו משתנות. */
export function isLive(id, data){
  if (!data) return false;
  if (id === currentWid()) return true;
  return id === nextWid() && (!!data.launchedAt || data.phase === "locked");
}
/* פייסבוק מחזיק שעות שבועיות אחת, לא לפי תאריך. לכן הוא מקבל את השבוע
   הבא מרגע שזה חי (כמו ב"שגר" של יום חמישי), ואת הנוכחי עד אז. */
const fbWid = () => isLive(nextWid(), weeks[nextWid()]) ? nextWid() : currentWid();

/** מצב הסנכרון של שבוע, בשביל המסך. */
export function stateOf(id, data = weeks[id]){
  const sync = (data && data.sync) || null;
  const dirty = !sync || sync.sig !== sigOf(data);
  return {
    live: isLive(id, data),
    pending: busy.has(id) || (isLive(id, data) && dirty && (hasHours(data) || !!sync)),
    dirty, sync,
    fbHere: id === fbWid(),
    google: googleFresh(data),
    error: lastError[id] || "",
  };
}
const hasHours = (data) => hoursByDayOf(data).some(x => x.length);

/* גוגל עוד לא מאושרת ל-API, ולכן זה הערוץ היחיד שנעשה ביד. "מעודכן" אומר:
   מה שסומן בגוגל הוא בדיוק השעות של עכשיו. סימון ישן (בלי googleSig)
   נחשב מעודכן רק אם השבוע לא השתנה אחריו. */
export function googleFresh(data){
  if (!data || !data.googleAt) return false;
  if (data.googleSig) return data.googleSig === sigOf(data);
  const g = data.googleAt.seconds || 0, u = (data.updatedAt && data.updatedAt.seconds) || 0;
  return !u || u <= g;
}
export async function markGoogle(id, data = weeks[id] || (id === weekId(S.weekStart) ? S.week : null)){
  await setDoc(doc(db, "weeks", id), { googleAt: serverTimestamp(), googleSig: sigOf(data) }, { merge: true });
}

/* ===== האזנה ===== */
let subbed = "";
export function subscribe(){
  if (!S.isOwner) return;
  const cur = currentWid(), nxt = nextWid();
  subbed = cur;
  for (const id of [cur, nxt]){
    track(onSnapshot(doc(db, "weeks", id), (snap) => {
      weeks[id] = snap.exists() ? snap.data() : null;
      emit("hoursync", id);
      schedule(id);
    }, () => {}));
  }
}
/** אפליקציה שנשארה פתוחה אחרי מוצאי שבת — עוברים לשבוע החדש. */
export function refresh(){ if (S.isOwner && subbed && subbed !== currentWid()) subscribe(); }

function schedule(id){
  const data = weeks[id];
  if (!S.isOwner || !isLive(id, data)) return;
  // שבוע ריק לגמרי לא מתפרסם (הוא היה מוחק את השעות מהדף) — אלא אם הוא
  // כבר פורסם פעם, ואז "סגור" הוא בדיוק מה שהלקוח צריך לראות.
  if (!hasHours(data) && !data.sync) return;
  if (data.sync && data.sync.sig === sigOf(data)) return;
  // פרסום באמצע: כשיסתיים הוא כותב sync, וה-snapshot שאחריו יחליט אם צריך עוד סבב.
  if (busy.has(id)) return;
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => {
    const d = weeks[id];
    // בזמן ההמתנה ייתכן שמכשיר אחר (או הסבב הקודם) כבר פרסם בדיוק את זה.
    if (!d || (d.sync && d.sync.sig === sigOf(d))) return;
    publish(id).catch(() => {});
  }, WAIT);
}

/* ===== הפרסום עצמו ===== */
/** מפרסם את השעות של שבוע: דף העגלה, פייסבוק, וגוגל כשתאושר. */
export async function publish(id, data = weeks[id]){
  if (!data || busy.has(id)) return null;
  busy.add(id); emit("hoursync", id);
  const ws = startOf(id), sig = sigOf(data);
  const out = { page: "", facebook: "", google: "" };
  try {
    // 1. דף העגלה. המסמך מחזיק את השבוע הנוכחי ואת הבא, כל אחד בשמו,
    //    כדי ששיגור של השבוע הבא ביום חמישי לא ימחק את השעות של שישי-שבת.
    try {
      let cur = {};
      try { const s = await getDoc(doc(db, "public", "hours")); cur = s.exists() ? s.data() : {}; } catch {}
      const keep = ymd(addDays(curStart(), -7));
      const map = {};
      for (const [k, v] of Object.entries(cur.weeks || {}))
        if (k >= keep && Array.isArray(v) && v.length === 7) map[k] = v;
      const mine = hoursDocOf(data, ws);
      map[ymd(ws)] = mine.days;
      // השדות העליונים (days/range) הם של השבוע שבו אנחנו נמצאים, אם ידוע.
      const todayKey = ymd(curStart());
      const top = (todayKey !== ymd(ws) && map[todayKey] && cur.from === todayKey) ? cur : mine;
      await setDoc(doc(db, "public", "hours"), { ...top, weeks: map, at: serverTimestamp() });
      out.page = "ok";
    } catch (e){
      out.page = e.code === "permission-denied" ? "שעות הפתיחה מתפרסמות עכשיו רק דרך בוט קורטדו בוואטסאפ." : "העדכון נכשל: " + String(e.message || e.code || "").slice(0, 140);
    }

    // 2. פייסבוק ו-3. גוגל — רק לשבוע ש"מחזיק" את שעות העמוד.
    if (id === fbWid() && WORKER_URL){
      const hours = {};
      hoursPairsOf(data).forEach((list, i) => { if (list.length) hours[FB_DAY[i]] = list; });
      try { await api("/hours/facebook", { hours }); out.facebook = "ok"; }
      catch (e){
        const msg = String(e.message || "");
        out.facebook = /not_configured|חסר/.test(msg) ? "עמוד הפייסבוק עוד לא מחובר." : msg.slice(0, 140);
      }
      try {
        await api("/hours/google", { hours: hoursPairsOf(data) });
        out.google = "ok";
      } catch (e){
        out.google = /not_configured|עוד לא מחוברת/.test(String(e.message || "")) ? "manual" : String(e.message || "").slice(0, 140);
      }
    } else out.facebook = out.google = "skip";

    const patch = { sync: { sig, at: serverTimestamp(), ...out } };
    if (out.page === "ok" && !data.launchedAt) patch.launchedAt = serverTimestamp();
    if (out.google === "ok"){ patch.googleAt = serverTimestamp(); patch.googleSig = sig; }
    lastError[id] = out.page === "ok" ? "" : out.page;
    // בלי sync.sig על המסמך, כל snapshot היה מפרסם שוב. גם כשפייסבוק נכשל —
    // ניסיון חוזר הוא ידני, לא לולאה.
    await setDoc(doc(db, "weeks", id), patch, { merge: true });
    return out;
  } finally {
    busy.delete(id); emit("hoursync", id);
  }
}

/* ===== חריגה ליום אחד ===== */
/** כותב (או מוחק, עם null) חריגת שעות ליום אחד. מחזיר את מה שהיה, בשביל "בטל". */
const dataOf = (id) => weeks[id] !== undefined ? weeks[id] : (id === weekId(S.weekStart) ? S.week : null);
// setDoc עם merge לא יודע למחוק מפתח בתוך מפה, ולכן המפה נכתבת כולה —
// updateDoc מחליף את השדה. מסמך שעוד לא קיים (שבוע בלי משמרות) נוצר.
async function writeOverrides(id, next, extra = {}){
  const data = dataOf(id);
  const body = { phase: (data && data.phase) || "availability", hoursOverride: next, updatedAt: serverTimestamp(), ...extra };
  if (data) await updateDoc(doc(db, "weeks", id), body);
  else await setDoc(doc(db, "weeks", id), body, { merge: true });
}
export async function setOverride(id, day, value){
  const data = dataOf(id);
  const prev = (data && data.hoursOverride && data.hoursOverride[day]) || null;
  const next = { ...((data && data.hoursOverride) || {}) };
  if (value) next[String(day)] = value; else delete next[String(day)];
  await writeOverrides(id, next);
  return prev;
}

/* ===== גוגל כמקור =====
   קוראים את השעות מהפרופיל בגוגל וכותבים אותן כשעות מיוחדות (hoursOverride) על
   השבוע הנוכחי והבא. המשמרות והשיבוצים לא זזים. מכאן הסנכרון הרגיל מפיץ לבד
   לדף הנחיתה ולפייסבוק. שעה ששונתה אחר כך באפליקציה ("היום") גוברת — העריכה
   האחרונה מנצחת. */
const valueOf = (ranges) => ranges.length ? { ranges } : { closed: true };
/** מה גוגל אומרת, מול מה שמפורסם עכשיו. לא כותב כלום. */
export async function planFromGoogle(){
  const g = await api("/hours/fromgoogle", {});
  const plan = [];
  for (const id of [currentWid(), nextWid()]){
    const ws = startOf(id), data = dataOf(id);
    const now = hoursByDayOf(data), next = {}, rows = [];
    for (let i = 0; i < 7; i++){
      const date = ymd(addDays(ws, i));
      const ranges = (g.dated && g.dated[date]) || (g.regular && g.regular[i]) || [];
      next[String(i)] = valueOf(ranges);
      if (ranges.join(", ") !== now[i].join(", ")) rows.push({ day: i, date, from: now[i], to: ranges });
    }
    const after = { ...(data || {}), hoursOverride: next };
    plan.push({ id, next, rows, sig: sigOf(after) });
  }
  return { plan, changes: plan.reduce((n, w) => n + w.rows.length, 0), text: g.text || [] };
}
/** מחיל את מה ש-planFromGoogle החזיר. הסנכרון הרגיל מפרסם אחרי שנייה. */
export async function applyFromGoogle(plan){
  for (const w of plan)
    await writeOverrides(w.id, w.next, { googleAt: serverTimestamp(), googleSig: w.sig });
}
