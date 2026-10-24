// מרכז השליטה: השבוע בעגלה. הדף רק עורך ומציג. התצוגה והפרסום קורים בבוט קורטדו (‎/panel/*‎),
// באותו מסלול כמו "כן" בוואטסאפ, כך שיש דרך אחת לפרסם שעות והבוט תמיד יודע מה בחוץ.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "../config.js";
import { parseWeek, DAYS, hm } from "./parse.js";

const API = "https://agala-bot.cortado-snir.workers.dev";
const $ = (id) => document.getElementById(id);
const auth = getAuth(initializeApp(firebaseConfig));

let S = null;            // מצב מהבוט: שבועות שפורסמו, צוות, תחזית, חגים
let which = "next";      // cur | next
const grids = {};        // week -> [{ day, start, end, people[], open }]
let draftId = null;

/* ===== תאריכים ===== */
const plusDays = (ymd, n) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dm = (ymd) => `${+ymd.slice(8, 10)}.${+ymd.slice(5, 7)}`;
const weekId = () => (which === "next" ? S.next : S.cur);
// בידוד משמאל לימין, אחרת בעברית "25.10–31.10" מתהפך ל-"31.10–25.10"
const range = (wk) => `\u2066${dm(wk)}–${dm(plusDays(wk, 6))}\u2069`;
// "17", "9.30", "1730" → "17:00", "09:30", "17:30". לא שעה → ריק
const tm = (v) => { const m = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(String(v || "").trim()); return m && +m[1] < 24 && +(m[2] || 0) < 60 ? hm(m[1], m[2]) : ""; };

/* ===== רשת ===== */
async function call(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("צריך להתחבר מחדש");
  const r = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(body || {}) });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error(d.error === "החשבון הזה לא מורשה" ? "החשבון הזה לא מורשה. נכנסים עם המייל של העגלה" : "צריך להתחבר מחדש");
  if (!r.ok) throw new Error(d.error || `שגיאה ${r.status}`);
  return d;
}

/* ===== טיוטה במכשיר ===== */
const KEY = (wk) => `panel:grid:${wk}`;
const store = {
  get(wk) { try { return JSON.parse(localStorage.getItem(KEY(wk)) || "null"); } catch { return null; } },
  set(wk, v) { try { localStorage.setItem(KEY(wk), JSON.stringify({ base: JSON.stringify(saved(wk) || []), shifts: v })); } catch {} },
  del(wk) { try { localStorage.removeItem(KEY(wk)); } catch {} },
};
const clean = (s) => ({ day: s.day, start: s.start, end: s.end, people: [...(s.people || [])], open: s.open !== false, ...(s.note ? { note: s.note } : {}) });
const sorted = (list) => [...list].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
const saved = (wk) => S.weeks?.[wk]?.shifts?.map(clean) || null;
const same = (a, b) => JSON.stringify(sorted(a || [])) === JSON.stringify(sorted(b || []));
function grid() {
  const wk = weekId();
  if (!grids[wk]) {
    // טיוטה במכשיר תקפה רק אם בינתיים לא פורסמה גרסה אחרת (למשל מהטלפון של שותף/ה, או בוואטסאפ)
    const d = store.get(wk), pub = saved(wk) || [];
    const fresh = d && Array.isArray(d.shifts) && d.base === JSON.stringify(pub);
    if (d && !fresh) { store.del(wk); setTimeout(() => toast("בינתיים פורסמה גרסה חדשה. הטבלה מציגה אותה"), 0); }
    grids[wk] = fresh ? d.shifts : pub;
  }
  return grids[wk];
}
function setGrid(list) { const wk = weekId(); grids[wk] = sorted(list.map(clean)); store.set(wk, grids[wk]); draftId = null; render(); }

