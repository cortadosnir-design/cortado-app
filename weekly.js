// שיגור שבועי: פוסטר ליום, אוטומטית, מרגע שהשבוע ננעל.
//
// הרעיון: השבוע ננעל → שבעה פוסטרים נכנסים לתור בלחיצה אחת, אחד לכל יום,
// כל אחד עם היום שלו מודגש. פייסבוק מתזמן לבד; אינסטגרם נכנס לתור של
// הקרון בשרת ומתפרסם בדקה שנקבעה.
//
// שני דברים שנאכפים כאן ולא בממשק:
// 1. בלי נעילה אין שיגור. לפני שהשבוע ננעל השיבוץ עוד זז, ופוסטר עם
//    שעות שישתנו הוא הבטחה שאפשר להפר.
// 2. יום שהשעה שלו כבר עברה נדלג עליו בשקט. השרת דוחה תזמון לעבר,
//    והניסיון היה מפיל את כל השיגור באמצע.
import { S, db, api, on, $, el, clear, status, withBusy, ymd, dm, fromYmd, addDays,
  doc, setDoc, collection, query, where, onSnapshot, track } from "./core.js";
import * as Card from "./card.js";
import { BRAND } from "./playbook.js";
import { phase, wid, hoursByDay } from "./shifts.js";

const DAY_LABEL = ["יום א", "יום ב", "יום ג", "יום ד", "יום ה", "שישי", "שבת"];
// השרת דורש תזמון של עשר דקות קדימה לפחות. פחות מזה נדחה.
const MIN_AHEAD_MS = 12 * 60 * 1000;

export const locked = () => phase() === "locked";

/* טביעת אצבע של שעות השבוע. זה מה שמאפשר לדעת שפוסטר שכבר בתור
   מציג שעות שכבר לא נכונות — בלי להשוות שבע תמונות.
   נשמר על מסמך הפוסט בזמן השיגור, ומושווה מול המצב הנוכחי. */
export const hoursKey = () => JSON.stringify([ymd(S.weekStart), hoursByDay()]);

// מה שכבר בתור לשבוע הזה — מתעדכן מפיירסטור ומניע את שורת הסנכרון
let queued = new Map();     // postId → { date, at, hoursKey, fbPostId, fbPhotoId, status }

/* הימים שצריכים עדכון: כאלה שכבר תוזמנו, שזמנם עוד לא הגיע, ושנשמרה
   עליהם טביעת אצבע אחרת מזו שבלוח עכשיו. */
