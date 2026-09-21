// מי עשה כמה. הנתונים האלה היו קיימים במלואם מהיום הראשון ב-signups —
// פשוט אף קוד לא קרא אותם לפי אדם. זה כל מה שהמודול הזה עושה.
//
// נטען לפי דרישה (כשנכנסים ללשונית צוות), לא במאזין חי: זו טבלה שמסתכלים
// עליה פעם בשבוע, ואין סיבה להחזיק בשבילה חיבור פתוח.
import { db, $, el, clear, ymd, addDays, fromYmd, toMin, sundayOf, weekId,
  fmt1, status, withBusy, whoOf, keyOf, getDocs, collection, query, where, documentId } from "./core.js";

const WEEKS_BACK = 8;          // שמונה שבועות. מספיק כדי לראות מגמה, קצר מספיק כדי להיות רלוונטי.

let rows = [];                 // [{ key, name, shifts, hours, reported, customers[] }]
let loadedAt = 0;

/* ===== איסוף ===== */
// מזהי השבועות שנכללים בחישוב, מהשבוע הנוכחי אחורה.
function weekIds(){
  const out = [];
  let ws = sundayOf(new Date());
  for (let i = 0; i < WEEKS_BACK; i++){ out.push(weekId(ws)); ws = addDays(ws, -7); }
  return out;
}

const dateOfSignup = (wid, day) => {
  // מזהה שבוע הוא w<YYYY-MM-DD> של יום ראשון.
  const base = fromYmd(wid.slice(1));
  return ymd(addDays(base, day));
};

export async function load(btn){
  return withBusy(btn, async () => {
    status("peopleStatus", "", "אוסף…");
    const ids = new Set(weekIds());
    let weeks = [], signups = [], logs = [];
    try {
      // החלון הוא שמונה שבועות, וקודם הוא הופעל *אחרי* הקריאה: שלוש
      // קולקציות שלמות ירדו בכל לחיצה, וגדלו בלי סוף. 'in' מוגבל ל-30
      // ערכים, ושמונה מזהי שבוע נכנסים בבקשה אחת. היומן מסונן לפי תאריך.
      const idList = [...ids];
      const since = ymd(addDays(sundayOf(new Date()), -7 * (WEEKS_BACK - 1)));
      const [wSnap, sSnap, lSnap] = await Promise.all([
        getDocs(query(collection(db, "weeks"), where(documentId(), "in", idList))),
        getDocs(query(collection(db, "signups"), where("week", "in", idList))),
        getDocs(query(collection(db, "log"), where("date", ">=", since))),
      ]);
      weeks = wSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      signups = sSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      logs = lSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e){
      status("peopleStatus", "bad", e.code === "permission-denied" ? "רק המנהל רואה את הטבלה הזו." : "הטעינה נכשלה.");
      return;
    }

    // מפת משמרות: week+shiftId → { day, start, end }
    const shiftMap = {};
    weeks.forEach(w => (Array.isArray(w.shifts) ? w.shifts : []).forEach(s => {
      shiftMap[w.id + "|" + s.id] = s;
    }));

    const by = {};
    for (const su of signups){
      const k = keyOf(su);
      if (!k) continue;
      const sh = shiftMap[su.week + "|" + su.shift];
      const r = by[k] || (by[k] = { key: k, name: whoOf(su), shifts: 0, hours: 0, reported: 0, customers: [] });
      r.shifts++;
      if (sh && sh.start && sh.end) r.hours += Math.max(0, toMin(sh.end) - toMin(sh.start)) / 60;
      if (!sh) continue;
      const date = dateOfSignup(su.week, sh.day);
      // דיווח מתאים: או לפי קוד אישי ומשמרת, או לפי חשבון גוגל ותאריך.
      const log = logs.find(l => l.date === date &&
        ((l.token && l.token === k && l.shift === su.shift) || (l.uid && l.uid === k)));
      if (log){
        r.reported++;
        if (typeof log.customers === "number") r.customers.push(log.customers);
      }
    }
    rows = Object.values(by).sort((a, b) => b.shifts - a.shifts);
    loadedAt = Date.now();
    status("peopleStatus", "ok", `${rows.length} אנשים · ${WEEKS_BACK} שבועות אחרונים`);
    render();
  });
}

/* ===== ציור ===== */
export function render(){
  const box = $("peopleTable");
  if (!box) return;
  clear(box);
  if (!rows.length){
    box.append(el("p", { class: "small", text: loadedAt ? "אין שיבוצים בשבועות האחרונים." : "לחץ 'טען' כדי לראות מי עשה כמה." }));
    return;
  }

  // ממוצע הלקוחות הכללי — הבסיס שכל אחד נמדד מולו.
  const all = rows.flatMap(r => r.customers);
  const avgAll = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;

  const table = el("table", { class: "ptable" });
  table.append(el("thead", {}, el("tr", {},
    el("th", { text: "מי" }),
    el("th", { text: "משמרות" }),
    el("th", { text: "שעות" }),
    el("th", { text: "דיווח" }),
    el("th", { text: "לקוחות" }))));
  const tb = el("tbody");
  rows.forEach(r => {
    const rate = r.shifts ? Math.round(100 * r.reported / r.shifts) : 0;
    const mine = r.customers.length ? r.customers.reduce((a, b) => a + b, 0) / r.customers.length : null;
    const diff = (mine != null && avgAll) ? Math.round(100 * (mine - avgAll) / avgAll) : null;
    tb.append(el("tr", {},
      el("td", { text: r.name }),
      el("td", { class: "num", text: String(r.shifts) }),
      el("td", { class: "num", text: fmt1(r.hours) }),
      el("td", {}, el("span", { class: "pill " + (rate >= 70 ? "ok" : rate >= 30 ? "warn" : "bad"), text: rate + "%" })),
      el("td", { class: "num", text: mine == null ? "—" :
        fmt1(mine) + (diff == null || !diff ? "" : diff > 0 ? ` (+${diff}%)` : ` (${diff}%)`) })));
  });
  table.append(tb);
  box.append(table);
  box.append(el("p", { class: "small", text:
    "'דיווח' = על כמה מהמשמרות שלו הוא מילא דיווח סוף משמרת. 'לקוחות' = ממוצע הדיווחים שלו מול הממוצע הכללי." }));
}

/* ===== חיווט ===== */
export function init(){
  const btn = $("peopleLoad");
  if (btn) btn.addEventListener("click", (e) => load(e.currentTarget));
  render();
}