/* ===== בדיקות לכל יום ===== */
const merged = (list) => {
  const out = [];
  for (const s of sorted(list).filter((x) => x.open)) {
    const last = out[out.length - 1];
    if (last && s.start <= last[1]) last[1] = s.end > last[1] ? s.end : last[1]; else out.push([s.start, s.end]);
  }
  return out;
};
function known(name) {
  if (!S.team?.length) return true;
  return S.team.some((t) => t === name || t.split(/\s+/)[0] === name);
}
function warningsOf(list) {
  const w = [];
  if (merged(list).length > 2) w.push("יותר משני טווחי שעות. פייסבוק וגוגל מחזיקים רק שניים");
  for (const s of list) {
    if (!tm(s.start) || !tm(s.end) || s.end <= s.start) w.push(`שעה לא תקינה ${s.start || "?"}–${s.end || "?"}`);
    else if (s.open && !s.people.length) w.push(`${s.start}–${s.end} בלי משובצים`);
    for (const p of s.people) if (!known(p)) w.push(`${p} לא ברשימת הצוות`);
  }
  return [...new Set(w)];
}
function weatherOf(date) {
  const f = S.forecast?.[date], L = S.limits || {};
  if (!f) return null;
  return {
    rain: { v: f.rain, alert: f.rain >= (L.rainProb ?? 50) && f.mm >= (L.rainMm ?? 1) },
    gust: { v: f.gust, alert: f.gust >= (L.gust ?? 40) },
    temp: { v: f.tmax, alert: f.tmax >= (L.hot ?? 37) },
  };
}
const ICON = {
  rain: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 15a4 4 0 0 1 .5-8A5 5 0 0 1 17 8a3.5 3.5 0 0 1 0 7H7M9 18l-1 2M13 18l-1 2M17 18l-1 2"/></svg>',
  gust: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8"/></svg>',
  temp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z"/></svg>',
};

