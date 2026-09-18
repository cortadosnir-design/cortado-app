// תפעול: צוות, הרשאות, תזכורות, יומן משמרת ותובנות.
import { S, db, DAYS, $, el, clear, pad, ymd, dm, addDays, fromYmd, sundayOf, toMin, weekId, fmt1,
  status, copyText, waLink, withBusy, api, WORKER_URL, nameOf, whoOf, track, makeToken, zLink,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp } from "./core.js";

const MIN_ENTRIES = 5;
const WEATHER = ["","נעים","חם","שרב","גשום","קר","רוח"];
let editingMember = null, remState = null, remWeek = null, unsubRem = null;

export function subscribe(){
  track(onSnapshot(collection(db, "roster"),
    (snap) => {
      S.roster = snap.docs.map(d => ({ token: d.id, ...d.data() }));
      S.rosterNames = {};
      S.roster.forEach(r => S.rosterNames[r.token] = r.name || "חבר צוות");
      renderRoster(); drawReminders();
    }, () => {}));
  track(onSnapshot(collection(db, "log"),
    (snap) => { S.logs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.date||"").localeCompare(a.date||"")); renderLog(); }, () => {}));
  if (S.isOwner){
    track(onSnapshot(collection(db, "members"),
      (snap) => {
        S.members = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        S.memberNames = {}; S.members.forEach(m => S.memberNames[m.uid] = m.name || "חבר צוות");
        renderAccess();
      }, () => {}));
    track(onSnapshot(collection(db, "joinRequests"),
      (snap) => { S.joinReqs = snap.docs.map(d => ({ uid: d.id, ...d.data() })); renderAccess(); }, () => {}));
  }
}

/* ===== צוות: לכל עובד קישור אישי קבוע ===== */
const inviteText = (r) => `היי ${r.name} 👋\nזה הקישור האישי שלך למשמרות בקורטדו. שמור אותו — הוא קבוע, ומכאן ממלאים זמינות ותופסים משמרות.\nאין צורך בסיסמה או בהתקנה.\n\n${zLink(r.token)}`;

function renderRoster(){
  const t = clear($("teamTable"));
  if (!S.roster.length){
    t.append(el("p", { class: "small", text: "עוד אין עובדים. הוסף את הראשון למעלה — הוא יקבל קישור אישי." }));
    return;
  }
  const list = [...S.roster].sort((a,b) =>
    (b.active === false ? -1 : 0) - (a.active === false ? -1 : 0) || (a.name||"").localeCompare(b.name||"", "he"));

  list.forEach(r => {
    const link = zLink(r.token);
    const wa = waLink(r.phone, inviteText(r));
    const row = el("div", { class: "rosterrow" + (r.active === false ? " off" : "") });
    row.append(el("div", { class: "grow" },
      el("div", {}, el("b", { text: r.name || "ללא שם" }),
        r.role ? el("span", { class: "small", text: " · " + r.role }) : null,
        r.active === false ? el("span", { class: "pill bad", text: "מושבת" }) : null),
      el("div", { class: "small mono clip", dir: "ltr", text: link })));
    const acts = el("div", { class: "actions" });
    if (wa) acts.append(el("a", { class: "btn wa", href: wa, target: "_blank", rel: "noopener", text: "שלח בוואטסאפ" }));
    else acts.append(el("button", { text: "שתף", onclick: () => shareInvite(r) }));
    acts.append(el("button", { text: "העתק קישור", onclick: (e) => copyText(link, e.currentTarget, "העתק קישור") }));
    acts.append(el("button", { class: "link", text: "עריכה", onclick: () => {
      editingMember = r.token;
      $("tName").value = r.name || ""; $("tPhone").value = r.phone || "";
      $("tEmail").value = r.email || ""; $("tRole").value = r.role || "";
      $("tSave").textContent = "שמור"; $("tName").focus();
    } }));
    acts.append(el("button", { class: "link", text: r.active === false ? "הפעל" : "השבת",
      onclick: () => updateDoc(doc(db, "roster", r.token), { active: r.active === false })
        .catch(() => status("teamStatus", "bad", "העדכון נכשל.")) }));
    acts.append(el("button", { class: "link", text: "קישור חדש", title: "מבטל את הקישור הישן",
      onclick: () => resetToken(r) }));
    row.append(acts);
    t.append(row);
  });
}

async function shareInvite(r){
  const text = inviteText(r);
  if (navigator.share){ try { await navigator.share({ text }); return; } catch {} }
  copyText(text, null, null);
  status("teamStatus", "ok", "ההודעה הועתקה. הדבק בוואטסאפ.");
}

