// קריאייטיב: זווית לכל יום פעילות, כתיבה עם זיכרון מותג, ולמידה מכל תיקון שלך.
import { S, db, storage, DAYS, $, el, clear, ymd, dm, addDays, fromYmd, weekId, holidayOn,
  status, copyText, download, withBusy, api, WORKER_URL, track, on, emit,
  doc, setDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp,
  sRef, uploadBytes, getDownloadURL } from "./core.js";
import { PILLARS, FORMATS, TIMING, HASHTAGS, AMPLIFIERS, VOICE, BENCHMARKS } from "./playbook.js";
import { shiftsOf, openDays, phase, wid, hoursByDay } from "./shifts.js";

let editing = null;          // מזהה הפוסט הנערך
let aiOrigin = null;         // הטקסט שה-AI הציע, כדי ללמוד מהתיקון
let pendingImage = null;

const STATUS_LABEL = { idea: "רעיון", ready: "מוכן", scheduled: "מתוזמן", done: "פורסם" };
const dayPosts = (d) => S.posts.filter(p => p.date === d).sort((a,b) => (a.time||"").localeCompare(b.time||""));

/* ===== האזנה ===== */
export function subscribe(){
  track(onSnapshot(collection(db, "posts"),
    (snap) => { S.posts = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); },
    () => {}));
  track(onSnapshot(doc(db, "brand", "memory"),
    (snap) => { S.memory = snap.exists() ? snap.data() : null; renderMemory(); },
    () => {}));
  track(onSnapshot(doc(db, "brand", "timing"),
    (snap) => { S.timing = snap.exists() ? snap.data() : null; },
    () => {}));
  subscribeCreative();
  on("weekchanged", subscribeCreative);
}

let unsubCreative = null;
function subscribeCreative(){
  if (unsubCreative) { try { unsubCreative(); } catch {} }
  S.creative = {};
  unsubCreative = onSnapshot(doc(db, "creative", weekId(S.weekStart)),
    (snap) => { S.creative = (snap.exists() && snap.data().days) || {}; render(); },
    () => {});
  track(unsubCreative);
}

/* ===== זיכרון המותג ===== */
const memory = () => S.memory || { tone: "", likes: [], avoid: [], facts: [], examples: [] };

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
// כל תיקון שלך על טיוטת AI נשמר כדוגמה. זה מה שגורם לכתיבה להישמע כמוכם.
async function learnFromEdit(before, after){
  if (!before || !after || before.trim() === after.trim()) return;
  const m = memory();
  const examples = [...(m.examples || []), { before: before.slice(0, 900), after: after.slice(0, 900), at: Date.now() }];
  await saveMemory({ examples: examples.slice(-15) });
}

function renderMemory(){
  const m = memory();
  const box = clear($("memBox"));
  if ($("memTone") && document.activeElement !== $("memTone")) $("memTone").value = m.tone || "";
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
  const ex = (m.examples || []).length;
  box.append(el("p", { class: "small", text: ex ? `${ex} תיקונים שלך נשמרו ומוזנים לכתיבה. ככל שתתקן יותר, כך הטקסט יישמע יותר כמוך.` : "עוד לא תיקנת טיוטות. כל תיקון שתעשה יילמד אוטומטית." }));
}

/* ===== תזמון חכם ===== */
export function bestTimes(net){
  const learned = S.timing && S.timing[net];
  if (learned && learned.samples >= 8 && Array.isArray(learned.slots) && learned.slots.length)
    return learned.slots.map(s => ({ ...s, learned: true }));
  return TIMING[net] || [];
}
// השעה המומלצת ליום מסוים ברשת מסוימת.
function suggestTime(dateStr, net = "instagram"){
  const d = fromYmd(dateStr).getDay();
  const slots = bestTimes(net);
  const exact = slots.filter(s => s.day === d).sort((a,b) => a.tier - b.tier)[0];
  if (exact) return exact;
  return slots.sort((a,b) => a.tier - b.tier)[0] || { time: "10:30", why: "ברירת מחדל" };
}

/* ===== לוח השבוע ===== */
function weekDates(){ return Array.from({ length: 7 }, (_, i) => ymd(addDays(S.weekStart, i))); }

