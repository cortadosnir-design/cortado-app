// דף העובד. בלי התחברות, בלי חשבון, בלי אפליקציה.
// הזהות היא הקוד שב-URL. הדף משנה את עצמו לפי השלב שהשבוע נמצא בו.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";
// playbook.js הוא העוגן היחיד לחגים, והוא חסר תלויות — אפשר לייבא אותו
// כאן בלי לגרור את core.js (שמאתחל אימות ו-Firestore עם התמדה, ודף
// העובד לא צריך אותם). הרשימה שהייתה כאן כבר סטתה: חסרו בה שלושה חגים,
// והעובד ראה תגי חג אחרים מאלה שבלוח של המנהלת.
import { HOLIDAYS } from "./playbook.js";

const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];

const db = getFirestore(initializeApp(firebaseConfig));
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dm = (d) => `${d.getDate()}.${d.getMonth()+1}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const sundayOf = (d) => { const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()); s.setDate(s.getDate()-s.getDay()); return s; };
const toMin = (t) => { const [h,m] = String(t).split(":").map(Number); return h*60+(m||0); };
const holidayOn = (s) => HOLIDAYS.find(h => h[0] === s);
function el(tag, attrs = {}, ...kids){
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k != null) e.append(typeof k === "string" ? document.createTextNode(k) : k);
  return e;
}
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
const say = (kind, msg) => { const n = $("zstatus"); n.className = "status " + (kind||""); n.textContent = msg || ""; };

// הקוד מגיע מה-hash כדי שלא יישלח לשרתים בלוגים של referrer.
const token = (location.hash || "").replace(/^#/, "").trim() || new URLSearchParams(location.search).get("t") || "";

let me = null;                    // { name }
let weekStart = (() => { const t = new Date(); const s = sundayOf(t); if (t.getDay() >= 5) s.setDate(s.getDate()+7); return s; })();
let week = null, mine = null, taken = new Set();
let draft = {}, note = "", dirty = false;
let pending = [];                 // משמרות שנגמרו וטרם דווחו: [{ date, shift, wid }]
const wid = () => "w" + ymd(weekStart);
const phase = () => (week && week.phase) || "availability";
const shiftsOf = () => (week && Array.isArray(week.shifts) ? [...week.shifts] : []).sort((a,b) => a.day - b.day || toMin(a.start) - toMin(b.start));

/* ===== טעינה ===== */
async function boot(){
  if (!token || token.length < 10){ fatal("הקישור לא שלם. בקש מהמנהל לשלוח אותו שוב."); return; }
  try {
    const snap = await getDoc(doc(db, "roster", token));
    if (!snap.exists() || snap.data().active === false){ fatal("הקישור כבר לא פעיל. פנה למנהל."); return; }
    me = snap.data();
  } catch { fatal("אין חיבור כרגע. נסה שוב בעוד רגע."); return; }
  $("hello").textContent = `היי ${me.name || ""}`;
  await load();
  findPending().then(() => render()).catch(() => {});
}

/* ===== דיווח סוף משמרת =====
   מה שקרה במשמרת יודע רק מי שעמד שם. עד היום רק המנהל יכול היה לדווח,
   ולכן רוב הימים נשארו ריקים. כאן זה נפתח לכל מי שיש לו קישור אישי.
   נבדקות שתי משמרות אחרונות בלבד — היום ואתמול. ישן מזה כבר לא זכור. */
const HOURS_BACK = 2;

async function findPending(){
  const out = [];
  const now = new Date();
  for (let back = 0; back < HOURS_BACK; back++){
    const d = addDays(now, -back);
    const dStr = ymd(d);
    const ws = sundayOf(d);
    const id = "w" + ymd(ws);
    let wk = null;
    try { const s = await getDoc(doc(db, "weeks", id)); wk = s.exists() ? s.data() : null; } catch { continue; }
    if (!wk || !Array.isArray(wk.shifts)) continue;
    const mineToday = wk.shifts.filter(sh => sh.day === d.getDay());
    for (const sh of mineToday){
      // נגמרה? היום — רק אם השעה עברה. אתמול — תמיד.
      const ended = back > 0 || toMin(sh.end) <= now.getHours() * 60 + now.getMinutes();
      if (!ended) continue;
      try {
        const sign = await getDoc(doc(db, "signups", `${id}_${sh.id}_${token}`));
        if (!sign.exists()) continue;                       // לא המשמרת שלו
        const log = await getDoc(doc(db, "log", `${dStr}_${sh.id}_${token}`));
        if (log.exists()) continue;                         // כבר דיווח
        out.push({ date: dStr, shift: sh.id, wid: id, start: sh.start, end: sh.end, day: d.getDay(), dateObj: d });
      } catch {}
    }
  }
  pending = out;
}

const WEATHER = ["שמש", "חם מאוד", "גשם", "רוח", "קר"];

function renderReport(main){
  if (!pending.length) return;
  const it = pending[0];
  const form = { customers: null, peak: "", weather: "", missing: "", notes: "" };

  const card = el("div", { class: "card zreport" });
  card.append(el("h2", { text: "איך היה במשמרת?" }));
  card.append(el("p", { class: "zlead small",
    text: `${DAYS[it.day]} ${dm(it.dateObj)} · ${it.start}–${it.end}. חצי דקה, ואתה משוחרר.` }));

  // כמה לקוחות — כפתורי טווח, לא הקלדה. אף אחד לא סופר בדיוק.
  card.append(el("span", { class: "small", text: "כמה לקוחות, בערך?" }));
  const counts = el("div", { class: "seg big", role: "group", "aria-label": "כמות לקוחות" });
  [["עד 10", 8], ["10–25", 18], ["25–50", 35], ["50+", 60]].forEach(([label, val]) => {
    const b = el("button", { type: "button", class: "segbtn ok", text: label,
      onclick: () => { form.customers = val; [...counts.children].forEach(x => x.setAttribute("aria-pressed", String(x === b))); } });
    b.setAttribute("aria-pressed", "false");
    counts.append(b);
  });
  card.append(counts);

  // מזג אוויר — משפיע ישירות על כמה אנשים באים, וזה מה שהופך את הנתון לשימושי.
  card.append(el("span", { class: "small", text: "מזג אוויר" }));
  const wx = el("div", { class: "chips", role: "group", "aria-label": "מזג אוויר" });
  WEATHER.forEach(w => {
    const b = el("button", { type: "button", class: "segbtn ok", text: w,
      onclick: () => { form.weather = form.weather === w ? "" : w;
        [...wx.children].forEach(x => x.setAttribute("aria-pressed", String(x.textContent === form.weather))); } });
    b.setAttribute("aria-pressed", "false");
    wx.append(b);
  });
  card.append(wx);

  card.append(el("label", { class: "zlabel" }, el("span", { class: "small", text: "מתי היה הכי עמוס?" }),
    el("input", { type: "time", oninput: (e) => form.peak = e.target.value })));

  // השדה הכי שווה כסף: מה אנשים ביקשו ולא היה. אף מערכת אחרת לא אוספת את זה.
  card.append(el("label", { class: "zlabel" }, el("span", { class: "small", text: "מה ביקשו ולא היה לנו?" }),
    el("input", { type: "text", placeholder: "חלב שקדים, קרואסון, קר…",
      oninput: (e) => form.missing = e.target.value })));

  card.append(el("label", { class: "zlabel" }, el("span", { class: "small", text: "עוד משהו?" }),
    el("input", { type: "text", placeholder: "לא חובה", oninput: (e) => form.notes = e.target.value })));

  const send = el("button", { class: "primary big", text: "שלח דיווח",
    onclick: (e) => sendReport(it, form, e.currentTarget) });
  card.append(el("div", { class: "actions" }, send,
    el("button", { class: "link", text: "לא עכשיו", onclick: () => { pending = pending.slice(1); render(); } })));
  main.append(card);
}

async function sendReport(it, form, btn){
  if (form.customers == null){ say("warn", "רק תסמן כמה לקוחות, וזהו."); return; }
  btn.disabled = true; btn.textContent = "שולח…";
  try {
    await setDoc(doc(db, "log", `${it.date}_${it.shift}_${token}`), {
      // week נשלח כדי שהכללים יוכלו לאמת מול ההרשמה שהעובד באמת לקח
      // את המשמרת. בלעדיו אי אפשר לגזור את מזהה השבוע מתוך התאריך.
      date: it.date, week: it.wid, shift: it.shift, token, by: (me.name || "").slice(0, 80),
      customers: form.customers,
      peak: (form.peak || "").slice(0, 10),
      weather: (form.weather || "").slice(0, 40),
      missing: (form.missing || "").slice(0, 200),
      notes: (form.notes || "").slice(0, 600),
      at: serverTimestamp(),
    });
    pending = pending.slice(1);
    say("ok", "התקבל. תודה 🙏");
    render();
  } catch (e){
    btn.disabled = false; btn.textContent = "שלח דיווח";
    say("bad", "הדיווח לא נשלח. בדוק חיבור ונסה שוב.");
  }
}
function fatal(msg){
  $("hello").textContent = "משהו לא בסדר";
  $("zsub").textContent = "";
  clear($("zmain")).append(el("div", { class: "card center" }, el("p", { text: msg })));
  $("zbar").hidden = true;
}

/* מונה דורות. בחיבור איטי שתי הקשות מהירות על "שבוע הבא" מחזירות את
   התשובות לא בסדר: week ו-taken של שבוע אחד לצד כותרת ותאריכים של אחר,
   והעובד לוקח "שלישי" שלא קיים בשבוע שעל המסך. טעינה שנעקפה פשוט יוצאת. */
let loadGen = 0;
async function load(){
  const gen = ++loadGen;
  dirty = false;
  clear($("zmain")).append(el("p", { class: "zloading", text: "טוען…" }));
  $("zbar").hidden = true;
  const id = wid();
  let wk = null, av = null, mark = new Set();
  try {
    const [wSnap, aSnap] = await Promise.all([
      getDoc(doc(db, "weeks", id)),
      getDoc(doc(db, "availability", `${id}_${token}`)),
    ]);
    if (gen !== loadGen) return;
    wk = wSnap.exists() ? wSnap.data() : null;
    av = aSnap.exists() ? aSnap.data() : null;
    // השיבוצים של אחרים סגורים בפני עובדים; קוראים רק את שלנו, לפי מזהה ידוע.
    const ss = (wk && Array.isArray(wk.shifts) ? wk.shifts : []);
    const got = await Promise.all(ss.map(sh =>
      getDoc(doc(db, "signups", `${id}_${sh.id}_${token}`)).then(d => d.exists() ? sh.id : null).catch(() => null)));
    if (gen !== loadGen) return;
    got.forEach(x => { if (x) mark.add(x); });
  } catch (e){
    if (gen !== loadGen) return;
    clear($("zmain")).append(el("div", { class: "card center" },
      el("p", { text: "לא הצלחתי לטעון. בדוק חיבור." }),
      el("button", { class: "primary", text: "נסה שוב", onclick: () => load() })));
    return;
  }
  // הכתיבה למצב הגלובלי קורית רק אחרי שכל ההמתנות עברו את הבדיקה.
  week = wk; mine = av; taken = mark;
  draft = { ...(mine && mine.days || {}) };
  note = (mine && mine.note) || "";
  render();
}

/* ===== ציור ===== */
function render(){
  const t0 = new Date();
  const thisW = ymd(sundayOf(t0)) === ymd(weekStart);
  const nextW = ymd(addDays(sundayOf(t0), 7)) === ymd(weekStart);
  $("zsub").textContent = (thisW ? "השבוע · " : nextW ? "השבוע הבא · " : "") +
    `${dm(weekStart)}–${dm(addDays(weekStart, 6))}`;
  const main = clear($("zmain"));
  const ph = phase();

  // הדיווח קודם לכל השאר: הוא נמחק מהזיכרון תוך שעות.
  renderReport(main);

  if (ph === "availability" || ph === "review") renderAvailability(main);
  else if (ph === "open") renderPick(main);
  else renderFinal(main);
}

const shiftsOn = (day) => shiftsOf().filter(s => s.day === day);
const shiftLine = (day) => {
  const ss = shiftsOn(day);
  if (!ss.length) return "";
  return ss.map(s => `${s.start}\u2013${s.end}` + ((s.need || 1) > 1 ? ` (${s.need})` : "")).join(" · ");
};

function renderAvailability(main){
  main.append(el("p", { class: "zlead", text: "סמן מתי אתה יכול. זה לא שיבוץ — רק זמינות." }));
  if (mine) main.append(el("div", { class: "notice ok2", text: "כבר שלחת. אפשר לשנות ולשלוח שוב." }));
  const anyShift = shiftsOf().length;
  if (anyShift) main.append(el("p", { class: "zlead small", text: "מתחת לכל יום כתובות שעות המשמרת שתוכננו, ובסוגריים כמה אנשים דרושים." }));

  for (let i = 0; i < 7; i++){
    const d = addDays(weekStart, i), h = holidayOn(ymd(d));
    const line = shiftLine(i);
    const row = el("div", { class: "zrow" + (draft[i] ? " set" : "") });
    row.append(el("div", { class: "zday" },
      el("b", { text: DAYS[i] }),
      el("span", { class: "small", text: dm(d) }),
      line ? el("span", { class: "zhours mono", text: line })
           : (anyShift ? el("span", { class: "small closed", text: "סגור" }) : null),
      h ? el("span", { class: "hol", text: h[1] }) : null));
    const day = i;
    const seg = el("div", { class: "seg big", role: "group", "aria-label": "זמינות ב" + DAYS[i] });
    [["yes","כן","ok"],["maybe","אולי","warn"],["no","לא","bad"]].forEach(([v,label,cls]) => {
      const b = el("button", { type: "button", class: "segbtn " + cls, text: label,
        "aria-pressed": String(draft[day] === v),
        onclick: () => { draft[day] = v; dirty = true; paint(); } });
      b.dataset.v = v; seg.append(b);
    });
    function paint(){
      [...seg.children].forEach(b => b.setAttribute("aria-pressed", String(draft[day] === b.dataset.v)));
      row.classList.toggle("set", !!draft[day]);
      left();
    }
    row.append(seg);
    main.append(row);
  }

  const noteInput = el("input", { type: "text", value: note, placeholder: "משהו שכדאי שאדע? (לא חובה)",
    oninput: (e) => { note = e.target.value; dirty = true; } });
  main.append(el("label", { class: "zlabel" }, el("span", { class: "small", text: "הערה" }), noteInput));

  $("zbar").hidden = false;
  $("zsend").hidden = false;
  $("zsend").textContent = mine ? "עדכן" : "שלח";
  $("zsend").onclick = send;
  left();
}

function left(){
  let n = 0; for (let i = 0; i < 7; i++) if (!draft[i]) n++;
  if (n === 0) say("ok", "כל הימים סומנו.");
  else say("", `נשארו ${n} ימים לסמן`);
}

function renderPick(main){
  const shifts = shiftsOf();
  if (!shifts.length){ main.append(el("p", { class: "zlead", text: "עוד לא נקבעו משמרות לשבוע הזה." })); return; }
  main.append(el("p", { class: "zlead", text: "המשמרות נפתחו. תפוס את מה שמתאים לך." }));

  for (let i = 0; i < 7; i++){
    const day = shifts.filter(s => s.day === i);
    if (!day.length) continue;
    const d = addDays(weekStart, i), h = holidayOn(ymd(d));
    const av = mine && mine.days && mine.days[i];
    main.append(el("div", { class: "zdayhead" },
      el("b", { text: DAYS[i] }), el("span", { class: "small", text: dm(d) }),
      h ? el("span", { class: "hol", text: h[1] }) : null,
      av === "no" ? el("span", { class: "pill bad", text: "סימנת שאינך יכול" }) : null));

    for (const s of day){
      const need = s.need || 1;
      const isMine = taken.has(s.id);
      const card = el("div", { class: "zshift " + (isMine ? "mine" : "") });
      card.append(el("div", { class: "row" },
        el("b", { class: "mono", text: `${s.start}–${s.end}` }),
        el("span", { class: "count", text: need === 1 ? "צריך אחד" : `צריך ${need}` })));
      if (isMine) card.append(el("button", { class: "join mine", text: "אתה משובץ — בטל", onclick: (e) => leave(s, e.currentTarget) }));
      else card.append(el("button", { class: "join", text: "אני לוקח", onclick: (e) => take(s, e.currentTarget) }));
      main.append(card);
    }
  }
  $("zbar").hidden = false;
  $("zsend").hidden = true;
}

function renderFinal(main){
  const shifts = shiftsOf();
  const mineShifts = shifts.filter(s => taken.has(s.id));
  main.append(el("p", { class: "zlead", text: "השבוע נסגר. זה השיבוץ שלך." }));
  if (!mineShifts.length){ main.append(el("div", { class: "card center" }, el("p", { text: "אין לך משמרות השבוע." }))); $("zbar").hidden = true; return; }
  for (const s of mineShifts){
    const d = addDays(weekStart, s.day);
    main.append(el("div", { class: "zshift mine" },
      el("div", { class: "row" }, el("b", { text: DAYS[s.day] + " " + dm(d) }), el("span", { class: "mono", text: `${s.start}–${s.end}` }))));
  }
  $("zbar").hidden = true;
}

/* ===== כתיבה ===== */
async function send(){
  const days = {};
  for (let i = 0; i < 7; i++) if (draft[i]) days[i] = draft[i];
  if (!Object.keys(days).length){ say("warn", "סמן לפחות יום אחד."); return; }
  const btn = $("zsend"), t = btn.textContent;
  btn.disabled = true; btn.textContent = "שולח…";
  try {
    await setDoc(doc(db, "availability", `${wid()}_${token}`), {
      week: wid(), token, name: me.name || "", days, note: (note || "").slice(0, 280), at: serverTimestamp(),
    });
    mine = { days, note };
    dirty = false;
    say("ok", "התקבל ✅ אפשר לשנות בכל רגע.");
    btn.textContent = "עדכן";
  } catch (e){
    say("bad", "השליחה נכשלה. בדוק חיבור ונסה שוב.");
    btn.textContent = t;
  } finally { btn.disabled = false; }
}

async function take(s, btn){
  btn.disabled = true; btn.textContent = "רגע…";
  try {
    await setDoc(doc(db, "signups", `${wid()}_${s.id}_${token}`), {
      week: wid(), shift: s.id, token, name: me.name || "", at: serverTimestamp(),
    });
    taken.add(s.id); render();
    say("ok", `נרשמת ל${DAYS[s.day]} ${s.start}–${s.end}`);
  } catch {
    btn.disabled = false; btn.textContent = "אני לוקח";
    say("bad", "לא הצלחתי לרשום. ייתכן שהשיבוץ נסגר — נסה לרענן.");
  }
}
async function leave(s, btn){
  btn.disabled = true; btn.textContent = "רגע…";
  try { await deleteDoc(doc(db, "signups", `${wid()}_${s.id}_${token}`)); taken.delete(s.id); render();
    say("", "המשמרת בוטלה."); }
  catch { btn.disabled = false; btn.textContent = "אתה משובץ — בטל"; say("bad", "הביטול נכשל. נסה שוב."); }
}

/* ===== ניווט ===== */
function move(delta){
  if (dirty && !confirm("יש שינוי שלא נשלח. לעבור בכל זאת?")) return;
  weekStart = addDays(weekStart, delta);
  load();
}
$("zprev").addEventListener("click", () => move(-7));
$("znext").addEventListener("click", () => move(7));
window.addEventListener("beforeunload", (e) => { if (dirty){ e.preventDefault(); e.returnValue = ""; } });

boot();
