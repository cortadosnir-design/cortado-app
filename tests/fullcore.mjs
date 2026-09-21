// מייצר tests/stubs/core-full.js: core.js האמיתי, רק ש-Firebase מוחלף בדמה.
// כל העוזרים (el, whoOf, makeToken, holidayOn, S, on/emit…) נשארים מילה במילה.
import { readFileSync, writeFileSync } from "fs";
const ROOT = new URL("..", import.meta.url).pathname;

const FAKE_HEAD = `// נוצר אוטומטית מ-core.js ע"י tests/fullcore.mjs — לא לערוך.
import { OWNER_EMAILS, WORKER_URL } from "../../config.js";
import { HOLIDAYS } from "../../playbook.js";
export { OWNER_EMAILS, WORKER_URL };

/* ===== Firestore מזויף, עם הלוך-חזור אמיתי ===== */
const store = {};
const snapLs = new Set();
window.__store = store; window.__writes = [];
const col = (c) => (store[c] = store[c] || {});
const now = () => ({ seconds: Math.floor(Date.now() / 1000), toDate(){ return new Date(this.seconds * 1000); } });
const TS = Symbol("ts");
export const serverTimestamp = () => TS;
const resolve = (body) => Object.fromEntries(Object.entries(body).map(([k, v]) => [k, v === TS ? now() : v]));
export const db = {};
export const doc = (_db, c, id) => ({ col: c, id });
export const collection = (_db, c) => ({ col: c, wheres: [] });
export const where = (field, op, val) => ({ field, op, val });
export const orderBy = () => null;
export const limit = () => null;
export const query = (ref, ...cl) => ({ col: ref.col, wheres: [...(ref.wheres || []), ...cl.filter(c => c && c.field)] });
const matches = (d, w) => w.every(x => x.op === "==" ? d[x.field] === x.val : true);
const snapDoc = (id, data) => ({ id, exists: () => !!data, data: () => data || {} });
const snapQuery = (q) => { const docs = Object.entries(col(q.col)).filter(([, d]) => matches(d, q.wheres || [])).map(([id, d]) => snapDoc(id, d));
  return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) }; };
export async function getDoc(ref){ return snapDoc(ref.id, col(ref.col)[ref.id]); }
export async function getDocs(q){ return snapQuery(q); }
function fire(){ for (const l of [...snapLs]) l.fn(l.t.id !== undefined ? snapDoc(l.t.id, col(l.t.col)[l.t.id]) : snapQuery(l.t)); }
export function onSnapshot(t, fn){ const l = { t, fn }; snapLs.add(l); setTimeout(() => { if (snapLs.has(l)) l.fn(t.id !== undefined ? snapDoc(t.id, col(t.col)[t.id]) : snapQuery(t)); }, 0); return () => snapLs.delete(l); }
export async function setDoc(ref, body, opts){
  const cur = col(ref.col)[ref.id];
  col(ref.col)[ref.id] = (opts && opts.merge && cur) ? { ...cur, ...resolve(body) } : resolve(body);
  window.__writes.push({ col: ref.col, id: ref.id, keys: Object.keys(body) }); fire();
}
export async function updateDoc(ref, body){ col(ref.col)[ref.id] = { ...(col(ref.col)[ref.id] || {}), ...resolve(body) }; window.__writes.push({ col: ref.col, id: ref.id, keys: Object.keys(body) }); fire(); }
export async function deleteDoc(ref){ delete col(ref.col)[ref.id]; window.__writes.push({ col: ref.col, id: ref.id, del: true }); fire(); }
window.__seed = (c, id, data) => { col(c)[id] = resolve(data); };
window.__fire = fire;

/* ===== Auth מזויף: המנהל כבר מחובר ===== */
const USER = { uid: "owner1", email: OWNER_EMAILS[0], displayName: "סניר", photoURL: "", getIdToken: async () => "t" };
export const auth = { currentUser: USER };
export const provider = {};
export const storage = {};
export const GoogleAuthProvider = function(){};
export const signInWithPopup = async () => ({ user: USER });
export const signInWithRedirect = async () => {};
export const getRedirectResult = async () => null;
export const signOut = async () => {};
export const onAuthStateChanged = (_a, cb) => { setTimeout(() => cb(USER), 0); return () => {}; };
export const sRef = () => ({}); export const uploadBytes = async () => { throw new Error("no storage"); }; export const getDownloadURL = async () => "";
`;

const FAKE_API = `/* ===== השרת (מזויף) ===== */
window.__api = window.__api || {}; window.__apiCalls = [];
export async function api(path, body){
  window.__apiCalls.push({ path, body });
  const h = window.__api[path];
  if (!h) throw new Error("אין דמה לנתיב " + path);
  if (h.fail) throw new Error(h.fail);
  return typeof h === "function" ? h(body) : h;
}
`;

export function buildFullCore(){
  const src = readFileSync(ROOT + "core.js", "utf8");
  const helpers = src.indexOf("/* ===== עזרים ===== */");
  const apiStart = src.indexOf("/* ===== השרת ===== */");
  const apiEnd = src.indexOf("/* ===== מצב משותף ===== */");
  const out = FAKE_HEAD + "\n" + src.slice(helpers, apiStart) + FAKE_API + "\n" + src.slice(apiEnd);
  writeFileSync(ROOT + "tests/stubs/core-full.js", out);
}
