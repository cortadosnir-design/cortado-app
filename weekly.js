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
  doc, setDoc } from "./core.js";
import * as Card from "./card.js";
import { BRAND } from "./playbook.js";
import { phase, wid, hoursByDay } from "./shifts.js";

const DAY_LABEL = ["יום א", "יום ב", "יום ג", "יום ד", "יום ה", "שישי", "שבת"];
// השרת דורש תזמון של עשר דקות קדימה לפחות. פחות מזה נדחה.
const MIN_AHEAD_MS = 12 * 60 * 1000;

export const locked = () => phase() === "locked";

/* התוכנית: שבעה ימים, מתי כל אחד משוגר, ומי כבר לא רלוונטי.
   מיוצא כי זה בדיוק מה שהממשק מציג לפני שלוחצים. */
export function plan(over = {}){
  const c = Card.cfg(over);
  const time = /^\d{2}:\d{2}$/.test(over.time || "") ? over.time : (c.posterTime || "08:00");
  const withClosed = over.withClosed !== false;
  const all = hoursByDay();
  const now = Date.now();
  return [0, 1, 2, 3, 4, 5, 6].map(i => {
    const date = ymd(addDays(S.weekStart, i));
    const at = new Date(`${date}T${time}`).getTime();
    const open = !!(all[i] || []).length;
    const skip = !isFinite(at) ? "תאריך לא תקין"
      : at < now + MIN_AHEAD_MS ? "השעה כבר עברה"
      : (!open && !withClosed) ? "יום סגור"
      : "";
    return { i, date, at, open, skip, day: DAY_LABEL[i], hours: (all[i] || []).join(" · ") };
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
      const r = await api("/publish/schedule", { postId: id, text, image, at: d.at });
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

/* ===== תצוגה ===== */
let previews = [];      // [{ d, url }]

function opts(){
  return {
    time: ($("wkTime") && $("wkTime").value) || "08:00",
    withClosed: !($("wkClosed") && !$("wkClosed").checked),
    target: ($("wkTarget") && $("wkTarget").value) || "ig_feed",
    photo: ($("wkPhoto") && $("wkPhoto").value) || "",
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
      el("span", { class: "small", text: d.skip || `משוגר ${dm(fromYmd(d.date))} ב-${opts().time}` })));
  }
  box.append(list);
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
  const fillPhotos = () => {
    if (!photoSel) return;
    const cur = photoSel.value;
    clear(photoSel);
    photoSel.append(el("option", { value: "", text: "בלי צילום" }));
    for (const a of Card.assets("photo")) photoSel.append(el("option", { value: a.url, text: a.name || "צילום" }));
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
  on("locked", renderPlan);
  renderPlan();
}
