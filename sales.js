// מכירות: דוח ה-Z של סגירת הקופה נכנס בצילום, נשמר, ומצטבר לפילוח.
// הקריאה מהצילום נעשית בשרת (Gemini). מה שחוזר מוצג לאישור לפני שמירה,
// כי OCR על נייר תרמי הוא הערכה, והמספרים האלה הולכים לרואה החשבון.
import { S, db, $, el, clear, status, withBusy, api, track, DAYS, fromYmd, dm, ymd,
  doc, setDoc, deleteDoc, collection, onSnapshot, serverTimestamp } from "./core.js";
import { derive, totals, byCategory, byWeekday, trend, findings, asTable, round } from "./sales-stats.js";

const MAX_PX = 1600, QUALITY = 0.86;   // דוח Z הוא טקסט צפוף: מקטינים, אבל לא עד כדי טשטוש
let draft = null;                       // מה שחזר מהצילום, לפני אישור

/* ===== נתונים ===== */
export function subscribe(){
  track(onSnapshot(collection(db, "sales"),
    (snap) => {
      S.sales = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
      render();
    }, () => {}));
}

const idOf = (r) => `${r.date || "unknown"}-${r.reportNo ?? "x"}`;

/* ===== צילום ===== */
function shrink(file){
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("לא הצלחתי לפתוח את התמונה.")); };
    img.src = url;
  });
}

/* ===== טופס האישור =====
   כל שדה פתוח לעריכה. מה שהמודל לא הצליח לקרוא מגיע ריק ומסומן. */
const FIELDS = [
  ["date", "תאריך", "date"], ["time", "שעה", "time"], ["reportNo", "מספר דוח", "number"],
  ["total", 'סה"כ מכירות ₪', "number"], ["vat", 'מע"מ ₪', "number"],
  ["customers", "לקוחות", "number"], ["items", "פריטים", "number"],
  ["card", "אשראי ₪", "number"], ["cash", "מזומן ₪", "number"],
  ["discounts", "הנחות ₪", "number"], ["cancels", "ביטולים ₪", "number"], ["returns", "החזרים ₪", "number"],
];

function renderDraft(){
  const box = clear($("zDraft"));
  if (!draft){ box.hidden = true; return; }
  box.hidden = false;
  if (draft.warn) box.append(el("p", { class: "status warn", text: draft.warn }));
  if (draft.note) box.append(el("p", { class: "small", text: "הערה מהקריאה: " + draft.note }));

  const grid = el("div", { class: "zgrid" });
  FIELDS.forEach(([k, label, type]) => {
    const input = el("input", { type, id: "z_" + k, value: draft[k] ?? "", step: type === "number" ? "0.01" : null,
      oninput: (e) => { draft[k] = type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value; renderTotals(); } });
    if (draft[k] == null || draft[k] === "") input.classList.add("missing");
    grid.append(el("label", { text: label }, input));
  });
  box.append(grid);

  box.append(el("h3", { class: "sub", text: "מכירות למחלקה" }));
  const cats = el("div", { class: "zcats" });
  (draft.categories || []).forEach((c, i) => {
    cats.append(el("div", { class: "zcat" },
      el("input", { type: "text", value: c.name, "aria-label": "שם מחלקה",
        oninput: (e) => { draft.categories[i].name = e.target.value; } }),
      el("input", { type: "number", step: "0.01", value: c.amount ?? "", "aria-label": "סכום",
        oninput: (e) => { draft.categories[i].amount = e.target.value === "" ? null : Number(e.target.value); renderTotals(); } }),
      el("input", { type: "number", step: "0.1", value: c.qty ?? "", "aria-label": "כמות",
        oninput: (e) => { draft.categories[i].qty = e.target.value === "" ? null : Number(e.target.value); renderTotals(); } }),
      el("button", { class: "icon", type: "button", text: "✕", title: "הסר",
        onclick: () => { draft.categories.splice(i, 1); renderDraft(); } })));
  });
  box.append(cats);
  box.append(el("div", { class: "actions" },
    el("button", { type: "button", text: "+ מחלקה", onclick: () => { (draft.categories ||= []).push({ name: "", amount: null, qty: null }); renderDraft(); } }),
    el("button", { class: "primary", id: "zSave", type: "button", text: "שמור דוח", onclick: save }),
    el("button", { type: "button", text: "בטל", onclick: () => { draft = null; renderDraft(); status("zStatus", "", ""); } })));
  box.append(el("p", { class: "small", id: "zCheck" }));
  renderTotals();
}

