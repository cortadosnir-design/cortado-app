// משמרות: זמינות → המנהל בונה את השבוע → אישור → שיבוץ עצמי → נעילה.
import { S, db, DAYS, sundayOf, $, el, clear, ymd, dm, addDays, toMin, fromMin, weekId, holidayOn,
  status, copyText, withBusy, whoOf, keyOf, track, emit, on,
  doc, getDoc, setDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp } from "./core.js";

const PHASES = {
  availability: { label: "איסוף זמינות", cls: "warn" },
  review:       { label: "ממתין לאישורך", cls: "warn" },
  open:         { label: "פתוח לשיבוץ",   cls: "ok"   },
  locked:       { label: "שבוע סגור",     cls: ""     },
};
const DEFAULT_SHIFT = { start: "06:30", end: "11:00", need: 1 };

/* ===== שעות הפתיחה הקבועות =====
   מה שכתוב בדף העסק בגוגל, לפי יום בשבוע. זה המקור היחיד לכפתור
   "מלא לפי שעות הפתיחה" — משנים כאן, וכל שבוע חדש נבנה מהשעות החדשות.
   כל יום הוא רשימת חלונות [התחלה, סיום]; רשימה ריקה = סגור.
   יום שני פתוח בשעות הבוקר הרגילות — בשבוע של יום כיפור הוא נסגר לבד,
   כי CLOSED_ON למטה מזהה את החג. */
export const WEEK_HOURS = [
  [["09:00","12:00"]],                      // ראשון
  [["09:00","12:00"]],                      // שני
  [["09:00","12:00"], ["16:00","19:00"]],   // שלישי
  [["09:30","12:30"]],                      // רביעי
  [["09:30","12:30"]],                      // חמישי
  [["09:00","12:00"]],                      // שישי
  [["16:30","19:00"]],                      // שבת
];
// חגים שבהם העגלה סגורה לגמרי. בסוכות ובשאר החגים פותחים כרגיל.
const CLOSED_ON = ["יום כיפור"];
const isClosed = (d) => { const h = holidayOn(d); return !!h && CLOSED_ON.some(n => h[1].startsWith(n)); };

/** המשמרות של השבוע המוצג לפי WEEK_HOURS, בלי הימים שהעגלה סגורה בהם. */
export function templateShifts(weekStart = S.weekStart){
  const out = [];
  for (let i = 0; i < 7; i++){
    if (isClosed(addDays(weekStart, i))) continue;
    for (const [start, end] of (WEEK_HOURS[i] || []))
      out.push({ id: newId(), day: i, start, end, need: 1 });
  }
  return out;
}
const repaired = new Set();
let loaded = false;   // האם ה-snapshot הראשון של השבוע הגיע

export const wid = () => weekId(S.weekStart);
export const phase = () => (S.week && S.week.phase) || "availability";
export const shiftsOf = () => (S.week && Array.isArray(S.week.shifts) ? [...S.week.shifts] : [])
  .sort((a,b) => a.day - b.day || toMin(a.start) - toMin(b.start));
export const openDays = () => [...new Set(shiftsOf().map(s => s.day))].sort();
const inShift = (id) => S.signups.filter(u => u.shift === id);
const myAvail = () => S.availability.find(a => a.uid === (S.me && S.me.uid));

/* ===== האזנה ===== */
let weekSubs = [];
export function resubscribe(){ subscribe(); }   // subscribe מנקה את המאזינים הישנים בעצמו
export function subscribe(){
  const id = wid();
  loaded = false;
  // בלי הניקוי הזה weekSubs גדל בכל מחזור כניסה־יציאה ואוסף סגירות מתות.
  weekSubs.forEach(u => { try { u(); } catch {} });
  weekSubs = [];
  S.week = null; S.availability = []; S.signups = [];
  render();
  weekSubs.push(track(onSnapshot(doc(db, "weeks", id),
    (snap) => {
      S.week = snap.exists() ? snap.data() : null;
      autoAdvance().catch(() => {});
      loaded = true;
      // שבוע שנוצר בגרסה ישנה ואין בו phase — משלימים בשקט, פעם אחת.
      if (S.isOwner && snap.exists() && !snap.data().phase && !repaired.has(id)){
        repaired.add(id);
        setDoc(doc(db, "weeks", id), { phase: "availability" }, { merge: true }).catch(() => {});
      }
      render(); emit("week");
    },
    () => $("conn").textContent = "אין חיבור לנתונים")));
  // autoAdvance נקראת מכל שלושת המאזינים: כשהשבוע נוחת הרשימות עוד ריקות,
  // והשער האמיתי נפתח רק כשהזמינות וההרשמות הגיעו.
  weekSubs.push(track(onSnapshot(query(collection(db, "availability"), where("week", "==", id)),
    (snap) => { S.availability = snap.docs.map(d => ({ id: d.id, ...d.data() })); autoAdvance().catch(() => {}); render(); },
    () => {})));
  weekSubs.push(track(onSnapshot(query(collection(db, "signups"), where("week", "==", id)),
    (snap) => { S.signups = snap.docs.map(d => ({ id: d.id, ...d.data() })); $("conn").textContent = ""; autoAdvance().catch(() => {}); render(); },
    () => $("conn").textContent = "אין חיבור לנתונים")));
}

