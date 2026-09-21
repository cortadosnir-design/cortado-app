// דמה של firebase-app/firebase-firestore עבור דף השעות הציבורי בלבד.
// hours.js מייבא ישירות מ-gstatic; ה-importmap בבדיקה מכוון את שתי
// הכתובות לכאן, כדי שהדף ייטען בלי רשת ועם מסמך שהבדיקה קובעת.
export const initializeApp = () => ({});
export const getFirestore = () => ({});
export const doc = (_db, col, id) => ({ col, id });
export function onSnapshot(_ref, cb){
  const d = window.__hoursDoc;
  setTimeout(() => cb({ exists: () => !!d, data: () => d || {} }), 0);
  return () => {};
}