// בדיקת שפיות חיה, בזמן שמתקנים: האם המחלקות מסתכמות לסך הכול.
function renderTotals(){
  const n = $("zCheck"); if (!n || !draft) return;
  const sum = (draft.categories || []).reduce((a, c) => a + (c.amount || 0), 0);
  const qty = (draft.categories || []).reduce((a, c) => a + (c.qty || 0), 0);
  if (!draft.total || !sum){ n.textContent = ""; n.className = "small"; return; }
  const gap = round(sum - draft.total);
  n.textContent = Math.abs(gap) < 1
    ? `המחלקות מסתכמות ל-${round(sum)} ₪ ו-${round(qty, 1)} פריטים. תואם לסך הכול ✓`
    : `המחלקות מסתכמות ל-${round(sum)} ₪, הפרש של ${gap} ₪ מהסך הכול.`;
  n.className = Math.abs(gap) < 1 ? "small ok" : "small warn";
}

async function save(){
  if (!draft) return;
  if (!draft.date){ status("zStatus", "bad", "בלי תאריך אי אפשר לשמור."); return; }
  if (draft.total == null){ status("zStatus", "bad", 'בלי סה"כ מכירות אי אפשר לשמור.'); return; }
  await withBusy($("zSave"), async () => {
    const rec = { ...draft };
    delete rec.warn;
    rec.categories = (rec.categories || []).filter(c => c.name && c.amount != null);
    try {
      await setDoc(doc(db, "sales", idOf(rec)), { ...rec, by: (S.me && S.me.displayName) || "", at: serverTimestamp() }, { merge: true });
      draft = null; renderDraft();
      status("zStatus", "ok", "נשמר. הפילוח למטה מתעדכן לבד.");
    } catch { status("zStatus", "bad", "השמירה נכשלה. רק המנהל יכול לשמור דוחות."); }
  });
}

/* ===== הפילוח ===== */
function bars(values, labels, fmt, empty){
  const wrap = el("div", {});
  const max = Math.max(0, ...values.filter(v => v != null));
  if (!max){ wrap.append(el("p", { class: "small", text: empty })); return wrap; }
  const row = el("div", { class: "bars" }), xl = el("div", { class: "xlab" });
  values.forEach((v, i) => {
    const h = v ? Math.max(2, v / max * 100) : 0;
    const b = el("div", { class: "bar", title: `${labels[i]}: ${v == null ? "אין נתונים" : fmt(v)}` });
    const lab = el("b", { text: v == null ? "" : fmt(v) }); lab.style.bottom = `calc(${h}% + 2px)`;
    const fill = el("i"); fill.style.height = h + "%";
    b.append(lab, fill); row.append(b); xl.append(el("span", { text: labels[i] }));
  });
  wrap.append(row, xl); return wrap;
}

const shekel = (n) => (n == null ? "—" : "₪" + Math.round(n).toLocaleString("he-IL"));