async function saveWeek(patch, statusId = "mgrStatus"){
  if (!loaded){ if (statusId) status(statusId, "warn", "רגע, השבוע עוד נטען."); return; }
  try {
    // phase נכתב תמיד: בלעדיו חוקי האבטחה לא יכולים להעריך את מצב השבוע.
    await setDoc(doc(db, "weeks", wid()), { phase: phase(), ...patch, updatedAt: serverTimestamp() }, { merge: true });
    if (statusId) status(statusId, "ok", "נשמר.");
  } catch (e){
    if (statusId) status(statusId, "bad", e.code === "permission-denied" ? "רק המנהל יכול לשנות את השבוע." : "השמירה נכשלה.");
  }
}

/* ===== שלב 1: זמינות ===== */
async function saveAvailability(days, note, btn){
  const id = `${wid()}_${S.me.uid}`;
  return withBusy(btn, async () => {
    try {
      await setDoc(doc(db, "availability", id), { week: wid(), uid: S.me.uid, days, note: note || "", at: serverTimestamp() });
      status("availStatus", "ok", "הזמינות נשמרה. תודה!");
    } catch (e){
      status("availStatus", "bad", e.code === "permission-denied" ? "איסוף הזמינות סגור כרגע." : "השמירה נכשלה.");
    }
  });
}

function renderAvailabilityForm(){
  const box = clear($("availForm"));
  const mine = myAvail();
  const state = { ...(mine && mine.days || {}) };
  const note = { v: (mine && mine.note) || "" };
  const locked = phase() === "locked";

  for (let i = 0; i < 7; i++){
    const d = addDays(S.weekStart, i), h = holidayOn(d);
    const row = el("div", { class: "availrow" });
    row.append(el("div", { class: "availday" },
      el("b", { text: DAYS[i] }),
      el("span", { class: "small", text: " " + dm(d) }),
      h ? el("span", { class: "hol", text: h[1] }) : null));
    const group = el("div", { class: "seg", role: "group", "aria-label": "זמינות ב" + DAYS[i] });
    [["yes","יכול","ok"],["maybe","אולי","warn"],["no","לא","bad"]].forEach(([v,label,cls]) => {
      const b = el("button", { type: "button", class: "segbtn " + cls, text: label, "aria-pressed": String(state[i] === v), disabled: locked || undefined,
        onclick: () => { state[i] = state[i] === v ? undefined : v; renderPressed(); } });
      b.dataset.v = v; group.append(b);
    });
    row.append(group);
    box.append(row);
    const day = i;
    function renderPressed(){
      [...group.children].forEach(b => b.setAttribute("aria-pressed", String(state[day] === b.dataset.v)));
    }
  }

  const noteInput = el("input", { type: "text", placeholder: "הערה למנהל (לא חובה)", value: note.v, disabled: locked || undefined });
  box.append(el("label", { class: "block", text: "" }, el("span", { class: "small", text: "הערה" }), noteInput));
  const btn = el("button", { class: "primary", text: mine ? "עדכן זמינות" : "שלח זמינות", disabled: locked || undefined,
    onclick: () => {
      const days = {}; for (let i = 0; i < 7; i++) if (state[i]) days[i] = state[i];
      if (!Object.keys(days).length){ status("availStatus", "warn", "סמן לפחות יום אחד."); return; }
      saveAvailability(days, noteInput.value.trim(), btn);
    } });
  box.append(el("div", { class: "actions" }, btn));
  if (mine) box.append(el("p", { class: "small", text: "כבר שלחת. אפשר לעדכן בכל רגע עד שהמנהל נועל את השבוע." }));
}

/* ===== שלב 2: המנהל בונה את השבוע ===== */
/* שדה שעה משלנו, ולא <input type="time"> של הדפדפן. הסיבה: הדפדפן מצייר
   את השדה לפי שפת הממשק שלו, ובאנגלית זה שעון 12 שעות — 16:00 נראה
   "04:00", וה-AM/PM נחתך בפריסה מימין לשמאל. בעגלה זו טעות אמיתית:
   משמרת ערב שנראית כמו משמרת לילה. רשימה שלנו תמיד 24 שעות, בכל דפדפן. */
const STEP = 15;
function timeSelect(value, onpick){
  const sel = el("select", { class: "timesel", onchange: (e) => onpick(e.target.value) });
  const opts = [];
  for (let m = 5 * 60; m <= 23 * 60 + 45; m += STEP) opts.push(fromMin(m));
  if (value && !opts.includes(value)) opts.push(value);   // שעה חריגה שכבר שמורה
  opts.sort((a, b) => toMin(a) - toMin(b));
  opts.forEach(t => sel.append(el("option", { value: t, text: t, selected: t === value || undefined })));
  return sel;
}