/* ===== ציור ===== */
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function render() {
  const wk = weekId(), list = grid();
  for (const [id, w] of [["tab-cur", S.cur], ["tab-next", S.next]]) {
    const b = $(id);
    b.innerHTML = `${b.dataset.week === "cur" ? "השבוע" : "שבוע הבא"}<small>${range(w)}</small>`;
    b.setAttribute("aria-selected", String(b.dataset.week === which));
  }
  renderStatus();
  $("days").innerHTML = DAYS.map((name, d) => dayHtml(name, d, wk, list)).join("");
}
function renderStatus() {
  const wk = weekId(), list = grid();
  const chips = [];
  const pub = S.weeks?.[wk];
  if (S.alert) chips.push(`<span class="chip bad">${esc(S.alert.split("\n")[0].replace(/^⚠️\s*/, ""))}</span>`);
  chips.push(pub ? '<span class="chip ok">פורסם</span>' : '<span class="chip bad">עוד לא פורסם</span>');
  if (pub && !same(list, saved(wk))) chips.push('<span class="chip bad">יש שינויים שלא פורסמו</span>');
  if (!pub && list.length) chips.push('<span class="chip">טיוטה במכשיר</span>');
  if (S.scheduled?.week === wk) chips.push(`<span class="chip">מתוזמן לפרסום ${esc(S.scheduled.due.replace("T", " "))}</span>`);
  $("status").innerHTML = chips.join("");
  $("copy-prev").disabled = !S.weeks?.[plusDays(wk, -7)];
}
function warnHtml(d, wk, list) {
  const date = plusDays(wk, d), mine = list.filter((s) => s.day === d), open = mine.some((s) => s.open), wx = weatherOf(date);
  const warns = warningsOf(mine), bad = wx && open && (wx.rain.alert || wx.gust.alert || wx.temp.alert);
  return warns.length || bad ? `${bad ? `<li>מזג אוויר: ${[wx.rain.alert && `גשם ${wx.rain.v}%`, wx.gust.alert && `רוח ${wx.gust.v} קמ"ש`, wx.temp.alert && `חום ${wx.temp.v}°`].filter(Boolean).join(", ")}. אין סככה, לשקול סגירה</li>` : ""}${warns.map((x) => `<li>${esc(x)}</li>`).join("")}` : "";
}
function dayHtml(name, d, wk, list) {
    const date = plusDays(wk, d), mine = list.map((s, i) => ({ ...s, i })).filter((s) => s.day === d);
    const open = mine.some((s) => s.open), wx = weatherOf(date), hol = S.holidays?.find(([x]) => x === date);
    const wxHtml = wx ? `<div class="wx">${wx.rain.v > 0 ? `<span class="${wx.rain.alert ? "alert" : ""}" title="גשם">${ICON.rain}${wx.rain.v}%</span>` : ""}<span class="${wx.gust.alert ? "alert" : ""}" title="משבי רוח">${ICON.gust}${wx.gust.v}</span><span class="${wx.temp.alert ? "alert" : ""}" title="חום">${ICON.temp}${wx.temp.v}°</span></div>` : "";
    return `<section class="day${open ? "" : " closed"}" data-day="${d}">
      <div class="day-head"><span class="day-name">${name}</span><span class="day-date">${dm(date)}</span>${wxHtml}</div>
      ${hol ? `<span class="holiday">${esc(hol[1])}</span>` : ""}
      ${mine.length ? "" : '<p class="closed-label">סגור</p>'}
      ${mine.map((s) => `<div class="shift${s.open ? "" : " off"}" data-i="${s.i}">
        <div class="times"><input inputmode="numeric" maxlength="5" autocomplete="off" value="${esc(s.start)}" data-f="start" aria-label="${name} מ-"><span>–</span><input inputmode="numeric" maxlength="5" autocomplete="off" value="${esc(s.end)}" data-f="end" aria-label="${name} עד"></div>
        <input class="names${s.open && !s.people.length ? " empty" : ""}" value="${esc(s.people.join(", "))}" data-f="people" placeholder="מי עובד…" autocomplete="off" spellcheck="false" aria-label="${name} ${esc(s.start)} מי עובד">
        <button class="standby" type="button" data-f="open" aria-pressed="${!s.open}">סטנד ביי</button>
        <button class="remove" type="button" data-f="remove" aria-label="הסרת המשמרת">×</button>
      </div>`).join("")}
      <ul class="day-warn">${warnHtml(d, wk, list)}</ul>
      <button class="add" type="button" data-f="add">+ משמרת</button>
    </section>`;
}

/* ===== עריכה ===== */
$("days")?.addEventListener("input", (e) => {
  const row = e.target.closest(".shift"); if (!row) return;
  const list = grid().map(clean), s = list[+row.dataset.i], f = e.target.dataset.f;
  if (f === "start" || f === "end") s[f] = tm(e.target.value) || e.target.value.trim();
  if (f === "people") s.people = e.target.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean);
  const wk = weekId(); grids[wk] = list; store.set(wk, list); draftId = null;
  if (f === "people") e.target.classList.toggle("empty", s.open && !s.people.length);
  const day = row.closest(".day"); day.querySelector(".day-warn").innerHTML = warnHtml(+day.dataset.day, wk, list);
  renderStatus();
});
// ביציאה משדה שעה: מציגים אותה בצורה המלאה, וממיינים מחדש
$("days")?.addEventListener("change", (e) => { const f = e.target.dataset.f; if ((f === "start" || f === "end") && tm(e.target.value)) e.target.value = tm(e.target.value); });
$("days")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button"); if (!btn) return;
  const list = grid().map(clean), f = btn.dataset.f;
  if (f === "add") {
    const d = +btn.closest(".day").dataset.day, prev = list.filter((s) => s.day === d).at(-1);
    list.push(prev ? { day: d, start: prev.end, end: prev.end < "19:00" ? "19:00" : prev.end, people: [], open: true } : { day: d, start: "17:00", end: "19:00", people: [], open: true });
    setGrid(list);
    requestAnimationFrame(() => { const rows = document.querySelectorAll(`.day[data-day="${d}"] .names`); rows[rows.length - 1]?.focus(); });
  }
  const row = btn.closest(".shift"); if (!row) return;
  const i = +row.dataset.i;
  if (f === "remove") { list.splice(i, 1); setGrid(list); }
  if (f === "open") { list[i].open = !list[i].open; setGrid(list); }
});

