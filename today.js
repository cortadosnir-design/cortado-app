// "היום": מה קורה בעגלה עכשיו, ומה משנים בלחיצה אחת.
//
// בעל עגלה לא מתכנן את היום מראש — יורד גשם וסוגרים ב-11:00, מגיעה
// קבוצת אופניים ונשארים עוד שעה, מישהו חולה ולא פותחים. כל אחד מאלה היה
// מסע: לגלול לטופס, לבחור שעה מרשימה של 76, לגלול ל"שגר", לאשר חלון.
// כאן זו נגיעה על הפעולה ונגיעה על השעה, והשינוי נפתח כהודעה מוכנה בצ'אט עם בוט קורטדו.
// הבוט מכין טיוטה, ואחרי "כן" מפרסם לדף, לפייסבוק ולגוגל — אותה שרשרת כמו כל שינוי שעות.
// המשמרות והשיבוצים לא זזים.
import { S, db, DAYS, $, el, clear, dm, toMin, fromMin, waLink, copyText, whoOf, on, track, addDays, fromYmd,
  collection, query, where, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, status } from "./core.js";
import { rangesOf, overrideOf, hoursTextOf, regularHours, parseDayHours, botShiftsOf, botNamesOf } from "./shifts.js";
import * as H from "./hoursync.js";

const GBP_URL = "https://business.google.com/";
let signups = [];
let panel = null;           // "early" | "later" | "open" | "swap"
let gone = null;            // מי ירד היום: { name, shifts: [id] } — בשביל "מי מחליף"
let last = null;            // { msg, undo, people, text }
let lastTimer = 0;
let subbed = "";

export function subscribe(){
  if (!S.isOwner) return;
  subbed = H.currentWid();
  track(onSnapshot(query(collection(db, "signups"), where("week", "==", H.currentWid())),
    (snap) => { signups = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); }, () => {}));
  track(onSnapshot(doc(db, "brand", "hours"),
    (snap) => { S.regularHours = snap.exists() ? snap.data().days : null; renderRegular(); }, () => {}));
}

/* ===== שעות קבועות: עורכים באפליקציה, לא בקוד ===== */
function renderRegular(){
  const box = $("regForm"); if (!box) return;
  clear(box);
  regularHours().forEach((rs, i) => box.append(el("label", {}, DAYS[i],
    el("input", { type: "text", dir: "ltr", inputmode: "numeric", "data-day": i, placeholder: "סגור",
      value: rs.map(([a, b]) => `${a}–${b}`).join(", ") }))));
}
async function saveRegular(){
  const inputs = [...document.querySelectorAll("#regForm input")];
  const days = [], bad = [];
  inputs.forEach((n, i) => {
    const raw = n.value.trim(), rs = parseDayHours(raw);
    // מה שהוקלד ולא נקרא הוא טעות הקלדה, לא "סגור" — עוצרים ואומרים איפה.
    if (raw && !rs.length) bad.push(DAYS[i]);
    days.push(rs.map(([a, b]) => `${a}–${b}`).join(", "));
  });
  if (bad.length){ status("regStatus", "warn", "לא הבנתי את השעות ב" + bad.join(", ") + ". כתוב כמו 09:00–12:00."); return; }
  try { await setDoc(doc(db, "brand", "hours"), { days, at: serverTimestamp() }); status("regStatus", "ok", "נשמר. כל שבוע חדש ייבנה מזה."); }
  catch { status("regStatus", "bad", "לא נשמר. רק המנהל יכול."); }
}

const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const up = (m, step) => Math.ceil(m / step) * step;
const clamp = (m) => Math.min(23 * 60 + 30, Math.max(5 * 60, m));
const str = (rs) => rs.map(([a, b]) => `${fromMin(a)}–${fromMin(b)}`);
const toValue = (rs) => rs.length ? { ranges: str(rs) } : { closed: true };

/** מי עובד היום: שמות, ומי מהם אפשר להגיע אליו בוואטסאפ. */
function peopleToday(data, day){
  // הסידור מהבוט: שמות בלבד, הטלפון מרשימת הצוות. אין מסמכי שיבוץ להוריד.
  const bot = botShiftsOf(data);
  if (bot) return [...new Set(bot.flatMap((s, k) => s.day === day ? botNamesOf(H.currentWid(), k) : []))]
    .map(name => { const r = S.roster.find(x => x.name === name); return { name, phone: r && r.phone, docs: [] }; });
  const ids = new Set(((data && data.shifts) || []).filter(s => s.day === day).map(s => s.id));
  const byName = new Map();
  for (const u of signups.filter(x => ids.has(x.shift))){
    const name = whoOf(u);
    if (byName.has(name)){ byName.get(name).docs.push(u); continue; }
    const r = S.roster.find(x => (u.token && x.token === u.token) || (x.name && x.name === name));
    byName.set(name, { name, phone: r && r.phone, docs: [u] });
  }
  return [...byName.values()];
}