function renderPlanner(){
  const box = clear($("planner"));
  const shifts = shiftsOf();

  for (let i = 0; i < 7; i++){
    const d = addDays(S.weekStart, i), h = holidayOn(d);
    const dayShifts = shifts.filter(s => s.day === i);
    const isOpen = dayShifts.length > 0;
    const card = el("div", { class: "planday" + (isOpen ? " on" : "") });

    const head = el("div", { class: "planhead" });
    head.append(el("label", { class: "toggle" },
      el("input", { type: "checkbox", checked: isOpen || undefined, onchange: (e) => toggleDay(i, e.target.checked) }),
      el("span", {}, el("b", { text: DAYS[i] }), el("span", { class: "small", text: " " + dm(d) }))));
    if (h) head.append(el("span", { class: "hol", text: h[1] }));
    card.append(head);

    if (isOpen){
      dayShifts.forEach((s, idx) => {
        const row = el("div", { class: "planshift" });
        const field = (label, value, patchKey) => el("label", { class: "tf" },
          el("span", { text: label }),
          timeSelect(value, (v) => editShift(s.id, { [patchKey]: v })));
        row.append(field("מתחילה", s.start, "start"));
        row.append(field("נגמרת", s.end, "end"));
        const nd = el("select", { onchange: (e) => editShift(s.id, { need: +e.target.value }) });
        [1,2,3].forEach(n => nd.append(el("option", { value: n, text: n + (n === 1 ? " איש" : " אנשים"), selected: (s.need||1) === n || undefined })));
        row.append(el("label", { class: "tf" }, el("span", { text: "כמה" }), nd));
        row.append(el("button", { class: "icon del", title: "מחק משמרת", "aria-label": "מחק משמרת", text: "✕",
          onclick: () => removeShift(s.id, s) }));
        if (dayShifts.length > 1) row.prepend(el("span", { class: "shiftnum", text: String(idx + 1) }));
        card.append(row);
      });
      card.append(el("button", { class: "link", text: "+ עוד משמרת ביום הזה", onclick: () => addShift(i) }));
    }
    box.append(card);
  }

  const slots = shifts.reduce((n,s) => n + (s.need || 1), 0);
  $("planSummary").textContent = shifts.length
    ? `${openDays().length} ימי פעילות · ${shifts.length} משמרות · ${slots} מקומות לאייש`
    : "עוד לא הגדרת ימים. סמן את הימים שהעגלה פתוחה.";
}

const newId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2,5);

function toggleDay(day, on){
  const rest = shiftsOf().filter(s => s.day !== day);
  if (on){
    const tpl = shiftsOf()[0] || DEFAULT_SHIFT;
    saveWeek({ shifts: [...rest, { id: newId(), day, start: tpl.start, end: tpl.end, need: tpl.need || 1 }] });
  } else {
    const gone = shiftsOf().filter(s => s.day === day).map(s => s.id);
    const who = S.signups.filter(u => gone.includes(u.shift)).length;
    if (who && !confirm(`לסגור את יום ${DAYS[day]}? ${who} שיבוצים יימחקו.`)){ render(); return; }
    purgeSignups(gone).then(() => saveWeek({ shifts: rest }));
  }
}
function addShift(day){
  const same = shiftsOf().filter(s => s.day === day);
  const last = same[same.length - 1] || DEFAULT_SHIFT;
  const start = last.end || "11:00";
  const end = fromMin(Math.min(23*60+59, toMin(start) + 240));
  saveWeek({ shifts: [...shiftsOf(), { id: newId(), day, start, end, need: 1 }] });
}
function editShift(id, patch){
  const next = shiftsOf().map(s => s.id === id ? { ...s, ...patch } : s);
  const s = next.find(x => x.id === id);
  if (toMin(s.end) <= toMin(s.start)){ status("mgrStatus", "warn", "שעת הסיום צריכה להיות אחרי ההתחלה."); render(); return; }
  saveWeek({ shifts: next });
}
async function removeShift(id, s){
  const who = inShift(id).length;
  const label = s ? `${DAYS[s.day]} ${s.start}–${s.end}` : "המשמרת";
  if (!confirm(who ? `למחוק את ${label}? ${who} אנשים רשומים אליה והשיבוץ שלהם יימחק.` : `למחוק את ${label}?`)) return;
  await purgeSignups([id]);
  saveWeek({ shifts: shiftsOf().filter(x => x.id !== id) });
}
async function purgeSignups(ids){
  await Promise.all(S.signups.filter(u => ids.includes(u.shift))
    .map(u => deleteDoc(doc(db, "signups", u.id)).catch(() => {})));
}

/* ===== שלב 3: מסך האישור ===== */
/* ===== מה שקורה לבד =====
   שני הצעדים שהבעלים תמיד רק אישר: לפתוח לשיבוץ כשכל הצוות ענה, ולנעול
   ביום חמישי כדי שהשעות יצאו לפני הסופ״ש. שניהם הפיכים, שניהם מדווחים,
   ושניהם לא קורים אם חסר משהו: לא נפתח בלי כיסוי, לא ננעל בלי אף שיבוץ. */
let autoTried = "";
// שים לב: הנעילה (autoTried) חייבת לקרות **אחרי** שערי הנתונים ולא לפניהם.
// autoAdvance נקראת מכל שלושת המאזינים, והראשון שנוחת (weeks) מגיע כשהרשימות
// עוד ריקות. נעילה מוקדמת הייתה שורפת את הניסיון היחיד ומשביתה את הקידום לגמרי.
async function autoAdvance(){
  if (!S.isOwner || !S.week) return;
  const id = wid();
  if (autoTried === id + phase()) return;
  const ph = phase();

  if (ph === "availability" || ph === "review"){
    const active = S.roster.filter(r => r.active !== false);
    if (!active.length || !shiftsOf().length || !S.availability.length) return;
    const sent = sentKeys();
    if (active.some(r => !hasSent(r, sent))) return;          // עוד לא כולם
    const { perDay } = coverage();
    if (openDays().some(d => perDay[d].yes + perDay[d].maybe < perDay[d].need)) return;  // אין כיסוי
    autoTried = id + ph;
    await saveWeek({ phase: "open", approvedAt: serverTimestamp(), approvedBy: S.me.uid, openedAuto: true });
    status("mgrStatus", "ok", "כל הצוות ענה ויש כיסוי — נפתח לשיבוץ לבד. אפשר להחזיר לאיסוף זמינות.");
    return;
  }

  if (ph === "open"){
    const now = new Date();
    if (now.getDay() < 4 || ymd(S.weekStart) !== ymd(sundayOf(addDays(now, now.getDay() >= 5 ? 7 : 0)))) return;
    if (!S.signups.length) return;                            // אף אחד לא נרשם — לא נועלים
    autoTried = id + ph;
    await saveWeek({ phase: "locked", lockedAt: serverTimestamp(), lockedAuto: true });
    status("mgrStatus", "ok", "יום חמישי והשיבוץ מלא — השבוע ננעל לבד. אפשר לפתוח מחדש.");
    emit("locked");
  }
}

