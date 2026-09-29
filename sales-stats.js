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