// מחליף את הקוד: הקישור הישן מפסיק לעבוד מיד.
async function resetToken(r){
  if (!confirm(`להנפיק ל${r.name} קישור חדש? הקישור הישן יפסיק לעבוד.`)) return;
  const token = makeToken();
  try {
    await setDoc(doc(db, "roster", token), { name: r.name || "", phone: r.phone || "", email: r.email || "", role: r.role || "", active: true, at: serverTimestamp() });
    await deleteDoc(doc(db, "roster", r.token));
    status("teamStatus", "ok", "הונפק קישור חדש. שלח אותו לעובד.");
  } catch { status("teamStatus", "bad", "לא הצלחתי להנפיק קישור חדש."); }
}

/* ===== הרשאות ===== */
function renderAccess(){
  const box = $("accessList"); if (!box) return;
  clear(box);
  const pending = S.joinReqs.filter(r => !S.members.some(m => m.uid === r.uid));
  if (pending.length){
    box.append(el("p", {}, el("b", { text: `מחכים לאישור (${pending.length})` })));
    pending.forEach(r => box.append(el("div", { class: "rem" },
      el("span", { class: "grow", text: `${r.name || "ללא שם"} · ${r.email || ""}` }),
      el("button", { class: "primary", text: "אשר", onclick: (e) => withBusy(e.currentTarget, async () => {
        try {
          await setDoc(doc(db, "members", r.uid), { name: r.name || "", email: r.email || "", at: serverTimestamp() });
          await deleteDoc(doc(db, "joinRequests", r.uid)).catch(() => {});
          status("teamStatus", "ok", `${r.name || "העובד"} אושר.`);
        } catch { status("teamStatus", "bad", "האישור נכשל."); }
      }) }),
      el("button", { class: "link", text: "דחה", onclick: () => deleteDoc(doc(db, "joinRequests", r.uid)).catch(() => {}) }))));
  }
  box.append(el("p", { style: "margin-top:8px" }, el("b", { text: "מאושרים" })));
  if (!S.members.length) box.append(el("p", { class: "small", text: "עוד אין עובדים מאושרים." }));
  S.members.forEach(m => box.append(el("div", { class: "rem" },
    el("span", { class: "grow", text: `${m.name || "ללא שם"} · ${m.email || ""}` }),
    el("button", { class: "link", text: "הסר גישה", onclick: async () => {
      if (!confirm(`להסיר את הגישה של ${m.name || "העובד"}?`)) return;
      try { await deleteDoc(doc(db, "members", m.uid)); } catch { status("teamStatus", "bad", "ההסרה נכשלה."); }
    } }))));
}

/* ===== תזכורות למחר ===== */
export async function loadReminders(){
  const box = $("remList"); if (!box || !S.me) return;
  const tomorrow = addDays(new Date(), 1);
  const id = weekId(sundayOf(tomorrow));
  if (remWeek === id){ drawReminders(); return; }
  remWeek = id; remState = null;
  clear(box).append(el("p", { class: "small", text: "טוען…" }));
  if (unsubRem){ try { unsubRem(); } catch {} }
  try {
    const wSnap = await getDoc(doc(db, "weeks", id));
    const shifts = wSnap.exists() && Array.isArray(wSnap.data().shifts) ? wSnap.data().shifts : [];
    unsubRem = onSnapshot(query(collection(db, "signups"), where("week", "==", id)),
      (snap) => { remState = { shifts, ups: snap.docs.map(d => ({ id: d.id, ...d.data() })) }; drawReminders(); },
      () => clear(box).append(el("p", { class: "small", text: "לא הצלחתי לקרוא את המשמרות של מחר." })));
    track(unsubRem);
  } catch { clear(box).append(el("p", { class: "small", text: "לא הצלחתי לקרוא את המשמרות של מחר." })); }
}

function drawReminders(){
  const box = $("remList"); if (!box || !remState) return;
  clear(box);
  const tomorrow = addDays(new Date(), 1), day = tomorrow.getDay();
  const rows = remState.shifts.filter(s => s.day === day).sort((a,b) => toMin(a.start) - toMin(b.start));
  box.append(el("p", {}, el("b", { text: `מחר · ${DAYS[day]} ${dm(tomorrow)}` })));
  if (!rows.length){ box.append(el("p", { class: "small", text: "אין משמרות מחר." })); return; }
  for (const s of rows){
    const ups = remState.ups.filter(u => u.shift === s.id);
    const line = el("div", { class: "rem" }, el("span", { class: "num", text: `${s.start}–${s.end}` }));
    if (!ups.length) line.append(el("span", { class: "pill bad", text: "אף אחד לא רשום" }));
    ups.forEach(u => {
      const who = whoOf(u);
      const member = S.roster.find(m => m.token === u.token) ||
        S.roster.find(m => (m.name || "").trim() === who.trim());
      const text = `היי ${member ? member.name : who} 👋\nתזכורת: מחר (${DAYS[day]} ${dm(tomorrow)}) את/ה במשמרת בעגלת קורטדו, ${s.start}–${s.end}.\nאם יש בעיה, עדכן/י אותי מוקדם. תודה! ☕`;
      const wa = member && waLink(member.phone, text);
      line.append(el("span", { text: who }));
      if (wa) line.append(el("a", { class: "btn wa", href: wa, target: "_blank", rel: "noopener", text: "וואטסאפ" }));
      else line.append(el("button", { class: "link", text: "העתק הודעה", onclick: (ev) => copyText(text, ev.currentTarget, "העתק הודעה") }));
    });
    box.append(line);
  }
}

