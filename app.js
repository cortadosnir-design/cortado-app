// קורטדו אופרציה — נקודת הכניסה: זיהוי, ניווט, וחיבור המודולים.
import { S, auth, db, provider, $, el, addDays, weekId, emit, on, dropSubs, track,
  OWNER_EMAILS, WORKER_URL,
  signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
  doc, getDoc, getDocs, setDoc, collection, serverTimestamp } from "./core.js";
import * as Shifts from "./shifts.js";
import * as Creative from "./creative.js";
import * as Reach from "./reach.js";
import * as Ops from "./ops.js";
import * as People from "./people.js";
import * as Launch from "./launch.js";
import * as Now from "./now.js";
import * as Weather from "./weather.js";
import * as Analyze from "./analyze.js";
import { APP_VERSION } from "./config.js";

const TABS = ["shifts","creative","reach","log","team"];
const OWNER_TABS = ["creative","reach","team"];

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
}

TABS.forEach(t => { const b = $("tab-" + t); if (b) b.addEventListener("click", () => selectTab(t)); });
on("tab", (name) => { selectTab(name); window.scrollTo({ top: 0, behavior: "smooth" }); });

/* ===== ניווט בין שבועות ===== */
on("weekchange", (delta) => {
  S.weekStart = addDays(S.weekStart, delta);
  // רק המשמרות תלויות בשבוע. שאר המאזינים נשארים כפי שהם.
  Shifts.resubscribe();
  emit("weekchanged");
});

/* ===== כניסה ===== */
$("signInBtn").addEventListener("click", async () => {
  $("signInBtn").disabled = true;
  try { await signInWithPopup(auth, provider); }
  catch (e){
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment"){
      try { await signInWithRedirect(auth, provider); return; } catch {}
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
  if (S.isOwner){ Creative.subscribe(); Reach.subscribe(); }
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

onAuthStateChanged(auth, async (user) => {
  S.me = user;
  S.isOwner = !!user && OWNER_EMAILS.map(e => e.toLowerCase()).includes((user.email || "").toLowerCase());
  S.isMember = S.isOwner;
  if (user && !S.isOwner){
    try { const m = await getDoc(doc(db, "members", user.uid)); S.isMember = m.exists(); }
    catch { S.isMember = false; }
  }

  $("signin").hidden = !!user;
  $("waiting").hidden = !(user && !S.isMember);
  $("tabs").hidden = !(user && S.isMember);
  $("who").hidden = !user;
  document.querySelectorAll("[data-owner]").forEach(n => n.hidden = !S.isOwner);
  document.querySelectorAll("[data-api]").forEach(n => n.hidden = !(S.isOwner && WORKER_URL));

  if (user){
    $("myName").textContent = user.displayName || user.email || "";
    if (user.photoURL) $("avatar").src = user.photoURL;
  }

  if (!user || !S.isMember){
    dropSubs();
    Object.assign(S, { week: null, availability: [], signups: [], posts: [], team: [], logs: [], members: [], joinReqs: [], creative: {} });
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
  dropSubs();
  startSubs();
});

/* ===== אתחול מודולים ===== */
Shifts.init();
Creative.init();
Reach.init();
Ops.init();
People.init();
Launch.init();
Now.init();
Weather.init();
Analyze.init();
Shifts.render();
Ops.renderLog();

/* ===== גרסה ועדכונים =====
   ה-Service Worker שומר את קבצי האפליקציה. בלי הקוד הזה הוא מתחלף רק
   מתי שבא לו, והבעלים רואה את הגרסה הישנה אחרי שדחפנו חדשה. */
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

    const btn = $("reloadNow");
    if (btn) btn.addEventListener("click", () => {
      if (reg.waiting) reg.waiting.postMessage({ type: "skip" });
      location.reload();
    });
  }).catch(() => {});
}
