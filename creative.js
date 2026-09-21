// קריאייטיב: ארבע משבצות קבועות בשבוע, בנק קליפים, טיוטה אחת שנשענת על הקול שלך, ושער ההוספה.
// העיקרון: הקצב נקבע פעם אחת. כל שבוע רק ממלאים את המשבצות. משבצת ריקה היא משימה, לא חור בלוח.
import { S, db, DAYS, $, el, clear, ymd, dm, addDays, fromYmd, toMin, holidayOn,
  status, copyText, download, withBusy, api, WORKER_URL, track, on, emit,
  doc, getDoc, setDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot, serverTimestamp
  } from "./core.js";
import { FORMATS, TIMING, HASHTAGS, VOICE, COMPETITORS, TEMPLATES, templateOf, templatesFor } from "./playbook.js";
import * as Card from "./card.js";
import { openDays, phase, wid, hoursByDay } from "./shifts.js";
import * as Weather from "./weather.js";
import * as Season from "./season.js";

/* ===== שלושת העמודים ===== */
export const PILLAR3 = {
  process: { label: "הקפה בתהליך",   note: "קיטור, מזיגה, ידיים, המכונה. 7–15 שניות, בלי דיבור." },
  place:   { label: "המקום והאנשים", note: "הנוף, הצוות, לקוח קבוע, מה קרה היום. הסיפור לפני הקפה." },
  when:    { label: "מתי ואיפה",     note: "שעות הסופ״ש ואיך מגיעים. הפוסט שמביא אנשים בפועל." },
};
// הקצב הקבוע. נקבע פעם אחת, אפשר לשנות בהגדרות.
const DEFAULT_SLOTS = [
  { key: "s1", pillar: "when",    day: 4, time: "17:30", format: "static" },
  { key: "s2", pillar: "process", day: 2, time: "10:30", format: "reel" },
  { key: "s3", pillar: "place",   day: 0, time: "10:00", format: "reel" },
  { key: "s4", pillar: "place",   day: 5, time: "08:00", format: "static" },
];
const NETS = ["facebook", "instagram"];   // תמיד שתי הרשתות. הפצה, לא בחירה.
const WORDS = [20, 25];                   // יעד אורך לפוסט. קצר מנצח בפיד ישראלי.

let editing = null;          // מזהה הפוסט הנערך
let editSlot = null;         // המשבצת שהפוסט שייך לה
let aiOrigin = null;         // הטיוטה שה-AI הציע, כדי ללמוד מהתיקון ולשמור על שער ההוספה
let lastShoot = "";          // הצעת הצילום מהטיוטה האחרונה
let pendingImage = null;
let composerPhoto = null;   // data URL מוקטן, נשלח ל-AI כדי שיראה את התמונה
let composerThumb = null;   // ~170px, נשמר במסמך הפוסט ומצויר בלוח
let rhythm = null;           // brand/rhythm
let clips = [];              // brand/clips.items
let cardUrl = null;          // הכרטיס שנבנה — התמונה שתתפרסם בפועל

const STATUS_LABEL = { idea: "טיוטה", ready: "מוכן", scheduled: "מתוזמן", done: "פורסם" };
const DONE = ["ready", "scheduled", "done"];

/* ===== האזנה ===== */
export function subscribe(){
  track(onSnapshot(query(collection(db, "posts"), orderBy("date", "desc"), limit(150)),
    (snap) => { S.posts = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); },
    () => {}));
  track(onSnapshot(doc(db, "brand", "memory"),
    (snap) => { S.memory = snap.exists() ? snap.data() : null; renderMemory(); },
    () => {}));
  track(onSnapshot(doc(db, "brand", "timing"),
    (snap) => { S.timing = snap.exists() ? snap.data() : null; },
    () => {}));
  track(onSnapshot(doc(db, "brand", "rhythm"),
    (snap) => { rhythm = snap.exists() ? snap.data() : null; renderRhythm(); render(); },
    () => {}));
  track(onSnapshot(doc(db, "brand", "clips"),
    (snap) => { clips = (snap.exists() && Array.isArray(snap.data().items)) ? snap.data().items : []; renderClips(); },
    () => {}));
  subscribeCreative();
  Card.subscribe();
}

let unsubCreative = null;
function subscribeCreative(){
  if (unsubCreative) { try { unsubCreative(); } catch {} }
  S.creative = {};
  brief = { text: "", photos: [], answers: [] }; briefFull = [];
  unsubCreative = onSnapshot(doc(db, "creative", wid()),
    (snap) => { S.creative = snap.exists() ? snap.data() : {}; loadBrief(); render(); },
    () => {});
  unsubCreative = track(unsubCreative);
}

/* ===== הקצב ===== */
export const slots = () => (rhythm && Array.isArray(rhythm.slots) && rhythm.slots.length ? rhythm.slots : DEFAULT_SLOTS)
  .map((s, i) => ({ ...DEFAULT_SLOTS[i] || DEFAULT_SLOTS[0], ...s, key: s.key || "s" + (i + 1) }));
const slotDate = (s) => ymd(addDays(S.weekStart, s.day));
const slotLabel = (s) => (PILLAR3[s.pillar] || PILLAR3.place).label;
const slotPost = (s) => S.posts.filter(p => p.week === wid() && p.slot === s.key)
  .sort((a, b) => ((a.at && a.at.seconds) || 0) - ((b.at && b.at.seconds) || 0))[0] || null;
const isDone = (p) => !!p && DONE.includes(p.status);
const weekDates = () => Array.from({ length: 7 }, (_, i) => ymd(addDays(S.weekStart, i)));

// משבצת שזמנה חלף. לא מוצגת כמשימה פתוחה ולא נספרת בציון —
// אי אפשר לפרסם אתמול, ומד שמונה כישלונות שאי אפשר לתקן רק מייאש.
function isPast(s){
  const now = new Date();
  const d = slotDate(s);
  const today = ymd(now);
  if (d < today) return true;
  if (d > today) return false;
  return toMin(s.time || "23:59") < now.getHours() * 60 + now.getMinutes();
}

async function saveRhythm(patch){
  try { await setDoc(doc(db, "brand", "rhythm"), { ...patch, updatedAt: serverTimestamp() }, { merge: true }); status("rhythmStatus", "ok", "נשמר. מעכשיו זה הקצב."); }
  catch { status("rhythmStatus", "bad", "לא נשמר. רק המנהל יכול."); }
}

function renderRhythm(){
  const box = $("rhythmBox"); if (!box) return;
  clear(box);
  slots().forEach((s, i) => {
    const row = el("div", { class: "rhythmrow" }, el("span", { class: "mono small", text: String(i + 1) }));
    const pillar = el("select", { "aria-label": "עמוד" });
    Object.entries(PILLAR3).forEach(([k, v]) => pillar.append(el("option", { value: k, text: v.label, selected: k === s.pillar })));
    const day = el("select", { "aria-label": "יום" });
    DAYS.forEach((d, di) => day.append(el("option", { value: di, text: d, selected: di === s.day })));
    const time = el("input", { type: "time", value: s.time, "aria-label": "שעה" });
    const fmt = el("select", { "aria-label": "פורמט" });
    FORMATS.filter(f => f.key !== "story").forEach(f => fmt.append(el("option", { value: f.key, text: f.label, selected: f.key === s.format })));
    row.append(pillar, day, time, fmt);
    row.dataset.key = s.key;
    box.append(row);
  });
  const every = $("shootEvery"); if (every) every.value = (rhythm && rhythm.shootEvery) || 14;
}
function readRhythm(){
  return [...$("rhythmBox").querySelectorAll(".rhythmrow")].map((row, i) => {
    const [pillar, day, fmt] = row.querySelectorAll("select");
    const time = row.querySelector("input[type=time]");
    return { key: row.dataset.key || "s" + (i + 1), pillar: pillar.value, day: +day.value, time: time.value || "10:00", format: fmt.value };
  });
}

/* ===== זיכרון המותג (הקול) ===== */
const memory = () => S.memory || { tone: "", likes: [], avoid: [], facts: [], examples: [], samples: [] };

async function saveMemory(patch){
  try { await setDoc(doc(db, "brand", "memory"), { ...patch, updatedAt: serverTimestamp() }, { merge: true }); }
  catch (e){ status("memStatus", "bad", "לא הצלחתי לשמור. רק המנהל יכול."); }
}
async function addRule(kind, text){
  if (!text) return;
  const m = memory(), list = [...(m[kind] || [])];
  if (list.includes(text)) return;
  list.push(text);
  await saveMemory({ [kind]: list.slice(-30) });
  status("memStatus", "ok", "נלמד.");
}
async function dropRule(kind, text){
  const m = memory();
  await saveMemory({ [kind]: (m[kind] || []).filter(x => x !== text) });
}
// פוסט שכתבת בעצמך, בלי AI. זה המקור הכי חזק לקול.
async function addSample(text){
  text = (text || "").trim(); if (text.length < 20) { status("memStatus", "warn", "קצר מדי בשביל ללמוד ממנו."); return; }
  const m = memory();
  await saveMemory({ samples: [...(m.samples || []), { text: text.slice(0, 900), at: Date.now() }].slice(-12) });
  status("memStatus", "ok", "נוסף לקול שלכם.");
}
async function dropAt(kind, idx){
  const m = memory();
  await saveMemory({ [kind]: (m[kind] || []).filter((_, i) => i !== idx) });
}
// כל תיקון שלך על טיוטת AI נשמר כדוגמה. זה מה שגורם לכתיבה להישמע כמוכם.
async function learnFromEdit(before, after){
  if (!before || !after || before.trim() === after.trim()) return;
  const m = memory();
  const examples = [...(m.examples || []), { before: before.slice(0, 900), after: after.slice(0, 900), at: Date.now() }];
  await saveMemory({ examples: examples.slice(-15) });
}

