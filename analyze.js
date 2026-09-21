// סוכן ניתוח נתונים: מעלים טבלה (CSV מהקופה, ייצוא מאקסל) או לוקחים את
// יומן המשמרות מהאפליקציה, ושואלים בעברית. הניתוח נעשה בשרת (Gemini),
// הדפדפן רק קורא את הקובץ ושולח כותרות, פרופיל ודגימת שורות.
import { S, $, el, clear, status, withBusy, api } from "./core.js";
import { parseDelimited, payload } from "./table.js";

let table = null;          // { columns, rows }
let name = "";
const history = [];        // [{q, a}] — הקשר לשאלות המשך

const QUICK = [
  "מה היום הכי חזק ומה הכי חלש?",
  "באיזו שעה מגיעים הכי הרבה לקוחות?",
  "איך מזג האוויר משפיע על כמות הלקוחות?",
  "מה ביקשו ולא היה לנו הכי הרבה פעמים?",
];

// יומן המשמרות מהאפליקציה כטבלה, בלי להעלות כלום.
function fromLogs(){
  const cols = ["תאריך", "לקוחות", "שעת עומס", "מזג אוויר", "מבצע/אירוע", "ביקשו ולא היה", "הערות"];
  const rows = (S.logs || []).map(l => [l.date, l.customers, l.peak, l.weather, l.promo, l.missing, l.notes].map(v => (v == null ? "" : String(v))));
  return { columns: cols, rows };
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
  file.addEventListener("change", () => {
    const f = file.files && file.files[0];
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)){
      status("anaStatus", "warn", "קובץ אקסל: שמור אותו כ-CSV (קובץ ← שמירה בשם ← CSV UTF-8) והעלה שוב.");
      file.value = ""; return;
    }
    status("anaStatus", "", "");
    const reader = new FileReader();
    reader.onload = () => { try { setTable(parseDelimited(reader.result), f.name); } catch { status("anaStatus", "bad", "לא הצלחתי לקרוא את הקובץ."); } };
    reader.onerror = () => status("anaStatus", "bad", "לא הצלחתי לקרוא את הקובץ.");
    reader.readAsText(f, "utf-8");
    file.value = "";
  });
  $("anaLogs").addEventListener("click", () => {
    status("anaStatus", "", "");
    const t = fromLogs();
    if (!t.rows.length){ status("anaStatus", "warn", "אין עדיין דיווחי משמרת. מלא כמה דיווחים בצד, ואז נתח."); return; }
    setTable(t, "יומן המשמרות");
  });
  $("anaGo").addEventListener("click", ask);
  $("anaQ").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); ask(); } });
  const quick = $("anaQuick");
  QUICK.forEach(q => quick.append(el("button", { class: "chip", type: "button", text: q, onclick: () => { $("anaQ").value = q; ask(); } })));
}
