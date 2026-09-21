// "שגר" — עדכון שעות הפתיחה בכל מקום בלחיצה אחת.
// מה שאפשר אוטומטית נעשה אוטומטית; מה שלא — מוגש מוכן להדבקה, בלי לעגל פינות.
import { S, db, $, el, clear, ymd, dm, status, copyText, withBusy, api, WORKER_URL, on,
  doc, setDoc, serverTimestamp } from "./core.js";
import { hoursByDay, hoursPairs, hoursText, hoursDoc, phase } from "./shifts.js";

const FB_DAY = ["sun","mon","tue","wed","thu","fri","sat"];
const GBP_URL = "https://business.google.com/";

/* ===== גוגל, כל עוד אין אישור API =====
   הערוץ הכי חשוב הוא גם היחיד שנעשה ביד, ולכן הוא הצעד שהכי קל לדלג עליו.
   הבעיה אינה 20 השניות — היא ששעות שגויות בגוגל שולחות מטיילים לעגלה סגורה.
   לכן מסמנים: מה שסומן נשמר על מסמך השבוע, ושורת "עכשיו" נודניקית עד שיסומן. */
export const googleMarked = () => !!(S.week && S.week.googleAt);
const googleWhen = () => {
  const t = S.week && S.week.googleAt;
  return t && t.seconds ? dm(new Date(t.seconds * 1000)) : "";
};
async function markGoogle(btn){
  await withBusy(btn, async () => {
    try {
      await setDoc(doc(db, "weeks", "w" + ymd(S.weekStart)),
        { googleAt: serverTimestamp() }, { merge: true });
      status("launchStatus", "ok", "סומן. שורת 'עכשיו' תפסיק לנדנד על גוגל השבוע.");
    } catch { status("launchStatus", "bad", "לא נשמר. רק המנהל יכול."); }
  });
}

// מצב כל ערוץ: pending / ok / manual / skip / fail
const channels = {
  page:      { label: "דף הנחיתה",  auto: true },
  facebook:  { label: "פייסבוק",     auto: true },
  google:    { label: "גוגל",        auto: false },
};
let results = {};


function row(key, state, note, actions){
  const icon = { ok: "✅", manual: "📋", fail: "⚠️", pending: "…", skip: "—" }[state] || "…";
  const r = el("div", { class: "launchrow " + state });
  r.append(el("span", { class: "launchicon", text: icon }));
  r.append(el("div", { class: "grow" },
    el("b", { text: channels[key].label }),
    note ? el("div", { class: "small", text: note }) : null));
  if (actions) r.append(actions);
  return r;
}

function render(){
  const box = clear($("launchList"));
  for (const key of ["page","facebook","google"]){
    let r = results[key] || { state: "pending", note: "" };
    if (key === "google" && googleMarked() && r.state !== "ok")
      r = { state: "ok", note: `עודכן ידנית${googleWhen() ? " ב-" + googleWhen() : ""}. עד שגוגל תאשר את ה-API זה הצעד היחיד שנעשה ביד.` };
    let actions = null;
    if (key === "page")
      actions = el("div", { class: "actions" },
        el("a", { class: "btn", href: "cafe/#visit", target: "_blank", rel: "noopener", text: "פתח את דף הנחיתה" }));
    if (key === "google" && r.state === "manual"){
      actions = el("div", { class: "actions" },
        el("button", { text: "העתק שעות", onclick: (e) => copyText(hoursText(), e.currentTarget, "העתק שעות") }),
        el("a", { class: "btn", href: GBP_URL, target: "_blank", rel: "noopener", text: "פתח גוגל" }),
        googleMarked() ? null
          : el("button", { class: "primary", text: "עדכנתי ✓", onclick: (e) => markGoogle(e.currentTarget) }));
    }
    box.append(row(key, r.state, r.note, actions));
  }
}

/* ===== השיגור ===== */
async function launch(btn){
  results = {};
  render();
  await withBusy(btn, async () => {
    const h = hoursByDay(), pairs = hoursPairs();
    const anyOpen = h.some(x => x.length);
    if (!anyOpen){
      status("launchStatus", "warn", "אין אף יום פתוח בשבוע הזה. הגדר משמרות קודם.");
      return;
    }
    if (phase() !== "locked" && !confirm("השבוע עוד לא ננעל — השעות עלולות להשתנות. לשגר בכל זאת?")) return;

    // 1. דף הנחיתה — מיידי
    try {
      await setDoc(doc(db, "public", "hours"), hoursDoc());
      results.page = { state: "ok", note: "עודכן. הדף הציבורי כבר מציג את השעות החדשות." };
      // מסמן על השבוע שהשעות שוגרו, כדי שהצעד הבא יידע להתקדם.
      setDoc(doc(db, "weeks", "w" + ymd(S.weekStart)), { launchedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    } catch (e){
      // "נסה שוב" על תקלה שחוזרת בכל פעם הוא מבוי סתום. הסיבה נכתבת כאן.
      results.page = { state: "fail", note: e.code === "permission-denied"
        ? "רק המנהל יכול לעדכן את דף השעות." : "העדכון נכשל: " + String(e.message || e.code || "").slice(0, 140) };
    }
    render();

    // 2. פייסבוק — דרך ה-API, אם העמוד מחובר
    if (!WORKER_URL){
      results.facebook = { state: "fail", note: "השרת לא מוגדר." };
    } else {
      try {
        const hours = {};
        pairs.forEach((list, i) => { if (list.length) hours[FB_DAY[i]] = list; });
        const r = await api("/hours/facebook", { hours });
        results.facebook = { state: "ok", note: "שעות העמוד עודכנו בפייסבוק." };
      } catch (e){
        const msg = String(e.message || "");
        results.facebook = { state: "fail",
          note: /not_configured|חסר/.test(msg) ? "עמוד הפייסבוק עוד לא מחובר — חסר App Secret בשרת." : msg };
      }
    }
    render();

    // 3. גוגל — הערוץ מספר 1 לחיפוש "קפה ליד".
    // מנסים אוטומטית. כל עוד אין אישור מגוגל השרת מחזיר not_configured, וזה
    // נופל בחזרה להדבקה ידנית בלי להיראות כמו תקלה. ביום שהאישור מגיע
    // ומוגדרים המשתנים ב-Cloudflare — זה הופך לאוטומטי בלי שינוי קוד.
    if (!WORKER_URL){
      results.google = { state: "manual", note: "הדבקה ידנית, 20 שניות. הטקסט מוכן למטה." };
    } else {
      try {
        await api("/hours/google", { hours: hoursPairs() });
        results.google = { state: "ok", note: "שעות הפרופיל עודכנו בגוגל." };
        setDoc(doc(db, "weeks", "w" + ymd(S.weekStart)), { googleAt: serverTimestamp() }, { merge: true }).catch(() => {});
      } catch (e){
        const msg = String(e.message || "");
        results.google = { state: "manual",
          note: /not_configured|עוד לא מחוברת/.test(msg)
            ? "גוגל עוד לא מאושרת ל-API. עד אז — הדבקה ידנית, 20 שניות."
            : msg };
      }
    }
    render();


    const okCount = Object.values(results).filter(r => r.state === "ok").length;
    status("launchStatus", okCount ? "ok" : "warn", `${okCount} מתוך 3 עודכנו אוטומטית. השאר מוכן להדבקה למטה.`);
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
  on("locked", () => {
    status("launchStatus", "ok", "השבוע ננעל. אפשר לשגר את השעות.");
    const card = $("launchCard");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
