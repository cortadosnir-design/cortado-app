// הפצה וצמיחה: קבוצות פייסבוק, דירקטוריות, מתחרים, שעות שנלמדו, ומדידת ביצועים.
import { S, db, DAYS, $, el, clear, ymd, dm, addDays, fromYmd, weekId, fmt1,
  status, copyText, withBusy, api, WORKER_URL, track,
  doc, setDoc, collection, onSnapshot, serverTimestamp } from "./core.js";
import { GROUPS, DIRECTORIES, COMPETITORS, AMPLIFIERS, BIG_MOVES, MILESTONES, BENCHMARKS, BRAND, TIMING, HASHTAGS } from "./playbook.js";
import { hoursText, hoursByDay, openDays } from "./shifts.js";
import { bestTimes } from "./creative.js";

const reach = () => S.reach || { done: {}, directories: {}, followers: [] };
const key = (i) => `${weekId(S.weekStart)}_${i}`;

export function subscribe(){
  track(onSnapshot(doc(db, "brand", "reach"),
    (snap) => { S.reach = snap.exists() ? snap.data() : null; render(); },
    () => {}));
}

async function saveReach(patch){
  try { await setDoc(doc(db, "brand", "reach"), { ...patch, updatedAt: serverTimestamp() }, { merge: true }); }
  catch { status("groupStatus", "bad", "רק המנהל יכול לעדכן."); }
}

/* ===== תור הקבוצות לשבוע ===== */
// אי אפשר לפרסם לקבוצות דרך ה-API — מטא סגרה את זה. אז זו רשימת עבודה
// שבועית עם טקסט מוכן: לוחצים העתק, פותחים את הקבוצה, מדביקים.
function weekBlurb(){
  const h = hoursByDay();
  const days = h.map((x,i) => x.length ? `${DAYS[i]} ${x.join(", ")}` : null).filter(Boolean);
  return `☕ קפה קורטדו · קיבוץ שניר\n\n${days.join("\n")}\n\nקפה איכותי, מאפים, והנוף של עמק החולה.\nמחכים לכם.`;
}

function renderGroups(){
  const box = clear($("groupList"));
  const r = reach();
  const tierFilter = +($("groupTier").value || 0);
  const list = GROUPS.filter(g => !tierFilter || g.tier === tierFilter);
  let done = 0;

  list.forEach((g) => {
    const i = GROUPS.indexOf(g);
    const isDone = !!(r.done && r.done[key(i)]);
    if (isDone) done++;
    const row = el("div", { class: "grouprow" + (isDone ? " done" : "") });
    row.append(el("label", { class: "toggle" },
      el("input", { type: "checkbox", checked: isDone || undefined, disabled: !S.isOwner || undefined,
        onchange: (e) => saveReach({ done: { ...(r.done || {}), [key(i)]: e.target.checked } }) }),
      el("span", {})));
    const main = el("div", { class: "grow" },
      el("div", {}, el("a", { href: g.url, target: "_blank", rel: "noopener", text: g.name }),
        " ", el("span", { class: "pill" + (g.tier === 1 ? " ok" : ""), text: "עדיפות " + g.tier }),
        g.members !== "—" ? el("span", { class: "small mono", text: " " + g.members + (g.verified ? " ✓" : " (לא מאומת)") }) : null),
      el("div", { class: "small", text: g.play }));
    row.append(main);
    // הטקסט זהה לכל הקבוצות, ולכן כפתור העתקה אחד למעלה — לא אחד לכל שורה.
    box.append(row);
  });

  $("groupProgress").textContent = `${done} מתוך ${list.length} טופלו השבוע`;
}

/* ===== דירקטוריות ===== */
function renderDirectories(){
  const box = clear($("dirList"));
  const r = reach();
  DIRECTORIES.forEach((d, i) => {
    const st = (r.directories && r.directories[d.name]) || d.status;
    const cls = st === "done" ? "ok" : st === "critical" ? "bad" : st === "missing" ? "bad" : "warn";
    const label = st === "done" ? "רשום ✓" : st === "critical" ? "קריטי" : st === "missing" ? "חסר!" : "לבדוק";
    box.append(el("div", { class: "grouprow" },
      el("div", { class: "grow" },
        el("div", {}, el("a", { href: d.url, target: "_blank", rel: "noopener", text: d.name }),
          " ", el("span", { class: "pill " + cls, text: label })),
        d.note ? el("div", { class: "small", text: d.note }) : null),
      S.isOwner ? el("button", { text: st === "done" ? "בטל" : "סמן כרשום",
        onclick: () => saveReach({ directories: { ...(r.directories || {}), [d.name]: st === "done" ? "check" : "done" } }) }) : null));
  });
}

