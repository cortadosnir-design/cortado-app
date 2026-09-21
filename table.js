// טבלאות: קריאת CSV/TSV שהמשתמש מעלה, וסיכום שנשלח לסוכן הניתוח.
// קובץ טהור, בלי DOM ובלי Firebase — נבדק ב-tests/table.mjs.

// מפרק CSV או TSV לפי RFC 4180: מרכאות, פסיק בתוך מרכאות, שורות בתוך מרכאות.
// המפריד מזוהה לבד מהשורה הראשונה (פסיק, טאב או נקודה-פסיק).
export function parseDelimited(text){
  let s = String(text || "").replace(/^﻿/, "");
  if (!s.trim()) return { columns: [], rows: [] };
  const firstLine = s.split(/\r?\n/, 1)[0];
  const delim = [",", "\t", ";"].map(d => [d, (firstLine.match(new RegExp(d === "\t" ? "\t" : "\\" + d, "g")) || []).length])
    .sort((a, b) => b[1] - a[1])[0][0];

  const records = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < s.length; i++){
    const c = s[i];
    if (quoted){
      if (c === '"'){ if (s[i + 1] === '"'){ cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim){ row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r"){
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(v => v.trim() !== "")) records.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim() !== "")) records.push(row);
  if (!records.length) return { columns: [], rows: [] };

  const columns = records[0].map((h, i) => (h.trim() || `עמודה ${i + 1}`));
  const rows = records.slice(1).map(r => columns.map((_, i) => (r[i] ?? "").trim()));
  return { columns, rows };
}

// מספר? כולל "1,234" ו-"₪45". מחזיר null אם לא.
export function asNumber(v){
  const s = String(v ?? "").replace(/[,\s₪$%]/g, "");
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}

// פרופיל של כל עמודה: סוג, כמה ריקים, טווח או ערכים נפוצים.
// זה מה שנותן למודל תמונה של הקובץ כולו גם כשנשלחות רק חלק מהשורות.
export function profile(table){
  const { columns, rows } = table;
  return columns.map((name, i) => {
    const vals = rows.map(r => r[i]).filter(v => v !== "" && v != null);
    const nums = vals.map(asNumber).filter(n => n !== null);
    const p = { name, empty: rows.length - vals.length };
    if (vals.length && nums.length >= vals.length * 0.9){
      p.type = "number";
      p.min = Math.min(...nums); p.max = Math.max(...nums);
      p.sum = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
      p.avg = Math.round((p.sum / nums.length) * 100) / 100;
    } else {
      const uniq = new Set(vals);
      p.type = uniq.size === vals.length && /^\d{4}-\d{2}-\d{2}/.test(vals[0] || "") ? "date" : "text";
      p.distinct = uniq.size;
      const counts = {};
      vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
      p.top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v, n]) => `${v} (${n})`);
    }
    return p;
  });
}

// מה נשלח לשרת: הכותרות, הפרופיל, ועד MAX_CHARS של שורות גולמיות.
// מודל לא צריך 10,000 שורות כדי לענות "איזה יום הכי חזק" — הפרופיל מכסה את השאר.
export const MAX_CHARS = 40000;
export function payload(table){
  const rows = [];
  let size = 0;
  for (const r of table.rows){
    const line = JSON.stringify(r);
    if (size + line.length > MAX_CHARS) break;
    rows.push(r); size += line.length + 1;
  }
  return { columns: table.columns, rows, rowCount: table.rows.length, sampled: rows.length < table.rows.length, profile: profile(table) };
}
