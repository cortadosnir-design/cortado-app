// שעות הפתיחה ללקוחות: רק תצוגה. השעות יוצאות דרך בוט קורטדו, והבוט רושם
// על מסמך השבוע מה יצא לכל ערוץ (sync). כאן מראים את זה, ולא כותבים שעות.
import { S, $, el, clear, dm, status, copyText, withBusy, api, on, db, doc, onSnapshot, track, DAYS, fromYmd } from "./core.js";
import { hoursText, wid } from "./shifts.js";
import * as H from "./hoursync.js";

const GBP_URL = "https://business.google.com/";

/* גוגל: מה שהבוט פרסם שם, או סימון ידני. "מסומן" = מה שבגוגל הוא בדיוק
   השעות של עכשיו; שינוי שעה אחרי זה מחזיר את הנדנוד. */
export const googleMarked = () => H.googleFresh(S.week);

const LABEL = { page: "דף הנחיתה", facebook: "פייסבוק", google: "גוגל" };

function row(key, state, note, actions){
  const icon = { ok: "✅", manual: "📋", fail: "⚠️", pending: "…" }[state] || "…";
  const r = el("div", { class: "launchrow " + state });
  r.append(el("span", { class: "launchicon", text: icon }));
  r.append(el("div", { class: "grow" },
    el("b", { text: LABEL[key] }),
    note ? el("div", { class: "small", text: note }) : null));
  if (actions) r.append(actions);
  return r;
}

/** מה הבוט רשם לכל ערוץ. "skip"/"manual"/"dry" אינם תקלה — פשוט לא יצא אוטומטית. */
function channel(sync, key){
  const v = sync && sync[key];
  const when = sync && sync.at && sync.at.seconds ? " · " + dm(new Date(sync.at.seconds * 1000)) : "";
  if (!v) return ["pending", "עוד לא פורסם."];
  if (v === "ok") return ["ok", "מעודכן" + when];
  if (v === "skip" || v === "manual" || v === "dry") return ["manual", "לא יצא אוטומטית."];
  return ["fail", v];
}

function render(){
  const box = $("launchList"); if (!box) return;
  clear(box);
  const sync = S.week && S.week.sync;
  for (const key of ["page", "facebook", "google"]){
    let [state, note] = channel(sync, key);
    let actions = null;
    if (key === "page")
      actions = el("div", { class: "actions" },
        el("a", { class: "btn", href: "cafe/#visit", target: "_blank", rel: "noopener", text: "פתח את דף הנחיתה" }));
    if (key === "google"){
      if (googleMarked()){ if (state !== "ok") [state, note] = ["ok", "סומן כמעודכן."]; }
      // אם הבוט לא הגיע לגוגל: מעתיקים, מעדכנים שם ביד, ומסמנים — כמו בכרטיס "היום".
      else actions = el("div", { class: "actions" },
        el("button", { text: "העתק ופתח גוגל", onclick: async (e) => {
          window.open(GBP_URL, "_blank", "noopener");
          await copyText(hoursText(), e.currentTarget, "העתק ופתח גוגל");
          try { await H.markGoogle(wid(), S.week); } catch {}
        } }));
    }
    box.append(row(key, state, note, actions));
  }
}

/* ===== חיבור עמוד פייסבוק, פעם אחת =====
   מדביקים טוקן זמני מ-Graph API Explorer, והשרת מחליף אותו בטוקן עמוד
   ארוך ושומר אותו אצלו. אין יותר "העתק את הבלוק ל-Cloudflare": זה הצעד
   שאף אחד לא עשה, ובגללו העמוד נשאר "לא מחובר". */
