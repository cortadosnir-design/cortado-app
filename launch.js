// שעות הפתיחה בכל מקום. מאז hoursync.js זה קורה לבד בכל שינוי; הכרטיס
// הזה מראה איפה כל ערוץ עומד, ומשאיר כפתור "עדכן עכשיו" למקרה שמשהו נכשל.
import { S, $, el, clear, dm, status, copyText, withBusy, api, on } from "./core.js";
import { hoursText, wid } from "./shifts.js";
import * as H from "./hoursync.js";

const GBP_URL = "https://business.google.com/";

/* ===== גוגל, כל עוד אין אישור API =====
   הערוץ הכי חשוב הוא גם היחיד שנעשה ביד. "מסומן" = מה שסומן בגוגל הוא
   בדיוק השעות של עכשיו; שינוי שעה אחרי הסימון מחזיר את הנדנוד. */
export const googleMarked = () => H.googleFresh(S.week);
const googleWhen = () => {
  const t = S.week && S.week.googleAt;
  return t && t.seconds ? dm(new Date(t.seconds * 1000)) : "";
};
async function markGoogle(btn){
  await withBusy(btn, async () => {
    try { await H.markGoogle(wid(), S.week); status("launchStatus", "ok", "סומן. שורת 'עכשיו' תפסיק לנדנד על גוגל, עד השינוי הבא בשעות."); }
    catch { status("launchStatus", "bad", "לא נשמר. רק המנהל יכול."); }
  });
}

const LABEL = { page: "דף הנחיתה", facebook: "פייסבוק", google: "גוגל" };

function row(key, state, note, actions){
  const icon = { ok: "✅", manual: "📋", fail: "⚠️", pending: "…", skip: "—" }[state] || "…";
  const r = el("div", { class: "launchrow " + state });
  r.append(el("span", { class: "launchicon", text: icon }));
  r.append(el("div", { class: "grow" },
    el("b", { text: LABEL[key] }),
    note ? el("div", { class: "small", text: note }) : null));
  if (actions) r.append(actions);
  return r;
}

/** מצב כל ערוץ, מתוך מה שנרשם על מסמך השבוע — לא מתוך לחיצה אחרונה. */
function channels(){
  const st = H.stateOf(wid(), S.week), sync = st.sync;
  const when = sync && sync.at && sync.at.seconds ? " · " + new Date(sync.at.seconds * 1000).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "";
  if (st.pending) return { page: ["pending", "מתעדכן…"], facebook: ["pending", "מתעדכן…"], google: googleRow() };
  const stale = st.dirty;
  const page = !sync ? ["pending", st.live ? "יתעדכן לבד עוד רגע." : "יתעדכן לבד כשהשבוע יינעל. אפשר גם עכשיו."]
    : stale ? ["fail", "השעות השתנו מאז העדכון האחרון. לחץ \"עדכן עכשיו\"."]
    : sync.page === "ok" ? ["ok", "מעודכן" + when] : ["fail", sync.page];
  const facebook = !sync ? ["pending", ""]
    : sync.facebook === "skip" ? ["skip", "פייסבוק מחזיק שעות של שבוע אחד, וכרגע זה שבוע אחר."]
    : stale ? ["fail", "לא מעודכן."]
    : sync.facebook === "ok" ? ["ok", "מעודכן" + when] : ["fail", sync.facebook || "לא נוסה."];
  return { page, facebook, google: googleRow() };
}
function googleRow(){
  return googleMarked()
    ? ["ok", `סומן כמעודכן${googleWhen() ? " ב-" + googleWhen() : ""}.`]
    : ["manual", "הדבקה ידנית עד שגוגל תאשר את ה-API. אחרי כל שינוי בשעות."];
}

function render(){
  const box = $("launchList"); if (!box) return;
  clear(box);
  const ch = channels();
  for (const key of ["page","facebook","google"]){
    const [state, note] = ch[key];
    let actions = null;
    if (key === "page")
      actions = el("div", { class: "actions" },
        el("a", { class: "btn", href: "cafe/#visit", target: "_blank", rel: "noopener", text: "פתח את דף הנחיתה" }));
    if (key === "google" && state === "manual")
      actions = el("div", { class: "actions" },
        el("button", { text: "העתק שעות", onclick: (e) => copyText(hoursText(), e.currentTarget, "העתק שעות") }),
        el("a", { class: "btn", href: GBP_URL, target: "_blank", rel: "noopener", text: "פתח גוגל" }),
        el("button", { class: "primary", text: "עדכנתי ✓", onclick: (e) => markGoogle(e.currentTarget) }));
    box.append(row(key, state, note, actions));
  }
}

/* ===== עדכון ידני — למקרה שמשהו נכשל, או לשבוע הבא לפני שננעל ===== */
async function launch(btn){
  await withBusy(btn, async () => {
    if (!S.week){ status("launchStatus", "warn", "אין עוד משמרות בשבוע הזה."); return; }
    const out = await H.publish(wid(), S.week).catch((e) => ({ page: e.message }));
    if (!out){ status("launchStatus", "warn", "כבר מתעדכן, או שאין עוד שבוע."); return; }
    const okN = [out.page, out.facebook, out.google].filter(x => x === "ok").length;
    status("launchStatus", out.page === "ok" ? "ok" : "bad", out.page === "ok" ? `עודכן. ${okN} מתוך 3 ערוצים אוטומטיים.` : out.page);
    render();
  });
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
        status("launchStatus", "ok", `העמוד "${r.saved.name}" מחובר${r.saved.ig ? " · אינסטגרם @" + r.saved.ig : ""}. שעות ופרסום יוצאים מעכשיו — לחץ "שגר".`);
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

export function init(){
  const fb = $("fbSetup"); if (fb) fb.addEventListener("click", (e) => fbSetup(e.currentTarget));
  const fs = $("fbStatus"); if (fs) fs.addEventListener("click", (e) => fbStatus(e.currentTarget));
  const btn = $("launchBtn");
  if (btn) btn.addEventListener("click", (e) => launch(e.currentTarget));
  const cp = $("launchCopy");
  if (cp) cp.addEventListener("click", (e) => copyText(hoursText(), e.currentTarget, "העתק את השעות"));
  render();
  on("week", render);
  on("weekchanged", render);
  on("hoursync", render);
  on("locked", () => status("launchStatus", "ok", "השבוע ננעל. השעות מתפרסמות לבד."));
}