function renderMemory(){
  const m = memory();
  const box = $("memBox"); if (!box) return;
  clear(box);
  if ($("memTone") && document.activeElement !== $("memTone")) $("memTone").value = m.tone || "";

  // המקורות: הטקסטים שהקול נבנה מהם. גלויים, ניתנים למחיקה.
  const src = el("div", { class: "memgroup" }, el("h3", { class: "sub", text: "מאיפה הקול נלמד" }));
  const samples = m.samples || [], examples = m.examples || [];
  if (!samples.length && !examples.length)
    src.append(el("p", { class: "small", text: "עדיין ריק. הדבק למטה פוסט שכתבת בעצמך, או תקן טיוטה — כל תיקון נשמר כאן." }));
  samples.forEach((s, i) => src.append(el("blockquote", { class: "quote" },
    el("span", { text: s.text }),
    el("span", { class: "small muted", text: " · פוסט שלך" }),
    el("button", { class: "icon", title: "הסר", text: "✕", onclick: () => dropAt("samples", i) }))));
  examples.forEach((e, i) => src.append(el("blockquote", { class: "quote" },
    el("span", { text: e.after }),
    el("span", { class: "small muted", text: " · תיקון שלך" + (e.at ? " " + dm(new Date(e.at)) : "") }),
    el("button", { class: "icon", title: "הסר", text: "✕", onclick: () => dropAt("examples", i) }))));
  box.append(src);

  const group = (kind, title, cls) => {
    const list = m[kind] || [];
    const wrap = el("div", { class: "memgroup" }, el("h3", { class: "sub", text: title }));
    const chips = el("div", { class: "summary" });
    if (!list.length) chips.append(el("span", { class: "small", text: "—" }));
    list.forEach(t => chips.append(el("span", { class: "chip " + cls },
      el("span", { text: t }), el("button", { class: "icon", title: "הסר", text: "✕", onclick: () => dropRule(kind, t) }))));
    wrap.append(chips);
    return wrap;
  };
  box.append(group("likes", "תמיד לעשות", "ok"));
  box.append(group("avoid", "אף פעם לא", "bad"));
  box.append(group("facts", "עובדות על העסק", ""));
}

/* ===== תזמון חכם ===== */
export function bestTimes(net){
  const learned = S.timing && S.timing[net];
  if (learned && learned.samples >= 8 && Array.isArray(learned.slots) && learned.slots.length)
    return learned.slots.map(s => ({ ...s, learned: true }));
  return TIMING[net] || [];
}
function suggestTime(dateStr, net = "facebook"){
  const d = fromYmd(dateStr).getDay();
  const list = bestTimes(net);
  const exact = [...list].filter(s => s.day === d).sort((a,b) => a.tier - b.tier)[0];
  if (exact) return exact;
  return [...list].sort((a,b) => a.tier - b.tier)[0] || { time: "10:30", why: "ברירת מחדל" };
}

/* ===== סימני AI בעברית ===== */
// מה שגורם לטקסט להיראות כאילו מכונה כתבה אותו. מסומן, לא נחסם.
const TELLS = [
  { re: /[—–]/g, msg: "קו מפריד ארוך. פסיק או נקודה במקומו.", fix: (t) => t.replace(/\s*[—–]\s*/g, ", ") },
  { re: /לא רק [^.\n]{2,50} אלא/g, msg: "'לא רק… אלא…' — תבנית של מכונה." },
  { re: /[✅🚀💡👉🔥⭐✨📍📌🎯💪🙌]|[1-9]️?⃣/gu, msg: "אימוג'י של ממשק. אם כבר, אחד של רגש.", fix: (t) => t.replace(/[✅🚀💡👉🔥⭐✨📍📌🎯💪🙌]|[1-9]️?⃣/gu, "") },
  { re: /!!+/g, msg: "סימני קריאה כפולים.", fix: (t) => t.replace(/!!+/g, ".") },
  { re: /(?:^|[\s,])[והבלכמש]{0,2}(חוויה|מושלם|מושלמת|פינוק|בלתי נשכח|בלתי נשכחת|מחכים לכם|קסום|קסומה|מדהים|מדהימה|מוזמנים)(?=[\s.,!?]|$)/g, msg: "מילת שיווק ריקה. מה באמת קרה?" },
  { re: /[^,.\n]{3,}, [^,.\n]{3,} ו[^,.\n\s]{2,}[^,\n]{0,20}[.!\n]/g, msg: "שלשה (X, Y ו-Z). שניים מספיקים, זה נשמע יותר אנושי." },
  { re: /^(שלום לכולם|היי לכולם|בוקר טוב לכולם)/m, msg: "פתיחה גנרית. המשפט הראשון צריך לעצור גלילה." },
];
export function tellsOf(text){
  const out = [];
  for (const t of TELLS){ t.re.lastIndex = 0; if (t.re.test(text)) out.push(t); }
  return out;
}
function cleanTells(text){
  let t = text;
  for (const x of TELLS) if (x.fix) t = x.fix(t);
  return t.replace(/[ \t]{2,}/g, " ").replace(/ ,/g, ",").trim();
}
const wordCount = (t) => (t || "").trim() ? (t || "").trim().split(/\s+/).length : 0;
// כמה מילים חדשות הבעלים הוסיף על הטיוטה. פחות מ-4 = לא באמת נגע בזה.
function addedWords(base, text){
  const a = new Set((base || "").toLowerCase().split(/\s+/));
  return (text || "").toLowerCase().split(/\s+/).filter(w => w && !a.has(w)).length;
}

/* ===== לוח השבוע =====
   רצועה של שבעה ימים עם התמונות עצמן, ומעליה צעד אחד הבא בתור.
   מה שלמדנו מ-Later ומ-Planoly: מתכננים בעיניים. לוח בלי תמונות, בכלי
   שכל מטרתו אינסטגרם ופייסבוק, הוא רשימת מטלות שמתחזה ללוח. */

const DAY_LETTER = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const PILLAR_ICON = { process: "☕", place: "📍", when: "🕒" };
const stateOf = (p, past) => (past && !p) ? "gone" : isDone(p) ? "done" : p ? "draft" : "empty";
// תקלה בפרסום לא נעלמת בשקט — היא מופיעה על השורה עד שמטפלים בה.
const igTrouble = (p) => !!(p && p.igError);

// התמונה של הפוסט, אם יש. thumb נשמר בפיירסטור, image הוא קישור חיצוני.
const thumbOf = (p) => (p && (p.thumb || p.image)) || "";

function tile(pillar, p, cls){
  const t = el("div", { class: "wtile " + (cls || "") });
  const src = thumbOf(p);
  if (src) t.append(el("img", { src, alt: "", loading: "lazy" }));
  else t.append(el("span", { class: "wicon", text: PILLAR_ICON[pillar] || "✎" }));
  return t;
}

// רצועת השבוע. כל יום תא אחד: פתוח/סגור בעגלה, התמונה, והמצב.
function renderStrip(box, items){
  const today = ymd(new Date());
  const open = openDays();
  const list = slots();
  const strip = el("div", { class: "wstrip", role: "group", "aria-label": "השבוע" });
  for (let i = 0; i < 7; i++){
    const date = ymd(addDays(S.weekStart, i));
    const it = items.find(x => x.s.day === i);
    const p = it ? it.p : null;
    const extra = S.posts.find(x => x.date === date && !(x.week === wid() && list.some(k => k.key === x.slot)));
    const st = it ? stateOf(p, it.past) : (extra ? stateOf(extra, false) : "none");
    const h = holidayOn(date);
    const cell = el("button", {
      type: "button",
      class: `wday ${st}` + (date === today ? " today" : "") + (open.includes(i) ? " cart" : ""),
      title: h ? h[1] : "",
      "aria-label": `${DAYS[i]} ${dm(addDays(S.weekStart, i))}${it ? " · " + slotLabel(it.s) : ""}`,
      onclick: () => it ? (p ? loadPost(p.id) : openSlot(it.s))
                       : extra ? loadPost(extra.id) : newPost(date),
    });
    cell.append(el("span", { class: "wname", text: DAY_LETTER[i] }));
    if (it || extra) cell.append(tile(it ? it.s.pillar : "place", p || extra));
    else cell.append(el("span", { class: "wtile ghost", text: "+" }));
    cell.append(el("span", { class: "wnum", text: String(fromYmd(date).getDate()) }));
    strip.append(cell);
  }
  box.append(strip);
}

// הצעד הבא. אחד. זו התשובה ל"איפה אני עומד" בשנייה אחת.
function renderNext(box, items){
  const it = items.find(({ p, past }) => !past && !isDone(p));
  const card = el("div", { class: "nextup" });

  if (!it){
    const doneList = items.filter(x => isDone(x.p));
    card.append(el("div", { class: "nxbody" },
      el("b", { text: doneList.length ? "השבוע סגור ✓" : "אין משבצת פתוחה השבוע." }),
      el("div", { class: "small", text: doneList.length
        ? "כל המשבצות מוכנות. נשאר להוריד את ה-CSV למתזמן."
        : "כל המשבצות עברו. הן חוזרות בשבוע הבא." })));
    box.append(card);
    return;
  }

  const { s, p } = it;
  const sk = ((S.creative && S.creative.slots) || {})[s.key] || {};
  const angle = (p && p.idea) || sk.angle || "";
  const noMaterial = !brief.text && !brief.photos.length && !brief.answers.length && !angle;

  card.append(tile(s.pillar, p, "big"));
  const body = el("div", { class: "nxbody" },
    el("div", { class: "nxwhen" },
      el("b", { text: slotLabel(s) }),
      el("span", { class: "small", text: ` · ${DAYS[s.day]} ${dm(addDays(S.weekStart, s.day))} · ${s.time}` })),
    el("div", { class: "nxangle", text: angle || (PILLAR3[s.pillar] || {}).note || "" }));

  // נקודת פתיחה אחת. כשאין חומר על השבוע, הצעד הבא הוא לספר — לא לכתוב.
  if (noMaterial && WORKER_URL && S.isOwner){
    body.append(el("div", { class: "actions" },
      el("button", { class: "primary big", text: "ספר לי מה היה השבוע", onclick: openBrief }),
      el("button", { class: "link", text: "לכתוב בלי זה", onclick: () => p ? loadPost(p.id) : openSlot(s) })));
  } else {
    body.append(el("div", { class: "actions" },
      el("button", { class: "primary big", text: p ? "המשך לכתוב" : "כתוב עכשיו",
        onclick: () => p ? loadPost(p.id) : openSlot(s) })));
  }
  card.append(body);
  box.append(card);
}

/* ===== מסך הכתיבה =====
   שכבה אחת מעל הכל, לא כרטיס בתחתית העמוד. בטלפון זה ההבדל בין
   "לגלול ולחפש איפה כותבים" לבין "נגעתי במשבצת, אני כותב". */
function openSheet(){
  const c = $("composer");
  // "פרטים" מחזיק את התאריך והשעה. בפוסט מעבר לקצב צריך אותם, במשבצת
  // של הקצב הם קבועים. נקבע פעם אחת בפתיחה ולא בכל הקלדה.
  const more = $("compMore");
  if (more) more.open = !editSlot;
  c.hidden = false;
  document.body.classList.add("sheeton");
  c.scrollTop = 0;
  renderPreview();
}
function closeSheet(){
  $("composer").hidden = true;
  document.body.classList.remove("sheeton");
}

// תצוגה מקדימה: איך הפוסט ייראה בפיד. מתעדכנת עם כל הקלדה.
const IG_HANDLE = ((COMPETITORS || []).find(c => c.me) || {}).ig || "";

