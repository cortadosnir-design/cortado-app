// זמינות: שעת סגירה, ותזכורת רק למי שעוד לא שלח.
// לפי המחקר (docs: "מחקר: מה לשפר"): בקשה + עד שתי תזכורות בשבוע. מעבר לזה
// התוספת כמעט אפסית והעובדים מתרגלים להתעלם. האחרונה אומרת "נסגר היום ב-X".
import { S, db, doc, setDoc, DAYS, pad, dm, ymd, addDays, el, waLink, zLink, copyText, withBusy, status } from "./core.js";
import { wid, sentKeys, hasSent } from "./shifts.js";

export const MAX_SENDS = 3;   // בקשה + שתי תזכורות

export const deadline = () => {
  const s = S.week && S.week.availBy;
  const d = s ? new Date(s) : null;
  return d && !isNaN(d) ? d : null;
};
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const whenText = (d) => `${DAYS[d.getDay()]} ${dm(d)} ב-${hhmm(d)}`;
const sameDay = (a, b) => ymd(a) === ymd(b);
// ברירת מחדל: יומיים מהיום ב-20:00. רוב התגובות מגיעות תוך שעות, ו-95% תוך 3 ימים.
export const suggested = (now = new Date()) => { const d = addDays(now, 2); d.setHours(20, 0, 0, 0); return d; };
const localIso = (d) => `${ymd(d)}T${hhmm(d)}`;

export const missing = () => {
  const sent = sentKeys();
  return S.roster.filter(r => r.active !== false && !hasSent(r, sent));
};
export const sendsTo = (r) => (S.week && S.week.reminded && S.week.reminded[r.token]) || 0;

export function message(r, now = new Date()){
  const d = deadline();
  const range = `${dm(S.weekStart)}–${dm(addDays(S.weekStart, 6))}`;
  const name = String(r.name || "").trim().split(/\s+/)[0] || "";
  const link = zLink(r.token);
  if (d && sameDay(d, now) && d > now)
    return `היי ${name}, הזמינות לשבוע ${range} נסגרת היום ב-${hhmm(d)}. חצי דקה: ${link}`;
  return `היי ${name}, מתי את/ה יכול/ה לעבוד בשבוע ${range}?${d && d > now ? ` עד ${whenText(d)}.` : ""} לוקח חצי דקה: ${link}`;
}

async function saveWeekFields(patch){
  // merge על שבוע קיים. reminded נכתב שלם, כדי שלא יימחקו ספירות של אחרים בשום מימוש של merge.
  await setDoc(doc(db, "weeks", wid()), patch, { merge: true });
}
export const setDeadline = (d) => saveWeekFields({ availBy: localIso(d) });
async function countSend(r){
  const reminded = { ...((S.week && S.week.reminded) || {}), [r.token]: sendsTo(r) + 1 };
  if (S.week) S.week.reminded = reminded;           // שהכפתור יתעדכן מיד, לפני שה-snapshot חוזר
  await saveWeekFields({ reminded });
}

// הפאנל שנפתח מתוך שורת "עכשיו": מי חסר, כמה כבר קיבל, ולחיצה אחת לוואטסאפ.
export function panel(onChange){
  const box = el("div", { class: "remind" });
  const d = deadline();
  const dl = el("div", { class: "remindrow" });
  const inp = el("input", { type: "datetime-local", id: "availBy", value: localIso(d || suggested()), "aria-label": "שעת סגירה לזמינות" });
  inp.addEventListener("change", () => { const v = new Date(inp.value); if (!isNaN(v)) setDeadline(v).then(onChange).catch(() => status("mgrStatus", "bad", "לא נשמר.")); });
  dl.append(el("label", { for: "availBy", text: d ? "נסגר:" : "עוד לא נקבעה שעת סגירה:" }), inp);
  if (!d) dl.append(el("button", { type: "button", text: "קבע", onclick: (e) => withBusy(e.currentTarget, () => setDeadline(new Date(inp.value)).then(onChange)) }));
  box.append(dl);

  for (const r of missing()){
    const n = sendsTo(r);
    const row = el("div", { class: "remindrow" }, el("b", { text: r.name || "ללא שם" }),
      el("span", { class: "small", text: n ? `נשלחו ${n}` : "עוד לא נשלח" }));
    if (n >= MAX_SENDS){
      row.append(el("span", { class: "small", text: "מספיק. עדיף לדבר איתו/ה." }));
    } else {
      const label = n === 0 ? "בקשה" : n === MAX_SENDS - 1 ? "תזכורת אחרונה" : "תזכורת";
      const text = message(r);
      const wa = waLink(r.phone, text);
      if (wa) row.append(el("a", { class: "btn wa", href: wa, target: "_blank", rel: "noopener",
        text: `${label} בוואטסאפ`, "aria-label": `${label} בוואטסאפ ל${r.name || ""}`,
        onclick: () => { countSend(r).then(onChange).catch(() => {}); } }));
      else row.append(el("button", { type: "button", text: `העתק ${label}`,
        onclick: (e) => { copyText(text, e.currentTarget, `העתק ${label}`); countSend(r).then(onChange).catch(() => {}); } }));
    }
    box.append(row);
  }
  return box;
}
