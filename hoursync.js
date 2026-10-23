// שעות הפתיחה של השבוע הנוכחי והבא, כמו שהן על מסמך השבוע.
//
// ללקוחות (דף העגלה, פייסבוק, גוגל) השעות יוצאות רק דרך בוט קורטדו
// (/hours/bot בשרת). הבוט רושם על מסמך השבוע מה יצא (sync, launchedAt,
// googleAt), והאפליקציה רק מציגה את זה. public/hours סגור לכתיבה מהלקוח.
import { S, db, addDays, sundayOf, weekId, emit, track, waLink,
  doc, setDoc, onSnapshot, serverTimestamp } from "./core.js";
import { BOT_WA } from "./config.js";
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
    // מי באיזו משמרת, מהסידור של הבוט: שורה לכל משמרת ב-botShifts, באותו סדר. רק מנהלים קוראים.
    track(onSnapshot(doc(db, "botpeople", id), (snap) => {
      S.botPeople = { ...(S.botPeople || {}), [id]: snap.exists() ? (snap.data().people || []) : [] };
      emit("hoursync", id);
    }, () => {}));
  }
}
/** אפליקציה שנשארה פתוחה אחרי מוצאי שבת — עוברים לשבוע החדש. */
export function refresh(){ if (S.isOwner && subbed && subbed !== currentWid()) subscribe(); }

/* ===== שינוי שעות: דרך הבוט =====
   האפליקציה לא כותבת שעות. שינוי (סוגרים מוקדם, חזרה לרגיל) נפתח בצ'אט עם בוט קורטדו
   כהודעה מוכנה. הבוט מכין טיוטה, ואחרי "כן" מפרסם לדף, לפייסבוק ולגוגל, ורושם על השבוע. */
export const botLink = (text) => waLink(BOT_WA, text);