/* ===== מתחרים ===== */
function renderCompetitors(){
  const box = clear($("compList"));
  const sorted = [...COMPETITORS].sort((a,b) => (b.followers || 0) - (a.followers || 0));
  const tbl = el("table", { class: "t" });
  tbl.append(el("thead", {}, el("tr", {},
    el("th", { text: "#" }), el("th", { text: "עסק" }), el("th", { text: "מקום" }), el("th", { text: "עוקבים" }), el("th", { text: "הערה" }))));
  const tb = el("tbody");
  sorted.forEach((c, i) => {
    const tr = el("tr", { class: c.me ? "me" : "" });
    tr.append(el("td", { class: "num", text: c.followers ? i + 1 : "—" }));
    tr.append(el("td", {}, c.ig ? el("a", { href: "https://instagram.com/" + c.ig.replace("@",""), target: "_blank", rel: "noopener", text: c.name }) : c.name,
      c.me ? el("span", { class: "pill ok", text: "אתם" }) : null));
    tr.append(el("td", { text: c.place }));
    tr.append(el("td", { class: "num", text: c.followers ? c.followers.toLocaleString("he-IL") : "—" }));
    tr.append(el("td", { class: "small", text: c.note || "" }));
    tb.append(tr);
  });
  tbl.append(tb);
  box.append(el("div", { class: "scroll" }, tbl));
  box.append(el("p", { class: "small", text: "נתוני בסיס מספטמבר 2026. לא מתעדכן אוטומטית — בקש ממני רענון כשתרצה." }));
}

function renderMilestones(){
  const box = clear($("milestones"));
  const cur = currentFollowers();
  box.append(el("div", { class: "kpis" },
    el("div", { class: "kpi" }, el("div", { class: "v", text: cur.toLocaleString("he-IL") }), el("div", { class: "l", text: "עוקבים באינסטגרם" }))));
  MILESTONES.forEach(m => {
    const pct = Math.min(100, Math.round(cur / m.to * 100));
    const hit = cur >= m.to;
    box.append(el("div", { class: "mile" },
      el("div", { class: "milehead" },
        el("b", { text: m.to.toLocaleString("he-IL") }), " ",
        el("span", { class: "small", text: m.label }),
        el("span", { class: "pill " + (hit ? "ok" : ""), text: hit ? "הושג" : m.months })),
      el("div", { class: "track" }, el("i", { style: `width:${pct}%` }))));
  });
  const inp = el("input", { type: "number", min: "0", max: "999999", value: cur, "aria-label": "עוקבים היום" });
  box.append(el("div", { class: "form" },
    el("label", { class: "block" }, el("span", { class: "small", text: "עדכן ספירת עוקבים" }), inp),
    el("button", { text: "שמור", onclick: () => {
      const n = +inp.value;
      if (!(n > 0)) return;
      saveReach({ followers: [...(reach().followers || []), { at: ymd(new Date()), n }].slice(-60) });
      status("growthStatus", "ok", "נשמר. אפשר לראות מגמה אחרי כמה מדידות.");
    } })));
  const hist = reach().followers || [];
  if (hist.length >= 2){
    const first = hist[0], last = hist[hist.length - 1];
    const diff = last.n - first.n;
    box.append(el("p", { class: "small", text: `מ-${first.at}: ${diff >= 0 ? "+" : ""}${diff} עוקבים.` }));
  }
}
function currentFollowers(){
  const h = reach().followers || [];
  return h.length ? h[h.length - 1].n : BRAND.baseline.followers;
}