function renderPreview(){
  const img = $("igImg"); if (!img) return;
  const name = $("igName");
  if (name && IG_HANDLE) name.textContent = IG_HANDLE.replace(/^@/, "");
  const src = composerPhoto || $("cImage").value || composerThumb || "";
  clear(img);
  if (src){ img.append(el("img", { src, alt: "" })); img.classList.add("has"); }
  else { img.append(el("span", { class: "small", text: "עוד אין תמונה" })); img.classList.remove("has"); }

  const text = mergedText();
  const cap = $("igText");
  const short = text.length > 120 ? text.slice(0, 120).replace(/\s+\S*$/, "") : text;
  clear(cap);
  cap.append(el("span", { text: short || "כאן יופיע הטקסט." }));
  if (text.length > short.length) cap.append(el("span", { class: "igmore", text: " … עוד" }));
  $("igTags").textContent = ($("cHash").value || "").split(/\s+/).filter(t => t.startsWith("#")).slice(0, 6).join(" ");
}

// כרטיס השיחה נפתח מהצעד הבא בלבד. שני כפתורים שאומרים "ספר לי"
// זה לא שתי אפשרויות — זו החלטה מיותרת.
let briefOpen = false;

function openBrief(){
  const c = $("briefCard");
  if (!c) return;
  briefOpen = true;
  c.hidden = false;
  c.scrollIntoView({ behavior: "smooth", block: "start" });
  const t = $("briefText"); if (t) t.focus();
}

// נקודת פתיחה אחת. כרטיס השיחה ו"כיוונים" מופיעים רק כשיש במה לגעת.
function renderEntry(){
  const hasMaterial = !!(brief.text || brief.photos.length || brief.answers.length);
  const live = S.isOwner && !!WORKER_URL;
  const card = $("briefCard");
  if (card) card.hidden = !live || !(briefOpen || hasMaterial);
  const plan = $("aiPlan");
  // בלי חומר על השבוע "כיוונים" מחזיר כיוון שמתאים לכל בית קפה. שם הוא מזיק.
  if (plan) plan.hidden = !live || !hasMaterial;
}

function renderBoard(){
  renderLeaderboard();
  const box = clear($("slotList"));
  const ph = phase(), open = openDays();
  const list = slots();
  const items = list.map(s => ({ s, p: slotPost(s), past: isPast(s) }));
  const active = items.filter(it => !(it.past && !it.p));
  const missed = items.length - active.length;
  const done = active.filter(it => isDone(it.p)).length;
  const allDone = active.length > 0 && done === active.length;

  const head = $("slotState");
  head.className = "pill " + (allDone ? "ok" : done ? "warn" : "");
  head.textContent = allDone ? "השבוע סגור ✓"
    : `${done}/${active.length} מוכנים` + (missed ? ` · ${missed} עברו` : "");

  renderStrip(box, items);
  renderNext(box, items);
  renderEntry();

  // מצב השיבוץ. שורה אחת מתחת לרצועה, לא הודעה שתופסת מסך.
  if (ph !== "locked"){
    const note = el("div", { class: "small hint" });
    if (!open.length){
      note.append(el("span", { text: "עוד לא נקבעו ימי פעילות. אפשר לכתוב — השעות ייכנסו לבד. " }),
        el("button", { class: "link", text: "לקבוע ימים", onclick: () => emit("tab", "shifts") }));
    } else {
      note.textContent = ph === "open"
        ? "השיבוץ עדיין פתוח — השעות עוד יכולות להשתנות."
        : "השבוע עוד לא נפתח לשיבוץ. השעות יתעדכנו בפוסט לבד.";
    }
    box.append(note);
  }

  // שאר המשבצות, שורה לכל אחת. הרצועה מראה אותן, זה נותן להן שם וכפתור.
  const rest = items.filter(x => x !== items.find(({ p, past }) => !past && !isDone(p)));
  if (rest.length){
    const wrap = el("div", { class: "slotrows" });
    rest.forEach(({ s, p, past }) => {
      const st = stateOf(p, past);
      const row = el("button", { type: "button", class: "slotrow " + st,
        onclick: () => p ? loadPost(p.id) : openSlot(s) });
      row.append(tile(s.pillar, p, "sm"));
      row.append(el("span", { class: "grow" },
        el("b", { text: slotLabel(s) }),
        el("span", { class: "small", text: ` · ${DAYS[s.day]} ${s.time}` }),
        el("div", { class: "small clip", text: (p && (p.text || p.idea || "").slice(0, 70))
          || (st === "gone" ? "הזמן חלף — חוזר בשבוע הבא" : "עוד לא נכתב") })));
      row.append(el("span", { class: "pill " + (igTrouble(p) ? "bad" : st === "done" ? "ok" : st === "draft" ? "warn" : ""),
        text: igTrouble(p) ? "אינסטגרם נכשל" : st === "gone" ? "עבר" : p ? STATUS_LABEL[p.status] || "טיוטה" : "ריק" }));
      wrap.append(row);
    });
    box.append(wrap);
  }

  // פוסטים מחוץ לקצב (אירוע, דוכן אורח, חג)
  const extra = S.posts.filter(p => weekDates().includes(p.date) && !(p.week === wid() && list.some(s => s.key === p.slot)))
    .sort((a,b) => (a.date + (a.time||"")).localeCompare(b.date + (b.time||"")));
  if (extra.length){
    const wrap = el("div", { class: "extras" }, el("h3", { class: "sub", text: "מעבר לקצב" }));
    extra.forEach(p => wrap.append(el("button", { type: "button", class: "slotrow " + stateOf(p, false),
      onclick: () => loadPost(p.id) },
      tile("place", p, "sm"),
      el("span", { class: "grow" },
        el("b", { text: DAYS[fromYmd(p.date).getDay()] + " " + dm(fromYmd(p.date)) }),
        el("span", { class: "mono small", text: " " + (p.time || "") }),
        el("div", { class: "small clip", text: (p.text || p.idea || "").slice(0, 70) })),
      el("span", { class: "pill " + (isDone(p) ? "ok" : ""), text: STATUS_LABEL[p.status] || "טיוטה" }))));
    box.append(wrap);
  }
}

/* ===== שלד לשבוע: כיוון לכל משבצת, בלי טקסט ===== */
async function skeleton(btn){
  await withBusy(btn, async () => {
    try {
      status("planStatus", "", "חושב…");
      const list = slots();
      const req = list.filter(s => !slotPost(s) && !isPast(s)).map(s => ({
        key: s.key, pillar: slotLabel(s), pillarNote: (PILLAR3[s.pillar] || {}).note || "",
        day: DAYS[s.day], date: slotDate(s), format: s.format,
        holiday: (holidayOn(slotDate(s)) || [])[1] || "",
      }));
      if (!req.length){ status("planStatus", "ok", "אין משבצת פתוחה שממתינה לכיוון."); return; }
      const r = await ai("/ai/week", {
        slots: req,
        clips: clips.filter(c => c.state === "shot").map(c => c.title).slice(0, 10),
        // החומר מהשיחה. זה ההבדל בין כיוון שמתאים לקורטדו לכיוון שמתאים לכל בית קפה.
        brief: brief.text, photos: aiPhotos(), answers: brief.answers,
      });
      const got = Array.isArray(r.slots) ? r.slots : [];
      const cur = { ...((S.creative && S.creative.slots) || {}) };
      let n = 0;
      for (const it of got){
        if (!it || !it.key || !req.some(s => s.key === it.key)) continue;
        cur[it.key] = { angle: String(it.angle || "").slice(0, 140), shoot: String(it.shoot || "").slice(0, 200) };
        n++;
      }
      await setDoc(doc(db, "creative", wid()), { week: wid(), slots: cur, at: serverTimestamp() }, { merge: true });
      status("planStatus", "ok", `${n} כיוונים. הטקסט נכתב רק כשפותחים משבצת — אחד אחד, עם משפט שלך.`);
    } catch (e){ status("planStatus", "bad", e.message); }
  });
}

/* ===== השיחה השבועית =====
   הסדר הפוך מקודם: קודם החומר, אחר כך הלוח. היא מספרת מה קרה ומעלה תמונות,
   אני שואל שתיים-שלוש שאלות קצרות, ורק אז נבנות המשבצות. הכיוון הגנרי
   שיצא עד היום נבע מכך שלמודל לא היה שום מידע על השבוע הזה. */
const MAX_Q = 4;
const MAX_PHOTOS = 6;
let brief = { text: "", photos: [], answers: [] };
let askedQ = null;          // השאלה שעל המסך כרגע
let briefPending = [];      // קבצים שנבחרו וטרם הועלו

/* התמונות בשני גדלים, בכוונה.
   מסמך ב-Firestore מוגבל ל-1MiB. שש תמונות של 1280 פיקסל כ-data URL הן
   0.8-2MB, כלומר המסמך נדחה — וביחד איתו נעלמות גם התשובות שנשמרות בו.
   לכן: המקור המלא נשאר בזיכרון ונשלח ל-AI, ומה שנשמר הוא ממוזערת של 240
   פיקסל (~8KB) — מספיק כדי שהתצוגה תשרוד רענון. */
/* briefFull מוצמד ל-brief.photos לפי אינדקס, ולכן הוא חייב להישאר באותו
   אורך בדיוק. קודם הוא היה מערך נפרד שלא אותחל ב-loadBrief: אחרי רענון
   עם 3 תמונות שמורות, הוספת תמונה רביעית נתנה briefFull=[full4] —
   ו-aiPhotos החזיר תמונה אחת במקום ארבע, בשקט. גרוע מזה, מחיקת התמונה
   הראשונה הסירה מ-briefFull את full4, כלומר את התמונה הלא נכונה.
   עכשיו: null מסמן "אין מקור בזיכרון, יש רק ממוזערת", והאורך תמיד זהה. */
let briefFull = [];
const syncFull = () => { briefFull.length = brief.photos.length;
  for (let i = 0; i < briefFull.length; i++) if (briefFull[i] === undefined) briefFull[i] = null; };
// לכל משבצת: המקור אם הוא בזיכרון, אחרת הממוזערת ששרדה את הרענון.
const aiPhotos = () => brief.photos.map((t, i) => briefFull[i] || t);

function loadBrief(){
  const c = (S.creative && S.creative.brief) || null;
  if (!c) return;
  brief = { text: c.text || "", photos: (Array.isArray(c.photos) ? c.photos : []).slice(0, MAX_PHOTOS),
            answers: Array.isArray(c.answers) ? c.answers : [] };
  syncFull();                 // מיישר את briefFull לאורך החדש
  const box = $("briefText");
  if (box && document.activeElement !== box && !box.value) box.value = brief.text;
  renderBrief();
}