for (const b of document.querySelectorAll(".weeks button")) b.addEventListener("click", () => { if (!S) return; which = b.dataset.week; draftId = null; render(); });

$("copy-prev")?.addEventListener("click", () => {
  const wk = weekId(), prev = S.weeks?.[plusDays(wk, -7)];
  if (!prev) return;
  if (grid().length && !confirm(`להחליף את הטבלה בסידור של ${range(plusDays(wk, -7))}?`)) return;
  setGrid(prev.shifts);
  toast(`הסידור של ${range(plusDays(wk, -7))} הועתק. משנים רק מה שאחרת`);
});

/* ===== הדבקה ===== */
$("paste-open")?.addEventListener("click", () => { $("paste-skipped").textContent = ""; $("paste").returnValue = ""; $("paste").showModal(); $("paste-text").focus(); });
$("paste")?.addEventListener("close", () => {
  if ($("paste").returnValue !== "fill") return;
  const r = parseWeek($("paste-text").value);
  if (!r.shifts.length && !r.closed.length) { toast("לא מצאתי משמרות. שורה לכל משמרת: יום, שעות, שמות"); return; }
  const days = new Set([...r.shifts.map((s) => s.day), ...r.closed]);
  // ימים שלא הוזכרו נשארים כמו שהיו בטבלה
  setGrid([...grid().filter((s) => !days.has(s.day)), ...r.shifts]);
  $("paste-text").value = "";
  toast(r.skipped.length ? `מולא. לא הבנתי ${r.skipped.length} שורות: ${r.skipped.join(" | ").slice(0, 120)}` : "הטבלה מולאה. בודקים ולוחצים על תצוגה");
});

/* ===== תצוגה ===== */
let view = "public";
for (const b of document.querySelectorAll(".seg button")) b.addEventListener("click", () => {
  view = b.dataset.view;
  for (const x of document.querySelectorAll(".seg button")) x.setAttribute("aria-selected", String(x === b));
  $("pv-public").hidden = view !== "public"; $("pv-team").hidden = view !== "team";
});
const hrs = (r) => (r.length ? r.map(([a, b]) => `${a}–${b}`).join(", ") : "סגור");
const teamText = (wk, list) => `סידור ${range(wk)}\n\n` + DAYS.map((n, d) => {
  const mine = sorted(list).filter((s) => s.day === d);
  return mine.length ? mine.map((s) => `${n} ${dm(plusDays(wk, d))} · ${s.start}–${s.end} · ${s.people.join(", ") || "אין משובצים"}${s.open ? "" : " (סטנד ביי)"}`).join("\n") : `${n} ${dm(plusDays(wk, d))} · סגור`;
}).join("\n");

