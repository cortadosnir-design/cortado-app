// קריאייטיב: ארבע משבצות קבועות בשבוע, בנק קליפים, טיוטה אחת שנשענת על הקול שלך, ושער ההוספה.
// העיקרון: הקצב נקבע פעם אחת. כל שבוע רק ממלאים את המשבצות. משבצת ריקה היא משימה, לא חור בלוח.
import { S, db, DAYS, $, el, clear, ymd, dm, addDays, fromYmd, toMin, weekId, holidayOn,
  status, copyText, download, withBusy, api, WORKER_URL, track, on, emit,
  doc, setDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot, serverTimestamp
  } from "./core.js";
import { FORMATS, TIMING, HASHTAGS, VOICE } from "./playbook.js";
import { openDays, phase, wid, hoursByDay } from "./shifts.js";

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
let rhythm = null;           // brand/rhythm
let clips = [];              // brand/clips.items

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
}

let unsubCreative = null;
function subscribeCreative(){
  if (unsubCreative) { try { unsubCreative(); } catch {} }
  S.creative = {};
  brief = { text: "", photos: [], answers: [] };
  unsubCreative = onSnapshot(doc(db, "creative", wid()),
    (snap) => { S.creative = snap.exists() ? snap.data() : {}; loadBrief(); render(); },
    () => {});
  track(unsubCreative);
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

/* ===== המשבצות של השבוע ===== */
function renderSlots(){
  const box = clear($("slotList"));
  const ph = phase(), open = openDays();
  const list = slots();
  // כל משבצת עם הפוסט שלה ועם השאלה אם זמנה כבר חלף.
  const items = list.map(s => ({ s, p: slotPost(s), past: isPast(s) }));
  // משבצת שעברה ונשארה ריקה יורדת מהחשבון. משבצת שעברה ויש בה פוסט נשארת בפנים.
  const active = items.filter(it => !(it.past && !it.p));
  const missed = items.length - active.length;
  const done = active.filter(it => isDone(it.p)).length;
  const allDone = active.length > 0 && done === active.length;

  const head = $("slotState");
  head.className = "pill " + (allDone ? "ok" : done ? "warn" : "");
  head.textContent = allDone ? "השבוע סגור ✓"
    : `${done}/${active.length} מוכנים` + (missed ? ` · ${missed} עברו` : "");

  if (ph !== "locked"){
    box.append(el("div", { class: "notice", text:
      !open.length ? "עוד לא נקבעו ימי פעילות. משבצת 'מתי ואיפה' תתמלא בשעות ברגע שיהיו." :
      ph === "open" ? "השיבוץ עדיין פתוח. אפשר לכתוב, אבל השעות עוד יכולות להשתנות." :
      "השבוע עוד לא נפתח לשיבוץ. אפשר כבר לכתוב, השעות יתעדכנו בפוסט לבד." }));
  }

  const skel = (S.creative && S.creative.slots) || {};
  items.forEach(({ s, p, past }) => {
    const gone = past && !p;                       // עבר וריק
    const date = slotDate(s);
    const h = holidayOn(date);
    const card = el("div", { class: "slot " + (gone ? "gone" : isDone(p) ? "done" : p ? "draft" : "empty") });
    card.append(el("div", { class: "slothead" },
      el("div", {}, el("b", { text: slotLabel(s) }),
        el("span", { class: "small", text: ` · ${DAYS[s.day]} ${dm(addDays(S.weekStart, s.day))} · ${s.time}` }),
        h ? el("span", { class: "hol", text: h[1] }) : null),
      el("span", { class: "pill " + (gone ? "" : isDone(p) ? "ok" : p ? "warn" : ""),
        text: gone ? "עבר" : p ? STATUS_LABEL[p.status] || "טיוטה" : "ריק" })));
    if (p){
      card.append(el("div", { class: "small clip", text: (p.text || p.idea || "").slice(0, 110) }));
    } else if (gone){
      card.append(el("div", { class: "small muted", text: "הזמן של המשבצת הזו חלף. היא תחזור בשבוע הבא." }));
    } else {
      const sk = skel[s.key];
      card.append(el("div", { class: "small", text: sk && sk.angle ? "כיוון: " + sk.angle : "עוד לא נכתב. " + (PILLAR3[s.pillar] || {}).note }));
    }
    card.append(el("div", { class: "actions" },
      el("button", { class: (p || gone) ? "link" : "primary",
        text: !p ? (gone ? "כתוב בכל זאת" : "כתוב") : isDone(p) ? "פתח" : "המשך",
        onclick: () => p ? loadPost(p.id) : openSlot(s) }),
      isDone(p) ? el("button", { class: "link", text: "העתק", onclick: (e) => copyText(fullText(p), e.currentTarget, "העתק") }) : null));
    box.append(card);
  });

  // פוסטים מחוץ לקצב (אירוע, דוכן אורח, חג)
  const extra = S.posts.filter(p => weekDates().includes(p.date) && !(p.week === wid() && list.some(s => s.key === p.slot)))
    .sort((a,b) => (a.date + (a.time||"")).localeCompare(b.date + (b.time||"")));
  if (extra.length){
    const wrap = el("div", { class: "extras" }, el("h3", { class: "sub", text: "מעבר לקצב" }));
    extra.forEach(p => wrap.append(el("div", { class: "idea" },
      el("div", { class: "grow" },
        el("div", {}, el("b", { text: DAYS[fromYmd(p.date).getDay()] + " " + dm(fromYmd(p.date)) }), " ",
          el("span", { class: "mono small", text: p.time || "" }), " ",
          el("span", { class: "pill " + (isDone(p) ? "ok" : ""), text: STATUS_LABEL[p.status] || "טיוטה" })),
        el("div", { class: "small clip", text: (p.text || p.idea || "").slice(0, 90) })),
      el("button", { text: "פתח", onclick: () => loadPost(p.id) }))));
    box.append(wrap);
  }
  if (allDone)
    box.append(el("div", { class: "notice ok", text: "כל המשבצות מוכנות. הורד את ה-CSV למתזמן, וזהו — השבוע סגור." }));
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
        brief: brief.text, photos: brief.photos, answers: brief.answers,
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
let brief = { text: "", photos: [], answers: [] };
let askedQ = null;          // השאלה שעל המסך כרגע
let briefPending = [];      // קבצים שנבחרו וטרם הועלו

function loadBrief(){
  const c = (S.creative && S.creative.brief) || null;
  if (!c) return;
  brief = { text: c.text || "", photos: Array.isArray(c.photos) ? c.photos : [], answers: Array.isArray(c.answers) ? c.answers : [] };
  const box = $("briefText");
  if (box && document.activeElement !== box && !box.value) box.value = brief.text;
  renderBrief();
}

async function saveBrief(){
  try { await setDoc(doc(db, "creative", wid()), { week: wid(), brief, at: serverTimestamp() }, { merge: true }); }
  catch {}
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
        onclick: () => { brief.photos = brief.photos.filter((_, j) => j !== i); saveBrief(); renderBrief(); } }))));
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