async function saveBrief(){
  try {
    await setDoc(doc(db, "creative", wid()), { week: wid(), brief, at: serverTimestamp() }, { merge: true });
    return true;
  } catch (e){
    // בליעה שקטה כאן עלתה בכל חומר השבוע. עדיף להגיד שזה לא נשמר.
    status("briefStatus", "bad", e.code === "permission-denied"
      ? "רק המנהל יכול לשמור את התחקיר."
      : "החומר לא נשמר. בדוק חיבור ונסה שוב.");
    return false;
  }
}

function renderBrief(){
  const card = $("briefCard"); if (!card) return;
  const has = brief.answers.length || brief.photos.length || brief.text;
  const pill = $("briefState");
  if (pill){
    pill.hidden = !has;
    pill.textContent = brief.answers.length ? `${brief.answers.length} תשובות` : brief.photos.length ? `${brief.photos.length} תמונות` : "יש חומר";
    pill.className = "pill " + (brief.answers.length ? "ok" : "warn");
  }
  const thumbs = $("briefThumbs");
  if (thumbs){
    clear(thumbs);
    brief.photos.forEach((u, i) => thumbs.append(el("div", { class: "thumb" },
      el("img", { src: u, alt: "" }),
      el("button", { class: "icon", title: "הסר", text: "✕",
        onclick: () => {
          brief.photos = brief.photos.filter((_, j) => j !== i);
          briefFull = briefFull.filter((_, j) => j !== i);   // שתי הרשימות באותו סדר
          saveBrief(); renderBrief();
        } }))));
  }
}

function showQuestion(q){
  askedQ = q;
  $("briefIntake").hidden = true;
  $("briefDone").hidden = true;
  $("briefQuestion").hidden = false;
  $("briefQText").textContent = q.question;
  $("briefWhy").textContent = q.why || "";
  const box = clear($("briefOptions"));
  (q.options || []).forEach(o => box.append(el("button", { class: "segbtn ok", type: "button", text: o,
    onclick: () => answer(o) })));
  $("briefFree").value = "";
}

function showDone(msg){
  askedQ = null;
  $("briefQuestion").hidden = true;
  $("briefIntake").hidden = true;
  $("briefDone").hidden = false;
  $("briefDoneText").textContent = msg;
}

// אין Firebase Storage (תוכנית Spark). הצילום המלא נשאר בזיכרון הדפדפן
// ונשלח ל-AI כ-data URL. מה שכן נשמר זו תמונה ממוזערת של 240 פיקסל
// (~8KB) בתוך מסמך הפוסט — היא מה שהופך את הלוח לוויזואלי, ושורדת רענון.
const PHOTO_MAX_PX = 1280;
const PHOTO_QUALITY = 0.72;
const THUMB_PX = 240;
const THUMB_QUALITY = 0.5;

