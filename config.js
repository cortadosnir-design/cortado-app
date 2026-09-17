// ההגדרות של פרויקט Firebase "cortado-ops".
// הערכים האלה גלויים בדפדפן בכל מקרה, וזה תקין ומתוכנן.
// האבטחה נאכפת בכללים שב-firestore.rules, לא כאן.
export const firebaseConfig = {
  apiKey: "AIzaSyD75yNOaZM6prmFAm2iyeLNcgzuQl-gh4Y",
  authDomain: "cortado-ops.firebaseapp.com",
  projectId: "cortado-ops",
  storageBucket: "cortado-ops.firebasestorage.app",
  messagingSenderId: "365004162115",
  appId: "1:365004162115:web:b1d76cdc98c969f8f800f6"
};

// מי יכול לנהל משמרות: לפתוח שבוע, להוסיף, למחוק ולהסיר עובדים.
// שינוי כאן חייב להיעשות גם ב-firestore.rules, בפונקציה isOwner.
export const OWNER_EMAILS = ["cortado.snir@gmail.com"];