$("preview-btn")?.addEventListener("click", async () => {
  const wk = weekId(), list = grid();
  const broken = list.find((s) => !tm(s.start) || !tm(s.end) || s.end <= s.start);
  if (broken) { toast(`${DAYS[broken.day]}: שעה לא תקינה`); return; }
  busy(true);
  try {
    const p = await call("/panel/preview", { next_week: which === "next", shifts: sorted(list.map(clean)) });
    if (p.week !== wk) throw new Error("השבוע התחלף בינתיים. מרעננים את הדף");
    draftId = p.id;
    $("pv-public").innerHTML = `<h3>השעות של העגלה ${range(wk)}</h3><ol>${p.days.map((r, d) => `<li><span class="d">${DAYS[d]} ${dm(plusDays(wk, d))}</span><span class="${r.length ? "h" : "x"}">${hrs(r)}</span></li>`).join("")}</ol>`;
    $("pv-team").textContent = teamText(wk, list);
    // מה השתנה ומה לבדוק: אותן שורות שהבוט היה שולח בוואטסאפ
    const lines = p.text.split("\n").map((l) => l.replace(/\*/g, "").trim());
    const checks = lines.filter((l) => /^(⛔|⚠️|📅|ירד:|נוסף:|שעות \S+: היה)/.test(l) && !/לא השתנה כלום/.test(l));
    for (let d = 0; d < 7; d++) {
      const wx = weatherOf(plusDays(wk, d));
      if (wx && p.days[d].length && (wx.rain.alert || wx.gust.alert || wx.temp.alert))
        checks.push(`🌧️ ${[wx.rain.alert && `גשם ${wx.rain.v}%`, wx.gust.alert && `רוח ${wx.gust.v} קמ"ש`, wx.temp.alert && `חום ${wx.temp.v}°`].filter(Boolean).join(", ")} ביום ${DAYS[d]} \u2066${dm(plusDays(wk, d))}\u2069. אין סככה`);
    }
    $("pv-checks").innerHTML = checks.map((c) => `<li class="${c.startsWith("⛔") ? "block" : ""}">${esc(c)}</li>`).join("");
    $("publish-btn").textContent = `פרסום ${range(wk)}`;
    $("publish-btn").disabled = !!p.blocked;
    $("preview").showModal();
  } catch (e) { toast(e.message); } finally { busy(false); }
});
$("pv-close")?.addEventListener("click", () => $("preview").close());

/* ===== פרסום ===== */
$("publish-btn")?.addEventListener("click", async () => {
  if (!draftId) return;
  const wk = weekId();
  $("publish-btn").disabled = true; $("publish-btn").textContent = "מפרסם…";
  try {
    const r = await call("/panel/publish", { id: draftId });
    draftId = null;
    $("preview").close();
    showResult(r, wk);
    if (r.page === "ok") { store.del(wk); delete grids[wk]; }
    await load();
  } catch (e) {
    toast(e.message);
    $("publish-btn").disabled = false; $("publish-btn").textContent = `פרסום ${range(wk)}`;
  }
});

function showResult(r, wk) {
  const later = wk !== S.cur, rows = [];
  if (r.page === undefined) {
    $("rs-title").textContent = `לא פורסם ${range(wk)}`;
    $("rs-channels").innerHTML = `<li class="bad"><span class="mark">!</span><div><b>הבוט</b><span>${esc((r.text || "לא התקבלה תשובה").replace(/\*/g, ""))}</span></div></li>`;
    $("rs-actions").innerHTML = "";
    $("result").showModal();
    return;
  }
  const okp = r.page === "ok" && (r.pageCheck ?? "ok") === "ok";
  rows.push([okp ? "ok" : "bad", "דף הנחיתה", okp ? (later ? `נשמר. יוצג מיום ראשון ${dm(wk)}` : "עודכן ונבדק") : (r.page === "ok" ? r.pageCheck : r.page || "לא עודכן")]);
  const okf = r.facebook === "ok" && (r.facebookCheck ?? "ok") === "ok";
  rows.push([r.facebook === "skip" ? "todo" : okf ? "ok" : "bad", "פייסבוק", r.facebook === "skip" ? "לא עודכן: השבוע הנוכחי עוד לא פורסם" : okf ? `7 הימים הקרובים עודכנו ונבדקו${r.unknown?.length ? `\nלימים ${r.unknown.map((d) => DAYS[d]).join(", ")} עוד אין שעות, ובינתיים מוצגות השעות של השבוע הנוכחי` : ""}` : r.facebook === "ok" ? r.facebookCheck : r.facebook || "לא עודכן"]);
  const g = r.google;
  rows.push([g === "ok" ? "ok" : g === "manual" || g === "dry" ? "todo" : g === "skip" ? "todo" : "bad", "גוגל", g === "ok" ? "עודכן לפי תאריך" : g === "manual" || g === "dry" ? "להדביק בפרופיל בגוגל" : g === "skip" ? "לא עודכן" : g || "לא עודכן"]);
  if (okp) rows.push(["ok", "סטוריז", "סטורי \"פתוחים עכשיו\" יוצא לבד בתחילת כל טווח שעות"]);
  $("rs-title").textContent = `${rows.some(([k]) => k === "bad") ? "הפרסום לא הסתיים נקי" : "פורסם"} ${range(wk)}`;
  $("rs-channels").innerHTML = rows.map(([k, t, s]) => `<li class="${k}"><span class="mark">${k === "ok" ? "✓" : k === "bad" ? "!" : "…"}</span><div><b>${t}</b><span>${esc(s)}</span></div></li>`).join("");
  const acts = [];
  if (r.googleText && g !== "ok") acts.push(`<button class="btn" type="button" data-copy="google">העתקת השעות לגוגל</button><a class="btn ghost" href="https://business.google.com/" target="_blank" rel="noopener">פתיחת הפרופיל בגוגל</a>`);
  if (r.team) acts.push('<button class="btn" type="button" data-copy="team">העתקת הסידור לקבוצת הצוות</button>');
  for (const m of (r.links || "").matchAll(/^(.+?): (https:\/\/wa\.me\/\S+)$/gm)) acts.push(`<a class="btn ghost" href="${esc(m[2])}" target="_blank" rel="noopener">שליחה ל${esc(m[1])}</a>`);
  $("rs-actions").innerHTML = acts.join("");
  $("rs-actions").onclick = (e) => { const c = e.target.closest("[data-copy]"); if (c) copy(c.dataset.copy === "google" ? r.googleText : r.team); };
  $("result").showModal();
}
$("rs-close")?.addEventListener("click", () => $("result").close());

/* ===== עזרים ===== */
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
  toast("הועתק");
}
let tt;
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 4200); }
function busy(on) { document.body.classList.toggle("loading", on); }