/* ===== שעות מומלצות ===== */
function renderTiming(){
  const box = clear($("timingBox"));
  [["instagram","אינסטגרם"],["facebook","פייסבוק"]].forEach(([net, label]) => {
    const slots = bestTimes(net);
    const learned = slots.some(s => s.learned);
    const card = el("div", { class: "timecard" },
      el("h3", { class: "sub" }, label, el("span", { class: "pill " + (learned ? "ok" : ""), text: learned ? "נלמד מהנתונים שלכם" : "בנצ׳מרק" })));
    slots.slice(0, 4).forEach(s => card.append(el("div", { class: "timerow" },
      el("b", { class: "mono", text: DAYS[s.day] + " " + s.time }),
      el("span", { class: "small", text: s.why || "" }))));
    box.append(card);
  });
  box.append(el("p", { class: "small", text: TIMING.dead + " המערכת תחליף את הבנצ׳מרק בנתונים שלכם אחרי 8 מדידות ביצועים לרשת." }));
}

/* ===== משיכת המספרים ממטא =====
   הקלדה של חשיפה, לייקים ושמירות לכל פוסט הייתה המטלה הכי כבדה כאן,
   והיא גם הדלק של כל הלמידה. מאז שהפרסום עובר דרך השרת יש לנו את מזהי
   הפוסטים, ומטא מחזירה את המספרים. ההקלדה נשארת רק למי שפרסם ידנית. */
const pullable = () => S.posts.filter(p => (p.fbPostId || p.igPostId) && p.date && fromYmd(p.date) <= new Date());
let pulledAt = 0;

async function pullNumbers(btn, quiet){
  const rows = pullable();
  if (!rows.length){
    if (!quiet) status("perfStatus", "warn", "אין עדיין פוסטים שפורסמו דרך האפליקציה. מה שפורסם ידנית — מקלידים למטה.");
    return;
  }
  const run = async () => {
    try {
      if (!quiet) status("perfStatus", "", "מושך מפייסבוק ומאינסטגרם…");
      const r = await api("/insights/posts", {
        posts: rows.slice(0, 30).map(p => ({ id: p.id, fbPostId: p.fbPostId || "", igPostId: p.igPostId || "" })),
      });
      let n = 0, failed = 0;
      for (const x of (r.posts || [])){
        if (x.error){ failed++; continue; }
        const was = S.posts.find(p => p.id === x.id);
        const old = (was && was.performance) || {};
        // לא דורסים מספר גבוה יותר שכבר נשמר: מטא מעדכנת באיחור, וירידה
        // פתאומית לאפס הייתה מרעילה את הלמידה.
        const v = { reach: Math.max(old.reach || 0, x.reach || 0),
                    likes: Math.max(old.likes || 0, x.likes || 0),
                    saves: Math.max(old.saves || 0, x.saves || 0), auto: true };
        if (v.reach === (old.reach || 0) && v.likes === (old.likes || 0) && v.saves === (old.saves || 0)) continue;
        await setDoc(doc(db, "posts", x.id), { performance: v }, { merge: true });
        n++;
      }
      pulledAt = Date.now();
      // המנוי של הלשונית הוא על brand/reach, לא על הפוסטים — בלי הציור
      // הזה המספרים החדשים היו מופיעים רק אחרי מעבר לשונית וחזרה.
      if (n){ await relearnTiming(); renderPerformance(); }
      if (!quiet || n)
        status("perfStatus", failed && !n ? "warn" : "ok",
          n ? `${n} פוסטים עודכנו מהמספרים האמיתיים.` : failed ? "מטא לא החזירה מספרים. ייתכן שהפוסט חדש מדי." : "הכל כבר מעודכן.");
    } catch (e){ if (!quiet) status("perfStatus", "bad", e.message); }
  };
  return btn ? withBusy(btn, run) : run();
}

// בפתיחת הלשונית, פעם בשעה, בשקט. אף אחד לא צריך לזכור ללחוץ.
function autoPull(){
  if (!S.isOwner || !WORKER_URL) return;
  if (Date.now() - pulledAt < 3600e3) return;
  if (!pullable().length) return;
  pullNumbers(null, true);
}

