// קורטדו אופרציה — נקודת הכניסה: זיהוי, ניווט, וחיבור המודולים.
import { S, auth, db, provider, $, addDays, weekId, defaultWeekStart, emit, on, dropSubs,
  FOUNDER_EMAILS, WORKER_URL,
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
  doc, getDoc, getDocs, setDoc, collection, serverTimestamp } from "./core.js";
import * as Shifts from "./shifts.js";
import * as Creative from "./creative.js";
import * as Drive from "./drive.js";
import * as Weekly from "./weekly.js";
import * as Reach from "./reach.js";
import * as Ops from "./ops.js";
import * as People from "./people.js";
import * as Launch from "./launch.js";
import * as Now from "./now.js";
import * as Today from "./today.js";
import * as Hours from "./hoursync.js";
import * as Weather from "./weather.js";
import * as Analyze from "./analyze.js";
import * as Sales from "./sales.js";
import { APP_VERSION } from "./config.js";

const TABS = ["shifts","creative","reach","sales","log","team"];
const OWNER_TABS = ["creative","reach","sales","team"];

function selectTab(name){
  if (!TABS.includes(name)) name = "shifts";
  if (OWNER_TABS.includes(name) && !S.isOwner) name = "shifts";
  for (const t of TABS){
    const btn = $("tab-" + t), panel = $("p-" + t);
    if (btn) btn.setAttribute("aria-selected", String(t === name));
    if (panel) panel.hidden = t !== name;
  }
  try { localStorage.setItem("cortado-tab", name); } catch {}
  if (name === "team"){ Ops.loadReminders(); People.render(); }
  if (name === "creative") Creative.render();
  if (name === "reach") Reach.render();
  if (name === "sales") Sales.render();
}

TABS.forEach(t => { const b = $("tab-" + t); if (b) b.addEventListener("click", () => selectTab(t)); });
on("tab", (name) => { selectTab(name); window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); });

/* ===== ניווט בין שבועות ===== */
on("weekchange", (delta) => {
  S.weekStart = addDays(S.weekStart, delta);
  // רק המשמרות תלויות בשבוע. שאר המאזינים נשארים כפי שהם.
  Shifts.resubscribe();
  emit("weekchanged");
});

/* S.weekStart נקבע פעם אחת בטעינת המודול. האפליקציה מותקנת כ-PWA ונשארת
   פתוחה על הטלפון ימים, ולכן אחרי חצות שישי היא המשיכה להציג את השבוע
   הישן בלי שום סימן. כאן מתקנים כשחוזרים ללשונית — אבל רק אם המשתמש
   יושב על השבוע שהאפליקציה בחרה לבד, כדי לא לחטוף לו את המסך מתחת לידיים. */
let autoWeek = weekId(S.weekStart);
function refreshWeekIfStale(){
  const fresh = defaultWeekStart();
  if (weekId(fresh) === autoWeek) return;               // עדיין אותו שבוע
  const onAuto = weekId(S.weekStart) === autoWeek;      // המשתמש לא ניווט בעצמו
  autoWeek = weekId(fresh);
  if (!onAuto) return;                                  // הוא בחר שבוע — משאירים אותו שם
  S.weekStart = fresh;
  Shifts.resubscribe();
  emit("weekchanged");
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshWeekIfStale(); });

/* ===== כניסה ===== */
$("signInBtn").addEventListener("click", async () => {
  $("signInBtn").disabled = true;
  try { await signInWithPopup(auth, provider); }
  catch (e){
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment"){
      // נפילה שקטה כאן השאירה את המשתמש מול מסך שלא מגיב, בלי שום הסבר.
      try { await signInWithRedirect(auth, provider); return; }
      catch { $("authNote").textContent = "הדפדפן חסם את חלון הכניסה. אפשר לאשר חלונות קופצים ולנסות שוב."; return; }
    }
    $("authNote").textContent =
      e.code === "auth/popup-closed-by-user" ? "הכניסה בוטלה." :
      e.code === "auth/unauthorized-domain" ? "הכתובת הזו לא מאושרת ב-Firebase (Authentication ← Settings ← Authorized domains)." :
      "הכניסה נכשלה. נסה שוב.";
  } finally { $("signInBtn").disabled = false; }
});
$("signOut").addEventListener("click", () => signOut(auth));
getRedirectResult(auth).catch(() => {});

