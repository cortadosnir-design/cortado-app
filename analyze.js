// סוכן ניתוח נתונים: מעלים טבלה (CSV מהקופה, ייצוא מאקסל) או לוקחים את
// יומן המשמרות מהאפליקציה, ושואלים בעברית. הניתוח נעשה בשרת (Gemini),
// הדפדפן רק קורא את הקובץ ושולח כותרות, פרופיל ודגימת שורות.
import { S, $, el, clear, status, withBusy, api } from "./core.js";
import { parseDelimited, payload, roles } from "./table.js";
import { table as salesTable } from "./sales.js";

let table = null;          // { columns, rows }
let name = "";
const history = [];        // [{q, a}] — הקשר לשאלות המשך

// השאלות המוכנות נבנות לפי מה שבאמת יש בקובץ. ייצוא של קופה עם שורת כסף
// ושורת מוצר שואל שאלות אחרות מיומן משמרות עם ספירת לקוחות.
const QUICK_BY_ROLE = [
  [["money"],          "כמה הכנסנו בסך הכול, ומה המגמה לאורך הזמן?"],
  [["money", "item"],  "אילו מוצרים מביאים הכי הרבה כסף, ואילו כמעט לא זזים?"],
  [["money", "order"], "מה הממוצע להזמנה, ואילו הזמנות חורגות ממנו?"],
  [["money", "time"],  "באילו שעות נכנס הכי הרבה כסף?"],
  [["money", "date"],  "מה היום הכי חזק כספית ומה הכי חלש?"],
  [["item", "qty"],    "מה נמכר הכי הרבה ביחידות, ומה זה אומר על המלאי?"],
  [["payment"],        "איך מתחלק התשלום בין מזומן לאשראי?"],
  [["people", "date"], "מה היום הכי חזק ומה הכי חלש?"],
  [["time"],           "באיזו שעה מגיעים הכי הרבה לקוחות?"],
];
const QUICK_FALLBACK = [
  "מה הדבר הכי חשוב שאפשר ללמוד מהנתונים האלה?",
  "מה חריג כאן, ומה שגרתי?",
  "איזו החלטה מעשית אחת הנתונים תומכים בה?",
];

function quickFor(t){
  const r = roles(t);
  const out = [];
  for (const [need, q] of QUICK_BY_ROLE){
    if (need.every(k => r[k] && r[k].length) && !out.includes(q)) out.push(q);
    if (out.length === 4) break;
  }
  while (out.length < 3) out.push(QUICK_FALLBACK[out.length]);
  return out.slice(0, 4);
}

// יומן המשמרות מהאפליקציה כטבלה, בלי להעלות כלום.
function fromLogs(){
  const cols = ["תאריך", "לקוחות", "שעת עומס", "מזג אוויר", "מבצע/אירוע", "ביקשו ולא היה", "הערות"];
  const rows = (S.logs || []).map(l => [l.date, l.customers, l.peak, l.weather, l.promo, l.missing, l.notes].map(v => (v == null ? "" : String(v))));
  return { columns: cols, rows };
}

// אקסל ישן (xls) הוא פורמט בינארי אחר לגמרי, ואותו באמת צריך להמיר.
// xlsx נקרא כאן ישירות, ולכן הטעינה של xlsx.js היא לפי דרישה בלבד.
async function readFile(f){
  if (/\.xls$/i.test(f.name)) throw new Error("זה קובץ אקסל ישן (xls). פתח אותו באקסל ושמור כ-xlsx או כ-CSV.");
  if (/\.xlsx$/i.test(f.name) || /sheet/.test(f.type || "")){
    if (typeof DecompressionStream === "undefined") throw new Error("הדפדפן הזה לא יודע לפתוח xlsx. שמור כ-CSV, או פתח את האפליקציה בכרום.");
    const { parseXlsx } = await import("./xlsx.js");
    try { return await parseXlsx(await f.arrayBuffer()); }
    catch { throw new Error("לא הצלחתי לקרוא את קובץ האקסל. אם הוא מוגן בסיסמה, הסר אותה ונסה שוב."); }
  }
  const text = await f.text();
  return parseDelimited(text);
}