export function render(){
  if (!$("salesKpis")) return;
  const reports = S.sales || [];
  $("salesEmpty").hidden = !!reports.length;
  $("salesBody").hidden = !reports.length;
  if (!reports.length) return;

  const t = totals(reports), cats = byCategory(reports), wd = byWeekday(reports), tr = trend(reports);

  const k = clear($("salesKpis"));
  [[shekel(t.money), "הכנסה"], [String(t.shifts), "משמרות"], [shekel(t.avgShift), "למשמרת"],
   [shekel(t.avgTicket), "ללקוח"], [t.itemsPer ?? "—", "פריטים ללקוח"], [shekel(t.avgItem), "לפריט"],
   [String(t.customers), "לקוחות"], [shekel(t.net), 'נטו בלי מע"מ']]
    .forEach(([v, l]) => k.append(el("div", { class: "kpi" }, el("div", { class: "v", text: String(v) }), el("div", { class: "l", text: l }))));

  // מחלקות: הטבלה שמראה את הפער בין נתח הכסף לנתח היחידות
  const tb = el("tbody");
  cats.forEach(c => tb.append(el("tr", {},
    el("td", { text: c.name }),
    el("td", { class: "num", text: shekel(c.amount) }),
    el("td", { class: "num", text: c.moneyShare == null ? "—" : c.moneyShare + "%" }),
    el("td", { class: "num", text: String(c.qty) }),
    el("td", { class: "num", text: c.unitShare == null ? "—" : c.unitShare + "%" }),
    el("td", { class: "num", text: shekel(c.avg) }),
    el("td", { class: "num" }, el("span", { class: "pill " + (c.pull >= 1.2 ? "ok" : c.pull <= 0.8 ? "warn" : ""), text: c.pull == null ? "—" : c.pull.toFixed(2) })))));
  clear($("salesCats")).append(el("div", { class: "scroll" }, el("table", { class: "t" },
    el("thead", {}, el("tr", {}, ...["מחלקה", "₪", "% מהכסף", "יחידות", "% מהיחידות", "ממוצע", "מדד"].map(h => el("th", { text: h })))), tb)));

  clear($("salesDays")).append(bars(wd.map(e => e.avgTotal), DAYS.map(d => d.slice(0, 3)), shekel, "צריך דוחות מכמה ימים."));
  const last = [...reports].filter(r => r.date && r.total != null).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  clear($("salesTrend")).append(bars(last.map(r => r.total), last.map(r => dm(fromYmd(r.date))), shekel, "צריך עוד דוח אחד לפחות."));

  const tn = clear($("salesTrendNote"));
  if (tr && tr.pct != null)
    tn.append(el("p", { class: tr.pct >= 0 ? "status ok" : "status warn",
      text: `${tr.n} המשמרות האחרונות: ${shekel(tr.recent)} בממוצע, מול ${shekel(tr.prev)} ב-${tr.n} שלפניהן. ${tr.pct >= 0 ? "+" : ""}${tr.pct}%` }));

  const f = clear($("salesFindings"));
  findings(reports).forEach(x => f.append(el("p", { text: x })));

  const rt = el("tbody");
  reports.slice(0, 20).forEach(r => { const d = derive(r);
    rt.append(el("tr", {},
      el("td", { class: "num", text: r.date ? dm(fromYmd(r.date)) : "—" }),
      el("td", { class: "num", text: shekel(r.total) }),
      el("td", { class: "num", text: r.customers ?? "—" }),
      el("td", { class: "num", text: shekel(d.avgTicket) }),
      el("td", { class: "num", text: r.items ?? "—" }),
      el("td", {}, el("button", { class: "icon", type: "button", text: "✕", title: "מחק דוח",
        onclick: async () => { if (confirm(`למחוק את הדוח מ-${r.date}?`)) { try { await deleteDoc(doc(db, "sales", r.id)); } catch {} } } }))));
  });
  clear($("salesRecent")).append(el("div", { class: "scroll" }, el("table", { class: "t" },
    el("thead", {}, el("tr", {}, ...["תאריך", "מכירות", "לקוחות", "ללקוח", "פריטים", ""].map(h => el("th", { text: h })))), rt)));
}

// הטבלה המלאה, לשאלות חופשיות ב"שאל את הנתונים".
export const table = () => asTable(S.sales || []);

/* ===== חיווט ===== */
export function init(){
  const f = $("zPhoto");
  if (!f) return;
  f.addEventListener("change", async () => {
    const file = f.files && f.files[0]; f.value = "";
    if (!file) return;
    status("zStatus", "", "קורא את הדוח מהצילום…");
    try {
      const image = await shrink(file);
      const r = await api("/ai/zreport", { image });
      draft = { ...r, categories: r.categories || [] };
      renderDraft();
      status("zStatus", "ok", "בדוק את המספרים מול הפתק, תקן מה שצריך, ושמור.");
    } catch (err){
      draft = null; renderDraft();
      status("zStatus", "bad", err.message || "לא הצלחתי לקרוא את הדוח.");
    }
  });
  $("zManual").addEventListener("click", () => {
    draft = { date: ymd(new Date()), categories: [{ name: "", amount: null, qty: null }] };
    renderDraft(); status("zStatus", "", "מלא ידנית מהפתק.");
  });
  render();
}
