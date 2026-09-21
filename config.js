// ההגדרות של פרויקט Firebase "cortado-ops".
// הערכים האלה גלויים בדפדפן בכל מקרה, וזה תקין ומתוכנן.
// האבטחה נאכפת בכללים שב-firestore.rules, לא כאן.
// גרסת הבנייה. מוצגת בכותרת, וזהה ל-VERSION ב-sw.js (יש בדיקה שמוודאת).
// **מעלים אותה בכל דחיפה שמשנה קבצים** — אחרת ה-Service Worker לא מתחלף
// והדפדפן ממשיך להגיש את הגרסה הישנה.
export const APP_VERSION = "2026-09-21.28";

export const firebaseConfig = {
  apiKey: "AIzaSyD75yNOaZM6prmFAm2iyeLNcgzuQl-gh4Y",
  authDomain: "cortado-ops.firebaseapp.com",
  projectId: "cortado-ops",
  storageBucket: "cortado-ops.firebasestorage.app",
  messagingSenderId: "365004162115",
  appId: "1:365004162115:web:b1d76cdc98c969f8f800f6"
};

/* המייסדים. רשימה קבועה בקוד, בכוונה — זו רצפת הגישה שאי אפשר להסיר
   דרך הממשק, וגם אם רשימת המנהלים תישבר היא מה שמחזיר אותך פנימה.
   רק המייסדים ממנים ומסירים מנהלים.

   מנהלים רגילים כבר לא נכתבים כאן: מוסיפים אותם מהמסך (צוות ← גישה
   מלאה דרך גוגל ← "הפוך למנהל"), והם נשמרים כדגל admin במסמך members.

   הרשימה הזו חייבת להישאר זהה בארבעה מקומות:
     1. כאן                          — מה שהדפדפן מציג
     2. firestore.rules · isFounder   — מה שבאמת נאכף על הנתונים
     3. storage.rules · isOwner       — נשמר לתיעוד גם אם Storage כבוי
     4. worker/src/index.js · DEFAULT_OWNERS — או OWNER_EMAILS בלוח של Cloudflare
   להחלפת מייסד/ת: לעדכן את כל ארבעתם באותו commit. */
export const FOUNDER_EMAILS = ["cortado.snir@gmail.com", "limormelman@gmail.com"];

// שם ישן, נשמר כדי שקוד קיים לא יישבר.
export const OWNER_EMAILS = FOUNDER_EMAILS;

// כתובת השרת (Cloudflare Worker). ריק = הכפתורים החכמים מוסתרים.
export const WORKER_URL = "https://cortado-api.cortado-snir.workers.dev";

// מיקום העגלה, לתחזית מזג האוויר. קואורדינטות מקורבות של קיבוץ שניר.
// אם התחזית נראית לא מדויקת: פותחים את Google Maps על העגלה, לוחצים ימני
// על הנקודה, ומעתיקים את שני המספרים לכאן.
export const PLACE = { lat: 33.24, lon: 35.63, name: "קיבוץ שניר" };
