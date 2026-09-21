// הפילוח: כל החישובים על דוחות ה-Z, במקום אחד ובלי DOM.
// כל מה שמוצג בלשונית "מכירות" מגיע מכאן, וכל מה שכאן נבדק ב-tests/sales.mjs.

export const VAT_RATE = 0.18;               // מע"מ בישראל, 2026
export const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const sum = (list, f) => list.reduce((a, x) => a + (f(x) || 0), 0);
const share = (part, whole) => (whole ? round(part / whole * 100, 1) : null);

// מספרים שנגזרים מדוח בודד. לא נשמרים — תמיד מחושבים מחדש מהמקור,
// כדי שדוח שתוקן ידנית לא ישאיר אחריו ממוצע ישן.
export function derive(r){
  const total = num(r.total), customers = num(r.customers), items = num(r.items);
  const vat = num(r.vat);
  return {
    ...r,
    net: total == null ? null : round(vat != null ? total - vat : total / (1 + VAT_RATE)),
    avgTicket: total != null && customers ? round(total / customers) : null,
    avgItem: total != null && items ? round(total / items) : null,
    itemsPer: items != null && customers ? round(items / customers) : null,
  };
}

// פילוח לפי מחלקה, על פני כל הדוחות. שני נתחים לכל מחלקה: נתח הכסף
// ונתח היחידות. הפער ביניהם הוא כל הסיפור — מה מושך אנשים מול מה מכניס.
export function byCategory(reports){
  const map = new Map();
  for (const r of reports) for (const c of (r.categories || [])){
    const e = map.get(c.name) || { name: c.name, amount: 0, qty: 0, shifts: 0 };
    e.amount += c.amount || 0; e.qty += c.qty || 0; e.shifts++;
    map.set(c.name, e);
  }
  const list = [...map.values()];
  const money = sum(list, c => c.amount), units = sum(list, c => c.qty);
  return list.map(c => ({
    ...c,
    amount: round(c.amount), qty: round(c.qty, 1),
    avg: c.qty ? round(c.amount / c.qty) : null,
    moneyShare: share(c.amount, money),
    unitShare: share(c.qty, units),
    // מעל 1 = מכניס יותר ממה שהוא תופס ביחידות. מתחת ל-1 = מושך תנועה, לא כסף.
    pull: c.qty && units && money ? round((c.amount / money) / (c.qty / units), 2) : null,
  })).sort((a, b) => b.amount - a.amount);
}

// ממוצע לפי יום בשבוע. ראשון=0, כמו getDay.
export function byWeekday(reports){
  const out = Array.from({ length: 7 }, () => ({ total: 0, customers: 0, n: 0 }));
  for (const r of reports){
    if (!r.date || r.total == null) continue;
    const [y, m, d] = String(r.date).split("-").map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    out[wd].total += r.total; out[wd].customers += r.customers || 0; out[wd].n++;
  }
  return out.map(e => ({
    shifts: e.n,
    avgTotal: e.n ? round(e.total / e.n) : null,
    avgCustomers: e.n ? round(e.customers / e.n, 1) : null,
  }));
}

// השוואה בין החלון האחרון לחלון שלפניו, באותו אורך. בלי זה כל מספר
// הוא נקודה בודדת ואי אפשר לדעת אם המצב משתפר.
export function trend(reports, window = 7){
  const sorted = [...reports].filter(r => r.date && r.total != null).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const n = Math.min(window, Math.floor(sorted.length / 2));
  if (!n) return null;
  const recent = sorted.slice(-n), prev = sorted.slice(-2 * n, -n);
  if (!prev.length) return null;
  const avg = (l) => round(sum(l, r => r.total) / l.length);
  const a = avg(recent), b = avg(prev);
  return { recent: a, prev: b, n, diff: round(a - b), pct: b ? round((a - b) / b * 100, 1) : null };
}

export function totals(reports){
  const list = reports.map(derive);
  const withTotal = list.filter(r => r.total != null);
  const money = sum(withTotal, r => r.total);
  const customers = sum(list, r => r.customers);
  const items = sum(list, r => r.items);
  return {
    shifts: list.length,
    money: round(money),
    net: round(sum(list, r => r.net)),
    vat: round(money - sum(list, r => r.net)),
    customers, items,
    avgShift: withTotal.length ? round(money / withTotal.length) : null,
    avgTicket: customers ? round(money / customers) : null,
    avgItem: items ? round(money / items) : null,
    itemsPer: customers ? round(items / customers, 2) : null,
    discounts: round(sum(list, r => r.discounts)),
    cancels: round(sum(list, r => r.cancels)),
    returns: round(sum(list, r => r.returns)),
    cash: round(sum(list, r => r.cash)),
    card: round(sum(list, r => r.card)),
  };
}

