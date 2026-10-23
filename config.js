// ההגדרות של פרויקט Firebase "cortado-ops". דף העגלה (cafe/cafe.js) קורא מכאן את projectId
// כדי למשוך את public/hours. הערכים גלויים בדפדפן בכל מקרה, וזה תקין ומתוכנן:
// האבטחה נאכפת בכללים שב-firestore.rules, לא כאן.
export const firebaseConfig = {
  apiKey: "AIzaSyD75yNOaZM6prmFAm2iyeLNcgzuQl-gh4Y",
  authDomain: "cortado-ops.firebaseapp.com",
  projectId: "cortado-ops",
  storageBucket: "cortado-ops.firebasestorage.app",
  messagingSenderId: "365004162115",
  appId: "1:365004162115:web:b1d76cdc98c969f8f800f6"
};

/* המייסדים. רשימה קבועה בקוד, בכוונה: זו רצפת הגישה לנתונים, גם אם רשימת המנהלים תישבר.
   הרשימה הזו חייבת להישאר זהה בארבעה מקומות (tests/admins.mjs נופל אם אחד סוטה):
     1. כאן
     2. firestore.rules · isFounder   — מה שבאמת נאכף על הנתונים
     3. storage.rules · isOwner       — נשמר לתיעוד גם אם Storage כבוי
     4. worker/src/index.js · DEFAULT_OWNERS — או OWNER_EMAILS בלוח של Cloudflare
   להחלפת מייסד/ת: לעדכן את כל ארבעתם באותו commit. */
export const FOUNDER_EMAILS = ["cortado.snir@gmail.com", "limormelman@gmail.com"];