/* שינוי שעות יום אחד: נפתח בבוט כהודעה מוכנה. value: { ranges } / { closed } / null = לפי המשמרות,
   ואז נשלחות השעות עצמן מהמשמרות, כדי שלבוט יהיה מה לפרסם. */
function hoursLine(value, data, day){
  if (!value){ const rs = rangesOf({ ...(data || {}), hoursOverride: null }, day); return rs.length ? rs.map(([a, b]) => `${a}–${b}`).join(", ") + " (לפי המשמרות)" : "העגלה סגורה"; }
  return value.closed ? "העגלה סגורה" : value.ranges.join(", ");
}
function toBot(date, value, data){
  const day = date.getDay();
  window.open(H.botLink(`שעות הפתיחה ביום ${DAYS[day]} ${dm(date)}: ${hoursLine(value, data, day)}`), "_blank", "noopener");
}
function apply(day, value, msg, workerText){
  const data = H.weeks[H.currentWid()];
  const people = peopleToday(data, day);
  toBot(new Date(), value, data);   // לפני כל await: דפדפן בטלפון חוסם חלון שנפתח אחרי המתנה
  panel = null;
  last = { msg: msg + " נשלח לבוט: אחרי \"כן\" שם זה יוצא ללקוחות.", people, text: workerText };
  clearTimeout(lastTimer);
  lastTimer = setTimeout(() => { last = null; render(); }, 45000);
  render();
}

function chip(text, onclick, cls = ""){ return el("button", { type: "button", class: cls, text, onclick }); }