function startSubs(){
  Shifts.subscribe();
  if (S.isOwner){ Creative.subscribe(); Reach.subscribe(); Sales.subscribe(); Hours.subscribe(); Today.subscribe(); }
  Ops.subscribe();
}

async function loadMemberNames(){
  if (S.isOwner) return;              // למנהל יש מאזין חי ב-ops
  try {
    const snap = await getDocs(collection(db, "members"));
    S.memberNames = {};
    snap.docs.forEach(d => S.memberNames[d.id] = (d.data().name || "חבר צוות"));
  } catch {}
}

/* הקולבק הזה הוא async ועושה await לפני שהוא נוגע במנויים, ו-Firebase לא
   מסדר קולבקים אסינכרוניים בתור. בלי מונה הדורות, כניסה שמיד אחריה יציאה
   מריצה את הסוף של הקולבק הישן *אחרי* שהחדש כבר ניקה — ומנויים חיים
   נפתחים בשם משתמש מנותק, נכשלים ב-permission-denied, ו"אין חיבור לנתונים"
   נתקע על המסך. gen !== authGen פירושו: אירוע חדש יותר כבר עקף אותי. */
let authGen = 0;
onAuthStateChanged(auth, async (user) => {
  const gen = ++authGen;
  S.me = user;
  /* מייסד מזוהה מהרשימה הקבועה; מנהל רגיל — מדגל admin במסמך members
     שלו. את מסמך ה-members צריך לקרוא בכל מקרה (הוא גם מה שקובע אם
     המשתמש מאושר בכלל), ולכן זו לא קריאה נוספת. */
  S.isFounder = !!user && FOUNDER_EMAILS.map(e => e.toLowerCase()).includes((user.email || "").toLowerCase());
  S.isOwner = S.isFounder;
  S.isMember = S.isFounder;
  if (user && !S.isFounder){
    try {
      const m = await getDoc(doc(db, "members", user.uid));
      if (gen !== authGen) return;
      S.isMember = m.exists();
      S.isOwner = m.exists() && m.data().admin === true;
    }
    catch { if (gen !== authGen) return; S.isMember = false; S.isOwner = false; }
  }

  $("signin").hidden = !!user;
  $("waiting").hidden = !(user && !S.isMember);
  $("tabs").hidden = !(user && S.isMember);
  $("who").hidden = !user;
  document.querySelectorAll("[data-owner]").forEach(n => n.hidden = !S.isOwner);
  document.querySelectorAll("[data-api]").forEach(n => n.hidden = !(S.isOwner && WORKER_URL));

  if (user){
    $("myName").textContent = user.displayName || user.email || "";
    // בלי ה-else התמונה של המשתמש הקודם נשארת על המסך למי שאין לו תמונה.
    if (user.photoURL) $("avatar").src = user.photoURL; else $("avatar").removeAttribute("src");
  }

  if (!user || !S.isMember){
    dropSubs();
    Object.assign(S, { week: null, availability: [], signups: [], posts: [], team: [], logs: [], members: [], joinReqs: [], creative: {}, sales: [] });
    TABS.forEach(t => { const p = $("p-" + t); if (p) p.hidden = true; });
    if (user && !S.isMember){
      try {
        await setDoc(doc(db, "joinRequests", user.uid), {
          name: user.displayName || "", email: user.email || "", photo: user.photoURL || "", at: serverTimestamp(),
        });
      } catch {}
    }
    return;
  }

  try {
    await setDoc(doc(db, "users", user.uid), {
      name: user.displayName || "", email: user.email || "", photo: user.photoURL || "", lastSeen: serverTimestamp(),
    }, { merge: true });
  } catch {}

  let tab = "shifts";
  try {
    const t = localStorage.getItem("cortado-tab");
    if (t && TABS.includes(t) && (S.isOwner || !OWNER_TABS.includes(t))) tab = t;
  } catch {}
  selectTab(tab);

  await loadMemberNames();
  if (gen !== authGen) return;        // אירוע אימות חדש יותר כבר טיפל במצב
  dropSubs();
  startSubs();
});

