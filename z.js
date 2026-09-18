// דף העובד. בלי התחברות, בלי חשבון, בלי אפליקציה.
// הזהות היא הקוד שב-URL. הדף משנה את עצמו לפי השלב שהשבוע נמצא בו.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const HOLIDAYS = [
  ["2026-09-21","יום כיפור"],["2026-09-26","סוכות"],["2026-10-03","שמחת תורה"],
  ["2026-12-04","חנוכה"],["2027-01-23","ט״ו בשבט"],["2027-03-23","פורים"],
  ["2027-04-22","פסח"],["2027-05-12","יום העצמאות"],["2027-06-11","שבועות"],
];

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
}
function fatal(msg){
  $("hello").textContent = "משהו לא בסדר";
  $("zsub").textContent = "";
  clear($("zmain")).append(el("div", { class: "card center" }, el("p", { text: msg })));
  $("zbar").hidden = true;
}

async function load(){
  dirty = false;
  clear($("zmain")).append(el("p", { class: "zloading", text: "טוען…" }));
  $("zbar").hidden = true;
  const id = wid();
  try {
    const [wSnap, aSnap] = await Promise.all([
      getDoc(doc(db, "weeks", id)),
      getDoc(doc(db, "availability", `${id}_${token}`)),
    ]);
    week = wSnap.exists() ? wSnap.data() : null;
    mine = aSnap.exists() ? aSnap.data() : null;
    // השיבוצים של אחרים סגורים בפני עובדים; קוראים רק את שלנו, לפי מזהה ידוע.
    taken = new Set();
    const ss = shiftsOf();
    const got = await Promise.all(ss.map(sh =>
      getDoc(doc(db, "signups", `${id}_${sh.id}_${token}`)).then(d => d.exists() ? sh.id : null).catch(() => null)));
    got.forEach(x => { if (x) taken.add(x); });
  } catch (e){
    clear($("zmain")).append(el("div", { class: "card center" },
      el("p", { text: "לא הצלחתי לטעון. בדוק חיבור." }),
      el("button", { class: "primary", text: "נסה שוב", onclick: () => load() })));
    return;
  }
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
