// תשתית משותפת: Firebase, עזרים, מצב גלובלי.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, documentId }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig, OWNER_EMAILS, WORKER_URL } from "./config.js";
import { HOLIDAYS } from "./playbook.js";

export { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, documentId,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
  OWNER_EMAILS, WORKER_URL };

/* ===== Firebase ===== */
const fbApp = initializeApp(firebaseConfig);
export const auth = getAuth(fbApp);
let _db;
try { _db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch { _db = getFirestore(fbApp); }
export const db = _db;
export const provider = new GoogleAuthProvider();

/* ===== עזרים ===== */
export const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
export const DAYS_SHORT = ["א","ב","ג","ד","ה","ו","ש"];

export const $ = (id) => document.getElementById(id);
export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const dm = (d) => `${d.getDate()}.${d.getMonth()+1}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
export const fromYmd = (s) => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y, m-1, d); };
export const sundayOf = (d) => { const s = new Date(d.getFullYear(), d.getMonth(), d.getDate()); s.setDate(s.getDate()-s.getDay()); return s; };
export const toMin = (t) => { const [h,m] = String(t).split(":").map(Number); return h*60+(m||0); };
export const fromMin = (m) => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
export const fmt1 = (n) => (Math.round(n*10)/10).toString();
export const weekId = (ws) => "w" + ymd(ws);
export const holidayOn = (d) => HOLIDAYS.find(h => h[0] === (typeof d === "string" ? d : ymd(d)));

export function el(tag, attrs = {}, ...kids){
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
export function clear(node){ while (node && node.firstChild) node.removeChild(node.firstChild); return node; }

export const status = (id, kind, msg) => {
  const n = $(id); if (!n) return;
  n.className = "status " + (kind || ""); n.textContent = msg || "";
};

export function waLink(phone, text){
  let p = String(phone || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1); else if (p.startsWith("0")) p = "972" + p.slice(1);
  return p.length >= 11 ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null;
}

export async function copyText(text, btn, label){
  try { await navigator.clipboard.writeText(text); if (btn) btn.textContent = "הועתק ✓"; }
  catch { prompt("העתק:", text); }
  if (btn && label) setTimeout(() => btn.textContent = label, 1800);
}

export function download(name, text, mime = "text/plain;charset=utf-8"){
  const blob = new Blob(["﻿" + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function withBusy(btn, fn){
  if (!btn) return fn();
  const t = btn.textContent; btn.disabled = true; btn.textContent = "רגע…";
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = t; }
}

/* ===== השרת ===== */
export async function api(path, body){
  if (!WORKER_URL) throw new Error("השרת עוד לא מוגדר.");
  if (!auth.currentUser) throw new Error("צריך להיכנס מחדש.");
  const token = await auth.currentUser.getIdToken();
  const r = await fetch(WORKER_URL.replace(/\/$/, "") + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || "השרת החזיר שגיאה.");
  return data;
}

/* ===== מצב משותף ===== */
// השבוע שהאפליקציה נפתחת עליו: השבוע הנוכחי, ומיום שישי כבר השבוע הבא.
// מיוצא כפונקציה ולא כערך, כדי ש-app.js יוכל לחשב אותו מחדש כשחוזרים
// ללשונית אחרי שעברה חצות — ולא להיתקע על השבוע שהיה בזמן הטעינה.
export function defaultWeekStart(){
  const t = new Date(); const s = sundayOf(t);
  if (t.getDay() >= 5) s.setDate(s.getDate() + 7);
  return s;
}

export const S = {
  me: null, isOwner: false, isMember: false,
  weekStart: defaultWeekStart(),
  week: null, availability: [], signups: [],
  posts: [], team: [], roster: [], logs: [], members: [], joinReqs: [], sales: [],
  memory: null, timing: null, reach: null, creative: {},
  memberNames: {}, rosterNames: {},
  subs: [],
};

/* track מחזיר עוטף שמוציא את עצמו מהרשימה. בלעדיו כל ניווט בין שבועות
   וכל מחזור כניסה־יציאה הוסיף סגירה מתה ל-S.subs, שלא נוקתה לעולם —
   ואחרי חמישים ניווטים dropSubs רץ על מאות סגירות שכבר בוטלו. */
export function track(unsub){
  if (typeof unsub !== "function") return unsub;
  const wrapped = () => {
    const i = S.subs.indexOf(wrapped);
    if (i >= 0) S.subs.splice(i, 1);
    try { unsub(); } catch {}
  };
  S.subs.push(wrapped);
  return wrapped;
}
export function dropSubs(){ const all = S.subs.slice(); S.subs = []; all.forEach(u => { try { u(); } catch {} }); }

export const nameOf = (uid) => (S.me && uid === S.me.uid) ? "אתה" : (S.memberNames[uid] || "חבר צוות");

// רשומה של זמינות או שיבוץ יכולה להגיע משני מקורות: קישור אישי (token) או כניסה עם גוגל (uid).
export function whoOf(rec){
  if (!rec) return "חבר צוות";
  if (rec.token) return S.rosterNames[rec.token] || rec.name || "חבר צוות";
  if (rec.uid) return nameOf(rec.uid);
  return rec.name || "חבר צוות";
}
export const keyOf = (rec) => (rec && (rec.token || rec.uid)) || "";

// קוד אקראי לקישור אישי. 20 תווים, ~100 ביט — לא ניתן לניחוש.
export function makeToken(){
  const a = new Uint8Array(15);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const zLink = (token) => location.href.replace(/[^/]*$/, "") + "z.html#" + token;

/* ===== מגשר עדכונים בין המודולים ===== */
const listeners = {};
export function on(evt, fn){ (listeners[evt] ||= []).push(fn); }
export function emit(evt, payload){ (listeners[evt] || []).forEach(fn => { try { fn(payload); } catch (e){ console.error(e); } }); }
