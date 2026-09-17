// אפליקציית המשמרות של קפה קורטדו — עצמאית, על Firebase.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig, OWNER_EMAILS } from "./config.js";

/* ---------- עזרים ---------- */
const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dm = (d) => `${d.getDate()}.${d.getMonth()+1}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const sundayOf = (d) => { const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()); s.setDate(s.getDate()-s.getDay()); return s; };
const toMin = (t) => { const [h,m] = t.split(":").map(Number); return h*60+(m||0); };
const fromMin = (m) => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const weekId = (ws) => "w" + ymd(ws);
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
const status = (id, kind, msg) => { const n = $(id); n.className = "status " + (kind || ""); n.textContent = msg || ""; };

/* ---------- Firebase ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbs = getFirestore(app);
const provider = new GoogleAuthProvider();

/* ---------- מצב ---------- */
let me = null, isOwner = false;
let weekStart = (() => { const t = new Date(); const s = sundayOf(t); if (t.getDay() >= 4) s.setDate(s.getDate()+7); return s; })();
let week = null, signups = [], unsubWeek = null, unsubSignups = null;
let busy = false;

DAYS.forEach((d,i) => $("fDay").append(el("option", { value: i, text: d })));

/* ---------- כניסה ---------- */
$("signInBtn").addEventListener("click", async () => {
  $("signInBtn").disabled = true;
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment"){
      try { await signInWithRedirect(auth, provider); return; } catch {}
    }
    $("authNote").textContent = e.code === "auth/popup-closed-by-user" ? "הכניסה בוטלה." :
      e.code === "auth/unauthorized-domain" ? "הכתובת הזו לא מאושרת בהגדרות Firebase (Authentication ← Settings ← Authorized domains)." :
      "הכניסה נכשלה. נסה שוב.";
  } finally { $("signInBtn").disabled = false; }
});
$("signOut").addEventListener("click", () => signOut(auth));
getRedirectResult(auth).catch(() => {});

onAuthStateChanged(auth, async (user) => {
  me = user;
  isOwner = !!user && OWNER_EMAILS.map(e => e.toLowerCase()).includes((user.email || "").toLowerCase());
  $("signin").hidden = !!user;
  $("board").hidden = !user;
  $("who").hidden = !user;
  $("managerPanel").hidden = !isOwner;
  if (user){
    $("myName").textContent = user.displayName || user.email || "";
    if (user.photoURL) $("avatar").src = user.photoURL;
    try {
      await setDoc(doc(dbs, "users", user.uid), {
        name: user.displayName || "", email: user.email || "", photo: user.photoURL || "", lastSeen: serverTimestamp()
      }, { merge: true });
    } catch {}
    subscribe();
  } else {
    if (unsubWeek) unsubWeek(); if (unsubSignups) unsubSignups();
    week = null; signups = []; render();
  }
});

/* ---------- נתונים ---------- */
function subscribe(){
  if (unsubWeek) unsubWeek(); if (unsubSignups) unsubSignups();
  week = null; signups = []; render();
  const wid = weekId(weekStart);
  unsubWeek = onSnapshot(doc(dbs, "weeks", wid),
    (snap) => { week = snap.exists() ? snap.data() : null; render(); },
    () => $("conn").textContent = "אין חיבור לנתונים");
  unsubSignups = onSnapshot(query(collection(dbs, "signups"), where("week", "==", wid)),
    (snap) => { signups = snap.docs.map(d => ({ id: d.id, ...d.data() })); $("conn").textContent = ""; render(); },
    () => $("conn").textContent = "אין חיבור לנתונים");
}
const shifts = () => (week && Array.isArray(week.shifts)) ? [...week.shifts].sort((a,b) => a.day - b.day || toMin(a.start) - toMin(b.start)) : [];
const isOpen = () => !!(week && week.open);

async function saveWeek(patch){
  if (busy) return; busy = true;
  try {
    await setDoc(doc(dbs, "weeks", weekId(weekStart)), { shifts: shifts(), open: isOpen(), ...patch, updatedAt: serverTimestamp() }, { merge: true });
    status("managerStatus", "ok", "נשמר.");
  } catch (e){
    status("managerStatus", "bad", e.code === "permission-denied" ? "רק המנהל יכול לשנות משמרות." : "השמירה נכשלה. נסה שוב.");
  } finally { busy = false; }
}

/* ---------- פעולות ---------- */
$("addShift").addEventListener("click", () => {
  const day = +$("fDay").value, start = $("fStart").value, end = $("fEnd").value, need = Math.max(1, +$("fNeed").value || 1);
  if (!start || !end || toMin(end) <= toMin(start)) { status("managerStatus", "warn", "שעת הסיום צריכה להיות אחרי ההתחלה."); return; }
  const id = "s" + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
  saveWeek({ shifts: [...shifts(), { id, day, start, end, need }] });
});
$("copyPrev").addEventListener("click", async () => {
  try {
    const snap = await getDoc(doc(dbs, "weeks", weekId(addDays(weekStart, -7))));
    const prev = snap.exists() && Array.isArray(snap.data().shifts) ? snap.data().shifts : [];
    if (!prev.length) { status("managerStatus", "warn", "בשבוע שעבר לא היו משמרות."); return; }
    if (shifts().length && !confirm("להחליף את המשמרות של השבוע?")) return;
    saveWeek({ shifts: prev.map(s => ({ ...s })) });
  } catch { status("managerStatus", "bad", "לא הצלחתי לקרוא את שבוע שעבר."); }
});
$("toggleOpen").addEventListener("click", () => {
  if (!isOpen() && !shifts().length) { status("managerStatus", "warn", "הוסף קודם משמרות."); return; }
  saveWeek({ open: !isOpen() });
});
$("prevWeek").addEventListener("click", () => { weekStart = addDays(weekStart, -7); subscribe(); });
$("nextWeek").addEventListener("click", () => { weekStart = addDays(weekStart, 7); subscribe(); });
$("copyHours").addEventListener("click", async () => {
  const text = hoursText();
  try { await navigator.clipboard.writeText(text); $("copyHours").textContent = "הועתק"; }
  catch { prompt("העתק:", text); }
  setTimeout(() => $("copyHours").textContent = "העתק טקסט לפרסום", 2000);
});

async function join(s){
  if (!me) return;
  const wid = weekId(weekStart);
  const id = `${wid}_${s.id}_${me.uid}`;
  try {
    await setDoc(doc(dbs, "signups", id), {
      week: wid, shift: s.id, uid: me.uid,
      name: me.displayName || me.email || "", photo: me.photoURL || "", at: serverTimestamp()
    });
  } catch (e){
    alert(e.code === "permission-denied" ? "השבוע עדיין לא פתוח לשיבוץ." : "ההרשמה לא נשמרה. נסה שוב.");
  }
}
async function leave(id){
  try { await deleteDoc(doc(dbs, "signups", id)); }
  catch { alert("הביטול לא נשמר. נסה שוב."); }
}

/* ---------- תצוגה ---------- */
function render(){
  const ws = weekStart, we = addDays(ws, 6);
  $("range").textContent = `${dm(ws)} – ${dm(we)}`;
  const list = shifts();
  const byShift = {};
  signups.forEach(s => (byShift[s.shift] ||= []).push(s));

  $("weekState").textContent = isOpen() ? "פתוח לשיבוץ" : "בתכנון";
  $("weekState").className = "pill " + (isOpen() ? "ok" : "");
  $("toggleOpen").textContent = isOpen() ? "סגור שיבוץ" : "פתח לשיבוץ";

  const need = list.reduce((a,s) => a + (s.need || 1), 0);
  const filled = list.reduce((a,s) => a + Math.min((byShift[s.id] || []).length, s.need || 1), 0);
  const emptyShifts = list.filter(s => !(byShift[s.id] || []).length).length;
  const mine = me ? signups.filter(s => s.uid === me.uid).length : 0;
  const sum = $("summary"); sum.replaceChildren();
  if (list.length){
    sum.append(el("span", { class: "chip " + (filled === need ? "ok" : filled ? "warn" : "bad"), text: `${filled} מתוך ${need} מקומות מאוישים` }));
    if (emptyShifts) sum.append(el("span", { class: "chip bad", text: `${emptyShifts} משמרות ריקות` }));
    if (mine) sum.append(el("span", { class: "chip ok", text: `אתה רשום ל-${mine} משמרות` }));
  }

  const n = $("notice"); n.replaceChildren();
  if (!list.length) n.append(el("div", { class: "notice info", text: isOwner ? "אין עדיין משמרות לשבוע הזה. הוסף אותן למטה." : "המשמרות לשבוע הזה עוד לא פורסמו." }));
  else if (!isOpen()) n.append(el("div", { class: "notice", text: isOwner ? "השבוע בתכנון. לחץ \"פתח לשיבוץ\" כדי שהצוות יוכל להירשם." : "השבוע עדיין לא נפתח לשיבוץ." }));

  const days = $("days"); days.replaceChildren();
  for (let d = 0; d < 7; d++){
    const col = el("div", { class: "day" },
      el("div", { class: "dayhead" }, el("b", { text: DAYS[d] }), el("span", { class: "num", text: dm(addDays(ws, d)) })));
    const dayShifts = list.filter(s => s.day === d);
    if (!dayShifts.length) col.append(el("div", { class: "empty", text: "אין משמרות" }));
    for (const s of dayShifts){
      const people = byShift[s.id] || [];
      const cap = s.need || 1;
      const mineHere = me && people.find(p => p.uid === me.uid);
      const card = el("div", { class: "shift " + (people.length >= cap ? "full" : people.length ? "part" : "") },
        el("div", { class: "row" }, el("span", { class: "num", text: `${s.start}–${s.end}` }), el("span", { class: "count", text: `${people.length}/${cap}` })));
      const pl = el("div", { class: "people" });
      for (const p of people){
        const row = el("div", { class: "person" });
        if (p.photo) row.append(el("img", { src: p.photo, alt: "", referrerpolicy: "no-referrer" }));
        row.append(el("span", { class: "nm", text: me && p.uid === me.uid ? "אתה" : (p.name || "חבר צוות") }));
        if (isOwner && !(me && p.uid === me.uid)) row.append(el("button", { text: "✕", "aria-label": "הסר מהמשמרת", onclick: () => leave(p.id) }));
        pl.append(row);
      }
      for (let i = people.length; i < cap; i++) pl.append(el("span", { class: "slot", text: "מקום פנוי" }));
      card.append(pl);
      if (me && isOpen()){
        card.append(mineHere
          ? el("button", { class: "join mine", text: "רשום ✓ · לחץ לביטול", onclick: () => leave(mineHere.id) })
          : el("button", { class: "join", text: people.length >= cap ? "מלא" : "אני משתבץ", disabled: people.length >= cap, onclick: () => join(s) }));
      }
      if (isOwner) card.append(el("button", { class: "link", text: "מחק משמרת", onclick: () => {
        const taken = (byShift[s.id] || []).length;
        if (taken && !confirm(`רשומים ${taken} למשמרת. למחוק בכל זאת?`)) return;
        saveWeek({ shifts: shifts().filter(x => x.id !== s.id) });
      }}));
      col.append(card);
    }
    days.append(col);
  }

  if (isOwner) renderHours(byShift);
}

function computeHours(byShift){
  const out = [];
  for (let d = 0; d < 7; d++){
    const iv = shifts().filter(s => s.day === d && (byShift[s.id] || []).length)
      .map(s => [toMin(s.start), toMin(s.end)]).sort((a,b) => a[0]-b[0]);
    const merged = [];
    for (const [a,b] of iv){ const last = merged[merged.length-1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a,b]); }
    out.push(merged.map(([a,b]) => `${fromMin(a)}–${fromMin(b)}`));
  }
  return out;
}
let lastHours = [];
function renderHours(byShift){
  lastHours = computeHours(byShift);
  const dl = $("hours"); dl.replaceChildren();
  lastHours.forEach((h,i) => dl.append(el("dt", { text: DAYS[i] }), el("dd", { class: h.length ? "num" : "closed", text: h.length ? h.join(", ") : "סגור" })));
}
function hoursText(){
  const ws = weekStart, we = addDays(ws, 6);
  return `☕ שעות העגלה לשבוע ${dm(ws)}–${dm(we)}\n\n${lastHours.map((h,i) => `${DAYS[i]}: ${h.length ? h.join(", ") : "סגור"}`).join("\n")}\n\nמחכים לכם!`;
}

render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