function renderWeekPlan(){
  const box = clear($("weekPlan"));
  const open = openDays();
  const ph = phase();

  if (ph !== "locked"){
    box.append(el("div", { class: "notice", text:
      !open.length ? "עוד לא נקבעו ימי פעילות. הקריאייטיב נבנה סביב הימים שהעגלה פתוחה." :
      ph === "open" ? "השיבוץ עדיין פתוח. אפשר להתחיל לעבוד על התוכן, אבל הימים עוד יכולים להשתנות." :
      "השבוע עוד לא אושר ונפתח לשיבוץ. אפשר כבר לעבוד על הזוויות." }));
  }

  if (!open.length){ box.append(el("p", { class: "empty", text: "אין ימי פעילות בשבוע הזה." })); return; }

  const hours = hoursByDay();
  for (const i of open){
    const date = ymd(addDays(S.weekStart, i));
    const h = holidayOn(date);
    const ps = dayPosts(date);
    const card = el("div", { class: "planitem" });
    const head = el("div", { class: "planhead" },
      el("div", {}, el("b", { text: DAYS[i] }), el("span", { class: "small", text: " " + dm(addDays(S.weekStart, i)) }),
        h ? el("span", { class: "hol", text: h[1] }) : null),
      el("span", { class: "small mono", text: hours[i] && hours[i].length ? hours[i].join(", ") : "" }));
    card.append(head);

    const angleRow = el("div", { class: "angle" });
    const inp = el("input", { type: "text", value: angleOf(date), placeholder: "הזווית של היום — מה מיוחד בו?",
      onchange: (e) => setAngle(date, e.target.value) });
    angleRow.append(inp);
    if (WORKER_URL && S.isOwner)
      angleRow.append(el("button", { class: "icon", title: "הצע זווית", text: "✨", onclick: (e) => suggestAngle(date, inp, e.currentTarget) }));
    card.append(angleRow);

    const list = el("div", { class: "ideas" });
    ps.forEach(p => list.append(postChip(p)));
    if (!ps.length) list.append(el("p", { class: "small", text: "אין עדיין פוסט ליום הזה." }));
    card.append(list);
    card.append(el("div", { class: "actions" },
      el("button", { class: "link", text: "+ פוסט ליום הזה", onclick: () => newPost(date) })));
    box.append(card);
  }
}

function postChip(p){
  const f = FORMATS.find(x => x.key === p.format);
  return el("div", { class: "idea" },
    el("div", { class: "grow" },
      el("div", {}, el("b", { class: "mono", text: p.time || "—" }), " ",
        el("span", { class: "pill " + (p.status === "done" ? "ok" : p.status === "scheduled" ? "warn" : ""), text: STATUS_LABEL[p.status] || "רעיון" }),
        f ? el("span", { class: "pill", text: f.label }) : null),
      el("div", { class: "small clip", text: (p.text || p.idea || "").slice(0, 90) })),
    el("button", { text: "פתח", onclick: () => loadPost(p.id) }));
}

const angleOf = (date) => {
  const c = S.creative && S.creative[date];
  return (c && c.angle) || "";
};
async function setAngle(date, angle){
  S.creative = { ...(S.creative || {}), [date]: { ...(S.creative && S.creative[date] || {}), angle } };
  try { await setDoc(doc(db, "creative", weekId(S.weekStart)), { week: weekId(S.weekStart), days: S.creative, at: serverTimestamp() }, { merge: true }); }
  catch {}
}

async function suggestAngle(date, input, btn){
  await withBusy(btn, async () => {
    try {
      const r = await ai("/ai/angle", { date, day: DAYS[fromYmd(date).getDay()], holiday: (holidayOn(date)||[])[1] || "" });
      if (r.angle){ input.value = r.angle; setAngle(date, r.angle); }
    } catch (e){ status("planStatus", "bad", e.message); }
  });
}

/* ===== קריאה ל-AI עם הזיכרון ===== */
function aiContext(){
  const m = memory();
  return {
    memory: { tone: m.tone || "", likes: m.likes || [], avoid: m.avoid || [], facts: m.facts || [],
      examples: (m.examples || []).slice(-6) },
    voice: VOICE,
    recent: S.posts.filter(p => p.status === "done").sort((a,b) => (b.date||"").localeCompare(a.date||"")).slice(0, 6)
      .map(p => ({ date: p.date, text: (p.text||"").slice(0,300), pillar: p.pillar, format: p.format, reach: p.performance && p.performance.reach })),
    hours: hoursByDay(), openDays: openDays().map(i => DAYS[i]),
  };
}
const ai = (path, body) => api(path, { ...aiContext(), ...body });

