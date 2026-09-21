// דמה של core.js: אותם עוזרי DOM, ו-Firestore מזויף שבאמת עושה הלוך-חזור.
export const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
export const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const dm = (d) => `${d.getDate()}.${d.getMonth()+1}`;
export const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
export const fromYmd = (s) => { const [y,m,d]=String(s).split("-").map(Number); return new Date(y,m-1,d); };
export const toMin = (t) => { const [h,m]=String(t).split(":").map(Number); return h*60+(m||0); };
export const weekId = (ws) => "w" + ymd(ws);
export const fmt1 = (n) => (Math.round(n*10)/10).toString();
export const holidayOn = () => null;
export function el(tag, attrs = {}, ...kids){
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k != null) e.append(typeof k === "string" ? document.createTextNode(k) : k);
  return e;
}
export function clear(node){ while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
export const status = (id, kind, msg) => { const n=$(id); if(!n) return; n.className="status "+(kind||""); n.textContent=msg||""; };
export const copyText = async (t) => { window.__copied = t; };
export const download = (n, c) => { window.__downloaded = { name:n, size:(c||"").length }; };
export const withBusy = async (b, fn) => fn();
export const WORKER_URL = "https://example.invalid";

// ── רשת מזויפת: הבדיקה קובעת מה חוזר ומה נופל ──
window.__apiCalls = [];
export const api = async (path, body) => {
  window.__apiCalls.push({ path, body });
  const h = (window.__api || {})[path];
  if (!h) throw new Error("no stub for " + path);
  if (h.fail) throw new Error(h.fail);
  return typeof h === "function" ? h(body) : h;
};

// ── אפיק אירועים ──
const bus = {};
export const on = (k, fn) => { (bus[k] = bus[k] || []).push(fn); };
export const emit = (k, v) => (bus[k] || []).forEach(fn => fn(v));

// ── Firestore מזויף ──
const store = { posts:{}, brand:{}, creative:{}, log:{} };
window.__store = store;
window.__writes = [];
const listeners = [];
export const db = {};
export const collection = (_db, name) => ({ col: name });
export const query = (c) => c;
export const orderBy = () => null;
export const limit = () => null;
export const doc = (_db, col, id) => ({ col, id });
export const serverTimestamp = () => ({ __ts: Date.now() });
function fire(e){
  const t = e.target;
  if (t.id !== undefined){
    const d = (store[t.col] || {})[t.id];
    e.cb({ exists: () => !!d, data: () => d || {} });
  } else {
    e.cb({ docs: Object.entries(store[t.col] || {}).map(([id, data]) => ({ id, data: () => data })) });
  }
}
export function onSnapshot(target, cb){
  const e = { target, cb };
  listeners.push(e);
  setTimeout(() => fire(e), 0);
  return () => { const i = listeners.indexOf(e); if (i >= 0) listeners.splice(i, 1); };
}
export async function getDoc(ref){
  const d = (store[ref.col] || {})[ref.id];
  return { id: ref.id, exists: () => !!d, data: () => d || {} };
}
export async function setDoc(ref, body, opts){
  store[ref.col] = store[ref.col] || {};
  store[ref.col][ref.id] = (opts && opts.merge)
    ? { ...(store[ref.col][ref.id] || {}), ...body } : { ...body };
  window.__writes.push({ col: ref.col, id: ref.id, keys: Object.keys(body),
    bytes: JSON.stringify(body).length });
  listeners.slice().forEach(fire);
}
export async function deleteDoc(ref){ delete (store[ref.col] || {})[ref.id]; listeners.slice().forEach(fire); }
export const track = () => {};
const st = new Date(); st.setDate(st.getDate() - st.getDay());
export const S = { isOwner: true, week: null, roster: [], availability: [], signups: [], weekStart: new Date(st.getFullYear(), st.getMonth(), st.getDate()),
  posts: [], memory: null, timing: null, creative: {}, logs: [] };