/* ===== יומן משמרת ===== */
const peakHour = () => {
  const counts = new Array(24).fill(0);
  S.logs.forEach(l => { if (l.peak) counts[+l.peak.slice(0,2)]++; });
  const max = Math.max(...counts);
  return max ? counts.indexOf(max) : null;
};

function bars(values, labels, fmt, emptyText){
  const wrap = el("div", {});
  const max = Math.max(0, ...values.filter(v => v != null));
  if (!max){ wrap.append(el("p", { class: "small", text: emptyText })); return wrap; }
  const row = el("div", { class: "bars" }), xl = el("div", { class: "xlab" });
  values.forEach((v,i) => {
    const h = v ? Math.max(2, v / max * 100) : 0;
    const b = el("div", { class: "bar", title: `${labels[i]}: ${v == null ? "אין נתונים" : fmt(v)}` });
    const lab = el("b", { text: v == null ? "" : fmt(v) }); lab.style.bottom = `calc(${h}% + 2px)`;
    const fill = el("i"); fill.style.height = h + "%";
    b.append(lab, fill); row.append(b); xl.append(el("span", { text: labels[i] }));
  });
  wrap.append(row, xl); return wrap;
}

export function renderLog(){
  if (!$("logKpis")) return;
  const withC = S.logs.filter(l => l.customers != null);
  const byDay = new Map();
  withC.forEach(l => { const d = fromYmd(l.date).getDay(); const e = byDay.get(d) || { sum: 0, n: 0 }; e.sum += l.customers; e.n++; byDay.set(d, e); });
  const peak = peakHour();

  const k = clear($("logKpis"));
  let best = null; for (const [d,e] of byDay) if (!best || e.sum/e.n > best[1]) best = [d, e.sum/e.n];
  [[S.logs.length, "דיווחים"],
   [withC.length ? fmt1(withC.reduce((a,l) => a + l.customers, 0) / withC.length) : "—", "ממוצע לקוחות"],
   [best ? DAYS[best[0]] : "—", "היום העמוס"],
   [peak != null ? `${pad(peak)}:00` : "—", "שעת עומס"]]
    .forEach(([v,l]) => k.append(el("div", { class: "kpi" }, el("div", { class: "v", text: String(v) }), el("div", { class: "l", text: l }))));

  clear($("chartDays")).append(bars(DAYS.map((_,d) => byDay.has(d) ? byDay.get(d).sum / byDay.get(d).n : null), DAYS.map(d => d.slice(0,3)), fmt1, "עוד אין דיווחים עם מספר לקוחות."));
  const hrs = []; for (let h = 6; h <= 20; h++) hrs.push(h);
  const counts = new Array(24).fill(0); S.logs.forEach(l => { if (l.peak) counts[+l.peak.slice(0,2)]++; });
  clear($("chartHours")).append(bars(hrs.map(h => counts[h] || null), hrs.map(String), String, "עוד לא סומנו שעות עומס."));

  const rc = clear($("reco"));
  if (withC.length >= MIN_ENTRIES){
    if (peak != null) rc.append(el("p", { text: `העומס מגיע בדרך כלל ב-${pad(peak)}:00. כדאי לפרסם בסביבות ${pad(Math.max(6, peak-2))}:00.` }));
    const ranked = [...byDay].map(([d,e]) => [d, e.sum/e.n]).sort((a,b) => a[1]-b[1]);
    if (ranked.length >= 2) rc.append(el("p", { text: `${DAYS[ranked[0][0]]} הכי שקט (${fmt1(ranked[0][1])} לקוחות), ${DAYS[ranked[ranked.length-1][0]]} הכי עמוס (${fmt1(ranked[ranked.length-1][1])}). כדאי לכוון מבצע ל${DAYS[ranked[0][0]]}.` }));
    const yes = withC.filter(l => l.promo), no = withC.filter(l => !l.promo);
    if (yes.length >= 2 && no.length >= 2){
      const a = yes.reduce((s,l) => s+l.customers, 0)/yes.length, b = no.reduce((s,l) => s+l.customers, 0)/no.length;
      rc.append(el("p", { text: a > b ? `במשמרות עם מבצע היו ${fmt1(a-b)} לקוחות יותר בממוצע.` : `מבצעים עוד לא הראו עלייה (${fmt1(a)} מול ${fmt1(b)}).` }));
    }
  } else rc.append(el("p", { text: `אחרי ${MIN_ENTRIES} דיווחים יופיעו כאן המלצות. יש ${withC.length}.` }));

  const rw = $("recentWrap"), rec = clear($("recent"));
  rw.hidden = !S.logs.length;
  if (S.logs.length){
    const tb = el("tbody");
    S.logs.slice(0, 14).forEach(l => tb.append(el("tr", {},
      el("td", { class: "num", text: dm(fromYmd(l.date)) }), el("td", { text: l.by || "" }),
      el("td", { class: "num", text: l.customers == null ? "—" : String(l.customers) }),
      el("td", { class: "num", text: l.peak || "—" }), el("td", { text: l.weather || "—" }), el("td", { text: l.promo || "" }))));
    rec.append(el("div", { class: "scroll" }, el("table", { class: "t" },
      el("thead", {}, el("tr", {}, ...["תאריך","מי דיווח","לקוחות","עומס","מזג אוויר","מבצע"].map(h => el("th", { text: h })))), tb)));
  }
}

