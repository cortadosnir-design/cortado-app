// הפילוח של דוחות ה-Z, על הקוד האמיתי. המספרים לקוחים מדוח אמיתי של העגלה.
import { derive, totals, byCategory, byWeekday, trend, findings, asTable, round } from "../sales-stats.js";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n + "  " + x));
console.log("\n21. פילוח מכירות");

const Z = { date: "2026-09-20", time: "12:13", reportNo: 259, total: 1206, vat: 183.97,
  customers: 23, items: 64, card: 1206, cash: 0, discounts: 0, cancels: 0, returns: 0,
  categories: [{ name: "קפה", amount: 336, qty: 26 }, { name: "מאפים מתוקים", amount: 80, qty: 4 },
    { name: "עטופים", amount: 77, qty: 7 }, { name: "שתיה קלה", amount: 270, qty: 14 },
    { name: "כריכים", amount: 402, qty: 11 }, { name: "ללא קטגוריה", amount: 41, qty: 2 }] };

const d = derive(Z);
ok("נטו = סך הכול פחות מע\"מ", d.net === 1022.03, String(d.net));
ok("ממוצע ללקוח כמו בדוח עצמו", d.avgTicket === 52.43, String(d.avgTicket));
ok("פריטים ללקוח", d.itemsPer === 2.78, String(d.itemsPer));
ok("ממוצע לפריט", d.avgItem === 18.84, String(d.avgItem));
// הדוח המודפס עצמו מציג 0 בשני השדות האלה. החישוב כאן הוא מה שהם אמורים להיות.
ok("נטו מחושב גם בלי שדה מע\"מ", derive({ total: 1206 }).net === round(1206 / 1.18), String(derive({ total: 1206 }).net));
ok("חלוקה באפס לא מייצרת NaN", derive({ total: 100, customers: 0, items: 0 }).avgTicket === null);

const c = byCategory([Z]);
ok("ממוין לפי כסף, כריכים ראשון", c[0].name === "כריכים" && c[0].amount === 402, c[0].name);
ok("נתח הכסף של כריכים", c[0].moneyShare === 33.3, String(c[0].moneyShare));
ok("נתח היחידות של קפה", c.find(x => x.name === "קפה").unitShare === 40.6);
ok("מדד: כריכים מעל 1, קפה מתחת", c[0].pull > 1.5 && c.find(x => x.name === "קפה").pull < 1);
ok("ממוצע ליחידה", c.find(x => x.name === "כריכים").avg === 36.55);
ok("סכום המחלקות = סך הכול", c.reduce((a, x) => a + x.amount, 0) === 1206);

const t = totals([Z]);
ok("סיכום של דוח אחד", t.shifts === 1 && t.money === 1206 && t.customers === 23 && t.items === 64);
ok("מע\"מ מצטבר", t.vat === 183.97, String(t.vat));

// שבוע שלם, כדי לבדוק ימים ומגמה
const week = [];
for (let i = 0; i < 14; i++){
  const day = new Date(2026, 8, 7 + i);
  const iso = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
  week.push({ date: iso, reportNo: 100 + i, total: 800 + i * 50, customers: 20 + i, items: 50 + i,
    vat: null, cash: 0, card: 800 + i * 50, discounts: 0, categories: [{ name: "קפה", amount: 300, qty: 25 }] });
}
const wd = byWeekday(week);
ok("כל יום בשבוע קיבל שתי משמרות", wd.every(e => e.shifts === 2), JSON.stringify(wd.map(e => e.shifts)));
const tr = trend(week);
ok("מגמה: שבוע אחרון מול הקודם", tr && tr.n === 7 && tr.pct > 0, JSON.stringify(tr));
ok("מגמה דורשת שני חלונות", trend([Z]) === null);

const f = findings([Z]);
ok("תובנה על תנועה מול כסף", f.some(x => /קפה/.test(x) && /כריכים/.test(x)), f[0]);
ok("תובנה על היעדר מזומן", f.some(x => /מזומן/.test(x)));
ok("בלי דוחות אין תובנות", findings([]).length === 0);

const tbl = asTable([Z]);
ok("טבלה לשאלות חופשיות: עמודה לכל מחלקה", tbl.columns.length === 11 + 6 * 2, String(tbl.columns.length));
ok("שורה אחת לכל דוח", tbl.rows.length === 1 && tbl.rows[0][0] === "2026-09-20");
ok("סכום מחלקה נכנס לעמודה שלו", tbl.rows[0][tbl.columns.indexOf("כריכים (₪)")] === "402");

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