async function fbSetup(btn, pageId){
  const token = $("fbUserToken").value.trim();
  if (!token){ $("fbSetupOut").textContent = "הדבק קודם את הטוקן."; return; }
  await withBusy(btn, async () => {
    try {
      const r = await api("/setup/pages", { userToken: token, pageId: pageId || undefined });
      const pages = Array.isArray(r.pages) ? r.pages : [];
      clear($("fbPick")); $("fbSetupOut").textContent = "";
      if (!pages.length){ $("fbSetupOut").textContent = "לא נמצאו עמודים בחשבון הזה."; return; }
      if (r.saved){
        $("fbUserToken").value = "";
        status("launchStatus", "ok", `העמוד "${r.saved.name}" מחובר${r.saved.ig ? " · אינסטגרם @" + r.saved.ig : ""}.`);
        $("fbConnect").open = false;
        return;
      }
      if (r.canSave){
        // כמה עמודים בחשבון — בוחרים אחד. אותו טוקן זמני משמש לשמירה.
        $("fbSetupOut").textContent = "יש כמה עמודים בחשבון הזה. איזה מהם הוא העגלה?";
        pages.forEach(p => $("fbPick").append(el("button", { class: "primary", text: "חבר את " + p.name,
          onclick: (e) => fbSetup(e.currentTarget, p.FB_PAGE_ID) })));
        return;
      }
      // בלי FIREBASE_SA השרת לא יכול לשמור. נשאר המסלול הידני, ואומרים את זה.
      $("fbSetupOut").textContent = pages.map(p =>
        `# ${p.name}\nFB_PAGE_ID=${p.FB_PAGE_ID}\nFB_PAGE_TOKEN=${p.FB_PAGE_TOKEN}` +
        (p.IG_USER_ID ? `\nIG_USER_ID=${p.IG_USER_ID}   (${p.ig || ""})` : "\n# אין חשבון אינסטגרם מקושר לעמוד הזה")
      ).join("\n\n");
      $("fbUserToken").value = "";
      status("launchStatus", "warn", "השרת לא יכול לשמור את החיבור בעצמו (חסר FIREBASE_SA). העתק את הבלוק ל-Cloudflare → Variables and Secrets.");
    } catch (e){ $("fbSetupOut").textContent = "שגיאה: " + e.message; }
  });
}
async function fbStatus(btn){
  await withBusy(btn, async () => {
    try {
      const r = await api("/status", {});
      $("fbSetupOut").textContent =
        `Gemini: ${r.gemini ? "מחובר" : "לא מוגדר"}${r.model ? " — " + r.model : ""}\n` +
        (r.geminiError ? `שגיאת Gemini: ${r.geminiError}\n` : "") +
        (r.models && r.models.length > 1 ? `מודלים זמינים: ${r.models.join(", ")}\n` : "") +
        `פייסבוק: ${r.facebook ? "מחובר" + (r.pageName ? " — " + r.pageName : "") : "לא מחובר"}\n` +
        `אינסטגרם: ${r.instagram ? "מחובר" : "לא מחובר"}` +
        (r.facebookError ? `\nשגיאה: ${r.facebookError}` : "");
    } catch (e){ $("fbSetupOut").textContent = "שגיאה: " + e.message; }
  });
}

/* ===== מה מחכה לצאת בבוט =====
   הבוט שולח לשרת את התור שלו (סטורי, ריל, פרסום אוטומטי, לו"ז מתוזמן) בכל שינוי,
   והשרת שומר ב-botqueue/now. כאן רק מציגים. */
let queue = [];
export function subscribe(){
  if (!S.isOwner) return;
  track(onSnapshot(doc(db, "botqueue", "now"), (snap) => { queue = (snap.exists() && snap.data().items) || []; renderQueue(); }, () => {}));
}
const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
function renderQueue(){
  const box = $("botQueue"); if (!box) return;
  clear(box);
  const now = localNow(), items = queue.filter(x => x.at >= now).sort((a, b) => a.at < b.at ? -1 : 1);
  if (!items.length) return;
  box.append(el("h3", { text: "מחכה לצאת" }));
  for (const x of items){
    const d = fromYmd(x.at.slice(0, 10));
    box.append(el("div", { class: "launchrow pending" },
      el("span", { class: "launchicon", text: "🕐" }),
      el("div", { class: "grow" }, el("b", { text: x.kind }),
        el("div", { class: "small", text: `${DAYS[d.getDay()]} ${dm(d)} ${x.at.slice(11)}${x.label ? " · " + x.label : ""}` }))));
  }
}

export function init(){
  const fb = $("fbSetup"); if (fb) fb.addEventListener("click", (e) => fbSetup(e.currentTarget));
  const fs = $("fbStatus"); if (fs) fs.addEventListener("click", (e) => fbStatus(e.currentTarget));
  render();
  on("week", render);
  on("weekchanged", render);
  on("hoursync", render);
}