/* ===== חיווט ===== */
export function init(){
  WEATHER.forEach(w => $("lWeather").append(el("option", { value: w, text: w || "—" })));
  $("lDate").value = ymd(new Date());

  $("tSave").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
    const name = $("tName").value.trim();
    if (!name){ status("teamStatus", "warn", "צריך שם."); return; }
    const body = { name, phone: $("tPhone").value.trim(), email: $("tEmail").value.trim(), role: $("tRole").value.trim() };
    try {
      const isNew = !editingMember;
      const token = editingMember || makeToken();
      if (isNew) body.active = true;
      body.at = serverTimestamp();
      await setDoc(doc(db, "roster", token), body, { merge: true });
      editingMember = null; $("tSave").textContent = "הוסף עובד";
      ["tName","tPhone","tEmail","tRole"].forEach(i => $(i).value = "");
      status("teamStatus", "ok", isNew ? `${name} נוסף. שלח לו את הקישור האישי.` : "נשמר.");
    } catch { status("teamStatus", "bad", "השמירה נכשלה."); }
  }));

  $("copyAppLink").addEventListener("click", (e) => copyText(location.href.split("#")[0], e.currentTarget, "העתק קישור לצוות"));

  $("lDate").addEventListener("change", async () => {
    if (!S.me || !$("lDate").value) return;
    try {
      const d = await getDoc(doc(db, "log", `${$("lDate").value}_${S.me.uid}`));
      if (d.exists()){
        const l = d.data();
        $("lCustomers").value = l.customers ?? ""; $("lPeak").value = l.peak || "";
        $("lWeather").value = l.weather || ""; $("lPromo").value = l.promo || ""; $("lNotes").value = l.notes || "";
        status("logStatus", "warn", "כבר דיווחת על היום הזה. שמירה תעדכן את הדיווח.");
      } else { ["lCustomers","lPeak","lPromo","lNotes"].forEach(i => $(i).value = ""); status("logStatus", "", ""); }
    } catch {}
  });

  $("lSave").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
    const date = $("lDate").value;
    if (!date){ status("logStatus", "warn", "בחר תאריך."); return; }
    const cust = $("lCustomers").value === "" ? null : Math.max(0, +$("lCustomers").value);
    const data = { date, customers: cust, peak: $("lPeak").value || "", weather: $("lWeather").value || "",
      promo: $("lPromo").value.trim(), notes: $("lNotes").value.trim(),
      uid: S.me ? S.me.uid : "", by: S.me ? (S.me.displayName || S.me.email || "") : "", at: serverTimestamp() };
    try {
      await setDoc(doc(db, "log", `${date}_${S.me.uid}`), data);
      status("logStatus", "ok", "הדיווח נשמר. תודה!");
      ["lCustomers","lPeak","lPromo","lNotes"].forEach(i => $(i).value = "");
    } catch { status("logStatus", "bad", "השמירה נכשלה. נסה שוב."); }
  }));

  $("aiInsights").addEventListener("click", (e) => withBusy(e.currentTarget, async () => {
    try {
      status("insightsStatus", "", "מנתח…");
      const r = await api("/ai/insights", {
        logs: S.logs.slice(0, 40).map(l => ({ date: l.date, customers: l.customers, peak: l.peak, weather: l.weather, promo: l.promo })),
        posts: S.posts.filter(p => p.performance).slice(0, 20).map(p => ({ date: p.date, time: p.time, format: p.format, pillar: p.pillar, performance: p.performance })),
      });
      const box = clear($("aiReco"));
      (Array.isArray(r.insights) ? r.insights : []).forEach(t => box.append(el("p", { text: String(t) })));
      status("insightsStatus", "ok", "");
    } catch (err){ status("insightsStatus", "bad", err.message); }
  }));
}