async function load() {
  S = await call("/panel/state");
  render();
}

/* ===== כניסה ===== */
$("signin-btn")?.addEventListener("click", async () => {
  $("signin-error").textContent = "";
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) {
    // באפליקציה שהותקנה במסך הבית חלון קופץ לפעמים לא נפתח: נכנסים בהפניה
    if (/popup-blocked|operation-not-supported|cancelled-popup/.test(e.code || "") && (matchMedia("(display-mode: standalone)").matches || navigator.standalone)) return signInWithRedirect(auth, new GoogleAuthProvider());
    $("signin-error").textContent = e.code === "auth/popup-blocked" ? "הדפדפן חסם את החלון. מאשרים חלונות קופצים ומנסים שוב"
      : e.code === "auth/unauthorized-domain" ? "הכתובת הזאת לא מורשית לכניסה. נכנסים מ-cortado-ops.web.app/panel"
      : e.code === "auth/popup-closed-by-user" ? "" : "הכניסה לא הצליחה. מנסים שוב";
  }
});
$("signout")?.addEventListener("click", () => signOut(auth));
onAuthStateChanged(auth, async (user) => {
  $("signin").hidden = !!user; $("app").hidden = !user;
  if (!user) return;
  // חמישי עד שבת: בונים את השבוע הבא. ראשון עד רביעי: את השבוע הזה
  which = [4, 5, 6].includes(new Date().getDay()) ? "next" : "cur";
  try { await load(); }
  catch (e) {
    if (/לא מורשה/.test(e.message)) { await signOut(auth); $("signin-error").textContent = e.message; return; }
    toast(e.message);
  }
});