export function stale(){
  const key = hoursKey(), week = wid();
  const now = Date.now();
  const out = [];
  for (const [id, q] of queued){
    // רק השבוע שמוצג עכשיו. פוסטר של שבוע אחר נמדד מול שעות אחרות,
    // והשוואה מול הלוח הנוכחי הייתה מסמנת אותו כישן בטעות.
    if (q.week && q.week !== week) continue;
    if (q.status === "cancelled" || q.status === "published") continue;
    if (!(Number(q.at) > now + MIN_AHEAD_MS)) continue;
    if (q.hoursKey === key) continue;
    out.push({ id, ...q });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* התוכנית: שבעה ימים, מתי כל אחד משוגר, ומי כבר לא רלוונטי.
   מיוצא כי זה בדיוק מה שהממשק מציג לפני שלוחצים. */
export function plan(over = {}){
  const c = Card.cfg(over);
  const time = /^\d{2}:\d{2}$/.test(over.time || "") ? over.time : (c.posterTime || "08:00");
  const withClosed = over.withClosed !== false;
  const all = hoursByDay();
  const now = Date.now();
  const today = ymd(new Date());
  const open = (i) => !!(all[i] || []).length;
  return [0, 1, 2, 3, 4, 5, 6].map(i => {
    const date = ymd(addDays(S.weekStart, i));
    const at = new Date(`${date}T${time}`).getTime();
    /* פוסטר של יום מתפרסם ביום שלו. אם שעת השיגור של היום כבר עברה —
       מפרסמים מיד ולא מדלגים: פוסטר שעות שיוצא ב-11:00 במקום ב-08:00
       עדיין נכון, ופוסטר שלא יצא בכלל הוא יום בלי הודעה. at=0 אומר
       לשרת "עכשיו". */
    const late = isFinite(at) && at < now + MIN_AHEAD_MS;
    const nowish = late && date === today;
    const skip = !isFinite(at) ? "תאריך לא תקין"
      : (late && !nowish) ? "היום כבר עבר"
      : (!open(i) && !withClosed) ? "יום סגור"
      : "";
    return { i, date, at: nowish ? 0 : at, now: nowish, open: open(i), skip,
      day: DAY_LABEL[i], hours: (all[i] || []).join(" · ") };
  });
}

/* הכיתוב של הפוסט. אותו מידע כמו בתמונה, בטקסט — מי שגולל בלי לפתוח
   את התמונה עדיין יודע מתי פתוח. */
export function caption(d){
  const range = Card.weekRange();
  if (d.open) return `${d.day} — פתוחים ${d.hours}.\n${BRAND.place} · בווייז: ${BRAND.name}\nשעות השבוע ${range}`;
  const next = Card.nextOpen(d.date);
  const back = next ? `נתראה ביום ${next.day}, ${next.text.split("  ").join(" · ")}.` : "";
  return `${d.day} — סגור. ${back}\n${BRAND.place} · שעות השבוע ${range}`;
}

export const buildDay = (d, over = {}) =>
  Card.build({ layout: "poster", date: d.date, target: over.target || "ig_feed",
    photo: over.photo || "", over });

/* השיגור. יום-יום בכוונה: תמונה אחת גדולה בכל בקשה, וכישלון ביום אחד
   לא מפיל את השאר. */
export async function scheduleWeek(over = {}, onStep){
  if (!locked()) throw new Error("השבוע עוד לא ננעל. אי אפשר לפרסם שעות שעוד יכולות לזוז.");
  const days = plan(over).filter(d => !d.skip);
  if (!days.length) throw new Error("אין יום אחד שאפשר עוד לתזמן השבוע.");
  const week = wid();
  const ok = [], failed = [];
  for (const d of days){
    try {
      const image = await buildDay(d, over);
      const text = caption(d);
      const id = `poster-${week}-${d.i}`;
      const r = await api("/publish/schedule", { postId: id, text, image, at: d.at, noIg: over.noIg !== false });
      // טביעת האצבע נשמרת תמיד, גם כשהשרת כבר כתב את שאר השדות: היא
      // מה שיודע להגיד אחר כך שהפוסטר הזה מציג שעות ישנות.
      await setDoc(doc(db, "posts", id), {
        kind: "poster", date: d.date, at: d.at, hoursKey: hoursKey(), week,
        fbPostId: r.fbPostId || "", fbPhotoId: r.fbPhotoId || "",
      }, { merge: true });
      if (!r.saved){
        await setDoc(doc(db, "posts", id), {
          kind: "poster", date: d.date, text, status: "scheduled",
          fbPostId: r.fbPostId || "", fbPhotoId: r.fbPhotoId || "",
          publishAt: r.publishAt || d.at, igPending: !!r.igPending,
          igPostId: r.igPostId || "", igSkipped: r.igSkipped || "", igError: r.igError || "",
        }, { merge: true });
      }
      ok.push({ ...d, ...r });
    } catch (e){ failed.push(`${d.day} — ${e.message}`); }
    if (onStep) onStep(ok.length + failed.length, days.length);
  }
  return { ok, failed, skipped: plan(over).filter(d => d.skip) };
}

/* הסנכרון: כל פוסטר שהשעות שלו התיישנו — מבוטל, נבנה מחדש, ומתוזמן
   מחדש לאותה שעה. הביטול קודם לתזמון בכוונה: שני פוסטים לאותו יום
   הם גרוע יותר מפוסט אחד עם שעות ישנות. */
export async function syncWeek(over = {}, onStep){
  const rows = stale();
  if (!rows.length) return { ok: [], failed: [] };
  const week = wid();
  const ok = [], failed = [];
  for (const q of rows){
    try {
      await api("/publish/cancel", { postId: q.id, at: q.at, fbPostId: q.fbPostId, fbPhotoId: q.fbPhotoId });
      const i = Math.round((fromYmd(q.date) - fromYmd(ymd(S.weekStart))) / 86400000);
      const d = plan(over).find(x => x.i === i);
      if (!d) throw new Error("היום הזה כבר לא בשבוע המוצג.");
      if (d.skip) throw new Error(d.skip);
      const image = await buildDay(d, over);
      const text = caption(d);
      const id = `poster-${week}-${d.i}`;
      const r = await api("/publish/schedule", { postId: id, text, image, at: d.at, noIg: over.noIg !== false });
      await setDoc(doc(db, "posts", id), {
        kind: "poster", date: d.date, text, at: d.at, hoursKey: hoursKey(), week,
        status: "scheduled", fbPostId: r.fbPostId || "", fbPhotoId: r.fbPhotoId || "",
        publishAt: r.publishAt || d.at, igPending: !!r.igPending,
        igPostId: r.igPostId || "", igSkipped: r.igSkipped || "", igError: r.igError || "",
      }, { merge: true });
      ok.push(d);
    } catch (e){ failed.push(`${dm(fromYmd(q.date))} — ${e.message}`); }
    if (onStep) onStep(ok.length + failed.length, rows.length);
  }
  return { ok, failed };
}

/* ===== ההרצה האוטומטית =====
   ברגע שהשבוע נעול — השיגור קורה לבד, בלי ללחוץ. זה מה שמבקשים כאן,
   ולכן זה גם מה שצריך להיות מוגן היטב:

   · רק אחרי שהתור נקרא מפיירסטור. לפני זה לא יודעים מה כבר שוגר,
     ושיגור כפול הוא שני פוסטים לאותו יום באותו עמוד.
   · רק אם אין ולו פוסטר אחד לשבוע הזה. הכפתור הידני נשאר למי שרוצה
     לשגר מחדש ביודעין.
   · דגל מקומי נגד הרצה כפולה באותה לשונית, כי "locked" יכול להישלח
     יותר מפעם אחת.
   כשכבר יש תור והשעות השתנו — מסנכרנים במקום לשגר. */
let ready = false;      // התור נקרא לפחות פעם אחת
let running = false;

export const autoOn = () => Card.cfg().posterAuto !== false;
export const queuedThisWeek = () => {
  const week = wid();
  return [...queued.values()].filter(q => q.week === week && q.status !== "cancelled");
};

export async function auto(){
  if (!ready || running || !autoOn() || !S.isOwner || !locked()) return;
  const has = queuedThisWeek().length;
  const old = stale();
  if (!has && !plan(opts()).some(d => !d.skip)) return;
  if (has && !old.length) return;
  running = true;
  try {
    const r = has ? await syncWeek(opts()) : await scheduleWeek(opts());
    if (r.ok.length || r.failed.length){
      status("wkStatus", r.failed.length ? "warn" : "ok",
        (has ? `סנכרון אוטומטי: ${r.ok.length} פוסטרים עודכנו.` : `שיגור אוטומטי: ${r.ok.length} פוסטרים נכנסו לתור.`) +
        (r.failed.length ? ` ${r.failed.length} נכשלו: ${r.failed[0]}` : ""));
    }
  } catch (e){ status("wkStatus", "bad", "השיגור האוטומטי נכשל: " + e.message); }
  finally { running = false; renderPlan(); }
}

/* מה שבתור נקרא בזמן אמת: כך שורת הסנכרון מופיעה גם כשמישהו אחר
   שינה את השיבוץ ממכשיר אחר. */
export function subscribe(){
  track(onSnapshot(query(collection(db, "posts"), where("kind", "==", "poster")),
    (snap) => {
      queued = new Map();
      snap.forEach(d => queued.set(d.id, d.data()));
      ready = true;
      renderPlan();
      auto();
    }, () => {}));
}

/* ===== תצוגה ===== */
let previews = [];      // [{ d, url }]

function opts(){
  return {
    time: ($("wkTime") && $("wkTime").value) || "08:00",
    withClosed: !($("wkClosed") && !$("wkClosed").checked),
    target: ($("wkTarget") && $("wkTarget").value) || "ig_feed",
    photo: ($("wkPhoto") && $("wkPhoto").value) || "",
    noIg: !($("wkIg") && $("wkIg").checked),
  };
}

function renderPlan(){
  const box = $("wkPlan");
  if (!box) return;
  clear(box);
  if (!locked()){
    box.append(el("p", { class: "small", text: "השבוע עוד לא ננעל. נעל אותו בלשונית השיבוץ, ואז אפשר לשגר." }));
    return;
  }
  const rows = plan(opts());
  const list = el("div", { class: "wkplan" });
  for (const d of rows){
    list.append(el("div", { class: "wkrow" + (d.skip ? " off" : "") },
      el("b", { text: d.day }),
      el("span", { class: "small", text: d.open ? d.hours : "סגור" }),
      el("span", { class: "small", text: d.skip || (d.now ? "מתפרסם מיד" : `משוגר ${dm(fromYmd(d.date))} ב-${opts().time}`) })));
  }
  box.append(list);

  // מה שכבר בתור ולא תואם ללוח — זו כל מהות הסנכרון, ולכן זה על המסך
  // ולא מוסתר מאחורי כפתור שצריך לזכור ללחוץ עליו.
  const old = stale();
  if (old.length){
    box.append(el("div", { class: "notice warn" },
      el("span", { text: `השעות השתנו מאז השיגור. ${old.length} פוסטרים בתור מציגים שעות ישנות.` +
        (autoOn() ? " מתעדכן אוטומטית." : "") }),
      el("button", { class: "primary", text: "סנכרן עכשיו",
        onclick: (e) => withBusy(e.currentTarget, async () => {
          try {
            const r = await syncWeek(opts(), (done) => status("wkStatus", "", `מעדכן ${done} מתוך ${old.length}…`));
            status("wkStatus", r.failed.length ? "warn" : "ok",
              r.failed.length ? `${r.ok.length} עודכנו, ${r.failed.length} נכשלו: ${r.failed[0]}`
                              : `${r.ok.length} פוסטרים עודכנו לשעות החדשות.`);
          } catch (err){ status("wkStatus", "bad", err.message); }
        }) })));
  }
}

function renderPreviews(){
  const box = $("wkShots");
  if (!box) return;
  clear(box);
  for (const p of previews){
    box.append(el("figure", { class: "asset" },
      el("img", { src: p.url, alt: p.d.day }),
      el("figcaption", { class: "small", text: p.d.day })));
  }
}

export function render(){ renderPlan(); }

export function bind(){
  if (!$("wkPlan")) return;

  const photoSel = $("wkPhoto");
  // הרשימה נבנית מחדש כשהספרייה משתנה — אחרת מי שמייבא מהדרייב אחרי
  // שהלשונית כבר נטענה רואה רשימה ריקה ומקבל פוסטר בלי צילום.
  on("assets", () => fillPhotos());
  const fillPhotos = () => {
    if (!photoSel) return;
    const cur = photoSel.value;
    clear(photoSel);
    const shots = Card.assets("photo");
    photoSel.append(el("option", { value: "", text: shots.length ? "הצילום הראשון בספרייה" : "אין צילומים בספרייה" }));
    for (const a of shots) photoSel.append(el("option", { value: a.url, text: a.name || "צילום" }));
    if (cur) photoSel.value = cur;
  };
  fillPhotos();

  const timeInput = $("wkTime");
  if (timeInput && !timeInput.value) timeInput.value = Card.cfg().posterTime || "08:00";

  for (const id of ["wkTime", "wkClosed", "wkTarget", "wkPhoto"]){
    const n = $(id);
    if (n) n.addEventListener("change", renderPlan);
  }

  $("wkPreview").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
    try {
      fillPhotos();
      const o = opts();
      const rows = plan(o).filter(d => !d.skip).slice(0, 7);
      if (!rows.length){ status("wkStatus", "warn", "אין יום אחד שאפשר עוד לתזמן השבוע."); return; }
      previews = [];
      for (const d of rows){
        previews.push({ d, url: await buildDay(d, o) });
        renderPreviews();
      }
      status("wkStatus", "ok", `${previews.length} פוסטרים מוכנים. בדוק ואז שגר.`);
    } catch (err){ status("wkStatus", "bad", err.message); }
  }));

  $("wkSend").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
    try {
      const o = opts();
      const n = plan(o).filter(d => !d.skip).length;
      if (!n){ status("wkStatus", "warn", "אין מה לשגר."); return; }
      if (!confirm(`לשגר ${n} פוסטרים לפייסבוק ולאינסטגרם?`)) return;
      const r = await scheduleWeek(o, (done) => status("wkStatus", "", `משגר ${done} מתוך ${n}…`));
      const ig = r.ok.filter(x => x.igSkipped).length;
      status("wkStatus", r.failed.length ? "warn" : "ok",
        r.failed.length ? `${r.ok.length} תוזמנו, ${r.failed.length} נכשלו: ${r.failed[0]}`
        : `${r.ok.length} פוסטרים תוזמנו.` + (ig ? ` ${ig} לא ילכו לאינסטגרם — ${r.ok.find(x => x.igSkipped).igSkipped}.` : ""));
      renderPlan();
    } catch (err){ status("wkStatus", "bad", err.message); }
  }));

  // נעילת השבוע היא הרגע שבו התוכנית הופכת לאמיתית — מרעננים אותה מיד.
  const autoBox = $("wkAuto");
  if (autoBox){
    autoBox.checked = autoOn();
    autoBox.addEventListener("change", async () => {
      await Card.saveCfg({ posterAuto: autoBox.checked });
      renderPlan();
      auto();
    });
  }

  on("locked", () => { renderPlan(); auto(); });
  // כל שינוי במסמך השבוע — שיבוץ, נעילה, פתיחה מחדש — יכול לייתר
  // פוסטר שכבר בתור. זה בדיוק הרגע לבדוק.
  on("week", () => { renderPlan(); auto(); });
  on("weekchanged", renderPlan);
  subscribe();
  renderPlan();
}
