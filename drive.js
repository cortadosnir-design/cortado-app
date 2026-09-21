// ייבוא מגוגל דרייב: התיקייה שבה יושבות התמונות של העגלה הופכת למקור
// של ספריית המדיה. בוחרים תמונות, מצמידים להן נושא, והן נכנסות לכרטיסים.
//
// למה דרך הדפדפן ולא דרך השרת: ההרשאה היא של הבעלים, לא של האפליקציה.
// הדפדפן מקבל אסימון קריאה בלבד ברגע שמבקשים, מחזיק אותו בזיכרון עד
// שסוגרים את הלשונית, ולא שומר אותו בשום מקום. השרת לא רואה אותו ולא
// צריך אותו — הוא גם ככה לא מחזיק הרשאות לדרייב של אף אחד.
import { auth, $, el, clear, status, withBusy,
  GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup } from "./core.js";
import * as Card from "./card.js";
import { PILLAR3 } from "./creative.js";

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const API = "https://www.googleapis.com/drive/v3";

/* האסימון חי בזיכרון בלבד. גוגל נותן לו כשעה, ואנחנו לא מנסים לחדש
   אותו בשקט — בקשה שנכשלת מחזירה את המשתמש לכפתור "התחבר". */
let token = "";
let tokenAt = 0;
let files = [];          // מה שנמצא בתיקייה
let picked = new Set();
export const connected = () => !!token && (Date.now() - tokenAt) < 50 * 60 * 1000;

function driveProvider(){
  const p = new GoogleAuthProvider();
  p.addScope(SCOPE);
  // בלי זה גוגל מדלג על מסך ההסכמה כשכבר התחברת, ולא מחזיר אסימון
  // עם ההרשאה החדשה — הייבוא היה נכשל ב-403 בלי שום הסבר.
  p.setCustomParameters({ prompt: "consent" });
  return p;
}

/* התחברות מצטברת: אותו חשבון, רק עם הרשאת קריאה לדרייב בנוסף.
   reauthenticateWithPopup שומר על המשתמש הקיים; אם הוא לא זמין
   (סשן שפג) נופלים לכניסה רגילה, שגם היא מחזירה את האסימון. */
export async function connect(){
  const p = driveProvider();
  let res;
  try {
    res = auth.currentUser
      ? await reauthenticateWithPopup(auth.currentUser, p)
      : await signInWithPopup(auth, p);
  } catch (e){
    if (e && e.code === "auth/popup-blocked") throw new Error("הדפדפן חסם את חלון גוגל. אפשר חלונות קופצים לאתר הזה ונסה שוב.");
    if (e && e.code === "auth/popup-closed-by-user") throw new Error("החלון נסגר לפני שאישרת.");
    if (e && e.code === "auth/user-mismatch") throw new Error("זה חשבון גוגל אחר. התחבר עם החשבון שהתיקייה שייכת לו.");
    throw new Error("ההתחברות לדרייב נכשלה: " + ((e && e.message) || ""));
  }
  const cred = GoogleAuthProvider.credentialFromResult(res);
  if (!cred || !cred.accessToken) throw new Error("גוגל לא החזיר הרשאת קריאה לדרייב.");
  token = cred.accessToken;
  tokenAt = Date.now();
  return token;
}
export function forget(){ token = ""; tokenAt = 0; files = []; picked.clear(); render(); }

async function api(path){
  if (!connected()) throw new Error("ההרשאה לדרייב פגה. לחץ 'התחבר לדרייב' שוב.");
  const r = await fetch(API + path, { headers: { Authorization: "Bearer " + token } });
  if (r.status === 401 || r.status === 403){
    token = "";
    throw new Error("גוגל דחה את הבקשה. התחבר לדרייב שוב.");
  }
  if (!r.ok) throw new Error("גוגל החזיר שגיאה " + r.status);
  return r.json();
}

/* מזהה התיקייה מתוך קישור שיתוף רגיל, או מזהה גולמי.
   .../folders/<id>?usp=sharing → <id> */
export function folderIdOf(input){
  const s = String(input || "").trim();
  if (!s) return "";
  const m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : "";
}

/* מה שיש בתיקייה. רק תמונות, ורק מה שלא נמחק. */
export async function listFolder(id){
  const q = encodeURIComponent(`'${id}' in parents and mimeType contains 'image/' and trashed = false`);
  const fields = encodeURIComponent("files(id,name,mimeType,thumbnailLink,imageMediaMetadata(width,height)),nextPageToken");
  let out = [], page = "";
  do {
    const j = await api(`/files?q=${q}&fields=${fields}&pageSize=100&orderBy=createdTime desc` + (page ? `&pageToken=${page}` : ""));
    out = out.concat(j.files || []);
    page = j.nextPageToken || "";
  } while (page && out.length < 300);
  files = out;
  picked.clear();
  return out;
}

/* הורדה בפועל. הקובץ נוסע כ-blob, מוקטן בדפדפן ונשמר כ-data URL —
   אותו מסלול בדיוק של תמונה שמעלים מהמכשיר. */
