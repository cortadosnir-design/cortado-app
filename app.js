// קורטדו אופרציה — אפליקציה עצמאית על Firebase.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig, OWNER_EMAILS } from "./config.js";

/* ===== עזרים ===== */
const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const PILLARS = ["משקה השבוע","מאחורי הבר","קפה ומאפה","לקוחות וביקורות","אווירת סופ״ש","הכירו את הצוות","מבצע","שעות ועדכונים","חג או מועד"];
const WEATHER = ["","נעים","חם","שרב","גשום","קר","רוח"];
// מועדים בישראל (היום עצמו; רובם מתחילים בערב שלפני). מקור: hebcal.com
const HOLIDAYS = [
  ["2026-09-21","יום כיפור","ערב החג 20.9"],
  ["2026-09-26","סוכות","ערב החג 25.9"],
  ["2026-10-01","יום הקפה הבינלאומי",""],
  ["2026-10-03","שמחת תורה","ערב החג 2.10"],
  ["2026-12-04","חנוכה – נר ראשון","בערב"],
  ["2027-01-23","ט״ו בשבט","ערב 22.1"],
  ["2027-02-14","ולנטיין",""],
  ["2027-03-23","פורים","ערב 22.3"],
  ["2027-04-22","פסח","ערב החג 21.4"],
  ["2027-05-12","יום העצמאות","ערב 11.5"],
  ["2027-05-25","ל״ג בעומר","ערב 24.5"],
  ["2027-06-11","שבועות","ערב החג 10.6"],
];
const MIN_ENTRIES = 5;
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dm = (d) => `${d.getDate()}.${d.getMonth()+1}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const fromYmd = (s) => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const sundayOf = (d) => { const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()); s.setDate(s.getDate()-s.getDay()); return s; };
const toMin = (t) => { const [h,m] = t.split(":").map(Number); return h*60+(m||0); };
const fromMin = (m) => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const fmt1 = (n) => (Math.round(n*10)/10).toString();
const weekId = (ws) => "w" + ymd(ws);
const holidayOn = (d) => HOLIDAYS.find(h => h[0] === ymd(d));
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
function waLink(phone, text){
  let p = String(phone || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1); else if (p.startsWith("0")) p = "972" + p.slice(1);
  return p.length >= 11 ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null;
}
async function copyText(text, btn, label){
  try { await navigator.clipboard.writeText(text); if (btn) btn.textContent = "הועתק"; }
  catch { prompt("העתק:", text); }
  if (btn) setTimeout(() => btn.textContent = label, 2000);
}

/* ===== Firebase ===== */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbs = getFirestore(app);
const provider = new GoogleAuthProvider();

/* ===== מצב ===== */
let me = null, isOwner = false;
let weekStart = (() => { const t = new Date(); const s = sundayOf(t); if (t.getDay() >= 4) s.setDate(s.getDate()+7); return s; })();
let week = null, signups = [], unsubWeek = null, unsubSignups = null;
let posts = [], team = [], logs = [], unsubPosts = null, unsubTeam = null, unsubLogs = null;
let remRows = null, remWeekId = null;
let calMonth = (() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); })();
let editingPost = null, editingMember = null, busy = false;

DAYS.forEach((d,i) => $("fDay").append(el("option", { value: i, text: d })));
PILLARS.forEach(p => $("cPillar").append(el("option", { value: p, text: p })));
WEATHER.forEach(w => $("lWeather").append(el("option", { value: w, text: w || "—" })));
$("lDate").value = ymd(new Date());
$("cDate").value = ymd(addDays(new Date(), 1));

/* ===== לשוניות ===== */
const TABS = ["shifts","posts","team","log"];
function selectTab(name){
  for (const t of TABS){ $("tab-" + t).setAttribute("aria-selected", String(t === name)); $("p-" + t).hidden = t !== name; }
  try { localStorage.setItem("cortado-tab", name); } catch {}
  if (name === "team") renderReminders();
}
TABS.forEach(t => $("tab-" + t).addEventListener("click", () => selectTab(t)));

/* ===== כניסה ===== */
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
  $("tabs").hidden = !user;
  $("who").hidden = !user;
  $("managerPanel").hidden = !isOwner;
  document.querySelectorAll("[data-owner]").forEach(n => n.hidden = !isOwner);
  if (!user){
    [unsubWeek, unsubSignups, unsubPosts, unsubTeam, unsubLogs].forEach(u => u && u());
    unsubWeek = unsubSignups = unsubPosts = unsubTeam = unsubLogs = null;
    week = null; signups = []; posts = []; team = []; logs = [];
    TABS.forEach(t => $("p-" + t).hidden = true);
    render(); return;
  }
  $("myName").textContent = user.displayName || user.email || "";
  if (user.photoURL) $("avatar").src = user.photoURL;
  try {
    await setDoc(doc(dbs, "users", user.uid), {
      name: user.displayName || "", email: user.email || "", photo: user.photoURL || "", lastSeen: serverTimestamp()
    }, { merge: true });
  } catch {}
  let tab = "shifts";
  try { const t = localStorage.getItem("cortado-tab"); if (t && TABS.includes(t) && (isOwner || t === "shifts" || t === "log")) tab = t; } catch {}
  selectTab(tab);
  subscribeWeek();
  subscribeShared();
});

/* ===== משמרות ===== */
function subscribeWeek(){
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
$("addShift").addEventListener("click", () => {
  const day = +$("fDay").value, start = $("fStart").value, end = $("fEnd").value, need = Math.max(1, +$("fNeed").value || 1);
  if (!start || !end || toMin(end) <= toMin(start)) { status("managerStatus", "warn", "שעת הסיום צריכה להיות אחרי ההתחלה."); return; }
  saveWeek({ shifts: [...shifts(), { id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2,5), day, start, end, need }] });
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
$("shareLink").addEventListener("click", () => copyText(location.href.split("#")[0], $("shareLink"), "העתק קישור לצוות"));
$("prevWeek").addEventListener("click", () => { weekStart = addDays(weekStart, -7); subscribeWeek(); });
$("nextWeek").addEventListener("click", () => { weekStart = addDays(weekStart, 7); subscribeWeek(); });
$("copyHours").addEventListener("click", () => copyText(hoursText(), $("copyHours"), "העתק טקסט לפרסום"));

async function join(s){
  if (!me) return;
  const wid = weekId(weekStart);
  try {
    await setDoc(doc(dbs, "signups", `${wid}_${s.id}_${me.uid}`), {
      week: wid, shift: s.id, uid: me.uid, name: me.displayName || me.email || "", photo: me.photoURL || "", at: serverTimestamp()
    });
  } catch (e){ alert(e.code === "permission-denied" ? "השבוע עדיין לא פתוח לשיבוץ." : "ההרשמה לא נשמרה. נסה שוב."); }
}
const leave = async (id) => { try { await deleteDoc(doc(dbs, "signups", id)); } catch { alert("הביטול לא נשמר."); } };

function render(){
  const ws = weekStart;
  $("range").textContent = `${dm(ws)} – ${dm(addDays(ws, 6))}`;
  const list = shifts(), byShift = {};
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
  const hols = []; for (let d = 0; d < 7; d++){ const h = holidayOn(addDays(ws, d)); if (h) hols.push(`${h[1]} ב${DAYS[d]} ${dm(addDays(ws,d))}`); }
  if (hols.length) n.append(el("div", { class: "notice", text: `השבוע: ${hols.join(" · ")}` }));

  const days = $("days"); days.replaceChildren();
  for (let d = 0; d < 7; d++){
    const date = addDays(ws, d);
    const col = el("div", { class: "day" }, el("div", { class: "dayhead" }, el("b", { text: DAYS[d] }), el("span", { class: "num", text: dm(date) })));
    const h = holidayOn(date); if (h) col.append(el("span", { class: "hol", text: h[1] }));
    const dayShifts = list.filter(s => s.day === d);
    if (!dayShifts.length) col.append(el("div", { class: "empty", text: "אין משמרות" }));
    for (const s of dayShifts){
      const people = byShift[s.id] || [], cap = s.need || 1;
      const mineHere = me && people.find(p => p.uid === me.uid);
      const card = el("div", { class: "shift " + (people.length >= cap ? "full" : people.length ? "part" : "") },
        el("div", { class: "row" }, el("span", { class: "num", text: `${s.start}–${s.end}` }), el("span", { class: "count", text: `${people.length}/${cap}` })));
      const pl = el("div", { class: "people" });
      for (const p of people){
        const row = el("div", { class: "person" });
        if (p.photo) row.append(el("img", { src: p.photo, alt: "", referrerpolicy: "no-referrer" }));
        row.append(el("span", { class: "nm", text: me && p.uid === me.uid ? "אתה" : (p.name || "חבר צוות") }));
        if (isOwner && !(me && p.uid === me.uid)) row.append(el("button", { text: "✕", "aria-label": "הסר", onclick: () => leave(p.id) }));
        pl.append(row);
      }
      for (let i = people.length; i < cap; i++) pl.append(el("span", { class: "slot", text: "מקום פנוי" }));
      card.append(pl);
      if (me && isOpen()) card.append(mineHere
        ? el("button", { class: "join mine", text: "רשום ✓ · לחץ לביטול", onclick: () => leave(mineHere.id) })
        : el("button", { class: "join", text: people.length >= cap ? "מלא" : "אני משתבץ", disabled: people.length >= cap, onclick: () => join(s) }));
      if (isOwner) card.append(el("button", { class: "link", text: "מחק משמרת", onclick: () => {
        if ((byShift[s.id] || []).length && !confirm("רשומים למשמרת הזו. למחוק בכל זאת?")) return;
        saveWeek({ shifts: shifts().filter(x => x.id !== s.id) });
      }}));
      col.append(card);
    }
    days.append(col);
  }
  if (isOwner) renderHours(byShift);
}
let lastHours = [];
function renderHours(byShift){
  lastHours = [];
  for (let d = 0; d < 7; d++){
    const iv = shifts().filter(s => s.day === d && (byShift[s.id] || []).length).map(s => [toMin(s.start), toMin(s.end)]).sort((a,b) => a[0]-b[0]);
    const merged = [];
    for (const [a,b] of iv){ const last = merged[merged.length-1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a,b]); }
    lastHours.push(merged.map(([a,b]) => `${fromMin(a)}–${fromMin(b)}`));
  }
  const dl = $("hours"); dl.replaceChildren();
  lastHours.forEach((h,i) => dl.append(el("dt", { text: DAYS[i] }), el("dd", { class: h.length ? "num" : "closed", text: h.length ? h.join(", ") : "סגור" })));
}
const hoursText = () => `☕ שעות העגלה לשבוע ${dm(weekStart)}–${dm(addDays(weekStart, 6))}\n\n${lastHours.map((h,i) => `${DAYS[i]}: ${h.length ? h.join(", ") : "סגור"}`).join("\n")}\n\nמחכים לכם!`;

/* ===== מנויים משותפים: פוסטים, צוות, יומן ===== */
function subscribeShared(){
  if (unsubLogs) unsubLogs();
  unsubLogs = onSnapshot(query(collection(dbs, "log"), orderBy("date", "desc"), limit(120)),
    (snap) => { logs = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderLog(); }, () => {});
  if (!isOwner) return;
  if (unsubPosts) unsubPosts();
  unsubPosts = onSnapshot(collection(dbs, "posts"),
    (snap) => { posts = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderCal(); renderHolidays(); }, () => {});
  if (unsubTeam) unsubTeam();
  unsubTeam = onSnapshot(collection(dbs, "team"),
    (snap) => { team = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderTeam(); renderReminders(); }, () => {});
}

/* ===== פרסום ===== */
const postState = (p) => p.status === "done" ? "done" : p.status === "ready" ? "draft" : "idea";
function renderCal(){
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $("calTitle").textContent = `${MONTHS[m]} ${y}`;
  const cal = $("cal"); cal.replaceChildren();
  DAYS.forEach(d => cal.append(el("div", { class: "dow", text: d.slice(0,3) })));
  const start = sundayOf(new Date(y, m, 1)), todayKey = ymd(new Date());
  for (let i = 0; i < 42; i++){
    const d = addDays(start, i);
    if (i >= 35 && d.getMonth() !== m) break;
    const key = ymd(d);
    const cell = el("button", { class: "cell" + (d.getMonth() !== m ? " out" : "") + (key === todayKey ? " today" : ""), onclick: () => newPost(key) },
      el("span", { class: "d", text: String(d.getDate()) }));
    const h = holidayOn(d); if (h) cell.append(el("span", { class: "hol", text: h[1] }));
    posts.filter(p => p.date === key).sort((a,b) => (a.time||"").localeCompare(b.time||"")).forEach(p =>
      cell.append(el("span", { class: "pchip " + postState(p), title: p.text || "", text: `${p.time || ""} ${p.idea || p.pillar || "פוסט"}`,
        onclick: (ev) => { ev.stopPropagation(); loadPost(p.id); } })));
    cal.append(cell);
  }
}
$("calPrev").addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()-1, 1); renderCal(); });
$("calNext").addEventListener("click", () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth()+1, 1); renderCal(); });

function renderHolidays(){
  const now = new Date(); now.setHours(0,0,0,0);
  const box = $("holidays"); box.replaceChildren();
  const up = HOLIDAYS.filter(h => { const d = fromYmd(h[0]); return d >= now && d <= addDays(now, 75); });
  if (!up.length) box.append(el("p", { class: "small", text: "אין מועדים ב-75 הימים הקרובים." }));
  up.forEach(([date, name, note]) => {
    const d = fromYmd(date), prep = addDays(d, -2);
    const has = posts.some(p => p.holiday === date);
    box.append(el("div", { class: "idea" },
      el("div", {}, el("b", { text: `${name} · ${dm(d)}` }), el("div", { class: "small", text: (note ? note + " · " : "") + (has ? "כבר מתוכנן פוסט" : `כדאי לפרסם ב-${dm(prep)}`) })),
      el("button", { text: has ? "עוד פוסט" : "צור פוסט", onclick: () => newPost(ymd(prep < now ? now : prep), { pillar: "חג או מועד", idea: name, holiday: date }) })));
  });
}
function newPost(date, preset = {}){
  editingPost = null;
  $("compTitle").textContent = "פוסט חדש";
  $("cDate").value = date || ymd(addDays(new Date(), 1));
  $("cTime").value = "07:30";
  $("cPillar").value = preset.pillar || PILLARS[0];
  $("cIdea").value = preset.idea || ""; $("cText").value = "";
  $("composer").dataset.holiday = preset.holiday || "";
  $("delPost").hidden = true; status("compStatus"); dateHint();
  $("composer").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function loadPost(id){
  const p = posts.find(x => x.id === id); if (!p) return;
  editingPost = id;
  $("compTitle").textContent = p.status === "done" ? "פוסט שפורסם" : "עריכת פוסט";
  $("cDate").value = p.date || ""; $("cTime").value = p.time || "07:30";
  $("cPillar").value = p.pillar || PILLARS[0]; $("cIdea").value = p.idea || ""; $("cText").value = p.text || "";
  $("composer").dataset.holiday = p.holiday || "";
  $("delPost").hidden = false; status("compStatus"); dateHint();
  $("composer").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function dateHint(){
  const d = $("cDate").value ? fromYmd($("cDate").value) : null;
  const h = d && holidayOn(d);
  const peak = peakHour();
  const parts = [];
  if (peak != null) parts.push(`העומס בעגלה בדרך כלל ב-${pad(peak)}:00, אז שעה טובה לפרסום היא ${pad(Math.max(6, peak-2))}:00.`);
  if (h) parts.push(`שים לב: ${h[1]} ביום הזה.`);
  $("dateHint").textContent = parts.join(" ");
}
$("cDate").addEventListener("change", dateHint);
async function savePost(st){
  if (!$("cDate").value){ status("compStatus", "warn", "בחר תאריך."); return; }
  const data = { date: $("cDate").value, time: $("cTime").value, pillar: $("cPillar").value, idea: $("cIdea").value.trim(),
    text: $("cText").value, status: st, holiday: $("composer").dataset.holiday || "", updatedAt: serverTimestamp() };
  try {
    const ref = editingPost ? doc(dbs, "posts", editingPost) : doc(collection(dbs, "posts"));
    await setDoc(ref, data, { merge: true });
    editingPost = ref.id; $("delPost").hidden = false;
    status("compStatus", "ok", st === "done" ? "סומן כפורסם." : st === "ready" ? "נשמר כמוכן לפרסום." : "נשמר כרעיון.");
  } catch (e){ status("compStatus", "bad", e.code === "permission-denied" ? "רק המנהל יכול לשמור פוסטים." : "השמירה נכשלה."); }
}
$("saveIdea").addEventListener("click", () => savePost("idea"));
$("saveReady").addEventListener("click", () => savePost("ready"));
$("markDone").addEventListener("click", () => savePost("done"));
$("copyText").addEventListener("click", () => copyText($("cText").value, $("copyText"), "העתק טקסט"));
$("newPost").addEventListener("click", () => newPost());
$("delPost").addEventListener("click", async () => {
  if (!editingPost || !confirm("למחוק את הפוסט?")) return;
  try { await deleteDoc(doc(dbs, "posts", editingPost)); newPost(); status("compStatus", "ok", "נמחק."); }
  catch { status("compStatus", "bad", "המחיקה נכשלה."); }
});

/* ===== צוות ===== */
$("tSave").addEventListener("click", async () => {
  const m = { name: $("tName").value.trim(), phone: $("tPhone").value.trim(), email: $("tEmail").value.trim(), role: $("tRole").value.trim() };
  if (!m.name){ status("teamStatus", "warn", "צריך לפחות שם."); return; }
  if (team.some(x => x.name === m.name && x.id !== editingMember)){ status("teamStatus", "warn", "כבר יש עובד בשם הזה."); return; }
  try {
    if (editingMember) await updateDoc(doc(dbs, "team", editingMember), m);
    else await setDoc(doc(collection(dbs, "team")), { ...m, active: true, createdAt: serverTimestamp() });
    editingMember = null; ["tName","tPhone","tEmail","tRole"].forEach(i => $(i).value = "");
    $("tSave").textContent = "הוסף עובד"; status("teamStatus", "ok", "נשמר.");
  } catch (e){ status("teamStatus", "bad", e.code === "permission-denied" ? "רק המנהל יכול לערוך את הצוות." : "השמירה נכשלה."); }
});
function renderTeam(){
  const t = $("teamTable"); t.replaceChildren();
  if (!team.length){ t.append(el("p", { class: "small", text: "עוד אין עובדים. הוסף את הראשון בטופס." })); return; }
  const tb = el("tbody");
  [...team].sort((a,b) => (b.active === false ? -1 : 0) - (a.active === false ? -1 : 0) || a.name.localeCompare(b.name, "he")).forEach(m =>
    tb.append(el("tr", { style: m.active === false ? "opacity:.55" : "" },
      el("td", {}, el("b", { text: m.name }), m.role ? el("div", { class: "small", text: m.role }) : null),
      el("td", {}, waLink(m.phone) ? el("span", { class: "pill ok", text: "וואטסאפ" }) : el("span", { class: "pill warn", text: "אין טלפון" })),
      el("td", {},
        el("button", { class: "link", text: "עריכה", onclick: () => { editingMember = m.id; $("tName").value = m.name; $("tPhone").value = m.phone || ""; $("tEmail").value = m.email || ""; $("tRole").value = m.role || ""; $("tSave").textContent = "שמור"; $("tName").focus(); } }),
        el("button", { class: "link", text: m.active === false ? "הפעל" : "השבת", onclick: () => updateDoc(doc(dbs, "team", m.id), { active: m.active === false }).catch(() => status("teamStatus", "bad", "העדכון נכשל.")) })))));
  t.append(el("div", { class: "scroll" }, el("table", { class: "t" }, el("thead", {}, el("tr", {}, ...["עובד","קשר",""].map(h => el("th", { text: h })))), tb)));
}

/* ===== תזכורות ===== */
async function renderReminders(){
  const box = $("remList"); if (!box) return;
  const tomorrow = addDays(new Date(), 1);
  const ws = sundayOf(tomorrow), wid = weekId(ws);
  if (remWeekId !== wid){
    remWeekId = wid; remRows = null; box.replaceChildren(el("p", { class: "small", text: "טוען…" }));
    try {
      const [wSnap, sSnap] = await Promise.all([
        getDoc(doc(dbs, "weeks", wid)),
        new Promise((res, rej) => { const u = onSnapshot(query(collection(dbs, "signups"), where("week", "==", wid)), (s) => { u(); res(s); }, rej); })
      ]);
      remRows = { shifts: wSnap.exists() && Array.isArray(wSnap.data().shifts) ? wSnap.data().shifts : [], ups: sSnap.docs.map(d => ({ id: d.id, ...d.data() })) };
    } catch { box.replaceChildren(el("p", { class: "small", text: "לא הצלחתי לקרוא את המשמרות של מחר." })); return; }
  }
  box.replaceChildren();
  if (!remRows) return;
  const day = tomorrow.getDay();
  const rows = remRows.shifts.filter(s => s.day === day).sort((a,b) => toMin(a.start) - toMin(b.start));
  box.append(el("p", {}, el("b", { text: `מחר · ${DAYS[day]} ${dm(tomorrow)}` })));
  if (!rows.length){ box.append(el("p", { class: "small", text: "אין משמרות מחר." })); return; }
  for (const s of rows){
    const ups = remRows.ups.filter(u => u.shift === s.id);
    const line = el("div", { class: "rem" }, el("span", { class: "num", text: `${s.start}–${s.end}` }));
    if (!ups.length) line.append(el("span", { class: "pill bad", text: "אף אחד לא רשום" }));
    ups.forEach(u => {
      const member = team.find(m => (m.name || "").trim() === (u.name || "").trim());
      const text = `היי ${u.name} 👋\nתזכורת: מחר (${DAYS[day]} ${dm(tomorrow)}) את/ה במשמרת בעגלת קורטדו, ${s.start}–${s.end}.\nאם יש בעיה, עדכן/י אותי מוקדם. תודה! ☕`;
      const wa = member && waLink(member.phone, text);
      line.append(el("span", { text: u.name || "חבר צוות" }));
      if (wa) line.append(el("a", { class: "btn wa", href: wa, target: "_blank", rel: "noopener", text: "וואטסאפ" }));
      else line.append(el("button", { class: "link", text: "העתק הודעה", onclick: (ev) => copyText(text, ev.target, "העתק הודעה") }));
    });
    box.append(line);
  }
}

/* ===== יומן ותובנות ===== */
$("lSave").addEventListener("click", async () => {
  const date = $("lDate").value;
  if (!date){ status("logStatus", "warn", "בחר תאריך."); return; }
  const cust = $("lCustomers").value === "" ? null : Math.max(0, +$("lCustomers").value);
  const data = { date, customers: cust, peak: $("lPeak").value || "", weather: $("lWeather").value || "",
    promo: $("lPromo").value.trim(), notes: $("lNotes").value.trim(),
    uid: me ? me.uid : "", by: me ? (me.displayName || me.email || "") : "", at: serverTimestamp() };
  try {
    await setDoc(doc(dbs, "log", `${date}_${me.uid}`), data);
    status("logStatus", "ok", "הדיווח נשמר. תודה!");
    ["lCustomers","lPeak","lPromo","lNotes"].forEach(i => $(i).value = "");
  } catch (e){ status("logStatus", "bad", "השמירה נכשלה. נסה שוב."); }
});
const peakHour = () => {
  const counts = new Array(24).fill(0);
  logs.forEach(l => { if (l.peak) counts[+l.peak.slice(0,2)]++; });
  const max = Math.max(...counts);
  return max ? counts.indexOf(max) : null;
};
function bars(values, labels, fmt, emptyText){
  const wrap = el("div", {});
  const max = Math.max(0, ...values.filter(v => v != null));
  if (!max){ wrap.append(el("p", { class: "small", text: emptyText })); return wrap; }
  const row = el("div", { class: "bars" }), xl = el("div", { class: "xlab" });
  values.forEach((v,i) => {
    const h = v ? Math.max(2, v / max * 100) : 0;
    const b = el("div", { class: "bar", title: `${labels[i]}: ${v == null ? "אין נתונים" : fmt(v)}` });
    const lab = el("b", { text: v == null ? "" : fmt(v) }); lab.style.bottom = `calc(${h}% + 2px)`;
    const fill = el("i"); fill.style.height = h + "%";
    b.append(lab, fill); row.append(b); xl.append(el("span", { text: labels[i] }));
  });
  wrap.append(row, xl); return wrap;
}
function renderLog(){
  const withC = logs.filter(l => l.customers != null);
  const byDay = new Map();
  withC.forEach(l => { const d = fromYmd(l.date).getDay(); const e = byDay.get(d) || { sum: 0, n: 0 }; e.sum += l.customers; e.n++; byDay.set(d, e); });
  const peak = peakHour();
  const k = $("logKpis"); k.replaceChildren();
  let best = null; for (const [d,e] of byDay) if (!best || e.sum/e.n > best[1]) best = [d, e.sum/e.n];
  [[logs.length, "דיווחים"], [withC.length ? fmt1(withC.reduce((a,l) => a + l.customers, 0) / withC.length) : "—", "ממוצע לקוחות"],
   [best ? DAYS[best[0]] : "—", "היום העמוס"], [peak != null ? `${pad(peak)}:00` : "—", "שעת עומס"]]
    .forEach(([v,l]) => k.append(el("div", { class: "kpi" }, el("div", { class: "v", text: String(v) }), el("div", { class: "l", text: l }))));

  $("chartDays").replaceChildren(bars(DAYS.map((_,d) => byDay.has(d) ? byDay.get(d).sum / byDay.get(d).n : null), DAYS.map(d => d.slice(0,3)), fmt1, "עוד אין דיווחים עם מספר לקוחות."));
  const hrs = []; for (let h = 6; h <= 20; h++) hrs.push(h);
  const counts = new Array(24).fill(0); logs.forEach(l => { if (l.peak) counts[+l.peak.slice(0,2)]++; });
  $("chartHours").replaceChildren(bars(hrs.map(h => counts[h] || null), hrs.map(String), String, "עוד לא סומנו שעות עומס."));

  const rc = $("reco"); rc.replaceChildren();
  if (withC.length >= MIN_ENTRIES){
    if (peak != null) rc.append(el("p", { text: `העומס מגיע בדרך כלל ב-${pad(peak)}:00. כדאי לפרסם בסביבות ${pad(Math.max(6, peak-2))}:00.` }));
    const ranked = [...byDay].map(([d,e]) => [d, e.sum/e.n]).sort((a,b) => a[1]-b[1]);
    if (ranked.length >= 2) rc.append(el("p", { text: `${DAYS[ranked[0][0]]} הכי שקט (${fmt1(ranked[0][1])} לקוחות), ${DAYS[ranked[ranked.length-1][0]]} הכי עמוס (${fmt1(ranked[ranked.length-1][1])}). כדאי לכוון מבצע ל${DAYS[ranked[0][0]]}.` }));
    const yes = withC.filter(l => l.promo), no = withC.filter(l => !l.promo);
    if (yes.length >= 2 && no.length >= 2){
      const a = yes.reduce((s,l) => s+l.customers, 0)/yes.length, b = no.reduce((s,l) => s+l.customers, 0)/no.length;
      rc.append(el("p", { text: a > b ? `במשמרות עם מבצע היו ${fmt1(a-b)} לקוחות יותר בממוצע.` : `מבצעים עוד לא הראו עלייה (${fmt1(a)} מול ${fmt1(b)}).` }));
    }
  } else rc.append(el("p", { text: `אחרי ${MIN_ENTRIES} דיווחים יופיעו כאן המלצות. יש ${withC.length}.` }));

  const rw = $("recentWrap"), rec = $("recent");
  rw.hidden = !logs.length; rec.replaceChildren();
  if (logs.length){
    const tb = el("tbody");
    logs.slice(0, 14).forEach(l => tb.append(el("tr", {},
      el("td", { class: "num", text: dm(fromYmd(l.date)) }), el("td", { text: l.by || "" }),
      el("td", { class: "num", text: l.customers == null ? "—" : String(l.customers) }),
      el("td", { class: "num", text: l.peak || "—" }), el("td", { text: l.weather || "—" }), el("td", { text: l.promo || "" }))));
    rec.append(el("div", { class: "scroll" }, el("table", { class: "t" },
      el("thead", {}, el("tr", {}, ...["תאריך","מי דיווח","לקוחות","עומס","מזג אוויר","מבצע"].map(h => el("th", { text: h })))), tb)));
  }
  dateHint();
}

render(); renderLog();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