function setTable(t, label){
  table = t; name = label; history.length = 0;
  clear($("anaAnswers"));
  const info = $("anaInfo");
  if (!t || !t.rows.length){
    info.textContent = "לא מצאתי שורות בקובץ. צריך שורת כותרות ולפחות שורה אחת של נתונים.";
    $("anaAsk").hidden = true; return;
  }
  info.textContent = `${label} · ${t.rows.length} שורות · ${t.columns.length} עמודות: ${t.columns.slice(0, 6).join(", ")}${t.columns.length > 6 ? "…" : ""}`;
  renderQuick();
  $("anaAsk").hidden = false;
  $("anaQ").focus();
}

function renderAnswer(q, r){
  const box = $("anaAnswers");
  const card = el("div", { class: "ana-item" },
    el("p", { class: "ana-q", text: q }),
    el("p", { class: "ana-a", text: r.answer || "" }));
  if (r.table && r.table.columns.length && r.table.rows.length){
    const tbl = el("table", { class: "ana-table" },
      el("thead", {}, el("tr", {}, ...r.table.columns.map(c => el("th", { text: c })))),
      el("tbody", {}, ...r.table.rows.map(row => el("tr", {}, ...row.map(c => el("td", { text: c }))))));
    card.append(el("div", { class: "ana-scroll" }, tbl));
  }
  if (r.followups && r.followups.length){
    card.append(el("div", { class: "chips" }, ...r.followups.map(f =>
      el("button", { class: "chip", type: "button", text: f, onclick: () => { $("anaQ").value = f; ask(); } }))));
  }
  box.prepend(card);
}

function renderQuick(){
  const box = clear($("anaQuick"));
  const list = table ? quickFor(table) : QUICK_FALLBACK;
  list.forEach(q => box.append(el("button", { class: "chip", type: "button", text: q,
    onclick: () => { $("anaQ").value = q; ask(); } })));
}

async function ask(){
  const q = $("anaQ").value.trim();
  if (!table || !q) return;
  await withBusy($("anaGo"), async () => {
    try {
      status("anaStatus", "", "מנתח…");
      const r = await api("/ai/analyze", { ...payload(table), name, question: q, history: history.slice(-4) });
      history.push({ q, a: r.answer });
      renderAnswer(q, r);
      $("anaQ").value = "";
      status("anaStatus", "ok", "");
    } catch (err){ status("anaStatus", "bad", err.message); }
  });
}

export function init(){
  const file = $("anaFile");
  if (!file) return;
  file.addEventListener("change", async () => {
    const f = file.files && file.files[0];
    file.value = "";
    if (!f) return;
    status("anaStatus", "", "קורא את הקובץ…");
    try {
      setTable(await readFile(f), f.name);
      status("anaStatus", "", "");
    } catch (err){
      status("anaStatus", "bad", err.message || "לא הצלחתי לקרוא את הקובץ.");
    }
  });
  $("anaSales").addEventListener("click", () => {
    status("anaStatus", "", "");
    const t = salesTable();
    if (!t.rows.length){ status("anaStatus", "warn", "עוד לא נשמרו דוחות Z. צלם דוח בלשונית מכירות, ואז אפשר לשאול עליו."); return; }
    setTable(t, "דוחות המכירות");
  });
  $("anaLogs").addEventListener("click", () => {
    status("anaStatus", "", "");
    const t = fromLogs();
    if (!t.rows.length){ status("anaStatus", "warn", "אין עדיין דיווחי משמרת. מלא כמה דיווחים בצד, ואז נתח."); return; }
    setTable(t, "יומן המשמרות");
  });
  $("anaGo").addEventListener("click", ask);
  $("anaQ").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); ask(); } });
  renderQuick();
}