// מסמך זמינות מגיע משני מסלולים: קוד אישי (שדה token) או כניסה עם גוגל (שדה uid).
// ספירה שמסתכלת רק על אחד מהם סותרת את עצמה — "3 מתוך 3 שלחו" לצד צ'יפ
// "עוד לא שלחו" על אותו אדם. keyOf מחזיר את מה שקיים, ומאחד את שתי הרשימות.
export const sentKeys = () => new Set(S.availability.map(keyOf).filter(Boolean));

// אותו אדם יכול להיות גם ברשימת העובדים (לפי קוד) וגם חבר צוות שנכנס עם גוגל
// (לפי uid). המייל הוא מה שמקשר ביניהם, ובלעדיו הוא נספר פעמיים.
function rosterUid(r){
  const mail = String(r && r.email || "").trim().toLowerCase();
  if (!mail) return "";
  const m = S.members.find(x => String(x.email || "").trim().toLowerCase() === mail);
  return m ? m.uid : "";
}
export const hasSent = (r, sent) => sent.has(r.token) || (!!rosterUid(r) && sent.has(rosterUid(r)));

function coverage(){
  // סופרים רק מסמכים שמשויכים למישהו — מסמך בלי token ובלי uid הוא רעש.
  const subs = S.availability.filter(a => keyOf(a)).length;
  const perDay = {};
  for (const d of openDays()){
    const yes = S.availability.filter(a => a.days && a.days[d] === "yes").length;
    const maybe = S.availability.filter(a => a.days && a.days[d] === "maybe").length;
    const need = shiftsOf().filter(s => s.day === d).reduce((n,s) => n + (s.need || 1), 0);
    perDay[d] = { yes, maybe, need };
  }
  return { subs, perDay };
}

function renderApproval(){
  const box = clear($("approval"));
  const shifts = shiftsOf();
  if (!shifts.length){ box.append(el("p", { class: "small", text: "הגדר קודם ימים ומשמרות." })); $("approveBtn").disabled = true; return; }

  const { subs, perDay } = coverage();
  const active = S.roster.filter(r => r.active !== false);
  const sent = sentKeys();
  const missing = active.filter(r => !hasSent(r, sent));
  const answered = active.length - missing.length;
  box.append(el("p", { class: "small", text: `${active.length ? answered : subs} מתוך ${active.length || subs} עובדים שלחו זמינות.` }));
  if (missing.length){
    const chips = el("div", { class: "summary" });
    missing.forEach(r => chips.append(el("span", { class: "chip warn", text: r.name || "ללא שם" })));
    box.append(el("p", { class: "small", text: "עוד לא שלחו:" }), chips);
  }

  const problems = [];
  const tbl = el("table", { class: "t" });
  tbl.append(el("thead", {}, el("tr", {},
    el("th", { text: "יום" }), el("th", { text: "צריך" }), el("th", { text: "יכולים" }), el("th", { text: "אולי" }), el("th", { text: "מצב" }))));
  const tb = el("tbody");
  for (const d of openDays()){
    const c = perDay[d];
    let cls = "ok", txt = "מכוסה";
    if (c.yes < c.need && c.yes + c.maybe < c.need){ cls = "bad"; txt = "חסר"; problems.push(`${DAYS[d]}: צריך ${c.need}, זמינים ${c.yes}`); }
    else if (c.yes < c.need){ cls = "warn"; txt = "על הקצה"; problems.push(`${DAYS[d]}: מסתמך על "אולי"`); }
    tb.append(el("tr", {}, el("td", { text: DAYS[d] }), el("td", { class: "num", text: c.need }),
      el("td", { class: "num", text: c.yes }), el("td", { class: "num", text: c.maybe }),
      el("td", {}, el("span", { class: "pill " + cls, text: txt }))));
  }
  tbl.append(tb);
  box.append(el("div", { class: "scroll" }, tbl));

  if (S.availability.some(a => a.note)){
    const notes = el("div", { class: "notes" });
    S.availability.filter(a => a.note).forEach(a => notes.append(el("p", { class: "small", text: `${whoOf(a)}: ${a.note}` })));
    box.append(el("h3", { class: "sub", text: "הערות מהצוות" }), notes);
  }
  if (problems.length) box.append(el("div", { class: "notice", text: "לב לזה — " + problems.join(" · ") }));
  $("approveBtn").disabled = false;
}