/* ===== מדידת ביצועים — הדלק של הלמידה ===== */
function renderPerformance(){
  const box = clear($("perfList"));
  const done = S.posts.filter(p => p.status === "done" || p.status === "scheduled")
    .sort((a,b) => (b.date||"").localeCompare(a.date||"")).slice(0, 12);

  const auto = pullable().length;
  const head = $("perfAuto");
  if (head){
    clear(head);
    if (auto) head.append(
      el("span", { class: "small", text: `${auto} פוסטים פורסמו דרך האפליקציה — המספרים נמשכים לבד.` }),
      el("button", { text: "משוך עכשיו", onclick: (e) => pullNumbers(e.currentTarget) }));
    else head.append(el("span", { class: "small", text: "פוסט שיפורסם דרך 'תזמן ופרסם' — המספרים שלו יגיעו לבד." }));
  }

  if (!done.length){ box.append(el("p", { class: "small", text: "כשיהיו פוסטים שפורסמו, המספרים שלהם יופיעו כאן." })); return; }

  done.forEach(p => {
    const perf = p.performance || {};
    const row = el("div", { class: "perfrow" });
    const d = p.date ? fromYmd(p.date) : null;
    row.append(el("div", { class: "grow" },
      el("div", {}, el("b", { text: d ? DAYS[d.getDay()] + " " + dm(d) : "" }), " ",
        el("span", { class: "mono small", text: p.time || "" }), " ",
        el("span", { class: "pill", text: (p.network||[]).length > 1 ? "FB + IG" : (p.network||["instagram"])[0] === "facebook" ? "פייסבוק" : "אינסטגרם" })),
      el("div", { class: "small clip", text: (p.text || "").slice(0, 70) })));
    // נמשך אוטומטית → תצוגה בלבד. ארבעה פקדים לכל פוסט הם מה שהעמיס את הלשונית.
    if (perf.auto){
      row.append(el("div", { class: "perfnums" },
        el("span", {}, el("b", { class: "mono", text: String(perf.reach || 0) }), el("span", { class: "small", text: " חשיפה" })),
        el("span", {}, el("b", { class: "mono", text: String(perf.likes || 0) }), el("span", { class: "small", text: " לייקים" })),
        el("span", {}, el("b", { class: "mono", text: String(perf.saves || 0) }), el("span", { class: "small", text: " שמירות" }))));
      box.append(row);
      return;
    }
    const mk = (k, ph) => el("input", { type: "number", min: "0", class: "tiny", placeholder: ph, value: perf[k] != null ? perf[k] : "", "aria-label": ph });
    const reach_ = mk("reach", "חשיפה"), likes = mk("likes", "לייקים"), saves = mk("saves", "שמירות");
    row.append(reach_, likes, saves);
    row.append(el("button", { text: "שמור", onclick: (e) => withBusy(e.currentTarget, async () => {
      const v = { reach: +reach_.value || 0, likes: +likes.value || 0, saves: +saves.value || 0 };
      try {
        await setDoc(doc(db, "posts", p.id), { performance: v }, { merge: true });
        await relearnTiming();
        status("perfStatus", "ok", "נשמר.");
      } catch { status("perfStatus", "bad", "השמירה נכשלה."); }
    }) }));
    box.append(row);
  });

  // סיכום מול הבנצ׳מרק
  const withPerf = S.posts.filter(p => p.performance && p.performance.reach > 0);
  if (withPerf.length >= 3){
    const followers = currentFollowers();
    const avgEng = withPerf.reduce((s,p) => s + (p.performance.likes || 0) + (p.performance.saves || 0), 0) / withPerf.length;
    const er = followers ? (avgEng / followers * 100) : 0;
    const [lo, hi] = BENCHMARKS.erTarget;
    const cls = er >= hi ? "ok" : er >= lo ? "warn" : "bad";
    const verdict = er >= hi ? "מעל היעד — התוכן עובד" : er >= lo ? "בתוך היעד" : er >= 2 ? "מתחת ליעד" : "התוכן לא עובד. שנה פורמט.";
    $("perfSummary").innerHTML = "";
    $("perfSummary").append(el("div", { class: "kpis" },
      el("div", { class: "kpi" }, el("div", { class: "v", text: fmt1(er) + "%" }), el("div", { class: "l", text: "שיעור מעורבות" })),
      el("div", { class: "kpi" }, el("div", { class: "v", text: Math.round(avgEng) }), el("div", { class: "l", text: "אינטראקציות בממוצע" })),
      el("div", { class: "kpi" }, el("div", { class: "v", text: withPerf.length }), el("div", { class: "l", text: "פוסטים נמדדו" }))),
      el("p", {}, el("span", { class: "pill " + cls, text: verdict }),
        el("span", { class: "small", text: ` היעד לחשבון בגודל שלכם: ${lo}–${hi}%.` })));
  }
}