export function render(){
  const box = $("todayCard"); if (!box) return;
  const id = H.currentWid(), data = H.weeks[id];
  if (!S.isOwner || !S.me || data === undefined){ box.hidden = true; return; }
  box.hidden = false; clear(box);

  const t = new Date(), day = t.getDay(), now = nowMin();
  const ranges = rangesOf(data, day).map(([a, b]) => [toMin(a), toMin(b)]);
  const ov = overrideOf(data, day);
  const openR = ranges.find(([a, b]) => now >= a && now < b);
  const next = ranges.find(([a]) => a > now);
  const ended = ranges.length && !openR && !next;

  let kicker = "היום", big, dot = "off";
  if (openR){ kicker = "פתוח עכשיו"; big = "עד " + fromMin(openR[1]); dot = "open"; }
  else if (next){ big = "נפתח ב-" + fromMin(next[0]); dot = "soon"; }
  else if (ended) big = "סיימנו להיום";
  else big = "סגור היום";

  const people = peopleToday(data, day);
  box.append(el("div", { class: "tkick" }, el("span", { class: "tdot " + dot }), el("span", { text: kicker }),
    el("span", { class: "tdate", text: `${DAYS[day]} ${dm(t)}` })));
  box.append(el("div", { class: "tbig", text: big }));
  // השעות בבידוד משמאל לימין — אחרת "09:30–12:30" מתהפך ל-"12:30–09:30".
  box.append(el("div", { class: "tline" },
    ranges.length ? el("bdi", { dir: "ltr", text: str(ranges).join(" · ") }) : "סגור",
    " · " + (people.length ? people.map(p => p.name).join(", ") : "אף אחד לא משובץ")));

  if (ov) box.append(el("div", { class: "tov" },
    el("span", { text: "השעות של היום שונו ידנית" }),
    chip("חזרה לרגיל", () => apply(day, null, "חזרנו לשעות הרגילות של היום.", ""), "link")));

  // הפעולות. כל אחת פותחת שורת שעות אחת, והנגיעה על השעה היא השמירה.
  const acts = el("div", { class: "todayacts" });
  const toggle = (p) => () => { panel = panel === p ? null : p; gone = null; render(); };
  if (openR || next){
    acts.append(chip("סוגרים מוקדם", toggle("early"), panel === "early" ? "on" : ""));
    acts.append(chip("נשארים עוד", toggle("later"), panel === "later" ? "on" : ""));
    if (!openR) acts.append(chip("לא פותחים היום", () => apply(day, { closed: true }, "היום העגלה סגורה.", "היום העגלה לא נפתחת, המשמרת שלך מבוטלת. סליחה על ההודעה המאוחרת.")));
  } else {
    acts.append(chip(ended ? "פותחים שוב" : "פותחים היום בכל זאת", toggle("open"), panel === "open" ? "on" : ""));
  }
  if (people.length && !ended && !botShiftsOf(data)) acts.append(chip("מישהו לא מגיע", toggle("swap"), panel === "swap" ? "on" : ""));
  box.append(acts);

  if (panel){
    const row = el("div", { class: "tchips" });
    if (panel === "early"){
      const cur = openR || next;
      const from = openR ? now : cur[0];
      if (openR){
        const T = up(now, 5);
        row.append(chip("עכשיו", () => closeAt(day, ranges, T, true)));
      }
      for (let m = up(from + 15, 30); m <= cur[1] - 15 && row.children.length < 5; m += 30)
        row.append(chip(fromMin(m), () => closeAt(day, ranges, m)));
      if (!openR) row.append(chip("לא פותחים בכלל", () => apply(day, { closed: true }, "היום העגלה סגורה.", "היום העגלה לא נפתחת, המשמרת שלך מבוטלת.")));
    }
    if (panel === "later"){
      const i = openR ? ranges.indexOf(openR) : ranges.length - 1;
      for (const add of [30, 60, 90, 120]){
        const T = clamp(ranges[i][1] + add);
        row.append(chip(`${add < 60 ? add + " דק׳" : add === 60 ? "שעה" : add === 120 ? "שעתיים" : "שעה וחצי"} · עד ${fromMin(T)}`, () => {
          const rs = ranges.map((r, k) => k === i ? [r[0], T] : r).filter(([a], k) => k <= i || a > T);
          apply(day, toValue(rs), `היום נשארים עד ${fromMin(T)}.`, `היום נשארים עד ${fromMin(T)}.`);
        }));
      }
    }
    if (panel === "swap"){
      // שלב 1: מי לא מגיע. שלב 2 (gone): מי מחליף — לשאול בוואטסאפ, או לשבץ ישר.
      if (!gone) for (const p of people) row.append(chip("בלי " + p.name, () => dropOut(p, ranges)));
      else {
        const here = new Set(people.map(p => p.name));
        // ponytail: כל הצוות הפעיל בלי סדר לפי זמינות; למיין לפי availability של היום אם הרשימה תגדל.
        const cands = S.roster.filter(r => r.active !== false && r.token && !here.has(r.name) && r.name !== gone.name);
        row.append(el("div", { class: "small grow", text: cands.length ? `מי מחליף את ${gone.name}?` : "אין עוד עובדים ברשימה." }));
        for (const r of cands){
          const ask = waLink(r.phone, `היי ${r.name}, ${gone.name} לא יכול/ה להגיע היום (${str(ranges).join(", ")}). תוכל/י להחליף?`);
          row.append(el("div", { class: "tswap" }, el("b", { text: r.name }),
            ask ? el("a", { class: "btn wa", href: ask, target: "_blank", rel: "noopener", text: "לשאול" }) : null,
            chip("שבץ", () => fillIn(r))));
        }
        row.append(chip("סגור", () => { gone = null; panel = null; render(); }, "link"));
      }
    }
    if (panel === "open"){
      const s = up(now, 5);
      const reg = (regularHours()[day] || []).map(([a, b]) => [Math.max(toMin(a), s), toMin(b)]).filter(([a, b]) => b - a >= 30);
      if (reg.length) row.append(chip("כרגיל · " + str(reg).join(", "), () =>
        apply(day, toValue(reg), `היום פותחים ${str(reg).join(", ")}.`, `היום בכל זאת פותחים, ${str(reg).join(", ")}.`)));
      for (const len of [60, 120]){
        const rs = [[s, clamp(s + len)]];
        row.append(chip(`עכשיו, ל${len === 60 ? "שעה" : "שעתיים"}`, () =>
          apply(day, toValue(rs), `פותחים עכשיו, עד ${fromMin(rs[0][1])}.`, `פותחים עכשיו, עד ${fromMin(rs[0][1])}.`)));
      }
    }
    box.append(row);
  }

  if (last){
    const toast = el("div", { class: "todaytoast", role: "status" }, el("span", { class: "grow", text: last.msg }));
    if (last.undo) toast.append(chip("בטל", () => last.undo()));
    for (const p of (last.people || [])){
      const wa = p.phone && last.text && waLink(p.phone, `היי ${p.name}, ${last.text}`);
      if (wa) toast.append(el("a", { class: "btn", href: wa, target: "_blank", rel: "noopener", text: "וואטסאפ ל" + p.name }));
    }
    box.append(toast);
  }

  box.append(syncLine(id, data, day, ov));
}