async function approve(btn){
  const { perDay } = coverage();
  const short = openDays().filter(d => perDay[d].yes + perDay[d].maybe < perDay[d].need);
  if (short.length && !confirm(`ב${short.map(d => DAYS[d]).join(", ")} אין מספיק אנשים זמינים. לפתוח לשיבוץ בכל זאת?`)) return;
  await withBusy(btn, () => saveWeek({ phase: "open", approvedAt: serverTimestamp(), approvedBy: S.me.uid }, "mgrStatus"));
}

/* ===== שלב 4: שיבוץ ===== */
async function join(s){
  if (!S.me) return;
  try {
    await setDoc(doc(db, "signups", `${wid()}_${s.id}_${S.me.uid}`), { week: wid(), shift: s.id, uid: S.me.uid, at: serverTimestamp() });
  } catch (e){
    alert(e.code === "permission-denied" ? "השיבוץ לא פתוח כרגע. רענן את הדף." : "ההרשמה לא נשמרה.");
  }
}
const leave = async (id) => { try { await deleteDoc(doc(db, "signups", id)); } catch { alert("הביטול לא נשמר."); } };

/* ===== שיבוץ ידני של המנהל =====
   לא כל אחד תופס לעצמו. יש מי שאומר את הזמינות בטלפון, ויש שבוע שצריך
   להיסגר היום. לכן כל "מקום פנוי" בלוח הוא אצל המנהל רשימת שמות: בוחרים,
   והשיבוץ נכתב בדיוק כמו שיבוץ עצמי — אותו מזהה מסמך ואותם שדות. ככה
   העובד רואה אותו בדף האישי שלו, התזכורת מוצאת את הטלפון שלו, וטבלת
   "מי עשה כמה" סופרת אותו. שיבוץ ידני הוא לא סוג שני של נתון. */

/** מי מותר לשבץ: רשימת העובדים, חברי צוות עם גוגל, ומי שכבר נמצא בשבוע. */
function assignable(){
  const out = [], seen = new Set(), mails = new Set(), names = new Set();
  const add = (c) => { out.push(c); seen.add(c.key); if (c.name) names.add(c.name); };

  for (const r of S.roster){
    if (r.active === false || !r.token) continue;
    const mail = String(r.email || "").trim().toLowerCase();
    if (mail) mails.add(mail);
    // הקוד האישי מנצח את ה-uid: הוא מה שהתזכורת מחפשת כדי להגיע לטלפון,
    // והוא מה שהעובד רואה בדף שלו גם בלי חשבון גוגל.
    add({ key: r.token, field: "token", name: r.name || "ללא שם",
      keys: [r.token, rosterUid(r)].filter(Boolean) });
  }
  for (const m of S.members){
    const mail = String(m.email || "").trim().toLowerCase();
    // אותו אדם יכול להיות גם ברשימת העובדים וגם חבר צוות עם גוגל.
    // המייל הוא מה שמקשר, ובלעדיו הוא מופיע פעמיים בשני מזהים שונים.
    if (seen.has(m.uid) || (mail && mails.has(mail))) continue;
    add({ key: m.uid, field: "uid", name: m.name || "חבר צוות", keys: [m.uid] });
  }
  // המנהל עצמו. מייסד מזוהה מרשימה קבועה בקוד ולא תמיד יש לו מסמך
  // members, ובלי השורה הזו הוא היחיד שאינו יכול לשבץ את עצמו.
  if (S.me && S.me.uid && !seen.has(S.me.uid))
    add({ key: S.me.uid, field: "uid", name: S.me.displayName || S.me.email || "אני", keys: [S.me.uid] });
  // מי שכבר בשבוע הזה — בזמינות או בשיבוץ — ואיננו באף רשימה. קורה כשעובד
  // הוסר מהרשימה אחרי שנרשם; בלעדיו אי אפשר לשבץ אותו שוב לשאר הימים.
  for (const rec of [...S.availability, ...S.signups]){
    const k = keyOf(rec);
    if (!k || seen.has(k)) continue;
    const name = whoOf(rec);
    if (names.has(name)) continue;
    add({ key: k, field: rec.token ? "token" : "uid", name, keys: [k] });
  }
  return out.sort((a,b) => a.name.localeCompare(b.name, "he"));
}

const AVAIL_RANK = { yes: 0, maybe: 1, no: 3 };
const AVAIL_MARK = { yes: "יכול", maybe: "אולי", no: "סימן שלא" };
// הזמינות של אותו אדם יכולה להגיע בקוד אישי או ב-uid — בודקים את שניהם.
const availOn = (c, day) => {
  const a = S.availability.find(x => c.keys.includes(keyOf(x)));
  return (a && a.days && a.days[day]) || "";
};
// "זה אותו אדם" — לפי המזהה, ואם אין מזהה (שם חופשי) לפי השם שמוצג.
const sameOne = (c, u) => (keyOf(u) ? c.keys.includes(keyOf(u)) : false) || whoOf(u) === c.name;

const FREE = "__free__";