// המסקנות שאפשר להסיק בלי לשאול מודל. כל אחת נשענת על מספר שמוצג ממש לידה,
// וכל אחת אומרת מה לעשות. סדר: מה שמשנה הכי הרבה כסף קודם.
export function findings(reports){
  const out = [];
  if (!reports.length) return out;
  const t = totals(reports), cats = byCategory(reports), wd = byWeekday(reports);

  if (cats.length >= 2){
    const money = [...cats].sort((a, b) => b.moneyShare - a.moneyShare)[0];
    const traffic = [...cats].sort((a, b) => b.unitShare - a.unitShare)[0];
    if (money.name !== traffic.name)
      out.push(`${traffic.name} מושך את התנועה (${traffic.unitShare}% מהיחידות), אבל ${money.name} מביא את הכסף (${money.moneyShare}% מההכנסה, ${money.avg} ₪ ליחידה). מי שקונה ${traffic.name} בלבד שווה הרבה פחות.`);
    const weak = cats.filter(c => c.moneyShare != null && c.moneyShare < 8).sort((a, b) => a.moneyShare - b.moneyShare)[0];
    if (weak) out.push(`${weak.name} הוא ${weak.moneyShare}% מההכנסה בלבד (${weak.qty} יחידות). או שהוא לא מוצג נכון, או שהוא תופס מקום שמוצר אחר היה עושה בו יותר.`);
  }
  if (t.itemsPer != null)
    out.push(`כל לקוח קונה ${t.itemsPer} פריטים בממוצע, ${t.avgTicket} ₪. כל עלייה של 0.2 פריטים ללקוח שווה בערך ${round(t.avgItem * 0.2 * t.customers)} ₪ על הנתונים שיש.`);

  const days = wd.map((e, i) => ({ ...e, i })).filter(e => e.shifts);
  if (days.length >= 2){
    const DAYS = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
    const best = days.reduce((a, b) => (b.avgTotal > a.avgTotal ? b : a));
    const worst = days.reduce((a, b) => (b.avgTotal < a.avgTotal ? b : a));
    if (best.i !== worst.i)
      out.push(`${DAYS[best.i]} מכניס ${best.avgTotal} ₪ בממוצע, ${DAYS[worst.i]} רק ${worst.avgTotal} ₪. הפער הוא ${round(best.avgTotal - worst.avgTotal)} ₪ למשמרת.`);
  }
  const tr = trend(reports);
  if (tr && tr.pct != null)
    out.push(tr.pct >= 0
      ? `${tr.n} המשמרות האחרונות מכניסות ${tr.pct}% יותר מ-${tr.n} שלפניהן (${tr.recent} ₪ מול ${tr.prev} ₪).`
      : `${tr.n} המשמרות האחרונות מכניסות ${Math.abs(tr.pct)}% פחות מ-${tr.n} שלפניהן (${tr.recent} ₪ מול ${tr.prev} ₪).`);
  if (t.money && t.discounts / t.money > 0.05)
    out.push(`ההנחות הן ${share(t.discounts, t.money)}% מהמכירות (${t.discounts} ₪). שווה לבדוק מי מזכה ולמה.`);
  if (t.money && !t.cash) out.push("כל התקבולים באשראי, אין מזומן בקופה. מי שמגיע עם מזומן בלבד לא יכול לקנות.");
  return out;
}

// הטבלה שנשלחת ל"שאל את הנתונים", כדי שאפשר יהיה לשאול על ההיסטוריה בשפה חופשית.
export function asTable(reports){
  const base = ["תאריך","סה\"כ מכירות","מע\"מ","נטו","לקוחות","פריטים","ממוצע ללקוח","פריטים ללקוח","אשראי","מזומן","הנחות"];
  const catNames = [...new Set(reports.flatMap(r => (r.categories || []).map(c => c.name)))];
  const columns = [...base, ...catNames.map(n => `${n} (₪)`), ...catNames.map(n => `${n} (כמות)`)];
  const rows = reports.map(derive).map(r => {
    const find = (n) => (r.categories || []).find(c => c.name === n);
    const v = (x) => (x == null ? "" : String(x));
    return [v(r.date), v(r.total), v(r.vat), v(r.net), v(r.customers), v(r.items), v(r.avgTicket),
      v(r.itemsPer), v(r.card), v(r.cash), v(r.discounts),
      ...catNames.map(n => v(find(n) && find(n).amount)),
      ...catNames.map(n => v(find(n) && find(n).qty))];
  });
  return { columns, rows };
}