/* מישהו חולה. השיבוץ שלו יורד (עם "בטל" שמחזיר את אותם מסמכים בדיוק),
   והשעות לא זזות — העגלה פתוחה, רק צריך מחליף. */
async function dropOut(p, ranges){
  const saved = p.docs.map(u => ({ ...u }));
  try { await Promise.all(saved.map(u => deleteDoc(doc(db, "signups", u.id)))); }
  catch { last = { msg: "לא נשמר. רק המנהל יכול.", people: [] }; render(); return; }
  gone = { name: p.name, shifts: [...new Set(saved.map(u => u.shift))] };
  last = { msg: `${p.name} ירד/ה מהמשמרת של היום.`, people: [], undo: async () => {
    await Promise.all(saved.map(({ id, ...body }) => setDoc(doc(db, "signups", id), body)));
    gone = null; panel = null; last = { msg: "בוטל. השיבוץ חזר.", people: [] }; render();
  } };
  render();
}
async function fillIn(r){
  const wid = H.currentWid();
  try {
    // אותו מסמך בדיוק כמו שיבוץ ידני בלוח (shifts.js assign), כדי שהתזכורות והספירה יכירו בו.
    await Promise.all(gone.shifts.map(sh => setDoc(doc(db, "signups", `${wid}_${sh}_${r.token}`),
      { week: wid, shift: sh, token: r.token, name: (r.name || "").slice(0, 60), at: serverTimestamp() })));
  } catch { last = { msg: "השיבוץ לא נשמר.", people: [] }; render(); return; }
  last = { msg: `${r.name} משובץ/ת היום במקום ${gone.name}.`, people: [] };
  gone = null; panel = null; render();
}

function closeAt(day, ranges, T, now = false){
  const rs = ranges.filter(([a]) => a < T).map(([a, b]) => [a, Math.min(b, T)]).filter(([a, b]) => b > a);
  const msg = rs.length ? (now ? "סגורים מעכשיו." : `היום נסגרים ב-${fromMin(T)}.`) : "היום העגלה סגורה.";
  apply(day, toValue(rs), msg, rs.length ? `היום סוגרים ב-${fromMin(T)}.` : "היום העגלה לא נפתחת, המשמרת שלך מבוטלת.");
}

/* איפה השעות עומדות ללקוחות: מה שהבוט רשם על השבוע (sync). שינוי כאן לא
   מתפרסם מכאן — אומרים את זה, כדי ששינוי שנשמר לא ייראה כמו שינוי שיצא. */
function syncLine(id, data, day, ov){
  const line = el("div", { class: "tsync" });
  const sync = data && data.sync;
  if (sync && sync.page === "ok") line.append(el("span", { class: "okc", text: "דף העגלה ✓" }));
  if (ov || !sync) line.append(el("span", { text: "ללקוחות: דרך בוט קורטדו" }));
  if (H.googleFresh(data)) line.append(el("span", { class: "okc", text: "גוגל ✓" }));
  else line.append(chip("גוגל: העתק ופתח", async (e) => {
    const t = new Date();
    const text = (ov ? `היום, ${DAYS[day]} ${dm(t)}: ${rangesOf(data, day).map(([a, b]) => `${a}–${b}`).join(", ") || "סגור"}\n\n` : "")
      + hoursTextOf(data, H.curStart());
    // החלון נפתח לפני ה-await, אחרת דפדפן בטלפון חוסם אותו כחלון קופץ.
    window.open(GBP_URL, "_blank", "noopener");
    await copyText(text, e.currentTarget, "");
    try { await H.markGoogle(id, data); } catch {}
  }, "primary"));
  return line;
}

export function init(){
  renderRegular();
  const rs = $("regSave"); if (rs) rs.addEventListener("click", saveRegular);
  on("hoursync", render);
  on("state", render);
  // שבוע שהמנהל שינה בו יום מתוך לוח הניהול (שורת "ללקוחות")
  on("override", ({ day, value, id }) => toBot(addDays(fromYmd(id.slice(1)), day), value, H.weeks[id] || S.week));
  // הזמן זז: "פתוח עכשיו" צריך להתחלף ל"סיימנו" בלי רענון.
  setInterval(() => { if (!document.hidden && !panel) render(); }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (subbed && subbed !== H.currentWid()){ H.refresh(); subscribe(); }
    render();
  });
}