function assignSlot(s, cands){
  const here = inShift(s.id);
  const free = cands.filter(c => !here.some(u => sameOne(c, u)));
  // מי שסימן "יכול" למעלה, מי שסימן "לא" למטה. זה כל מה שהמנהל מחפש כאן.
  free.sort((a,b) => (AVAIL_RANK[availOn(a, s.day)] ?? 2) - (AVAIL_RANK[availOn(b, s.day)] ?? 2)
    || a.name.localeCompare(b.name, "he"));
  const asked = S.availability.length > 0;
  const sel = el("select", { class: "slot pick", title: "הוסף מישהו למשמרת",
    "aria-label": `הוסף מישהו ל${DAYS[s.day]} ${s.start}–${s.end}` });
  sel.append(el("option", { value: "", text: "+ הוסף" }));
  free.forEach((c, i) => {
    const note = asked ? " · " + (AVAIL_MARK[availOn(c, s.day)] || "לא ענה") : "";
    sel.append(el("option", { value: String(i), text: c.name + note }));
  });
  // שם חופשי תמיד בסוף, גם כשהרשימות ריקות. מי שעוזר פעם אחת, מתנדב, או
  // עובד שעוד לא הוספת — נכנס למשמרת עכשיו, לא אחרי טיול למסך הצוות.
  sel.append(el("option", { value: FREE, text: "שם אחר…" }));
  sel.addEventListener("change", () => {
    if (sel.value === FREE){ assignFree(s); return; }
    const c = free[+sel.value];
    if (c) assign(s, c);
  });
  return sel;
}

// שם חופשי: בלי קוד אישי ובלי חשבון גוגל, השם הוא כל מה שיש — והוא גם
// המזהה במסמך, כדי שאותו שם לא ייכנס פעמיים לאותה משמרת.
function assignFree(s){
  const name = (prompt(`מי נכנס ל${DAYS[s.day]} ${s.start}–${s.end}?`) || "").trim();
  if (!name){ render(); return; }
  const key = "n" + name.replace(/[\/.\s]+/g, "-").slice(0, 40);
  assign(s, { key, field: "", name, keys: [] });
}

/* רשימת העובדים מגיעה ממאזין של ops, בדרך כלל אחרי שהלוח כבר צויר —
   ובלי השורות האלה "מקום פנוי" נשאר טקסט מת עד שמשהו אחר יגרום לציור
   מחדש. מציירים רק את הלוח (render המלא פולט "state" בעצמו וחוזר לכאן),
   ורק כשהרשימה באמת השתנתה, כדי לא לסגור בחירה שפתוחה כרגע. */
let candSig = "";
function boardFollowsRoster(){
  const sig = S.isOwner ? assignable().map(c => c.key + ":" + c.name).join("|") : "";
  if (sig === candSig) return;
  candSig = sig;
  renderBoard();
}

async function assign(s, c){
  // אותו אדם בשתי משמרות שחופפות בשעות — כמעט תמיד לחיצה בשורה הלא נכונה.
  const clash = shiftsOf().find(x => x.day === s.day && x.id !== s.id
    && toMin(x.start) < toMin(s.end) && toMin(s.start) < toMin(x.end)
    && inShift(x.id).some(u => sameOne(c, u)));
  if (clash && !confirm(`${c.name} כבר במשמרת ${clash.start}–${clash.end} באותו יום. לשבץ גם כאן?`)){ render(); return; }
  try {
    // אותו מזהה מסמך כמו בשיבוץ עצמי, ולכן שיבוץ כפול דורס את עצמו
    // במקום ליצור שתי שורות לאותו אדם באותה משמרת.
    const body = { week: wid(), shift: s.id, name: (c.name || "").slice(0, 60), at: serverTimestamp() };
    if (c.field) body[c.field] = c.key;
    await setDoc(doc(db, "signups", `${wid()}_${s.id}_${c.key}`), body);
  } catch (e){
    alert(e.code === "permission-denied" ? "רק המנהל יכול לשבץ ידנית." : "השיבוץ לא נשמר.");
    render();
  }
}

function renderBoard(){
  const box = clear($("board"));
  const shifts = shiftsOf();
  if (!shifts.length){
    box.append(el("p", { class: "empty", text: S.isOwner ? "הגדר ימים ומשמרות בלוח הניהול למטה." : "המנהל עוד לא קבע את השבוע." }));
    return;
  }
  const ph = phase(), canJoin = ph === "open";
  // המנהל משבץ ידנית בכל שלב חוץ מנעול — אותו גבול בדיוק כמו ה-✕ שמסיר משובץ.
  const canAssign = S.isOwner && ph !== "locked";
  const cands = canAssign ? assignable() : [];
  for (let i = 0; i < 7; i++){
    const dayShifts = shifts.filter(s => s.day === i);
    if (!dayShifts.length) continue;
    const d = addDays(S.weekStart, i), h = holidayOn(d);
    const col = el("div", { class: "day" });
    col.append(el("div", { class: "dayhead" }, el("b", { text: DAYS[i] }), el("span", { text: dm(d) })));
    if (h) col.append(el("div", { class: "hol", text: h[1] + (h[2] ? " · " + h[2] : "") }));
    for (const s of dayShifts){
      const people = inShift(s.id), need = s.need || 1, full = people.length >= need;
      const card = el("div", { class: "shift " + (full ? "full" : people.length ? "part" : "") });
      card.append(el("div", { class: "row" },
        el("b", { class: "mono", text: `${s.start}–${s.end}` }),
        el("span", { class: "count", text: `${people.length}/${need}` })));
      const list = el("div", { class: "people" });
      people.forEach(p => {
        const mine = S.me && p.uid === S.me.uid;
        list.append(el("div", { class: "person" },
          el("span", { class: "nm", text: whoOf(p) }),
          (mine || S.isOwner) && ph !== "locked" ? el("button", { class: "icon", title: "הסר", text: "✕", onclick: () => leave(p.id) }) : null));
      });
      for (let k = people.length; k < need; k++)
        list.append(canAssign ? assignSlot(s, cands) : el("div", { class: "slot", text: "מקום פנוי" }));
      card.append(list);
      if (canJoin && S.me){
        const mine = people.some(p => p.uid === S.me.uid);
        const av = myAvail(), marked = av && av.days && av.days[i];
        if (mine) card.append(el("button", { class: "join mine", text: "אתה משובץ — בטל", onclick: () => leave(`${wid()}_${s.id}_${S.me.uid}`) }));
        else if (full) card.append(el("button", { class: "join", text: "מלא", disabled: true }));
        else card.append(el("button", { class: "join", text: marked === "no" ? "סימנת שאינך יכול — בכל זאת" : "אני לוקח", onclick: () => join(s) }));
      }
      col.append(card);
    }
    box.append(col);
  }
}