/* ===== שלושה מסכים: שעות · בתור · עוד. כל מה שהבוט יודע לעשות, ככפתור ===== */
const act = (action, extra = {}) => call("/panel/do", { action, ...extra });
let viewNow = "hours";
const TITLES = { queue: "מה יוצא בקרוב", more: "עוד" };
function show(v) {
  viewNow = v;
  for (const x of ["hours", "queue", "more"]) $(`v-${x}`).hidden = x !== v;
  for (const b of document.querySelectorAll(".nav button")) b.toggleAttribute("aria-current", b.dataset.view === v), b.dataset.view === v && b.setAttribute("aria-current", "page");
  document.querySelector(".weeks").hidden = v !== "hours";
  $("view-title").hidden = v === "hours"; $("view-title").textContent = TITLES[v] || "";
  $("preview-btn").hidden = v !== "hours";
  if (v === "queue") loadQueue();
  if (v === "more") loadMore();
  scrollTo(0, 0);
}
for (const b of document.querySelectorAll(".nav button")) b.addEventListener("click", () => S && show(b.dataset.view));

const when = (at) => { const d = at.slice(0, 10); return `${DAYS[new Date(d + "T12:00:00Z").getUTCDay()]} ⁦${dm(d)}⁩ ${at.slice(11, 16)}`; };
async function run(fn, done) {
  busy(true);
  try { const r = await fn(); if (r?.text) toast(r.text.replace(/\*/g, "").split("\n")[0]); await done?.(r); return r; }
  catch (e) { toast(e.message); } finally { busy(false); }
}

/* בתור */
async function loadQueue() {
  $("queue").innerHTML = '<p class="empty-state">טוען…</p>';
  try {
    const { items } = await act("queue");
    $("queue").innerHTML = items.length ? items.map((x, i) => `<article class="item">
      ${/\.(jpe?g|png|webp)$/i.test(x.media) ? `<img src="${esc(x.media)}" alt="" width="64" height="64" loading="lazy">` : `<span class="ph">${esc(x.kind)}</span>`}
      <div><b>${esc(x.kind)} · ${esc(when(x.at))}</b><span>${esc(x.label || x.media.split("/").pop() || "")}</span></div>
      <button class="btn ghost" type="button" data-cancel="${i}">ביטול</button>
    </article>`).join("") : '<p class="empty-state">אין כלום בתור</p>';
    // תמונה שלא נטענה: במקומה שם הסוג, לא ריבוע ריק
    for (const img of $("queue").querySelectorAll("img")) img.addEventListener("error", () => { const ph = document.createElement("span"); ph.className = "ph"; ph.textContent = img.closest(".item").querySelector("b").textContent.split(" · ")[0]; img.replaceWith(ph); });
    $("queue").onclick = (e) => {
      const b = e.target.closest("[data-cancel]"); if (!b) return;
      const x = items[+b.dataset.cancel];
      if (!confirm(`לבטל את ה${x.kind} של ${when(x.at).replace(/[⁦⁩]/g, "")}?`)) return;
      run(() => act("cancel_item", x), async () => { await loadQueue(); S = await call("/panel/state"); render(); });
    };
  } catch (e) { $("queue").innerHTML = `<p class="empty-state">${esc(e.message)}</p>`; }
}
$("stop-auto")?.addEventListener("click", () => {
  if (!confirm("לעצור את כל הרילים והפוסטים שמחכים לצאת לבד? הסטוריז והשעות לא נעצרים")) return;
  run(() => act("cancel_auto"), loadQueue);
});