async function fetchFile(f){
  const r = await fetch(`${API}/files/${f.id}?alt=media`, { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error(`${f.name}: גוגל החזיר ${r.status}`);
  const blob = await r.blob();
  return new File([blob], f.name, { type: blob.type || f.mimeType || "image/jpeg" });
}

/* ייבוא. אחת-אחת בכוונה: כל תמונה היא מסמך נפרד בפיירסטור, ובקשה
   מקבילה של עשרים תמונות רק מגדילה את הסיכוי שחלקן ייפלו בשקט. */
export async function importPicked(kind, pillar, onStep){
  const list = files.filter(f => picked.has(f.id));
  let ok = 0;
  const failed = [];
  for (const f of list){
    try {
      const file = await fetchFile(f);
      await Card.addAsset(file, kind, f.name.replace(/\.[^.]+$/, ""), pillar);
      ok++;
    } catch (e){ failed.push(`${f.name} — ${e.message}`); }
    if (onStep) onStep(ok + failed.length, list.length);
  }
  picked.clear();
  render();
  return { ok, failed };
}

/* ===== תצוגה ===== */
function render(){
  const box = $("drvList");
  if (!box) return;
  clear(box);
  const btn = $("drvConnect");
  if (btn) btn.textContent = connected() ? "התחבר מחדש" : "התחבר לדרייב";
  const bar = $("drvBar");
  if (bar) bar.hidden = !files.length;
  const count = $("drvCount");
  if (count) count.textContent = files.length ? `${picked.size} מתוך ${files.length} מסומנות` : "";

  if (!connected()){
    box.append(el("p", { class: "small", text: "לחץ \"התחבר לדרייב\" כדי לראות את התיקייה. ההרשאה היא קריאה בלבד, והיא נשארת בדפדפן הזה עד שסוגרים אותו." }));
    return;
  }
  if (!files.length){
    box.append(el("p", { class: "small", text: "אין תמונות בתיקייה, או שעוד לא טענת אותה." }));
    return;
  }
  const grid = el("div", { class: "assets" });
  for (const f of files){
    const on = picked.has(f.id);
    grid.append(el("figure", { class: "asset drv" + (on ? " on" : "") },
      el("img", {
        // thumbnailLink של גוגל הוא כתובת חתומה וציבורית-למי-שיש-לו — לא צריך אסימון
        src: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, "=s220") : "",
        alt: f.name, title: f.name,
        onclick: () => { picked.has(f.id) ? picked.delete(f.id) : picked.add(f.id); render(); } }),
      el("figcaption", { class: "small", text: f.name.replace(/\.[^.]+$/, "").slice(0, 22) })));
  }
  box.append(grid);
}

export function bind(){
  const box = $("drvList");
  if (!box) return;

  const folderInput = $("drvFolder");
  if (folderInput) folderInput.value = Card.cfg().driveFolder || "";

  $("drvConnect").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
    try {
      await connect();
      status("drvStatus", "ok", "מחובר. טוען את התיקייה…");
      await load();
    } catch (err){ status("drvStatus", "bad", err.message); render(); }
  }));

  $("drvLoad").addEventListener("click", (e) => withBusy(e.currentTarget, load));

  $("drvAll").addEventListener("click", () => {
    if (picked.size === files.length) picked.clear();
    else files.forEach(f => picked.add(f.id));
    render();
  });

  $("drvImport").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
    if (!picked.size){ status("drvStatus", "warn", "לא סימנת תמונות."); return; }
    const kind = $("drvKind").value, pillar = $("drvPillar").value;
    const n = picked.size;
    try {
      const r = await importPicked(kind, pillar, (done) => status("drvStatus", "", `מייבא ${done} מתוך ${n}…`));
      status("drvStatus", r.failed.length ? "warn" : "ok",
        r.failed.length ? `${r.ok} נכנסו, ${r.failed.length} נכשלו: ${r.failed[0]}` : `${r.ok} תמונות נכנסו לספרייה.`);
    } catch (err){ status("drvStatus", "bad", err.message); }
  }));

  const pillarSel = $("drvPillar");
  if (pillarSel){
    clear(pillarSel);
    pillarSel.append(el("option", { value: "", text: "בלי נושא" }));
    for (const [k, v] of Object.entries(PILLAR3)) pillarSel.append(el("option", { value: k, text: v.label }));
  }
  render();
}

async function load(){
  const raw = ($("drvFolder") && $("drvFolder").value) || Card.cfg().driveFolder || "";
  const id = folderIdOf(raw);
  if (!id){ status("drvStatus", "warn", "הדבק קישור לתיקייה בדרייב, או את המזהה שלה."); return; }
  try {
    if (!connected()) await connect();
    const list = await listFolder(id);
    // המזהה נשמר, כדי שלא צריך להדביק אותו שוב בפעם הבאה
    if (Card.cfg().driveFolder !== id) await Card.saveCfg({ driveFolder: id });
    status("drvStatus", "ok", `${list.length} תמונות בתיקייה.`);
    render();
  } catch (err){ status("drvStatus", "bad", err.message); render(); }
}