/* ===== שעות פתיחה מחושבות ===== */
export function hoursByDay(){
  const out = [];
  for (let i = 0; i < 7; i++){
    const ss = shiftsOf().filter(s => s.day === i).sort((a,b) => toMin(a.start) - toMin(b.start));
    if (!ss.length){ out.push([]); continue; }
    const merged = [];
    for (const s of ss){
      const last = merged[merged.length - 1];
      if (last && toMin(s.start) <= toMin(last.end)) last.end = toMin(s.end) > toMin(last.end) ? s.end : last.end;
      else merged.push({ start: s.start, end: s.end });
    }
    out.push(merged.map(m => `${m.start}–${m.end}`));
  }
  return out;
}
// זוגות שעות גולמיים, בפורמט שפייסבוק וגוגל מבקשים
export function hoursPairs(){
  const out = [];
  for (let i = 0; i < 7; i++){
    const ss = shiftsOf().filter(s => s.day === i).sort((a,b) => toMin(a.start) - toMin(b.start));
    const merged = [];
    for (const s of ss){
      const last = merged[merged.length - 1];
      if (last && toMin(s.start) <= toMin(last[1])) last[1] = toMin(s.end) > toMin(last[1]) ? s.end : last[1];
      else merged.push([s.start, s.end]);
    }
    out.push(merged.slice(0, 2));
  }
  return out;
}

export const hoursText = () => {
  const h = hoursByDay();
  return `☕ שעות העגלה · ${dm(S.weekStart)}–${dm(addDays(S.weekStart, 6))}\n\n` +
    h.map((x,i) => `${DAYS[i]}: ${x.length ? x.join(", ") : "סגור"}`).join("\n") +
    `\n\nקפה קורטדו · קיבוץ שניר`;
};

/* מסמך השעות הציבורי — מקור אחד לשני הכפתורים ("שגר" ו"עדכן את דף השעות"),
   וגם הפורמט שדף הנחיתה קורא.

   days הוא שורה אחת ליום, ולא מערך של טווחים: Firestore לא מקבל מערך בתוך
   מערך, וכל כתיבה כזו נפלה כאן על "Nested arrays are not supported" עוד
   לפני שיצאה לרשת. זה היה "העדכון נכשל" שאין לו שום קשר להרשאות או לחיבור,
   והוא הופיע בכל שיגור מאז שהדף נולד. מחרוזת ריקה = סגור. */
export function hoursDoc(){
  const to = addDays(S.weekStart, 6);
  return {
    week: wid(), from: ymd(S.weekStart), to: ymd(to),
    range: `${dm(S.weekStart)} – ${dm(to)}`,
    days: hoursByDay().map(x => x.join(", ")),
    text: hoursText(),
    at: serverTimestamp(),
  };
}

async function publishHours(btn){
  return withBusy(btn, async () => {
    try {
      await setDoc(doc(db, "public", "hours"), hoursDoc());
      status("hoursStatus", "ok", "דף השעות הציבורי עודכן.");
    } catch (e){
      // הודעה שלא אומרת מה נשבר שולחת את המנהל לחפש בהרשאות ובחיבור.
      status("hoursStatus", "bad", e.code === "permission-denied"
        ? "רק המנהל יכול לעדכן את דף השעות." : "העדכון נכשל: " + String(e.message || e.code || ""));
    }
  });
}

