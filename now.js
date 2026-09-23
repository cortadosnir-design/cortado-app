// "עכשיו": השורה הראשונה שרואים. איפה השבוע עומד, ומה הצעד האחד הבא.
// האפליקציה יודעת איזה יום היום ומה השלב, ומציעה את הפעולה במקום שהמנהלת תחפש אותה.
import { S, DAYS, $, el, clear, dm, ymd, on, emit } from "./core.js";
import { phase, shiftsOf, openDays, sentKeys, hasSent } from "./shifts.js";
import { weekProgress } from "./creative.js";
import { googleMarked } from "./launch.js";

const STEPS = ["ימים", "זמינות", "שיבוץ", "נעול"];

const scrollTo = (id) => { const n = $(id); if (n && !n.hidden) n.scrollIntoView({ behavior: "smooth", block: "start" }); };
const click = (sel) => { const n = document.querySelector(sel); if (n && !n.disabled) n.click(); };
const isPlanningWeek = () => ymd(S.weekStart) === ymd(S.__defaultWeek || S.weekStart);

function owner(){
  const ph = phase(), shifts = shiftsOf();
  const today = new Date().getDay();
  const cur = isPlanningWeek();
  const slots = shifts.reduce((n, s) => n + (s.need || 1), 0);
  const filled = S.signups.length;

  if (!shifts.length && ph !== "locked") return {
    step: 0, title: "בונים את השבוע",
    sub: "סמן איזה ימים העגלה פתוחה, וכמה אנשים צריך בכל משמרת.",
    primary: ["לימי הפעילות", () => scrollTo("mgrCard")],
  };

  if (ph === "availability" || ph === "review"){
    // דרך sentKeys/hasSent, כמו מסך האישור. ספירה נפרדת כאן יצרה סתירה
    // גלויה: "3 מתוך 3" למטה, ו-"2/3 · עוד לא: דנה" בשורה הראשונה שקוראים.
    const active = S.roster.filter(r => r.active !== false);
    const sent = sentKeys();
    const missing = active.filter(r => !hasSent(r, sent));
    const total = active.length || sent.size;
    const n = active.length ? active.length - missing.length : sent.size;
    const all = active.length && !missing.length;
    return {
      step: 1, title: `${n}/${total} שלחו זמינות`,
      sub: all ? "כולם שלחו. אפשר לאשר ולפתוח לשיבוץ." :
           missing.length ? "עוד לא: " + missing.map(r => r.name || "ללא שם").slice(0, 4).join(", ") + (missing.length > 4 ? " ועוד" : "") :
           "שלח לצוות את הקישורים האישיים.",
      nudge: cur && today >= 2 && !all ? `כבר יום ${DAYS[today]}. כדאי לאשר היום, שהצוות יספיק להשתבץ.` : "",
      primary: all ? ["אשר ופתח לשיבוץ", () => click("#approveBtn")] : ["שלח תזכורת", () => emit("tab", "team")],
      ghost: all ? null : ["אשר בכל זאת", () => click("#approveBtn")],
    };
  }

  if (ph === "open"){
    const short = openDays().filter(d => {
      const need = shifts.filter(s => s.day === d).reduce((n, s) => n + (s.need || 1), 0);
      const got = S.signups.filter(u => shifts.some(s => s.day === d && s.id === u.shift)).length;
      return got < need;
    });
    return {
      step: 2, title: `${filled}/${slots} מקומות מאוישים`,
      sub: short.length ? "חסר ב" + short.map(d => DAYS[d]).join(", ") + "." : "הכל מאויש. אפשר לנעול.",
      nudge: cur && today >= 4 ? `כבר יום ${DAYS[today]}. לנעול היום, שהשעות יעלו לפני הסופ״ש.` : "",
      primary: ["נעל את השבוע", () => click("#phaseBar button.primary")],
      ghost: short.length ? ["הזכר לצוות", () => emit("tab", "team")] : null,
    };
  }

  // נעול
  const launched = !!(S.week && S.week.launchedAt);
  const { done, total } = weekProgress();
  if (!launched) return {
    step: 3, title: "השבוע נעול",
    sub: "השעות מתפרסמות לבד לדף העגלה ולפייסבוק, תוך שנייה או שתיים.",
    primary: ["עדכן עכשיו", () => click("#launchBtn")],
    ghost: [`קריאייטיב ${done}/${total}`, () => emit("tab", "creative")],
  };
  // גוגל הוא הערוץ שמביא את מי שמחפש "קפה ליד", והיחיד שעדיין נעשה ביד.
  // לכן הוא צעד בפני עצמו — ונעלם ברגע שמסמנים אותו.
  if (!googleMarked()) return {
    step: 3, title: "גוגל עוד לא עודכן השבוע",
    sub: "מי שמחפש קפה בדרך לבניאס רואה את גוגל, לא את פייסבוק. 20 שניות.",
    nudge: cur && today >= 4 ? "סוף השבוע מתקרב — שעות שגויות בגוגל שולחות אנשים לעגלה סגורה." : "",
    primary: ["לעדכן בגוגל", () => {
      emit("tab", "shifts");
      setTimeout(() => { const c = $("launchCard"); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 120);
    }],
    ghost: [`קריאייטיב ${done}/${total}`, () => emit("tab", "creative")],
  };

  if (done < total) return {
    step: 3, title: `${done}/${total} פוסטים מוכנים`,
    sub: "משבצת ריקה זו משימה. אחת אחת, עם משפט שלך.",
    nudge: cur && today >= 4 ? "הפוסטים של הסופ״ש עוד לא מוכנים." : "",
    primary: ["לכתוב", () => emit("tab", "creative")],
  };
  return {
    step: 4, title: "השבוע סגור ✓",
    sub: "שעות שוגרו, פוסטים מוכנים. נשאר להוריד את ה-CSV למתזמן.",
    primary: ["לתזמון", () => emit("tab", "creative")],
  };
}

function member(){
  const ph = phase();
  const mine = S.availability.find(a => S.me && a.uid === S.me.uid);
  const myShifts = S.signups.filter(u => S.me && u.uid === S.me.uid).length;
  if (ph === "availability" || ph === "review") return mine
    ? { step: 1, title: "הזמינות שלך התקבלה ✓", sub: "אפשר לעדכן עד שהשבוע ייפתח לשיבוץ.", primary: ["עדכן", () => scrollTo("availCard")] }
    : { step: 1, title: "מתי אתה יכול השבוע?", sub: "סמן לכל יום. לוקח חצי דקה.", primary: ["סמן זמינות", () => scrollTo("availCard")] };
  if (ph === "open") return { step: 2, title: myShifts ? `נרשמת ל-${myShifts} משמרות` : "השיבוץ פתוח", sub: "תפוס את המשמרות שלך לפני שיתמלאו.", primary: ["למשמרות", () => scrollTo("boardCard")] };
  return { step: 3, title: myShifts ? `${myShifts} משמרות השבוע` : "השבוע סגור", sub: "זה השיבוץ הסופי.", primary: ["למשמרות", () => scrollTo("boardCard")] };
}

export function render(){
  const box = $("now"); if (!box) return;
  if (!S.me || !S.isMember){ box.hidden = true; return; }
  const v = S.isOwner ? owner() : member();
  clear(box); box.hidden = false;
  const today = new Date();
  box.append(el("div", { class: "nowhead" },
    el("div", { class: "nowtitle", text: v.title }),
    el("div", { class: "nowday", text: `יום ${DAYS[today.getDay()]} ${dm(today)}` })));
  if (v.sub) box.append(el("div", { class: "nowsub", text: v.sub }));
  if (v.nudge) box.append(el("div", { class: "nowsub", text: "· " + v.nudge }));
  const steps = el("ol", { class: "steps4" });
  STEPS.forEach((t, i) => steps.append(el("li", { class: i < v.step ? "done" : i === v.step ? "cur" : "", text: t })));
  box.append(steps);
  const acts = el("div", { class: "actions" });
  if (v.primary) acts.append(el("button", { text: v.primary[0], onclick: v.primary[1] }));
  if (v.ghost) acts.append(el("button", { class: "ghost", text: v.ghost[0], onclick: v.ghost[1] }));
  box.append(acts);
}

export function init(){
  S.__defaultWeek = new Date(S.weekStart);
  on("state", render);
  on("weekchanged", render);
}
