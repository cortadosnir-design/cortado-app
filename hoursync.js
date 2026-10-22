// שעות הפתיחה של השבוע הנוכחי והבא, כמו שהן על מסמך השבוע.
//
// ללקוחות (דף העגלה, פייסבוק, גוגל) השעות יוצאות רק דרך בוט קורטדו
// (/hours/bot בשרת). הבוט רושם על מסמך השבוע מה יצא (sync, launchedAt,
// googleAt), והאפליקציה רק מציגה את זה. public/hours סגור לכתיבה מהלקוח.
import { S, db, addDays, sundayOf, weekId, emit, track,
  doc, setDoc, updateDoc, onSnapshot, serverTimestamp } from "./core.js";
import { hoursByDayOf } from "./shifts.js";

export const weeks = {};         // wid → נתוני השבוע (null = אין מסמך)

export const sigOf = (data) => JSON.stringify(hoursByDayOf(data));
export const curStart = () => sundayOf(new Date());
export const currentWid = () => weekId(curStart());
export const nextWid = () => weekId(addDays(curStart(), 7));
/* "גוגל מעודכנת": הבוט פרסם לגוגל (googleAt + googleSig), או שסומן ביד. "מעודכן" אומר:
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
    }, () => {}));
  }
}
/** אפליקציה שנשארה פתוחה אחרי מוצאי שבת — עוברים לשבוע החדש. */
export function refresh(){ if (S.isOwner && subbed && subbed !== currentWid()) subscribe(); }

/* ===== חריגה ליום אחד ===== */
/** כותב (או מוחק, עם null) חריגת שעות ליום אחד, לאפליקציה ולצוות — ללקוחות זה יוצא רק דרך הבוט.
    מחזיר את מה שהיה, בשביל "בטל". */
const dataOf = (id) => weeks[id] !== undefined ? weeks[id] : (id === weekId(S.weekStart) ? S.week : null);
// setDoc עם merge לא יודע למחוק מפתח בתוך מפה, ולכן המפה נכתבת כולה —
// updateDoc מחליף את השדה. מסמך שעוד לא קיים (שבוע בלי משמרות) נוצר.
async function writeOverrides(id, next){
  const data = dataOf(id);
  const body = { phase: (data && data.phase) || "availability", hoursOverride: next, updatedAt: serverTimestamp() };
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
