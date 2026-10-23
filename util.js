// עזרים טהורים, בלי Firebase: גם האפליקציה (דרך core.js) וגם דף העובד (z.js) מייבאים מכאן.
// עד 23.10.2026 לדף העובד היה עותק משלו, וכבר פעם אחת הוא סטה (רשימת החגים).
import { HOLIDAYS } from "./playbook.js";

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