// אין Firebase Storage (תוכנית Spark). התמונות לא נשמרות בשום מקום:
// הן מוקטנות כאן בדפדפן, נשלחות ל-AI כ-data URL, ונעלמות עם רענון הדף.
const PHOTO_MAX_PX = 1280;
const PHOTO_QUALITY = 0.72;

function shrinkToDataUrl(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", PHOTO_QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}

async function uploadBriefPhotos(){
  if (!briefPending.length) return;
  status("briefStatus", "", `מכין ${briefPending.length} תמונות…`);
  for (const f of briefPending.slice(0, 6 - brief.photos.length)){
    try { brief.photos.push(await shrinkToDataUrl(f)); }
    catch { status("briefStatus", "bad", "תמונה אחת לא נקראה."); }
  }
  briefPending = [];
  $("briefPhotos").value = "";
}

async function nextQuestion(){
  const r = await api("/ai/brief", { ...aiContext(), brief: brief.text, photos: brief.photos, answers: brief.answers, max: MAX_Q });
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
    words: WORDS,
  };
}
const ai = (path, body) => api(path, { ...aiContext(), ...body });

/* ===== עורך הפוסט ===== */
function resetComposer(){
  editing = null; editSlot = null; aiOrigin = null; pendingImage = null; lastShoot = "";
  $("cText").value = ""; $("cLine").value = ""; $("cIdea").value = "";
  $("cHash").value = defaultHashtags().join(" ");
  $("cImage").value = ""; $("cPreview").hidden = true; $("cPhoto").value = "";
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
  $("composer").hidden = false;
  $("composer").scrollIntoView({ behavior: "smooth", block: "start" });
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
  $("composer").hidden = false;
  $("composer").scrollIntoView({ behavior: "smooth", block: "start" });
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
  $("cPreview").hidden = !p.image; if (p.image) $("cPreview").src = p.image;
  if (p.shoot) $("shootHint").textContent = "מה לצלם: " + p.shoot;
  const s = slots().find(x => x.key === p.slot);
  $("compTitle").textContent = s ? `${slotLabel(s)} · ${DAYS[fromYmd(p.date).getDay()]} ${dm(fromYmd(p.date))}` : "עריכת פוסט";
  $("timeWhy").textContent = s ? "השעה הקבועה של המשבצת." : "";
  if (aiOrigin) $("aiWrite").textContent = "✨ גרסה אחרת";
  $("delPost").hidden = false;
  renderComposerMeta();
  $("composer").hidden = false;
  $("composer").scrollIntoView({ behavior: "smooth", block: "start" });
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
}

