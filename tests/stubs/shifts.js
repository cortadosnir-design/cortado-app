export const openDays = () => [0, 2, 4, 5];
export const phase = () => "locked";
export const wid = () => "wtest";
export const hoursByDay = () => [["08:00–13:00"],[],["08:00–13:00"],[],["16:00–20:00"],["07:30–12:00"],[]];
export const hoursPairs = () => [[["08:00","13:00"]],[],[["08:00","13:00"]],[],[["16:00","20:00"]],[["07:30","12:00"]],[]];
export const hoursText = () => "א׳ 08:00–13:00";
// מסמך השעות הציבורי, באותו פורמט שהמודול האמיתי מייצר: שורה ליום.
export const hoursDoc = () => ({ week: "wtest", from: "2026-01-04", to: "2026-01-10",
  range: "4.1 – 10.1", days: hoursByDay().map(x => x.join(", ")), text: hoursText(), at: null });
// hoursync.js (דרך launch.js) מבקש את הגרסאות הטהורות, שמקבלות נתוני שבוע.
export const rangesOf = (data, day) => (hoursPairs()[day] || []);
export const overrideOf = () => null;
export const hoursByDayOf = () => hoursByDay();
export const hoursPairsOf = () => hoursPairs();
export const hoursTextOf = () => hoursText();
export const hoursDocOf = () => hoursDoc();
export const WEEK_HOURS = [[],[],[],[],[],[],[]];
