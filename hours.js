// דף השעות הציבורי. קורא את public/hours ומתעדכן לבד כש"שגר" נלחץ.
// עומד בפני עצמו בכוונה: בלי core.js, בלי אימות — זה הדף היחיד שגולשים
// מהרחוב מגיעים אליו, והוא צריך להיפתח מהר גם בלי כלום.
//
// היה סקריפט inline בתוך hours.html. הוצא לקובץ כדי שאפשר יהיה לאכוף
// Content-Security-Policy בלי 'unsafe-inline' על סקריפטים.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
const db = getFirestore(initializeApp(firebaseConfig));

// הודעה במקום הטבלה. textContent ולא innerHTML — אין סיבה לבנות HTML כאן.
function message(text){
  const dl = document.getElementById("hours");
  dl.replaceChildren();
  const dt = document.createElement("dt"); dt.textContent = text;
  dl.append(dt, document.createElement("dd"));
}

onSnapshot(doc(db, "public", "hours"), snap => {
  const dl = document.getElementById("hours");
  if (!snap.exists()){ message("השעות יפורסמו בקרוב"); return; }
  dl.replaceChildren();
  const d = snap.data();
  if (d.range) document.getElementById("sub").textContent = `שעות הפעילות · ${d.range}`;
  // days הוא שורה אחת ליום, לפי הסדר ראשון→שבת, ומחרוזת ריקה = סגור.
  // מערך מתקבל גם הוא, כדי שגרסה ישנה של המסמך לא תרוקן את הדף.
  const days = Array.isArray(d.days) ? d.days : [];
  for (let i = 0; i < 7; i++){
    const v = days[i];
    const r = (Array.isArray(v) ? v.join(", ") : String(v || "")).trim();
    const dt = document.createElement("dt"); dt.textContent = DAYS[i];
    const dd = document.createElement("dd"); dd.textContent = r || "סגור";
    if (!r) dd.className = "closed";
    dl.append(dt, dd);
  }
}, () => message("לא הצלחנו לטעון"));