/* עוד */
async function loadMore() {
  $("cancel-week").hidden = !S.scheduled;
  const [team, rem, lists] = await Promise.allSettled([act("team"), act("reminders"), act("lists")]);
  $("team").innerHTML = team.status !== "fulfilled" ? `<p>${esc(team.reason.message)}</p>` : team.value.team.filter((p) => p.active !== false).map((p) => `<div class="r person">
    <div>${esc(p.name)}</div><input value="${esc(p.phone || "")}" data-phone="${esc(p.name)}" inputmode="tel" dir="ltr" autocomplete="off" aria-label="הטלפון של ${esc(p.name)}">
    <button class="link" type="button" data-left="${esc(p.name)}">עזב/ה</button></div>`).join("") || "<p>אין עובדים ברשימה</p>";
  $("reminders").innerHTML = rem.status !== "fulfilled" ? `<p>${esc(rem.reason.message)}</p>` : rem.value.items.map((x, i) => `<div class="r"><div>${esc(x.text)}<small>${esc(when(x.at))}</small></div><button class="link" type="button" data-rem="${i + 1}">מחיקה</button></div>`).join("") || "<p>אין תזכורות</p>";
  if (lists.status === "fulfilled") {
    const L = lists.value.lists;
    $("lists").innerHTML = Object.entries(L).filter(([, v]) => v.length).map(([n, v]) => `<h4>${esc(n)}</h4>${v.map((t, i) => `<div class="r"><div>${esc(t)}</div><button class="link" type="button" data-list="${esc(n)}" data-n="${i + 1}">מחיקה</button></div>`).join("")}`).join("") || "<p>אין רשימות</p>";
    $("list-names").innerHTML = Object.keys(L).map((n) => `<option value="${esc(n)}">`).join("");
  } else $("lists").innerHTML = `<p>${esc(lists.reason.message)}</p>`;
}
$("v-more")?.addEventListener("change", (e) => {
  const name = e.target.dataset.phone; if (!name) return;
  run(() => act("team_set", { name, phone: e.target.value }));
});
$("v-more")?.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.left && confirm(`${b.dataset.left} עזב/ה את הצוות?`)) run(() => act("team_set", { name: b.dataset.left, active: false }), loadMore);
  if (b.dataset.rem) run(() => act("reminder_cancel", { n: +b.dataset.rem }), loadMore);
  if (b.dataset.list) run(() => act("list_remove", { list: b.dataset.list, n: +b.dataset.n }), loadMore);
  if (b.dataset.do === "refresh") run(() => act("refresh"));
  if (b.dataset.do === "cancel_week" && confirm("לבטל את הפרסום המתוזמן?")) run(() => act("cancel_week"), async () => { S = await call("/panel/state"); loadMore(); });
  if (b.dataset.do === "undo") run(() => act("undo"), (r) => {
    which = r.week === S.next ? "next" : "cur";
    grids[r.week] = sorted(r.shifts.map(clean)); store.set(r.week, grids[r.week]);
    show("hours");
    toast("הגרסה הקודמת בטבלה. בודקים ומפרסמים");
  });
  if (b.dataset.info) {
    const t = { brief: "בריף להיום", stats: "איך הלכו הפוסטים", status: "מצב המערכת" }[b.dataset.info];
    run(() => act(b.dataset.info), (r) => { $("info-title").textContent = t; $("info-text").textContent = String(r.text || "").replace(/\*/g, ""); $("info").showModal(); });
  }
});
const form = (id, fn) => $(id)?.addEventListener("submit", (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); run(() => fn(f), () => { e.target.reset(); loadMore(); }); });
form("team-add", (f) => act("team_set", { name: f.name, phone: f.phone }));
form("remind-add", (f) => act("remind", { at: f.at.slice(0, 16), text: f.text }));
form("list-add", (f) => act("list_add", { list: f.list, text: f.text }));
$("info-close")?.addEventListener("click", () => $("info").close());

/* תזמון מהתצוגה ("כן ב-20:00") */
$("sched-btn")?.addEventListener("click", async () => {
  const t = tm($("sched-time").value);
  if (!draftId || !t) { toast("שעה לא תקינה"); return; }
  const wk = weekId();
  run(() => act("schedule", { id: draftId, time: t }), async () => {
    draftId = null; $("preview").close(); store.del(wk); S = await call("/panel/state"); render();
  });
});

/* התקנה בטלפון */
let installEvt = null;
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("install-card").hidden = false; $("install-btn").hidden = false; });
if (!standalone && /iphone|ipad/i.test(navigator.userAgent)) { $("install-card").hidden = false; $("install-ios").hidden = false; }
$("install-btn")?.addEventListener("click", async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("install-card").hidden = true; });