/* ===== אתחול מודולים ===== */
Shifts.init();
Creative.init();
Drive.bind();
Weekly.bind();
Reach.init();
Ops.init();
People.init();
Launch.init();
Now.init();
Today.init();
Weather.init();
Analyze.init();
Sales.init();
Shifts.render();
Ops.renderLog();

/* ===== גרסה ועדכונים =====
   ה-Service Worker שומר את קבצי האפליקציה. בלי הקוד הזה הוא מתחלף רק
   מתי שבא לו, והבעלים רואה את הגרסה הישנה אחרי שדחפנו חדשה. */
/* ===== ערבוב גרסאות =====
   index.html ו-app.js נשמרים במטמון בנפרד, ולכן אחרי דחיפה הדפדפן עלול
   להגיש HTML חדש לצד JS ישן. אז לשונית חדשה מצוירת, אבל לחיצה עליה לא
   עושה כלום — ה-JS הישן מעולם לא חיבר לה מאזין. זה נראה למשתמש כמו
   "האפליקציה תקועה", בלי שום שגיאה. כאן מזהים את הפער ומתקנים, פעם אחת. */
const declared = document.querySelector('meta[name="app-build"]');
if (declared && declared.content && declared.content !== APP_VERSION){
  const once = "cortado-fixmix-" + declared.content;
  let already = false;
  try { already = sessionStorage.getItem(once) === "1"; } catch {}
  if (!already){
    try { sessionStorage.setItem(once, "1"); } catch {}
    (async () => {
      try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch {}
      try {
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (reg) await reg.unregister();
      } catch {}
      location.reload();
    })();
  }
}

const build = $("build");
if (build) build.textContent = "· " + APP_VERSION;

if ("serviceWorker" in navigator){
  navigator.serviceWorker.register("sw.js").then(reg => {
    const offer = (worker) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        // "installed" + כבר יש שולט = יש גרסה חדשה שממתינה
        if (worker.state === "installed" && navigator.serviceWorker.controller) show();
      });
    };
    const show = () => { const bar = $("newver"); if (bar) bar.hidden = false; };
    if (reg.waiting && navigator.serviceWorker.controller) show();
    reg.addEventListener("updatefound", () => offer(reg.installing));
    offer(reg.installing);

    const check = () => reg.update().catch(() => {});
    check();
    // חוזרים ללשונית אחרי יום — כדאי לבדוק שוב
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });

    /* "רענן" חייב לחכות שה-Service Worker החדש באמת ישתלט.
       postMessage הוא אסינכרוני: רענון מיד אחריו מוגש עדיין ע"י הישן,
       הדפדפן מקבל את אותם קבצים, והבאנר פשוט חוזר. controllerchange הוא
       האירוע שאומר "החדש שולט מעכשיו" — ורק אז יש טעם לרענן.
       המונה מונע לולאה אם האירוע יורה יותר מפעם אחת, והשנייתיים הם
       רשת ביטחון למקרה שהוא לא יורה בכלל. */
    const btn = $("reloadNow");
    if (btn) btn.addEventListener("click", () => {
      btn.disabled = true; btn.textContent = "מרענן…";
      let reloaded = false;
      const go = () => { if (!reloaded){ reloaded = true; location.reload(); } };
      if (!reg.waiting){ go(); return; }
      navigator.serviceWorker.addEventListener("controllerchange", go, { once: true });
      reg.waiting.postMessage({ type: "skip" });
      setTimeout(go, 2000);
    });
  }).catch(() => {});
}