function shrinkToDataUrl(file, maxPx = PHOTO_MAX_PX, quality = PHOTO_QUALITY){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

async function uploadBriefPhotos(){
  if (!briefPending.length) return;
  status("briefStatus", "", `מכין ${briefPending.length} תמונות…`);
  // Math.max: אם המסמך הגיע מגרסה ישנה עם יותר מהמכסה, 6-7 הוא -1
  // ו-slice(0,-1) היה מחזיר את *כל* הקבצים פרט לאחרון — ההפך מהכוונה.
  const room = Math.max(0, MAX_PHOTOS - brief.photos.length);
  for (const f of briefPending.slice(0, room)){
    try {
      // שתי ההקטנות ביחד: דחיפה אחת אחרי השנייה אפשרה מצב שבו הממוזערת
      // נכנסה והמקור נכשל, ומאותו רגע כל האינדקסים זזו לצמיתות.
      const [thumb, full] = await Promise.all([
        shrinkToDataUrl(f, THUMB_PX, THUMB_QUALITY),
        shrinkToDataUrl(f),
      ]);
      brief.photos.push(thumb);
      briefFull.push(full);
    }
    catch { status("briefStatus", "bad", "תמונה אחת לא נקראה."); }
  }
  briefPending = [];
  $("briefPhotos").value = "";
}

async function nextQuestion(){
  const r = await api("/ai/brief", { ...aiContext(), brief: brief.text, photos: aiPhotos(), answers: brief.answers, max: MAX_Q });
  if (r.done || !r.question || brief.answers.length >= MAX_Q){ await buildWeek(); return; }
  showQuestion(r);
  status("briefStatus", "", "");
}

async function startBrief(btn){
  await withBusy(btn, async () => {
    try {
      brief.text = ($("briefText").value || "").trim().slice(0, 1200);
      await uploadBriefPhotos();
      if (!brief.text && !brief.photos.length){
        status("briefStatus", "warn", "משפט אחד או תמונה אחת — צריך משהו להתחיל ממנו."); return;
      }
      brief.answers = [];
      await saveBrief();
      renderBrief();
      status("briefStatus", "", "חושב על שאלה…");
      await nextQuestion();
    } catch (e){ status("briefStatus", "bad", e.message); }
  });
}

async function answer(text){
  text = (text || "").trim();
  if (!text || !askedQ) return;
  brief.answers.push({ q: askedQ.question, a: text.slice(0, 200) });
  await saveBrief();
  renderBrief();
  status("briefStatus", "", "רגע…");
  try { await nextQuestion(); }
  catch (e){ status("briefStatus", "bad", e.message); }
}

// סוף השיחה: אותו מסלול ישן של בניית הכיוונים, רק שעכשיו יש לו חומר.
async function buildWeek(){
  status("briefStatus", "", "בונה את השבוע…");
  try {
    await skeleton(null);
    showDone("השבוע נבנה מהחומר שנתת. הכיוונים יושבים במשבצות למטה — נשאר לכתוב.");
    status("briefStatus", "ok", "");
  } catch (e){ status("briefStatus", "bad", e.message); }
}

/* ===== קריאה ל-AI עם הזיכרון ===== */
function aiContext(){
  const m = memory();
  return {
    memory: { tone: m.tone || "", likes: m.likes || [], avoid: m.avoid || [], facts: m.facts || [],
      examples: (m.examples || []).slice(-6), samples: (m.samples || []).slice(-6) },
    voice: VOICE,
    recent: S.posts.filter(p => p.status === "done").sort((a,b) => (b.date||"").localeCompare(a.date||"")).slice(0, 6)
      .map(p => ({ date: p.date, text: (p.text||"").slice(0,300), pillar: p.pillar, format: p.format, reach: p.performance && p.performance.reach })),
    // הפוסטים שהגיעו הכי רחוק. "אל תחזור על זווית" זה לא אותו דבר כמו "ככה זה עובד",
    // ובלי זה המערכת לא לומדת מה מצליח אלא רק מה כבר נאמר.
    best: S.posts.filter(p => p.status === "done" && p.performance && p.performance.reach > 0)
      .sort((a,b) => (b.performance.reach||0) - (a.performance.reach||0)).slice(0, 4)
      .map(p => ({ text: (p.text||"").slice(0,300), pillar: p.pillar, format: p.format, reach: p.performance.reach })),
    // מה באמת קרה בעגלה. היומן נאסף בכל משמרת וזו המציאות היחידה שיש למודל.
    logs: (S.logs || []).slice().sort((a,b) => (b.date||"").localeCompare(a.date||"")).slice(0, 21)
      .map(l => ({ date: l.date, customers: l.customers, peak: l.peak, weather: l.weather, promo: l.promo })),
    hours: hoursByDay(), openDays: openDays().map(i => DAYS[i]),
    // תחזית השבוע + מה שמזג אוויר עושה למכירות בפועל, מהיומן שלך.
    weather: Weather.forAI(), weatherImpact: Weather.impactLine(),
    // חלונות ביקוש: חול המועד, חופש גדול, סופ״ש ארוך. מי מגיע השבוע ומתי.
    season: Season.forAI(S.weekStart),
    words: WORDS,
  };
}
const ai = (path, body) => api(path, { ...aiContext(), ...body });

/* ===== עורך הפוסט ===== */
function resetComposer(){
  editing = null; editSlot = null; aiOrigin = null; pendingImage = null; composerPhoto = null; composerThumb = null; lastShoot = ""; cardUrl = null; cards = [];
  $("cText").value = ""; $("cLine").value = ""; $("cIdea").value = "";
  $("cHash").value = defaultHashtags().join(" ");
  $("cImage").value = ""; $("cPhoto").value = "";
  $("shootHint").textContent = "";
  $("delPost").hidden = true;
  $("aiWrite").textContent = "✨ טיוטה";
  status("compStatus", "", "");
}

// פותח משבצת ריקה: התאריך, השעה, הפורמט והכיוון כבר בפנים. נשאר רק לכתוב.
function openSlot(s){
  resetComposer();
  editSlot = s.key;
  const date = slotDate(s);
  $("cDate").value = date; $("cTime").value = s.time;
  $("cFormat").value = s.format;
  const sk = (S.creative && S.creative.slots && S.creative.slots[s.key]) || {};
  // הכיוון הוא משפט אחד, לא גוף הפוסט. השעות מגיעות למודל בנפרד דרך aiContext().hours,
  // ולכן אין טעם לדחוף אותן לכאן — זה רק מילא שדה שורה אחת בטקסט רב-שורתי.
  $("cIdea").value = sk.angle || "";
  $("cIdea").placeholder = (PILLAR3[s.pillar] || {}).note || "למשל: הגשם הראשון, הקיטור, שלושה קבועים בשמונה בבוקר";
  if (sk.shoot) $("shootHint").textContent = "מה לצלם: " + sk.shoot;
  $("compTitle").textContent = `${slotLabel(s)} · ${DAYS[s.day]} ${dm(addDays(S.weekStart, s.day))}`;
  $("timeWhy").textContent = "";
  renderComposerMeta();
  openSheet();
}

export function newPost(date, preset = {}){
  resetComposer();
  const d = date || ymd(addDays(new Date(), 1));
  $("cDate").value = d;
  const t = suggestTime(d, "facebook");
  $("cTime").value = preset.time || t.time;
  $("timeWhy").textContent = t.why ? (t.learned ? "נלמד מהנתונים שלכם: " : "") + t.why : "";
  $("cFormat").value = preset.format || "reel";
  $("cIdea").value = preset.idea || "";
  $("compTitle").textContent = "פוסט מעבר לקצב";
  renderComposerMeta();
  openSheet();
}

export function loadPost(id){
  const p = S.posts.find(x => x.id === id); if (!p) return;
  resetComposer();
  editing = id; editSlot = p.slot || null; aiOrigin = p.aiDraft || null;
  $("cDate").value = p.date || ""; $("cTime").value = p.time || "";
  $("cFormat").value = p.format || "reel";
  $("cIdea").value = p.idea || ""; $("cText").value = p.text || "";
  $("cLine").value = p.line || "";
  $("cHash").value = (p.hashtags || []).join(" ") || defaultHashtags().join(" ");
  $("cImage").value = p.image || "";
  composerThumb = p.thumb || null;
  if (p.shoot) $("shootHint").textContent = "מה לצלם: " + p.shoot;
  const s = slots().find(x => x.key === p.slot);
  $("compTitle").textContent = s ? `${slotLabel(s)} · ${DAYS[fromYmd(p.date).getDay()]} ${dm(fromYmd(p.date))}` : "עריכת פוסט";
  $("timeWhy").textContent = s ? "השעה הקבועה של המשבצת." : "";
  if (aiOrigin) $("aiWrite").textContent = "✨ גרסה אחרת";
  if (p.igError) status("compStatus", "bad", "אינסטגרם נכשל: " + p.igError + " — אפשר לתזמן שוב.");
  else if (p.igPending) status("compStatus", "ok", "מתוזמן. אינסטגרם בתור ויעלה באותה דקה.");
  else if (p.fbPostId) status("compStatus", "ok", "כבר פורסם או מתוזמן בפייסבוק." + (p.igPostId ? " ובאינסטגרם." : ""));
  $("delPost").hidden = false;
  renderComposerMeta();
  openSheet();
}

function defaultHashtags(){
  return [...HASHTAGS.core, ...HASHTAGS.geo.slice(0,2), ...HASHTAGS.intent.slice(0,3)];
}

// משבצת של הקצב = אין מה לבחור. שורת מידע במקום שלושה שדות שאסור לגעת בהם.
function renderFixed(){
  const onSlot = !!editSlot;
  const fixed = $("cFixed"), meta = $("slotMeta");
  if (fixed) fixed.hidden = onSlot;
  if (!meta) return;
  meta.hidden = !onSlot;
  if (!onSlot) return;
  clear(meta);
  const date = $("cDate").value;
  const f = FORMATS.find(x => x.key === $("cFormat").value);
  const h = date ? holidayOn(date) : null;
  const bits = [
    date ? `${DAYS[fromYmd(date).getDay()]} ${dm(fromYmd(date))}` : "",
    $("cTime").value || "",
    f ? f.label : "",
    "פייסבוק + אינסטגרם",
  ].filter(Boolean);
  meta.append(el("span", { text: bits.join(" · ") }));
  if (h) meta.append(el("span", { class: "hol", text: h[1] }));
  meta.append(el("button", { class: "link", text: "שינוי הקצב", onclick: () => {
    const d = $("rhythmDetails");
    if (d){ d.open = true; d.scrollIntoView({ behavior: "smooth", block: "center" }); }
  } }));
}

function renderComposerMeta(){
  const date = $("cDate").value;
  const h = date ? holidayOn(date) : null;
  const i = date ? fromYmd(date).getDay() : -1;
  const bits = [];
  if (date) bits.push(DAYS[i]);
  if (h) bits.push("🎉 " + h[1] + (h[2] ? " · " + h[2] : ""));
  bits.push("פייסבוק + אינסטגרם");
  $("dateHint").textContent = bits.join(" · ");
  const f = FORMATS.find(x => x.key === $("cFormat").value);
  $("formatHint").textContent = f ? f.note : "";
  renderFixed();
  renderTemplates();

  const text = $("cText").value || "";
  const n = wordCount(text);
  const len = $("lenHint");
  len.textContent = n ? `${n} מילים · יעד ${WORDS[0]}–${WORDS[1]}` : "";
  len.className = "small " + (n > WORDS[1] * 2 ? "bad" : n > WORDS[1] + 10 ? "warn" : "");

  const tells = clear($("tells"));
  tellsOf(text).forEach(t => tells.append(el("li", { text: t.msg })));
  $("cleanTells").hidden = !tellsOf(text).some(t => t.fix);

  // שער ההוספה: מראה מראש מה חסר כדי לסמן "מוכן".
  const gate = $("gateHint");
  if (aiOrigin && !$("cLine").value.trim() && addedWords(aiOrigin, text) < 4)
    gate.textContent = "כדי לסמן מוכן: משפט אחד משלך למטה, או תיקון של הטיוטה.";
  else gate.textContent = "";

  renderPreview();
}

/* ===== נסיבות היום =====
   תבנית לא מתאימה "תמיד" — היא מתאימה למצב. הנסיבות נגזרות ממה שהמערכת
   כבר יודעת: הלוח, החגים, המשמרות והתחזית. אף אחד לא מקליד אותן. */
function occasionsOn(date){
  const out = [];
  if (!date) return out;
  const d = fromYmd(date);
  const dow = d.getDay();
  if (dow === 4 || dow === 5 || dow === 6) out.push("weekend");
  if (holidayOn(date)) out.push("holiday");
  if (!Card.hoursOn(date).open) out.push("closed");
  if (dow === 0 || dow === 1) out.push("quiet");
  const w = Weather.forDate(date);
  if (w){
    if ((w.rain || 0) >= 40) out.push("rain");
    if ((w.tmax || 0) >= 32) out.push("hot");
  }
  const first = weekDates().find(x => Card.hoursOn(x).open);
  if (first === date) out.push("first");
  return out;
}

/* ===== התבנית =====
   העמוד אומר על מה הפוסט. התבנית אומרת איך הוא בנוי: פתיחה, גוף, סיום
   וכרטיס. זה מה שהיה חסר — ובלעדיו המודל המציא מבנה חדש בכל שבוע. */
const currentTemplate = () => templateOf($("cTemplate") ? $("cTemplate").value : "");

function renderTemplates(){
  const sel = $("cTemplate");
  if (!sel) return;
  const date = $("cDate").value;
  const s = slots().find(x => x.key === editSlot);
  const pillar = s ? s.pillar : "";
  const occ = occasionsOn(date);
  const fit = templatesFor(pillar, occ);
  // מחוץ למשבצת של הקצב אין עמוד קבוע, אז כל התבניות פתוחות.
  const list = fit.length ? fit : TEMPLATES;
  const keep = sel.value;
  clear(sel);
  sel.append(el("option", { value: "", text: "— בלי תבנית —" }));
  for (const t of list)
    sel.append(el("option", { value: t.key, text: t.name + (t.occasion.length && t.occasion.some(o => occ.includes(o)) ? " ★" : "") }));
  sel.value = list.some(t => t.key === keep) ? keep : (list[0] ? list[0].key : "");
  renderTemplateNote();
}

function renderTemplateNote(){
  const box = $("tplNote");
  if (!box) return;
  clear(box);
  const t = currentTemplate();
  if (!t){ box.hidden = true; return; }
  box.hidden = false;
  const st = templateScore(t.key);
  box.append(el("p", { class: "small", text: t.open }));
  box.append(el("p", { class: "small", text: t.body }));
  if (t.shots && t.shots.length)
    box.append(el("ol", { class: "shots" }, ...t.shots.map(x => el("li", { text: x }))));
  // המחקר מוצג עד שיש מספיק מדידות. מרגע שיש — הנתונים שלנו גוברים עליו.
  box.append(el("p", { class: "small why", text: st ? st.line : "מחקר: " + t.why }));
}

/* ציון התבנית מהנתונים שלנו. פחות משני פוסטים = עוד אין מה ללמוד ממנו,
   ואז מוצג המחקר במקום. ממוצע חשיפה, כי זה מה שנאסף ב-/insights/posts. */
export function templateScore(key){
  const done = S.posts.filter(p => p.template === key && p.performance && p.performance.reach > 0);
  if (done.length < 2) return null;
  const avg = Math.round(done.reduce((a, p) => a + (p.performance.reach || 0), 0) / done.length);
  const all = S.posts.filter(p => p.performance && p.performance.reach > 0);
  const base = all.length ? Math.round(all.reduce((a, p) => a + p.performance.reach, 0) / all.length) : 0;
  const diff = base ? Math.round(((avg - base) / base) * 100) : 0;
  return { n: done.length, avg, diff,
    line: `הנתונים שלנו: ${done.length} פוסטים, ${avg} חשיפה בממוצע` +
      (base ? ` — ${diff >= 0 ? "+" : ""}${diff}% מול הממוצע.` : ".") };
}

// דירוג התבניות לפי מה שבאמת עבד. מוצג בכרטיס הצד.
export function renderLeaderboard(){
  const box = $("tplBoard");
  if (!box) return;
  clear(box);
  const rows = TEMPLATES.map(t => ({ t, st: templateScore(t.key) })).filter(r => r.st)
    .sort((a, b) => b.st.avg - a.st.avg);
  if (!rows.length){
    box.append(el("p", { class: "small", text: "עוד אין מספיק מדידות. צריך שני פוסטים מאותה תבנית עם נתוני חשיפה. עד אז התבניות מדורגות לפי המחקר." }));
    return;
  }
  for (const { t, st } of rows)
    box.append(el("div", { class: "tplrow" },
      el("b", { text: t.name }),
      el("span", { class: "mono small", text: st.avg + " חשיפה" }),
      el("span", { class: "pill " + (st.diff >= 0 ? "ok" : ""), text: (st.diff >= 0 ? "+" : "") + st.diff + "%" }),
      el("span", { class: "small", text: st.n + " פוסטים" })));
}

/* ===== הכרטיס =====
   מה שחוזר בכל פוסט — הסמל, שעות אותו היום, המיקום — לא נכתב מחדש בכל
   פעם. הוא נצרב על התמונה. הצילום הוא מה שאתה בוחר: מה שצולם עכשיו,
   או אחד מצילומי המלאי של העגלה. */
let cards = [];              // מה שנבנה בפועל, יעד אחר יעד

// אילו שיבוצים לבנות. ברירת המחדל נשמרת בעיצוב, ואפשר לשנות לפוסט בודד.
function renderTargets(){
  const box = $("cTargets");
  if (!box) return;
  const saved = Card.cfg().targets || ["ig_feed"];
  if (box.childElementCount) return;      // נבנה פעם אחת, לא בכל רינדור
  for (const t of Card.targets())
    box.append(el("label", { class: "check", for: "tg_" + t.key },
      el("input", { type: "checkbox", id: "tg_" + t.key, value: t.key, checked: saved.includes(t.key) }),
      t.label));
}
const chosenTargets = () => [...document.querySelectorAll("#cTargets input:checked")].map(i => i.value);

function renderCards(){
  const box = $("cCards");
  if (!box) return;
  clear(box);
  for (const c of cards)
    box.append(el("figure", { class: "asset" },
      el("img", { src: c.url, alt: c.target.label }),
      el("figcaption", { class: "small" },
        el("span", { text: c.target.label }),
        el("a", { href: c.url, download: `cortado-${c.target.key}.jpg`, class: "link", text: "הורד" }))));
}

async function buildCard(btn){
  const date = $("cDate").value;
  if (!date){ status("compStatus", "warn", "בחר תאריך — הכרטיס צורב את שעות אותו היום."); return; }
  await withBusy(btn, async () => {
    try {
      const t = currentTemplate();
      const base = composerPhoto || (Card.shots()[0] || {}).url || "";
      const picked = chosenTargets();
      const built = await Card.buildAll(picked, {
        photo: base,
        headline: $("cHead").value.trim(),
        date,
        layout: (t && t.card) || "photo",
      });
      cards = built;
      // הראשון הוא מה שמתפרסם דרך ה-API. השאר להורדה — סטורי מעלים ביד.
      cardUrl = built[0] ? built[0].url : null;
      if (cardUrl){
        composerPhoto = cardUrl;
        composerThumb = await Card.thumbOf(cardUrl);
      }
      renderCards();
      renderPreview();
      status("compStatus", "ok", built.length > 1
        ? `${built.length} גרסאות. הראשונה מתפרסמת, השאר להורדה.`
        : "הכרטיס מוכן. הסמל והשעות בפנים — לא צריך לכתוב אותן בטקסט.");
    } catch (e){ status("compStatus", "bad", e.message); }
  });
}

/* ===== כתיבה ===== */
async function write(btn){
  const date = $("cDate").value;
  if (!date){ status("compStatus", "warn", "בחר תאריך."); return; }
  await withBusy(btn, async () => {
    try {
      status("compStatus", "", "");
      const s = slots().find(x => x.key === editSlot);
      const t = currentTemplate();
      const r = await ai("/ai/post", {
        idea: $("cIdea").value.trim().slice(0, 200), date, day: DAYS[fromYmd(date).getDay()],
        holiday: (holidayOn(date) || [])[1] || "",
        pillar: s ? slotLabel(s) : "", pillarNote: s ? (PILLAR3[s.pillar] || {}).note : "",
        format: $("cFormat").value,
        // התבנית היא המבנה. בלעדיה המודל ממציא מבנה חדש בכל פעם, ומשם הגנריות.
        template: t ? { name: t.name, open: t.open, body: t.body, cta: t.cta, sec: t.sec || null } : null,
        occasions: occasionsOn(date),
        dayHours: Card.hoursLineOn(date),   // הפתיחה של אותו היום. עובדה, לא ניסוח.
        photos: composerPhoto ? [composerPhoto] : [],    // התמונה שתתפרסם, אם כבר נבחרה
        avoid: aiOrigin ? aiOrigin.slice(0, 600) : "",   // גרסה אחרת = לא אותו דבר שוב
      });
      if (r.text){ $("cText").value = cleanTells(r.text); aiOrigin = $("cText").value; }
      if (Array.isArray(r.hashtags) && r.hashtags.length) $("cHash").value = r.hashtags.join(" ");
      if (r.shoot){ lastShoot = r.shoot; $("shootHint").textContent = "מה לצלם: " + r.shoot; }
      if (r.headline && $("cHead") && !$("cHead").value.trim()) $("cHead").value = r.headline;
      btn.dataset.next = "✨ גרסה אחרת";
      renderComposerMeta();
      status("compStatus", "ok", "טיוטה. עכשיו משפט אחד משלך למטה — זה מה שהופך את זה לשלכם.");
      $("cLine").focus();
    } catch (e){ status("compStatus", "bad", e.message); }
  });
  if (btn.dataset.next){ btn.textContent = btn.dataset.next; delete btn.dataset.next; }
}

async function suggestAngle(btn){
  const date = $("cDate").value; if (!date) return;
  await withBusy(btn, async () => {
    try {
      const s = slots().find(x => x.key === editSlot);
      const r = await ai("/ai/angle", { date, day: DAYS[fromYmd(date).getDay()], holiday: (holidayOn(date)||[])[1] || "",
        pillar: s ? slotLabel(s) : "", clips: clips.filter(c => c.state === "shot").map(c => c.title).slice(0, 10) });
      if (r.angle){ $("cIdea").value = r.angle; }
    } catch (e){ status("compStatus", "bad", e.message); }
  });
}

/* ===== שמירה ===== */
function mergedText(){
  const text = $("cText").value.trim();
  const line = $("cLine").value.trim();
  const body = (!line || text.includes(line)) ? text : (text ? text + "\n\n" + line : line);
  return withHours(body);
}

/* הפתיחה של אותו היום נספחת לכל פוסט. זו העובדה שהכי הרבה אנשים מחפשים,
   והיא נגזרת מהמשמרות — אז היא לא יכולה לסתור את הלוח. אם כבר כתבת אותה
   בגוף הטקסט, לא מוסיפים שוב. */
function withHours(body){
  const date = $("cDate").value;
  const h = date ? Card.hoursOn(date) : null;
  if (!h || !h.day) return body;
  if (!$("cHours") || !$("cHours").checked) return body;
  const line = h.open ? `${h.day}: ${h.text}` : `${h.day}: סגור`;
  if (body.includes(h.text) || body.includes(line)) return body;
  return body ? body + "\n\n" + line : line;
}

async function savePost(newStatus, btn){
  const date = $("cDate").value;
  if (!date){ status("compStatus", "warn", "בחר תאריך."); return; }
  const text = mergedText();
  if (newStatus !== "idea" && !text){ status("compStatus", "warn", "אין טקסט."); return; }
  // שער ההוספה: טיוטת AI לא יוצאת החוצה בלי שנגעת בה.
  if (newStatus !== "idea" && aiOrigin && !$("cLine").value.trim() && addedWords(aiOrigin, text) < 4){
    status("compStatus", "warn", "רגע. משפט אחד משלך למטה — פרט, שם, מה קרה היום — ואז מוכן.");
    $("cLine").focus(); return;
  }
  let savedId = null;
  await withBusy(btn, async () => {
    try {
      const image = $("cImage").value || "";
      pendingImage = null;
      const s = slots().find(x => x.key === editSlot);
      const body = {
        date, time: $("cTime").value || "", network: NETS, week: wid(),
        format: $("cFormat").value, pillar: s ? slotLabel(s) : "",
        idea: $("cIdea").value.trim().slice(0, 200), text: text.slice(0, 2200),
        line: $("cLine").value.trim().slice(0, 300),
        hashtags: $("cHash").value.split(/\s+/).filter(t => t.startsWith("#")).slice(0, 15),
        image, status: newStatus, at: serverTimestamp(),
      };
      /* שמירה עם merge השאירה igError של פרסום קודם שנכשל, ולכן הלוח
         המשיך לצבוע "אינסטגרם נכשל" על פוסט שנערך ונשמר מחדש. כל עוד
         הפוסט לא במצב "תוזמן", אין לתוצאות הפרסום הקודמות מה לעשות כאן. */
      if (newStatus !== "scheduled"){
        Object.assign(body, { igError: "", igPending: false, igSkipped: "" });
      }
      // הממוזערת נשמרת כדי שהלוח יהיה ויזואלי. הצילום המלא מצורף בפרסום.
      if (composerThumb) body.thumb = composerThumb;
      body.template = ($("cTemplate") && $("cTemplate").value) || "";
      body.headline = ($("cHead") && $("cHead").value.trim().slice(0, 80)) || "";
      if (composerPhoto) body.hasMedia = true;
      if (editSlot) body.slot = editSlot;
      if (aiOrigin) body.aiDraft = aiOrigin;
      if (lastShoot || $("shootHint").textContent) body.shoot = (lastShoot || $("shootHint").textContent.replace(/^מה לצלם: /, "")).slice(0, 200);
      const id = editing || ("p" + Date.now().toString(36) + Math.random().toString(36).slice(2,6));
      await setDoc(doc(db, "posts", id), body, { merge: true });
      // הצילום המלא יושב במסמך נפרד: הלוח טוען 150 פוסטים, והוא לא צריך
      // לגרור מאות קילובייט. נמחק ברגע שהפוסט מתפרסם.
      if (composerPhoto){
        try { await setDoc(doc(db, "postmedia", id), { image: composerPhoto, at: serverTimestamp() }); }
        catch { status("compStatus", "warn", "הטקסט נשמר, אבל הצילום המלא לא — פרסום מרוכז יצא בלי תמונה."); }
      }
      if (aiOrigin && newStatus !== "idea") await learnFromEdit(aiOrigin, text);
      $("cText").value = text;
      editing = id; savedId = id; $("delPost").hidden = false;
      status("compStatus", "ok", newStatus === "done" ? "סומן כפורסם." : newStatus === "ready" ? "מוכן. המשבצת סגורה." : "נשמר כטיוטה.");
      renderComposerMeta();
    } catch (e){
      status("compStatus", "bad", e.code === "permission-denied" ? "רק המנהל יכול לשמור פוסטים." : "השמירה נכשלה.");
    }
  });
  return savedId;
}

// הצילום המלא של פוסט: מהזיכרון אם הוא פתוח בקומפוזר, אחרת מהמסמך הנפרד.
async function fullPhoto(id){
  if (composerPhoto && editing === id) return composerPhoto;
  try { const d = await getDoc(doc(db, "postmedia", id)); return d.exists() ? (d.data().image || "") : ""; }
  catch { return ""; }
}
// אחרי שהפוסט יצא אין למה להחזיק את המקור. הממוזערת נשארת ללוח.
const dropMedia = (id) => deleteDoc(doc(db, "postmedia", id)).catch(() => {});

// שיגור פוסט אחד: מחזיר את תשובת השרת, או זורק.
async function sendToMeta(id, when){
  const p = S.posts.find(x => x.id === id) || {};
  const text = [p.text || "", (p.hashtags || []).join(" ")].filter(Boolean).join("\n\n").slice(0, 2200);
  const r = await api("/publish/schedule", { postId: id, text, image: await fullPhoto(id), at: when.getTime() });
  if (!r.saved){
    await setDoc(doc(db, "posts", id), {
      status: "scheduled", fbPostId: r.fbPostId || "", fbPhotoId: r.fbPhotoId || "",
      publishAt: r.publishAt || when.getTime(), igPending: !!r.igPending,
      igPostId: r.igPostId || "", igSkipped: r.igSkipped || "", igError: r.igError || "",
    }, { merge: true });
  }
  if (!r.igPending) dropMedia(id);       // עוד בתור → השרת עוד יצטרך את התמונה
  return r;
}

/* ===== תזמון: נגיעה אחת, שתי רשתות =====
   הלולאה הישנה הייתה: הורד CSV → פתח מתזמן → ייבא → העלה תמונה לכל פוסט →
   חזור → סמן "תוזמן" → אחר כך סמן "פורסם". עכשיו: כפתור אחד.
   פייסבוק מתזמן לבד; אינסטגרם נכנס לתור של השרת ומתפרסם בדקה. */
async function schedulePost(btn){
  const when = new Date(`${$("cDate").value}T${$("cTime").value || "10:30"}`);
  if (isNaN(when)){ status("compStatus", "warn", "צריך תאריך ושעה כדי לתזמן."); return; }

  const id = await savePost("ready", null);      // השער נאכף כאן, לפני שיוצא החוצה
  if (!id) return;

  await withBusy(btn, async () => {
    try {
      status("compStatus", "", "שולח…");
      const r = await sendToMeta(id, when);
      const at = new Date(r.publishAt || when.getTime());
      const now = Math.abs(at - Date.now()) < 11 * 60000;
      const fb = now ? "פורסם בפייסבוק" : `מתוזמן לפייסבוק ל-${dm(at)} ${String(at.getHours()).padStart(2,"0")}:${String(at.getMinutes()).padStart(2,"0")}`;
      const ig = r.igPostId ? "ופורסם באינסטגרם" : r.igPending ? "אינסטגרם בתור ויעלה באותה דקה"
               : r.igError ? "אינסטגרם נכשל: " + r.igError : r.igSkipped ? "בלי אינסטגרם — " + r.igSkipped : "";
      status("compStatus", r.igError ? "warn" : "ok", [fb, ig].filter(Boolean).join(". ") + ".");
      if (!r.igError) setTimeout(closeSheet, 1600);
    } catch (e){ status("compStatus", "bad", e.message); }
  });
}

async function removePost(){
  if (!editing || !confirm("למחוק את הפוסט?")) return;
  try { await deleteDoc(doc(db, "posts", editing)); resetComposer(); closeSheet(); }
  catch { status("compStatus", "bad", "המחיקה נכשלה."); }
}

/* ===== בנק הקליפים ===== */
// חומר גלם שצולם מראש. הפוסט נולד מהקליפ, לא מהלוח.
async function saveClips(items){
  try { await setDoc(doc(db, "brand", "clips"), { items: items.slice(-60), updatedAt: serverTimestamp() }, { merge: true }); }
  catch { status("clipStatus", "bad", "לא נשמר. רק המנהל יכול."); }
}
const CLIP_STATE = { idea: "לצלם", shot: "צולם", used: "נוצל" };
function renderClips(){
  const box = $("clipList"); if (!box) return;
  clear(box);
  const ready = clips.filter(c => c.state === "shot");
  const cnt = $("clipCount");
  cnt.textContent = `${ready.length} מוכנים`;
  cnt.className = "pill " + (ready.length >= 3 ? "ok" : "warn");
  const warn = $("clipWarn");
  warn.hidden = ready.length >= 3;
  const every = (rhythm && +rhythm.shootEvery) || 14;
  const last = rhythm && rhythm.lastShoot;
  const next = last ? addDays(fromYmd(last), every) : null;
  const daysLeft = next ? Math.ceil((next - new Date()) / 864e5) : null;
  $("shootNext").textContent = !last ? "עוד לא סימנת יום צילום." :
    daysLeft > 0 ? `צילום הבא בעוד ${daysLeft} ימים (${DAYS[next.getDay()]} ${dm(next)}).` : "הגיע הזמן לצלם שוב.";
  if (!clips.length){ box.append(el("p", { class: "small", text: "ריק. כתוב למטה מה לצלם ביום הצילום הבא — 20 דקות של צילום מכסות שבועיים." })); return; }
  [...clips].sort((a,b) => (a.state === "used") - (b.state === "used")).forEach(c => {
    const row = el("div", { class: "cliprow " + c.state });
    row.append(el("div", { class: "grow" },
      el("span", { text: c.title }), " ",
      el("span", { class: "pill " + (c.state === "shot" ? "ok" : c.state === "idea" ? "warn" : ""), text: CLIP_STATE[c.state] || "" })));
    if (c.state === "idea") row.append(el("button", { text: "צולם ✓", onclick: () => setClip(c.id, "shot") }));
    if (c.state === "shot") row.append(el("button", { class: "primary", text: "לפוסט", onclick: () => useClip(c) }));
    row.append(el("button", { class: "icon", title: "הסר", text: "✕", onclick: () => saveClips(clips.filter(x => x.id !== c.id)) }));
    box.append(row);
  });
}
function setClip(id, state){ saveClips(clips.map(c => c.id === id ? { ...c, state } : c)); }
function addClip(title){
  title = (title || "").trim(); if (!title) return;
  saveClips([...clips, { id: "c" + Date.now().toString(36), title: title.slice(0, 120), state: "idea", at: Date.now() }]);
}
// קליפ נכנס לפוסט: אם יש משבצת ריקה של העמוד המתאים פותחים אותה, אחרת פוסט חופשי.
function useClip(c){
  const empty = slots().find(s => s.pillar !== "when" && !slotPost(s) && !isPast(s));
  if (empty) openSlot(empty); else newPost();
  $("cIdea").value = c.title;
  setClip(c.id, "used");
  status("compStatus", "ok", "הקליפ בפוסט. עכשיו טיוטה.");
}

/* ===== ייצוא למתזמן החיצוני ===== */
const fullText = (p) => [p.text || "", (p.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
const netLabel = (p) => { const n = p.network || NETS; return n.length > 1 ? "פייסבוק + אינסטגרם" : n[0] === "facebook" ? "פייסבוק" : "אינסטגרם"; };

function exportRows(){
  const dates = weekDates();
  return S.posts.filter(p => dates.includes(p.date) && ["ready"].includes(p.status) && (p.text || "").trim())
    .sort((a,b) => (a.date + (a.time||"")).localeCompare(b.date + (b.time||"")));
}

function exportCsv(){
  const rows = exportRows();
  if (!rows.length){ status("exportStatus", "warn", "אין פוסטים מוכנים לשבוע הזה. סמן 'מוכן' במשבצות."); return; }
  /* תא שמתחיל ב-= + - או @ נחשב לנוסחה באקסל ובגיליונות. טיוטה שנפתחת
     ב-"=מחר פתוחים" מתפרשת שם כנוסחה, והכיתוב נהרס. גרש מוביל מנטרל. */
  const esc = (v) => {
    let s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = ["date","time","network","text","link","image"];
  const body = [];
  rows.forEach(p => (p.network || NETS).forEach(net =>
    body.push([p.date, p.time || "10:30", net, fullText(p), "", p.image || ""].map(esc).join(","))));
  download(`cortado-${wid()}.csv`, [head.join(","), ...body].join("\n"), "text/csv;charset=utf-8");
  status("exportStatus", "ok", `${rows.length} פוסטים, שורה לכל רשת. העלה במתזמן (Bulk / Import), ואז "כולם תוזמנו ✓".`);
}

function copyAll(btn){
  const rows = exportRows();
  if (!rows.length){ status("exportStatus", "warn", "אין פוסטים מוכנים."); return; }
  const txt = rows.map(p => {
    const d = fromYmd(p.date);
    return `── ${DAYS[d.getDay()]} ${dm(d)} · ${p.time || ""} · ${netLabel(p)} · ${(FORMATS.find(f=>f.key===p.format)||{}).label || ""}\n${fullText(p)}${p.image ? "\nתמונה: " + p.image : ""}`;
  }).join("\n\n");
  copyText(txt, btn, "העתק הכל");
  status("exportStatus", "ok", "הכל הועתק. הדבק במתזמן.");
}

function renderExport(){
  const box = clear($("exportList"));
  const rows = exportRows();
  // שני מצבים, לא שתי דרכים: יש שרת מחובר → משגרים מכאן. אין → CSV.
  const live = publishOk;
  const head = $("exportHow");
  if (head) head.textContent = live
    ? "לחיצה אחת משגרת את כל המוכנים לפייסבוק ולאינסטגרם, כל אחד בשעה שלו."
    : "העמוד עוד לא מחובר לשרת, אז הייצוא הוא למתזמן חיצוני.";
  const only = (id, show) => { const n = $(id); if (n) n.hidden = !show; };
  only("sendAll", live);
  only("exportCsv", !live);
  only("scheduleAll", !live);
  only("copyWeek", !live);
  if (!rows.length){ box.append(el("p", { class: "small", text: "כשמשבצת מסומנת 'מוכן' היא מופיעה כאן." })); return; }
  rows.forEach(p => {
    const d = fromYmd(p.date);
    box.append(el("div", { class: "idea" },
      el("div", { class: "grow" },
        el("div", {}, el("b", { text: DAYS[d.getDay()] + " " + dm(d) }), " ", el("span", { class: "mono", text: p.time || "" }),
          " ", el("span", { class: "pill", text: netLabel(p) })),
        el("div", { class: "small clip", text: (p.text || "").slice(0, 100) })),
      el("button", { text: "העתק", onclick: (e) => copyText(fullText(p), e.currentTarget, "העתק") }),
      el("button", { class: "primary", text: "תוזמן ✓", onclick: () => markScheduled(p.id) })));
  });
}
async function markScheduled(id){
  try { await setDoc(doc(db, "posts", id), { status: "scheduled" }, { merge: true }); return true; }
  catch { status("exportStatus", "bad", "העדכון נכשל."); return false; }
}
/* ===== שיגור כל המוכנים =====
   עד עכשיו היו שתי דרכים לאותו דבר: "תזמן ופרסם" בקומפוזר, ולידו כרטיס
   CSV שמייצא למתזמן חיצוני. שתי דרכים לאותו יעד הן החלטה מיותרת. עכשיו
   הכרטיס משגר בעצמו — וה-CSV נשאר רק כשאין שרת מחובר. */
// נבדק כשפותחים את הכרטיס — הרגע היחיד שבו זה מעניין — ולא בכל ציור.
// הצלחה נזכרת; כישלון ייבדק שוב בפתיחה הבאה, כך שתקלת רשת חולפת לא
// נועלת את הכרטיס על מסלול ה-CSV.
let publishOk = false;
async function checkPublish(){
  if (publishOk) return true;
  if (!WORKER_URL || !S.isOwner) return false;
  try { const r = await api("/publish/state", {}); publishOk = !!(r && r.facebook); }
  catch { publishOk = false; }
  renderExport();
  return publishOk;
}

async function sendAllReady(btn){
  const rows = exportRows();
  if (!rows.length){ status("exportStatus", "warn", "אין פוסטים מוכנים לשגר."); return; }
  if (!confirm(`לשגר ${rows.length} פוסטים לפייסבוק ולאינסטגרם?`)) return;
  await withBusy(btn, async () => {
    let ok = 0; const bad = [];
    for (const p of rows){
      status("exportStatus", "", `משגר ${ok + bad.length + 1} מתוך ${rows.length}…`);
      const when = new Date(`${p.date}T${p.time || "10:30"}`);
      try { await sendToMeta(p.id, isNaN(when) ? new Date() : when); ok++; }
      catch (e){ bad.push(`${dm(fromYmd(p.date))}: ${e.message}`); }
    }
    status("exportStatus", bad.length ? (ok ? "warn" : "bad") : "ok",
      bad.length ? `${ok} שוגרו. נכשלו — ${bad.join(" · ")}` : `${ok} פוסטים שוגרו. מה שמתוזמן יעלה לבד בשעה שלו.`);
  });
}

async function markAllScheduled(btn){
  const rows = exportRows();
  if (!rows.length){ status("exportStatus", "warn", "אין פוסטים מוכנים לסמן."); return; }
  await withBusy(btn, async () => {
    // סופרים הצלחות. קודם הלולאה דרסה את הודעת הכישלון ב-"ok" עם המספר
    // המלא, והבעלים קיבל "4 סומנו" בזמן שאף אחד מהם לא נשמר.
    let done = 0;
    for (const p of rows) if (await markScheduled(p.id)) done++;
    if (!done) status("exportStatus", "bad", "אף פוסט לא סומן. בדוק חיבור ונסה שוב.");
    else if (done < rows.length) status("exportStatus", "warn", `${done} מתוך ${rows.length} סומנו. נסה שוב את השאר.`);
    else status("exportStatus", "ok", `${done} סומנו כמתוזמנים. "פורסם" יסומן לבד כשהזמן יעבור.`);
  });
}

// פוסט שתוזמן במתזמן וזמנו עבר — פורסם. המתזמן עשה את זה, לא צריך לספר לאפליקציה.
// רץ בכל ציור; כותב רק מה שהשתנה, פעם אחת לכל פוסט.
const sweeping = new Set();
function sweepPublished(){
  if (!S.isOwner) return;
  const now = new Date();
  for (const p of S.posts){
    if (p.status !== "scheduled" || !p.date || sweeping.has(p.id)) continue;
    if (p.igPending || p.igError) continue;      // עוד בתור או נכשל — לא "פורסם"
    const at = fromYmd(p.date); const [h, m] = String(p.time || "23:59").split(":").map(Number);
    at.setHours(h || 0, m || 0, 0, 0);
    if (at > now) continue;
    sweeping.add(p.id);
    setDoc(doc(db, "posts", p.id), { status: "done", doneAt: serverTimestamp(), doneBy: "auto" }, { merge: true })
      .catch(() => sweeping.delete(p.id));
  }
}

/* ===== ציור ===== */
// כמה משבצות מוכנות השבוע. משמש את שורת "עכשיו".
export function weekProgress(){
  // רק משבצות שעוד אפשר למלא. משבצת שעברה וריקה אינה חוב.
  const live = slots().filter(s => slotPost(s) || !isPast(s));
  return { done: live.filter(s => isDone(slotPost(s))).length, total: live.length };
}
export function render(){
  sweepPublished();
  emit("state");
  if ($("p-creative").hidden) return;
  renderBoard();
  renderExport();
  renderComposerMeta();
}

/* ===== חיווט ===== */
export function init(){
  FORMATS.forEach(f => $("cFormat").append(el("option", { value: f.key, text: f.label })));

  $("cDate").addEventListener("change", renderComposerMeta);
  $("cFormat").addEventListener("change", renderComposerMeta);
  $("cText").addEventListener("input", renderComposerMeta);
  $("cLine").addEventListener("input", renderComposerMeta);
  $("cleanTells").addEventListener("click", () => { $("cText").value = cleanTells($("cText").value); renderComposerMeta(); });

  $("aiWrite").addEventListener("click", (e) => write(e.currentTarget));
  // התבנית, הכותרת והכרטיס
  if ($("cTemplate")) $("cTemplate").addEventListener("change", renderTemplateNote);
  if ($("cBuildCard")) $("cBuildCard").addEventListener("click", (e) => buildCard(e.currentTarget));
  if ($("cHead")) $("cHead").addEventListener("input", renderPreview);
  if ($("cHours")) $("cHours").addEventListener("change", renderComposerMeta);
  renderTargets();
  Card.bind();
  Card.bindDesigner();
  // בחירת צילום מלאי: נכנס כבסיס לכרטיס, בלי להעלות שום דבר לאחסון.
  // לחיצה על פריט בספרייה: צילום הופך לבסיס הכרטיס. סמל או מדבקה הם
  // שכבה, לא רקע — ולשם הם נוספים דרך פאנל העיצוב.
  Card.onPickShot((a) => {
    if (a.kind !== "photo"){
      status("compStatus", "warn", `"${a.name}" הוא ${Card.KINDS[a.kind]}. להוסיף אותו לכרטיס: פאנל "עיצוב הכרטיס" ← שכבות נוספות ← + תמונה מהספרייה.`);
      return;
    }
    composerPhoto = a.url;
    Card.thumbOf(a.url).then(u => { composerThumb = u; renderPreview(); });
    renderPreview();
    status("compStatus", "ok", `${a.name} נבחר. עכשיו "בנה כרטיס".`);
  });
  $("aiAngle").addEventListener("click", (e) => suggestAngle(e.currentTarget));
  $("aiPlan").addEventListener("click", (e) => skeleton(e.currentTarget));
  $("saveIdea").addEventListener("click", (e) => savePost("idea", e.currentTarget));
  $("saveReady").addEventListener("click", (e) => savePost("ready", e.currentTarget));
  $("markDone").addEventListener("click", (e) => savePost("done", e.currentTarget));
  $("schedulePost").addEventListener("click", (e) => schedulePost(e.currentTarget));
  $("newPost").addEventListener("click", () => newPost());
  $("delPost").addEventListener("click", removePost);
  $("closeComposer").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("composer").hidden) closeSheet();
  });
  $("cHash").addEventListener("input", renderPreview);
  $("cImage").addEventListener("input", renderPreview);
  $("copyPost").addEventListener("click", (e) => {
    const p = { text: mergedText(), hashtags: $("cHash").value.split(/\s+/).filter(Boolean) };
    copyText(fullText(p), e.currentTarget, "העתק טקסט");
  });
  $("cPhoto").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024){ status("compStatus", "warn", "התמונה גדולה מ-8MB."); e.target.value = ""; return; }
    pendingImage = f;
    // שתי גרסאות: אחת ל-AI שיראה מה באמת בתמונה, ואחת קטנה שנשמרת ללוח.
    shrinkToDataUrl(f).then(u => { composerPhoto = u; renderPreview(); }).catch(() => { composerPhoto = null; });
    shrinkToDataUrl(f, THUMB_PX, THUMB_QUALITY).then(u => { composerThumb = u; renderPreview(); })
      .catch(() => { composerThumb = null; });
    status("compStatus", "ok", "הצילום נכנס לטיוטה וללוח. את המקור מצרפים בפרסום.");
  });

  // השיחה השבועית
  $("briefStart").addEventListener("click", (e) => startBrief(e.currentTarget));
  $("briefPhotos").addEventListener("change", (e) => {
    const files = [...(e.target.files || [])].filter(f => f.size <= 8 * 1024 * 1024);
    briefPending = files.slice(0, 6);
    if (briefPending.length < (e.target.files || []).length)
      status("briefStatus", "warn", "לקחתי עד 6 תמונות, וכל אחת עד 8MB.");
    else status("briefStatus", "", `${briefPending.length} תמונות מוכנות להעלאה.`);
  });
  $("briefSend").addEventListener("click", () => answer($("briefFree").value));
  $("briefFree").addEventListener("keydown", (e) => { if (e.key === "Enter"){ e.preventDefault(); answer(e.target.value); } });
  $("briefSkip").addEventListener("click", () => { if (askedQ) answer("לא רלוונטי"); });
  $("briefStop").addEventListener("click", () => buildWeek());
  $("briefRestart").addEventListener("click", () => {
    brief = { text: "", photos: [], answers: [] }; briefFull = [];
    briefPending = []; askedQ = null;
    $("briefText").value = "";
    $("briefDone").hidden = true; $("briefQuestion").hidden = true; $("briefIntake").hidden = false;
    saveBrief(); renderBrief(); status("briefStatus", "", "");
  });

  $("exportCsv").addEventListener("click", exportCsv);
  $("scheduleAll").addEventListener("click", (e) => markAllScheduled(e.currentTarget));
  $("sendAll").addEventListener("click", (e) => sendAllReady(e.currentTarget));
  $("exportCard").addEventListener("toggle", (e) => { if (e.target.open) checkPublish(); });
  $("copyWeek").addEventListener("click", (e) => copyAll(e.currentTarget));

  // בנק הקליפים
  $("addClip").addEventListener("click", () => { addClip($("clipNew").value); $("clipNew").value = ""; });
  $("clipNew").addEventListener("keydown", (e) => { if (e.key === "Enter"){ e.preventDefault(); addClip(e.target.value); e.target.value = ""; } });
  $("shotToday").addEventListener("click", () => saveRhythm({ lastShoot: ymd(new Date()) }));

  // הקצב
  renderRhythm();
  $("rhythmSave").addEventListener("click", () => saveRhythm({ slots: readRhythm(), shootEvery: Math.max(7, Math.min(60, +$("shootEvery").value || 14)) }));
  $("rhythmReset").addEventListener("click", () => saveRhythm({ slots: DEFAULT_SLOTS, shootEvery: 14 }));

  // הקול
  $("memTone").addEventListener("change", (e) => saveMemory({ tone: e.target.value.trim().slice(0, 500) }));
  $("addSample").addEventListener("click", () => { addSample($("memSample").value); $("memSample").value = ""; });
  $("addLike").addEventListener("click", () => { addRule("likes", $("memLike").value.trim()); $("memLike").value = ""; });
  $("addAvoid").addEventListener("click", () => { addRule("avoid", $("memAvoid").value.trim()); $("memAvoid").value = ""; });
  $("addFact").addEventListener("click", () => { addRule("facts", $("memFact").value.trim()); $("memFact").value = ""; });

  on("weekchanged", subscribeCreative);
  on("locked", () => { status("planStatus", "ok", "השבוע ננעל. השעות במשבצת 'מתי ואיפה' סופיות."); });
  resetComposer();
  $("compTitle").textContent = "פוסט";
  $("cDate").value = ymd(addDays(new Date(), 1));
  renderComposerMeta();
}
