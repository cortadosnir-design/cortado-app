// ההגדרות של פרויקט Firebase "cortado-ops".
// הערכים האלה גלויים בדפדפן בכל מקרה, וזה תקין ומתוכנן.
// האבטחה נאכפת בכללים שב-firestore.rules, לא כאן.
// גרסת הבנייה. מוצגת בכותרת, וזהה ל-VERSION ב-sw.js (יש בדיקה שמוודאת).
// **מעלים אותה בכל דחיפה שמשנה קבצים** — אחרת ה-Service Worker לא מתחלף
// והדפדפן ממשיך להגיש את הגרסה הישנה.
export const APP_VERSION = "2026-09-21.10";

export const firebaseConfig = {
  apiKey: "AIzaSyD75yNOaZM6prmFAm2iyeLNcgzuQl-gh4Y",
  authDomain: "cortado-ops.firebaseapp.com",
  projectId: "cortado-ops",
  storageBucket: "cortado-ops.firebasestorage.app",
  messagingSenderId: "365004162115",
  appId: "1:365004162115:web:b1d76cdc98c969f8f800f6"
};

// מי יכול לנהל: לפתוח שבוע, לשבץ, לכתוב פוסטים ולהסיר עובדים.
// הרשימה הזו חייבת להיות זהה בארבעה מקומות:
//   1. כאן                        — מה שהדפדפן מציג
//   2. firestore.rules · isOwner   — מה שבאמת נאכף על הנתונים
//   3. storage.rules · isOwner     — העלאת תמונות
//   4. worker/src/index.js         — או משתנה OWNER_EMAILS בלוח של Cloudflare
// להוספת מנהלת: הוסף את המייל שלה כמחרוזת נוספת בכל ארבעתם.
export const OWNER_EMAILS = ["cortado.snir@gmail.com", "limormelman@gmail.com"];

// כתובת השרת (Cloudflare Worker). ריק = הכפתורים החכמים מוסתרים.
export const WORKER_URL = "https://cortado-api.cortado-snir.workers.dev";

// מיקום העגלה, לתחזית מזג האוויר. קואורדינטות מקורבות של קיבוץ שניר.
// אם התחזית נראית לא מדויקת: פותחים את Google Maps על העגלה, לוחצים ימני
// על הנקודה, ומעתיקים את שני המספרים לכאן.
export const PLACE = { lat: 33.24, lon: 35.63, name: "קיבוץ שניר" };