/* ===== ציור ===== */
export function render(){
  const ph = phase(), p = PHASES[ph] || PHASES.availability;
  $("range").textContent = `${dm(S.weekStart)} – ${dm(addDays(S.weekStart, 6))}`;
  const badge = $("weekState"); badge.className = "pill " + p.cls; badge.textContent = p.label;

  const shifts = shiftsOf(), slots = shifts.reduce((n,s) => n + (s.need || 1), 0);
  const filled = S.signups.length;
  const sum = clear($("summary"));
  if (shifts.length){
    if (ph === "open" || ph === "locked")
      sum.append(el("span", { class: "chip " + (filled >= slots ? "ok" : filled ? "warn" : "bad"), text: `${filled}/${slots} מקומות מאוישים` }));
    sum.append(el("span", { class: "chip", text: `${openDays().length} ימי פעילות` }));
  }

  // מה מוצג למי
  $("availCard").hidden = S.isOwner || !(ph === "availability" || ph === "review");
  $("boardCard").hidden = !shifts.length && !S.isOwner;
  $("mgrCard").hidden = !S.isOwner;
  $("launchCard").hidden = !S.isOwner || !shifts.length;
  $("approveCard").hidden = !(S.isOwner && (ph === "availability" || ph === "review"));

  const note = clear($("notice"));
  if (!S.isOwner){
    if (ph === "availability") note.append(el("div", { class: "notice", text: "שלב הזמינות: סמן מתי אתה יכול השבוע. המנהל יבנה מזה את המשמרות." }));
    else if (ph === "review") note.append(el("div", { class: "notice", text: "המנהל בונה את השבוע. עוד רגע ייפתח לשיבוץ." }));
    else if (ph === "open") note.append(el("div", { class: "notice info", text: "השיבוץ פתוח. תפוס את המשמרות שלך." }));
    else if (ph === "locked") note.append(el("div", { class: "notice", text: "השבוע נסגר. זה השיבוץ הסופי." }));
  }

  if (!$("availCard").hidden) renderAvailabilityForm();
  renderBoard();
  if (S.isOwner){
    renderPlanner();
    if (!$("approveCard").hidden) renderApproval();
    renderHoursList();
  }
  renderPhaseButtons();
  $("p-shifts").dataset.phase = (!shifts.length && ph !== "locked") ? "setup" : ph;
  emit("state");
}

function renderHoursList(){
  const dl = clear($("hours"));
  hoursByDay().forEach((h,i) => {
    dl.append(el("dt", { text: DAYS[i] }));
    dl.append(el("dd", { class: h.length ? "" : "closed", text: h.length ? h.join(", ") : "סגור" }));
  });
}

function renderPhaseButtons(){
  const bar = clear($("phaseBar"));
  if (!S.isOwner) return;
  const ph = phase();
  const mk = (text, cls, fn, title) => el("button", { class: cls, text, title: title || "", onclick: (e) => withBusy(e.currentTarget, fn) });
  if (ph === "availability" || ph === "review"){
    bar.append(mk("שלח קישור זמינות לצוות", "", async () => copyText(location.href.split("#")[0], null, null).then(() => status("mgrStatus", "ok", "הקישור הועתק. שלח בוואטסאפ."))));
  }
  if (ph === "open"){
    bar.append(mk("נעל את השבוע והתחל קריאייטיב", "primary", async () => {
      const slots = shiftsOf().reduce((n,s) => n + (s.need||1), 0);
      if (S.signups.length < slots && !confirm(`עוד לא כל המקומות מאוישים (${S.signups.length}/${slots}). לנעול בכל זאת?`)) return;
      await saveWeek({ phase: "locked", lockedAt: serverTimestamp() });
      emit("locked");
    }));
    bar.append(mk("חזור לאיסוף זמינות", "", () => saveWeek({ phase: "availability" })));
  }
  if (ph === "locked"){
    bar.append(mk("פתח מחדש לשיבוץ", "", () => saveWeek({ phase: "open" })));
  }
}

/* ===== חיווט ===== */
export function init(){
  // רשימת העובדים היא הקלט השלישי של autoAdvance, והיא מגיעה ממאזין נפרד ב-ops.
  on("state", () => { autoAdvance().catch(() => {}); boardFollowsRoster(); });
  $("prevWeek").addEventListener("click", () => { emit("weekchange", -7); });
  $("nextWeek").addEventListener("click", () => { emit("weekchange", 7); });
  $("copyHours").addEventListener("click", (e) => copyText(hoursText(), e.currentTarget, "העתק טקסט"));
  $("pushHours").addEventListener("click", (e) => publishHours(e.currentTarget));
  $("applyAll").addEventListener("click", () => {
    const first = shiftsOf()[0];
    if (!first){ status("mgrStatus", "warn", "הגדר קודם משמרת אחת."); return; }
    const next = shiftsOf().map(s => ({ ...s, start: first.start, end: first.end, need: first.need }));
    saveWeek({ shifts: next });
  });
  $("fillTemplate").addEventListener("click", async (e) => withBusy(e.currentTarget, async () => {
    const next = templateShifts();
    if (!next.length){ status("mgrStatus", "warn", "אין שעות פתיחה מוגדרות לשבוע הזה."); return; }
    if (shiftsOf().length && !confirm("להחליף את המשמרות של השבוע בשעות הפתיחה הקבועות?")) return;
    await purgeSignups(S.signups.map(u => u.shift));
    await saveWeek({ shifts: next });
  }));
  $("copyPrevWeek").addEventListener("click", async (e) => withBusy(e.currentTarget, async () => {
    try {
      const snap = await getDoc(doc(db, "weeks", weekId(addDays(S.weekStart, -7))));
      const prev = snap.exists() && Array.isArray(snap.data().shifts) ? snap.data().shifts : [];
      if (!prev.length){ status("mgrStatus", "warn", "בשבוע שעבר לא היו משמרות."); return; }
      if (shiftsOf().length && !confirm("להחליף את המשמרות של השבוע?")) return;
      await purgeSignups(S.signups.map(u => u.shift));
      await saveWeek({ shifts: prev.map(s => ({ ...s, id: newId() })) });
    } catch { status("mgrStatus", "bad", "לא הצלחתי לקרוא את שבוע שעבר."); }
  }));
  $("approveBtn").addEventListener("click", (e) => approve(e.currentTarget));
}