// לומד את השעות הטובות מהביצועים בפועל. דורש 8 מדידות לרשת.
async function relearnTiming(){
  const out = {};
  for (const net of ["instagram","facebook"]){
    const rows = S.posts.filter(p => (p.network || []).includes(net) && p.performance && p.performance.reach > 0 && p.date && p.time);
    if (rows.length < 8) continue;
    const buckets = {};
    rows.forEach(p => {
      const d = fromYmd(p.date).getDay(), hh = p.time.slice(0,2);
      const k = d + "|" + hh;
      (buckets[k] ||= []).push((p.performance.reach || 0) + ((p.performance.likes || 0) + (p.performance.saves || 0)) * 10);
    });
    const slots = Object.entries(buckets)
      .map(([k, vals]) => {
        const [d, hh] = k.split("|");
        return { day: +d, time: hh + ":00", score: vals.reduce((a,b) => a+b, 0) / vals.length, n: vals.length };
      })
      .sort((a,b) => b.score - a.score).slice(0, 5)
      .map((s, i) => ({ day: s.day, time: s.time, tier: i + 1, why: `${s.n} פוסטים, ביצוע ממוצע ${Math.round(s.score)}` }));
    out[net] = { slots, samples: rows.length };
  }
  if (Object.keys(out).length){
    try { await setDoc(doc(db, "brand", "timing"), { ...out, at: serverTimestamp() }, { merge: true }); } catch {}
  }
}

/* ===== מהלכים גדולים ===== */
function renderBigMoves(){
  const box = clear($("bigMoves"));
  BIG_MOVES.forEach((m, i) => {
    box.append(el("div", { class: "move" },
      el("div", { class: "movenum", text: String(i + 1) }),
      el("div", { class: "grow" },
        el("b", {}, m.url ? el("a", { href: m.url, target: "_blank", rel: "noopener", text: m.title }) : m.title),
        el("div", { class: "small", text: m.why }))));
  });
  const tags = clear($("tagBox"));
  Object.entries({ "ליבה": HASHTAGS.core, "גאוגרפיה": HASHTAGS.geo, "כוונת חיפוש": HASHTAGS.intent, "קולינרי": HASHTAGS.food })
    .forEach(([label, list]) => {
      tags.append(el("div", { class: "memgroup" },
        el("h3", { class: "sub", text: label }),
        el("div", { class: "summary" }, ...list.map(t => el("span", { class: "chip", text: t })))));
    });
  tags.append(el("div", { class: "actions" },
    el("button", { text: "העתק סט מלא", onclick: (e) => copyText([...HASHTAGS.core, ...HASHTAGS.geo.slice(0,2), ...HASHTAGS.intent.slice(0,3), ...HASHTAGS.food.slice(0,2)].join(" "), e.currentTarget, "העתק סט מלא") })));
  const amp = clear($("ampBox"));
  AMPLIFIERS.forEach(a => amp.append(el("div", { class: "grouprow" },
    el("div", { class: "grow" }, el("b", { class: "mono", text: a.handle }), " ",
      el("span", { class: "small mono", text: a.followers }), el("div", { class: "small", text: a.note })),
    el("button", { text: "העתק", onclick: (e) => copyText(a.handle, e.currentTarget, "העתק") }))));
}

export function render(){
  if ($("p-reach").hidden) return;
  renderGroups(); renderDirectories(); renderTiming();
  renderCompetitors(); renderMilestones(); renderBigMoves(); renderPerformance();
  autoPull();
}

export function init(){
  $("groupTier").addEventListener("change", renderGroups);
  $("copyWeekBlurb").addEventListener("click", (e) => copyText(weekBlurb(), e.currentTarget, "העתק את טקסט השבוע"));
  $("copyHoursReach").addEventListener("click", (e) => copyText(hoursText(), e.currentTarget, "העתק שעות"));
}