/* ===== כתיבה ===== */
async function write(btn){
  const date = $("cDate").value;
  if (!date){ status("compStatus", "warn", "בחר תאריך."); return; }
  await withBusy(btn, async () => {
    try {
      status("compStatus", "", "");
      const s = slots().find(x => x.key === editSlot);
      const r = await ai("/ai/post", {
        idea: $("cIdea").value.trim().slice(0, 200), date, day: DAYS[fromYmd(date).getDay()],
        holiday: (holidayOn(date) || [])[1] || "",
        pillar: s ? slotLabel(s) : "", pillarNote: s ? (PILLAR3[s.pillar] || {}).note : "",
        format: $("cFormat").value,
        avoid: aiOrigin ? aiOrigin.slice(0, 600) : "",   // גרסה אחרת = לא אותו דבר שוב
      });
      if (r.text){ $("cText").value = cleanTells(r.text); aiOrigin = $("cText").value; }
      if (Array.isArray(r.hashtags) && r.hashtags.length) $("cHash").value = r.hashtags.join(" ");
      if (r.shoot){ lastShoot = r.shoot; $("shootHint").textContent = "מה לצלם: " + r.shoot; }
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
  if (!line || text.includes(line)) return text;
  return text ? text + "\n\n" + line : line;
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
  await withBusy(btn, async () => {
    try {
      let image = $("cImage").value || "";
      if (pendingImage){
        // בלי Firebase Storage אין לאן להעלות. התמונה נשארת בתצוגה המקדימה בלבד,
        // ומצורפת ידנית בזמן הפרסום. שדה "כתובת תמונה" ממשיך לעבוד לקישור חיצוני.
        pendingImage = null;
        status("compStatus", "warn", "התמונה לא נשמרת — צרפי אותה ידנית בפרסום.");
      }
      const s = slots().find(x => x.key === editSlot);
      const body = {
        date, time: $("cTime").value || "", network: NETS, week: wid(),
        format: $("cFormat").value, pillar: s ? slotLabel(s) : "",
        idea: $("cIdea").value.trim().slice(0, 200), text: text.slice(0, 2200),
        line: $("cLine").value.trim().slice(0, 300),
        hashtags: $("cHash").value.split(/\s+/).filter(t => t.startsWith("#")).slice(0, 15),
        image, status: newStatus, at: serverTimestamp(),
      };
      if (editSlot) body.slot = editSlot;
      if (aiOrigin) body.aiDraft = aiOrigin;
      if (lastShoot || $("shootHint").textContent) body.shoot = (lastShoot || $("shootHint").textContent.replace(/^מה לצלם: /, "")).slice(0, 200);
      const id = editing || ("p" + Date.now().toString(36) + Math.random().toString(36).slice(2,6));
      await setDoc(doc(db, "posts", id), body, { merge: true });
      if (aiOrigin && newStatus !== "idea") await learnFromEdit(aiOrigin, text);
      $("cText").value = text;
      editing = id; $("delPost").hidden = false;
      status("compStatus", "ok", newStatus === "done" ? "סומן כפורסם." : newStatus === "ready" ? "מוכן. המשבצת סגורה." : "נשמר כטיוטה.");
      renderComposerMeta();
    } catch (e){
      status("compStatus", "bad", e.code === "permission-denied" ? "רק המנהל יכול לשמור פוסטים." : "השמירה נכשלה.");
    }
  });
}

async function removePost(){
  if (!editing || !confirm("למחוק את הפוסט?")) return;
  try { await deleteDoc(doc(db, "posts", editing)); resetComposer(); $("composer").hidden = true; }
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
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = ["date","time","network","text","link","image"];
  const body = [];
  rows.forEach(p => (p.network || NETS).forEach(net =>
    body.push([p.date, p.time || "10:30", net, fullText(p), "", p.image || ""].map(esc).join(","))));
  download(`cortado-${wid()}.csv`, [head.join(","), ...body].join("\n"), "text/csv;charset=utf-8");
  status("exportStatus", "ok", `${rows.length} פוסטים, שורה לכל רשת. העלה במתזמן (Bulk / Import) וסמן כאן 'תוזמן'.`);
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
  try { await setDoc(doc(db, "posts", id), { status: "scheduled" }, { merge: true }); }
  catch { status("exportStatus", "bad", "העדכון נכשל."); }
}

/* ===== ציור ===== */
// כמה משבצות מוכנות השבוע. משמש את שורת "עכשיו".
export function weekProgress(){
  // רק משבצות שעוד אפשר למלא. משבצת שעברה וריקה אינה חוב.
  const live = slots().filter(s => slotPost(s) || !isPast(s));
  return { done: live.filter(s => isDone(slotPost(s))).length, total: live.length };
}
export function render(){
  emit("state");
  if ($("p-creative").hidden) return;
  renderSlots();
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
  $("aiAngle").addEventListener("click", (e) => suggestAngle(e.currentTarget));
  $("aiPlan").addEventListener("click", (e) => skeleton(e.currentTarget));
  $("saveIdea").addEventListener("click", (e) => savePost("idea", e.currentTarget));
  $("saveReady").addEventListener("click", (e) => savePost("ready", e.currentTarget));
  $("markDone").addEventListener("click", (e) => savePost("done", e.currentTarget));
  $("newPost").addEventListener("click", () => newPost());
  $("delPost").addEventListener("click", removePost);
  $("closeComposer").addEventListener("click", () => { $("composer").hidden = true; $("slotList").scrollIntoView({ behavior: "smooth", block: "start" }); });
  $("copyPost").addEventListener("click", (e) => {
    const p = { text: mergedText(), hashtags: $("cHash").value.split(/\s+/).filter(Boolean) };
    copyText(fullText(p), e.currentTarget, "העתק טקסט");
  });
  $("cPhoto").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024){ status("compStatus", "warn", "התמונה גדולה מ-8MB."); e.target.value = ""; return; }
    pendingImage = f;
    const r = new FileReader();
    r.onload = () => { $("cPreview").src = r.result; $("cPreview").hidden = false; };
    r.readAsDataURL(f);
    status("compStatus", "ok", "התמונה תעלה בשמירה.");
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
    brief = { text: "", photos: [], answers: [] };
    briefPending = []; askedQ = null;
    $("briefText").value = "";
    $("briefDone").hidden = true; $("briefQuestion").hidden = true; $("briefIntake").hidden = false;
    saveBrief(); renderBrief(); status("briefStatus", "", "");
  });

  $("exportCsv").addEventListener("click", exportCsv);
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