/* ===== עורך הפוסט ===== */
export function newPost(date, preset = {}){
  editing = null; aiOrigin = null; pendingImage = null;
  const d = date || ymd(addDays(new Date(), 1));
  $("cDate").value = d;
  const net = $("cNet").value || "instagram";
  const t = suggestTime(d, net);
  $("cTime").value = preset.time || t.time;
  $("timeWhy").textContent = t.why ? (t.learned ? "נלמד מהנתונים שלכם: " : "") + t.why : "";
  $("cPillar").value = preset.pillar || "";
  $("cFormat").value = preset.format || "reel";
  $("cIdea").value = preset.idea || angleOf(d) || "";
  $("cText").value = "";
  $("cHash").value = defaultHashtags().join(" ");
  $("cImage").value = ""; $("cPreview").hidden = true; $("cPhoto").value = "";
  $("compTitle").textContent = "פוסט חדש";
  $("delPost").hidden = true;
  status("compStatus", "", "");
  renderComposerMeta();
  $("composer").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function loadPost(id){
  const p = S.posts.find(x => x.id === id); if (!p) return;
  editing = id; aiOrigin = p.aiDraft || null; pendingImage = null;
  $("cDate").value = p.date || ""; $("cTime").value = p.time || "";
  $("cNet").value = (p.network && p.network[0]) || "instagram";
  $("cPillar").value = p.pillar || ""; $("cFormat").value = p.format || "reel";
  $("cIdea").value = p.idea || ""; $("cText").value = p.text || "";
  $("cHash").value = (p.hashtags || []).join(" ") || defaultHashtags().join(" ");
  $("cImage").value = p.image || "";
  $("cPreview").hidden = !p.image; if (p.image) $("cPreview").src = p.image;
  $("compTitle").textContent = "עריכת פוסט";
  $("delPost").hidden = false;
  status("compStatus", "", "");
  renderComposerMeta();
  $("composer").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function defaultHashtags(){
  return [...HASHTAGS.core, ...HASHTAGS.geo.slice(0,2), ...HASHTAGS.intent.slice(0,3)];
}

function renderComposerMeta(){
  const date = $("cDate").value;
  const h = date ? holidayOn(date) : null;
  const i = date ? fromYmd(date).getDay() : -1;
  const isOpenDay = i >= 0 && openDays().includes(i);
  const bits = [];
  if (date) bits.push(DAYS[i]);
  if (h) bits.push("🎉 " + h[1] + (h[2] ? " · " + h[2] : ""));
  bits.push(isOpenDay ? "יום פעילות" : "העגלה סגורה ביום הזה");
  $("dateHint").textContent = bits.join(" · ");
  const f = FORMATS.find(x => x.key === $("cFormat").value);
  $("formatHint").textContent = f ? f.note : "";
  const len = ($("cText").value || "").length;
  $("lenHint").textContent = len ? `${len} תווים` : "";
}

/* ===== כתיבה ===== */
async function write(btn){
  const idea = $("cIdea").value.trim();
  const date = $("cDate").value;
  if (!date){ status("compStatus", "warn", "בחר תאריך."); return; }
  await withBusy(btn, async () => {
    try {
      status("compStatus", "", "");
      const r = await ai("/ai/post", {
        idea, date, day: DAYS[fromYmd(date).getDay()],
        holiday: (holidayOn(date) || [])[1] || "",
        pillar: $("cPillar").value.trim().slice(0, 60), format: $("cFormat").value, network: $("cNet").value,
        angle: angleOf(date),
      });
      if (r.text){ $("cText").value = r.text; aiOrigin = r.text; }
      if (Array.isArray(r.hashtags) && r.hashtags.length) $("cHash").value = r.hashtags.join(" ");
      renderComposerMeta();
      status("compStatus", "ok", "טיוטה מוכנה. תקן אותה חופשי — כל תיקון נלמד.");
    } catch (e){ status("compStatus", "bad", e.message); }
  });
}

async function buildWeek(btn){
  await withBusy(btn, async () => {
    try {
      status("planStatus", "", "בונה…");
      const days = openDays().map(i => {
        const date = ymd(addDays(S.weekStart, i));
        return { date, day: DAYS[i], holiday: (holidayOn(date) || [])[1] || "", angle: angleOf(date), hours: hoursByDay()[i] };
      });
      const r = await ai("/ai/week", { days, target: BENCHMARKS.weeklyPosts, reels: BENCHMARKS.weeklyReels });
      const items = Array.isArray(r.posts) ? r.posts : [];
      if (!items.length){ status("planStatus", "warn", "לא חזרה תוכנית. נסה שוב."); return; }
      let n = 0;
      for (const it of items){
        if (!it || !it.date || !it.text) continue;
        if (!weekDates().includes(it.date)) continue;
        const net = ["facebook","instagram"].includes(it.network) ? it.network : "instagram";
        const t = it.time && /^\d{2}:\d{2}$/.test(it.time) ? it.time : suggestTime(it.date, net).time;
        const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
        await setDoc(doc(db, "posts", id), {
          date: it.date, time: t, network: [net],
          format: FORMATS.some(f => f.key === it.format) ? it.format : "reel",
          pillar: String(it.pillar || "").slice(0, 60),
          idea: String(it.idea || "").slice(0, 200),
          text: String(it.text).slice(0, 2200),
          hashtags: Array.isArray(it.hashtags) ? it.hashtags.slice(0, 15) : defaultHashtags(),
          aiDraft: String(it.text).slice(0, 2200),
          status: "idea", at: serverTimestamp(),
        });
        n++;
      }
      status("planStatus", "ok", `${n} פוסטים נכנסו ללוח כטיוטות. עבור עליהם ותקן.`);
    } catch (e){ status("planStatus", "bad", e.message); }
  });
}

/* ===== שמירה ===== */
async function savePost(newStatus, btn){
  const date = $("cDate").value, text = $("cText").value.trim();
  if (!date){ status("compStatus", "warn", "בחר תאריך."); return; }
  if (newStatus !== "idea" && !text){ status("compStatus", "warn", "אין טקסט."); return; }
  await withBusy(btn, async () => {
    try {
      let image = $("cImage").value || "";
      if (pendingImage){
        status("compStatus", "", "מעלה תמונה…");
        const path = `posts/${Date.now()}_${Math.random().toString(36).slice(2,7)}.jpg`;
        const snap = await uploadBytes(sRef(storage, path), pendingImage, { contentType: pendingImage.type || "image/jpeg" });
        image = await getDownloadURL(snap.ref);
        pendingImage = null; $("cImage").value = image;
      }
      const body = {
        date, time: $("cTime").value || "", network: [$("cNet").value],
        format: $("cFormat").value, pillar: $("cPillar").value.trim().slice(0, 60),
        idea: $("cIdea").value.trim().slice(0, 200), text: text.slice(0, 2200),
        hashtags: $("cHash").value.split(/\s+/).filter(t => t.startsWith("#")).slice(0, 15),
        image, status: newStatus, at: serverTimestamp(),
      };
      if (aiOrigin) body.aiDraft = aiOrigin;
      const id = editing || ("p" + Date.now().toString(36) + Math.random().toString(36).slice(2,6));
      await setDoc(doc(db, "posts", id), body, { merge: true });
      if (aiOrigin) await learnFromEdit(aiOrigin, text);
      editing = id; $("delPost").hidden = false; $("compTitle").textContent = "עריכת פוסט";
      status("compStatus", "ok", newStatus === "done" ? "סומן כפורסם." : "נשמר.");
    } catch (e){
      status("compStatus", "bad", e.code === "permission-denied" ? "רק המנהל יכול לשמור פוסטים." : "השמירה נכשלה.");
    }
  });
}

async function removePost(){
  if (!editing || !confirm("למחוק את הפוסט?")) return;
  try { await deleteDoc(doc(db, "posts", editing)); newPost($("cDate").value); }
  catch { status("compStatus", "bad", "המחיקה נכשלה."); }
}

/* ===== ייצוא למתזמן החיצוני ===== */
const fullText = (p) => [p.text || "", (p.hashtags || []).join(" ")].filter(Boolean).join("\n\n");

function exportRows(){
  const dates = weekDates();
  return S.posts.filter(p => dates.includes(p.date) && p.status !== "done" && (p.text || "").trim())
    .sort((a,b) => (a.date + (a.time||"")).localeCompare(b.date + (b.time||"")));
}

function exportCsv(){
  const rows = exportRows();
  if (!rows.length){ status("exportStatus", "warn", "אין פוסטים מוכנים לשבוע הזה."); return; }
  const esc = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = ["date","time","network","text","link","image"];
  const body = rows.map(p => [p.date, p.time || "10:30", (p.network || ["instagram"])[0], fullText(p), "", p.image || ""].map(esc).join(","));
  download(`cortado-${weekId(S.weekStart)}.csv`, [head.join(","), ...body].join("\n"), "text/csv;charset=utf-8");
  status("exportStatus", "ok", `${rows.length} פוסטים יוצאו. העלה את הקובץ במתזמן שלך (Bulk / Import).`);
}

function copyAll(btn){
  const rows = exportRows();
  if (!rows.length){ status("exportStatus", "warn", "אין פוסטים מוכנים."); return; }
  const txt = rows.map(p => {
    const d = fromYmd(p.date);
    return `── ${DAYS[d.getDay()]} ${dm(d)} · ${p.time || ""} · ${(p.network||["instagram"])[0] === "facebook" ? "פייסבוק" : "אינסטגרם"} · ${(FORMATS.find(f=>f.key===p.format)||{}).label || ""}\n${fullText(p)}${p.image ? "\nתמונה: " + p.image : ""}`;
  }).join("\n\n");
  copyText(txt, btn, "העתק הכל");
  status("exportStatus", "ok", "הכל הועתק. הדבק במתזמן.");
}

function renderExport(){
  const box = clear($("exportList"));
  const rows = exportRows();
  if (!rows.length){ box.append(el("p", { class: "small", text: "אין פוסטים מוכנים לתזמון בשבוע הזה." })); return; }
  rows.forEach(p => {
    const d = fromYmd(p.date);
    box.append(el("div", { class: "idea" },
      el("div", { class: "grow" },
        el("div", {}, el("b", { text: DAYS[d.getDay()] + " " + dm(d) }), " ", el("span", { class: "mono", text: p.time || "" }),
          " ", el("span", { class: "pill", text: (p.network||["instagram"])[0] === "facebook" ? "פייסבוק" : "אינסטגרם" })),
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
export function render(){
  if ($("p-creative").hidden && $("p-reach").hidden) return;
  renderWeekPlan();
  renderExport();
  renderComposerMeta();
}

/* ===== חיווט ===== */
export function init(){
  PILLARS.forEach(p => $("pillarList").append(el("option", { value: p.label, text: p.note || "" })));
  FORMATS.forEach(f => $("cFormat").append(el("option", { value: f.key, text: f.label })));

  $("cDate").addEventListener("change", () => {
    const net = $("cNet").value;
    const t = suggestTime($("cDate").value, net);
    if (!editing) { $("cTime").value = t.time; }
    $("timeWhy").textContent = t.why ? (t.learned ? "נלמד מהנתונים שלכם: " : "") + t.why : "";
    renderComposerMeta();
  });
  $("cNet").addEventListener("change", () => {
    const t = suggestTime($("cDate").value, $("cNet").value);
    $("timeWhy").textContent = t.why ? (t.learned ? "נלמד מהנתונים שלכם: " : "") + t.why : "";
    if (!editing) $("cTime").value = t.time;
  });
  $("cFormat").addEventListener("change", renderComposerMeta);
  $("cText").addEventListener("input", renderComposerMeta);

  $("aiWrite").addEventListener("click", (e) => write(e.currentTarget));
  $("aiPlan").addEventListener("click", (e) => buildWeek(e.currentTarget));
  $("saveIdea").addEventListener("click", (e) => savePost("idea", e.currentTarget));
  $("saveReady").addEventListener("click", (e) => savePost("ready", e.currentTarget));
  $("markDone").addEventListener("click", (e) => savePost("done", e.currentTarget));
  $("newPost").addEventListener("click", () => newPost($("cDate").value));
  $("delPost").addEventListener("click", removePost);
  $("copyPost").addEventListener("click", (e) => {
    const p = { text: $("cText").value, hashtags: $("cHash").value.split(/\s+/).filter(Boolean) };
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

  $("exportCsv").addEventListener("click", exportCsv);
  $("copyWeek").addEventListener("click", (e) => copyAll(e.currentTarget));

  // זיכרון
  $("memTone").addEventListener("change", (e) => saveMemory({ tone: e.target.value.trim().slice(0, 500) }));
  $("addLike").addEventListener("click", () => { addRule("likes", $("memLike").value.trim()); $("memLike").value = ""; });
  $("addAvoid").addEventListener("click", () => { addRule("avoid", $("memAvoid").value.trim()); $("memAvoid").value = ""; });
  $("addFact").addEventListener("click", () => { addRule("facts", $("memFact").value.trim()); $("memFact").value = ""; });

  on("locked", () => { status("planStatus", "ok", "השבוע ננעל. אפשר לבנות את הקריאייטיב."); });
  newPost();
}
