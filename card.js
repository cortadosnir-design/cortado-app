// הכרטיס: הצילום, סמל העגלה ושעות אותו היום נצרבים לתמונה אחת בדפדפן.
// למה בדפדפן ולא בשרת: אין Firebase Storage (תוכנית Spark), והתמונה שמתפרסמת
// ממילא נוסעת ל-Meta כ-data URL דרך /publish/schedule. קנבס מייצר בדיוק את זה.
// העיקרון: מה שחוזר בכל פוסט לא נכתב מחדש בכל פוסט. הוא נצרב.
import { S, db, DAYS, DAYS_SHORT, $, el, clear, ymd, dm, fromYmd, addDays, doc, setDoc, deleteDoc, collection, query, orderBy,
  onSnapshot, serverTimestamp, track, emit } from "./core.js";
import { CARD, BRAND, THEMES, TARGETS, targetOf } from "./playbook.js";
import { hoursByDay, phase } from "./shifts.js";
import { drawQR } from "./qr.js";

/* ===== ספריית המדיה =====
   כל מה שאפשר לשים על כרטיס יושב כאן: סמלים, צילומי עגלה, מדבקות, חותמות,
   לוגו של שותף, כל דבר. מסמך לכל פריט ב-assets/ — מסמך בפיירסטור מוגבל
   ל-1MiB, ורשימה אחת בתוך מסמך אחד הייתה נחסמת אחרי כמה תמונות.
   הכול data URL: אין Firebase Storage בתוכנית Spark. */
const ASSET_MAX_PX = 1100;
const ASSET_QUALITY = .72;
const MARK_MAX_PX = 520;        // סמלים ומדבקות — PNG, שקיפות נשמרת

export const KINDS = { logo: "סמל", photo: "צילום", sticker: "מדבקה" };

let cfgDoc = null;      // brand/card
let library = [];       // assets/* — [{ id, name, kind, url }]

/* הסדר: CARD ← THEMES[theme] ← brand/card ← מה שנשלח לפוסט הבודד.
   ככה ערכה משנה עשרה שדות בבת אחת, ועדיין אפשר לדרוס שדה יחיד אחריה. */
export function cfg(over = {}){
  const saved = cfgDoc || {};
  const name = over.theme || saved.theme || CARD.theme;
  const theme = THEMES[name] || {};
  const merged = { ...CARD, ...theme, ...saved, ...over, theme: name };
  // ערכה שנבחרה עכשיו מנצחת שדות ישנים שנשמרו מערכה קודמת
  if (over.theme && over.theme !== saved.theme) Object.assign(merged, theme, over);
  return merged;
}
export const targets = () => TARGETS;
export const assets = (kind) => kind ? library.filter(a => a.kind === kind) : library;
export const assetOf = (id) => library.find(a => a.id === id) || null;
/* הסמל הקבוע. סדר העדיפות: מה שנבחר בעיצוב ← הסמל הראשון בספרייה ←
   הקובץ שבמאגר. האחרון הוא הסבתא, והוא הסיבה שכרטיס יוצא עם סמל גם
   כשהספרייה עוד ריקה לגמרי. */
export const markUrl = (over = {}) => {
  const c = cfg(over);
  if (c.markId === "none") return "";
  const a = (c.markId && assetOf(c.markId)) || assets("logo")[0];
  return a ? a.url : (c.markFile || "");
};
export const shots = () => assets("photo");

export function subscribe(){
  track(onSnapshot(doc(db, "brand", "card"),
    (s) => { cfgDoc = s.exists() ? s.data() : null; render(); }, () => {}));
  track(onSnapshot(query(collection(db, "assets"), orderBy("at", "desc")),
    // כל מי שמציג רשימת צילומים צריך לדעת שהספרייה השתנתה — אחרת
    // ייבוא מהדרייב לא מופיע בבוררים שכבר נטענו.
    (snap) => { library = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); emit("assets"); }, () => {}));
}

/* ===== הקטנה =====
   אותו מנגנון של הקומפוזר, כאן עצמאי כדי ש-card.js לא יהיה תלוי ב-creative.js. */
export function shrink(file, maxPx = ASSET_MAX_PX, quality = ASSET_QUALITY, keepAlpha = false){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("לא הצלחתי לקרוא את הקובץ."));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("הקובץ אינו תמונה תקינה."));
      img.onload = () => {
        const r = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        // הסמל נשמר כ-PNG כדי שהשקיפות תישרד. צילום נשמר כ-JPEG, קטן בהרבה.
        resolve(keepAlpha ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

const loadImage = (src) => new Promise((resolve) => {
  if (!src){ resolve(null); return; }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);       // תמונה שבורה לא מפילה את הכרטיס
  img.src = src;
});

/* ===== שעות =====
   הדרישה שחוזרת בכל פוסט: מה הפתיחה באותו היום. המקור הוא המשמרות
   ששובצו, לא טקסט שמישהו הקליד — כך זה לא יכול לסתור את הלוח.

   שני סייגים שחייבים להיאכף כאן, לא בממשק:

   1. hoursByDay() מחזיר שבעה ימים של *השבוע שמוצג כרגע*. פוסט לתאריך
      בשבוע אחר היה מקבל את שעות השבוע הזה לפי יום בשבוע — כלומר מספרים
      שנראים אמיתיים ואינם. לכן קודם בודקים שהתאריך בכלל בתוך השבוע.
   2. שעות נעשות סופיות רק כשהשבוע ננעל (phase === "locked"). לפני זה
      השיבוץ עוד זז, ופרסום שלהן הוא הבטחה שאפשר להפר. */
const weekIndex = (dateStr) => {
  if (!dateStr || !S.weekStart) return -1;
  const i = Math.round((fromYmd(dateStr) - fromYmd(ymd(S.weekStart))) / 86400000);
  return (i >= 0 && i <= 6) ? i : -1;
};
export const hoursLocked = () => phase() === "locked";

/* known = יש לנו באמת את השעות של התאריך הזה.
   locked = השבוע ננעל, כלומר הן כבר לא ישתנו. */
export function hoursOn(dateStr){
  const i = weekIndex(dateStr);
  if (i < 0) return { day: "", text: "", open: false, known: false, locked: false };
  const list = hoursByDay()[i] || [];
  return { day: DAYS[fromYmd(dateStr).getDay()], text: list.length ? list.join(" · ") : "סגור",
    open: !!list.length, known: true, locked: hoursLocked() };
}
export const hoursLineOn = (dateStr) => {
  const h = hoursOn(dateStr);
  if (!h.known) return "";
  return h.open ? `${h.day} ${h.text}` : `${h.day} — סגור`;
};

/* כל הימים הפתוחים מתאריך הפרסום ועד סוף השבוע. זה מה שקורא רוצה
   לדעת מפוסט סופ״ש: לא "היום", אלא "מתי אפשר להגיע". */
export function hoursAhead(dateStr){
  const from = weekIndex(dateStr);
  if (from < 0) return [];
  const all = hoursByDay();
  const out = [];
  for (let i = from; i <= 6; i++){
    const list = all[i] || [];
    if (!list.length) continue;
    out.push({ day: DAYS[fromYmd(ymd(addDays(S.weekStart, i))).getDay()], text: list.join(" · ") });
  }
  return out;
}

/* כל שבעת הימים, לפוסטר השעות. יום סגור נשאר ברשימה ואומר "סגור" —
   זו בדיוק המידע שמונע נסיעת סרק. */
export function weekHours(){
  const all = hoursByDay();
  return all.map((list, i) => ({
    i, day: DAYS[i], short: DAYS_SHORT[i],
    text: list.length ? list.join("  ") : "סגור", open: !!list.length,
    date: ymd(addDays(S.weekStart, i)),
  }));
}
export const weekRange = () => `${dm(S.weekStart)}–${dm(addDays(S.weekStart, 6))}`;
// היום הפתוח הבא אחרי תאריך נתון. זה מה שאומרים כשסגור.
export function nextOpen(dateStr){
  const from = weekIndex(dateStr);
  if (from < 0) return null;
  return weekHours().slice(from + 1).find(d => d.open) || null;
}

/* ===== הציור ===== */
// הגופנים נטענים מהרשת, ובעצלתיים: document.fonts.ready לבדו חוזר מיד
// כשעוד לא ביקשו אותם, והקנבס מצייר בגופן ברירת המחדל. לכן מבקשים אותם
// במפורש לפי מה שהתצורה מבקשת, ורק אז מציירים.
const fontsDone = new Map();
function loadFonts(c){
  const key = `${c.display}|${c.body}`;
  if (fontsDone.has(key)) return fontsDone.get(key);
  const faces = [`400 100px "${c.display}"`, `700 100px "${c.body}"`, `600 100px "${c.body}"`];
  const job = (async () => {
    try {
      await Promise.all(faces.map(f => document.fonts.load(f, "אבג0123")));
      await document.fonts.ready;
    } catch {}   // בלי גופן מותאם מציירים בברירת המחדל. זה מכוער, לא שבור.
  })();
  fontsDone.set(key, job);
  return job;
}

// שבירת שורות בעברית: מודדים מילה-מילה. אין hyphenation, אז זה מספיק.
function wrap(ctx, text, maxW, maxLines){
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words){
    const next = cur ? cur + " " + w : w;
    if (ctx.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

/* build: צילום + כותרת + תאריך → data URL של הכרטיס המוכן.
   הכול עובר דרך שתי שכבות: היעד (מידה ואזור בטוח) והתצורה (ערכה + דריסות).
   layout הוא רמז מהתבנית בלבד — הוא בוחר ברירות מחדל, לא כופה כלום:
     photo — הצילום גיבור, כותרת בקצה.
     hours — השעות הן התוכן, גדולות.
     quote — הכותרת במרכז, כמו ציטוט. */
const LAYOUT_HINT = {
  photo: {},
  hours: { headlinePos: "top", hoursSize: .072, scrim: .66 },
  quote: { headlinePos: "center", align: "center", scrimStyle: "uniform", scrim: .42 },
  // שני אלה לא מציירים צילום בכלל: הטקסט הוא התוכן, והרקע הוא צבע המותג.
  week:  { headlinePos: "none", showHours: false, scrimStyle: "none", accentBar: false },
  today: { headlinePos: "none", showHours: false, scrimStyle: "none", accentBar: false },
  // הפוסטר השבועי: הצילום כן מצויר, אבל ברצועה אחת ולא כרקע מלא.
  poster: { headlinePos: "none", showHours: false, scrimStyle: "none", accentBar: false, theme: "poster" },
};
const IS_BOARD = (l) => l === "week" || l === "today" || l === "poster";

export async function build(opts = {}){
  const { photo = "", headline = "", date = "", layout = "photo", target = "", mark = "" } = opts;
  // ratio נשאר נתמך לאחור: מי שביקש מידה מקבל את היעד המתאים לה.
  const byRatio = { "4:5": "ig_feed", "1:1": "ig_square", "9:16": "ig_story" };
  const t = targetOf(target || byRatio[opts.ratio] || (cfg().target));
  const c = cfg({ ...(LAYOUT_HINT[layout] || {}), ...(opts.over || {}) });

  const W = t.w, H = t.h;
  // האזור הבטוח של היעד, ועליו השוליים של העיצוב. שום דבר לא נכתב מחוץ לו.
  const inset = {
    top: Math.round(H * t.safe.top + W * c.pad),
    bottom: Math.round(H * t.safe.bottom + W * c.pad),
    left: Math.round(W * t.safe.left + W * c.pad),
    right: Math.round(W * t.safe.right + W * c.pad),
  };
  const box = { x: inset.left, y: inset.top, w: W - inset.left - inset.right, h: H - inset.top - inset.bottom };

  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  await loadFonts(c);

  /* 1. רקע */
  // פוסטר בלי צילום נשאר עם חור באמצע. אם לא נבחר צילום — הראשון
  // בספרייה. רק אם הספרייה ריקה הפוסטר נבנה בלי רצועה, והפריסה
  // מתכווצת סביב זה במקום להשאיר שטח מת.
  const photoSrc = photo || (layout === "poster" ? ((shots()[0] || {}).url || c.posterFile || "") : "");
  const [img, badge] = await Promise.all([loadImage(photoSrc), loadImage(mark || markUrl(c))]);
  ctx.fillStyle = c.bg || "#22303c";
  ctx.fillRect(0, 0, W, H);
  if (img && layout !== "poster"){
    const r = Math.max(W / img.width, H / img.height);
    const w = img.width * r, h = img.height * r;
    // ברקע של לוח הצילום מטושטש לפני שמכסים אותו. טשטוש קודם להלבנה
    // נותן שטח רגוע; הלבנה לבדה משאירה קצוות שמתחרים בטקסט.
    const blur = IS_BOARD(layout) ? (c.washBlur || 0) : 0;
    if (blur) ctx.filter = `blur(${Math.round(W * blur)}px)`;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    ctx.filter = "none";
  }

  /* 2. גוון וההכהיה. בלי אלה טקסט לבן על צילום בהיר פשוט לא נקרא. */
  if (c.tint){ ctx.globalAlpha = c.tintAlpha || .18; ctx.fillStyle = c.tint; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  paintScrim(ctx, W, H, c);

  // שכבות שמתחת לטקסט: טקסטורה, חותמת דהויה, רקע לכותרת
  const layers = Array.isArray(c.overlays) ? c.overlays : [];
  await paintLayers(ctx, layers.filter(o => o && o.back), W, H, c);

  /* 3. מסגרת */
  if (c.frame){
    const fw = Math.max(2, Math.round(W * (c.frameWidth || .008)));
    const m = Math.round(W * .02);          // המסגרת יושבת על גבול האזור הבטוח
    ctx.strokeStyle = c.accent; ctx.lineWidth = fw;
    ctx.strokeRect(box.x - m, box.y - m, box.w + m * 2, box.h + m * 2);
  }

  ctx.direction = "rtl";
  ctx.textBaseline = "alphabetic";

  /* לוח השעות: שבוע שלם או יום אחד. כאן הטקסט הוא התוכן, לא כיתוב על
     צילום — ולכן יש לו מסלול ציור משלו והוא מסיים את הכרטיס. */
  if (IS_BOARD(layout)){
    const board = { W, H, box, c, layout, date, badge, img, logoW: Math.round(W * (c.logoSize || .2)) };
    if (layout === "poster") drawPoster(ctx, board); else drawBoard(ctx, board);
    if (c.showGuides) drawGuides(ctx, W, H, box, t);
    return cv.toDataURL("image/jpeg", .9);
  }

  const alignX = { right: box.x + box.w, center: box.x + box.w / 2, left: box.x };
  ctx.textAlign = c.align === "center" ? "center" : c.align === "left" ? "left" : "right";
  const ax = alignX[c.align] ?? alignX.right;
  const shade = (on) => { ctx.shadowColor = on ? "rgba(0,0,0,0.5)" : "transparent"; ctx.shadowBlur = on ? Math.round(W * .012) : 0; };

  /* 4. הסמל — נטען לפני הכותרת, כי הוא תופס מקום שהכותרת חייבת לכבד */
  const logoW = badge ? Math.round(W * (c.logoSize || .16)) : 0;
  const logoH = badge ? Math.round(logoW * (badge.height / badge.width || 1)) : 0;
  const corner = c.logoCorner || "bottom-left";
  const logoTop = corner.startsWith("top");

  /* 5. שורת השעות — עוגנת לתחתית האזור הבטוח */
  const h = hoursOn(date);
  // הסמל והשעות חולקים את הפס התחתון. זה לצד זה עובד רק כשהם בצדדים
  // נגדיים — סמל במרכז, או באותו צד של הטקסט, חייב שורה לעצמו.
  const sideBySide = !!badge && !logoTop &&
    ((c.align === "right" && corner.endsWith("left")) || (c.align === "left" && corner.endsWith("right")));
  const stacked = !!badge && !logoTop && !sideBySide;
  const bottomLogo = sideBySide ? logoW + Math.round(W * .03) : 0;
  const bottomFloor = box.y + box.h - (stacked ? logoH + Math.round(W * .03) : 0);
  let bottomUsed = stacked ? logoH + Math.round(W * .03) : 0;
  // h.known שומר על הכלל: שעות שאין לנו באמת לתאריך הזה לא נצרבות.
  if (c.showHours !== false && h.known){
    const maxLine = box.w - bottomLogo;
    const hoursText = h.open ? `${h.day} · ${h.text}` : `${h.day} · סגור`;
    let hs = Math.round(W * (c.hoursSize || .046));
    for (; hs > W * .028; hs -= 2){
      ctx.font = `700 ${hs}px "${c.body}", system-ui, sans-serif`;
      if (ctx.measureText(hoursText).width <= maxLine) break;
    }
    let y = bottomFloor;
    shade(c.shadow);
    ctx.fillStyle = c.ink;
    if (c.showWaze !== false && c.waze){
      const wazeText = `${BRAND.place} · ${c.waze}`;
      let ws = Math.round(hs * .72);
      for (; ws > W * .022; ws -= 2){
        ctx.font = `600 ${ws}px "${c.body}", system-ui, sans-serif`;
        if (ctx.measureText(wazeText).width <= maxLine) break;
      }
      ctx.globalAlpha = .85; ctx.fillText(wazeText, ax, y); ctx.globalAlpha = 1;
      y -= ws + Math.round(hs * .3);
      bottomUsed += ws + Math.round(hs * .3);
    }
    ctx.font = `700 ${hs}px "${c.body}", system-ui, sans-serif`;
    ctx.fillText(hoursText, ax, y);
    bottomUsed += hs;
    if (c.accentBar){
      // פס קצר בצבע המותג. זה מה שהופך את השורה לסימן חוזר ולא לעוד טקסט.
      const bw = Math.round(W * .14), bh = Math.max(4, Math.round(W * .007));
      const bx = c.align === "center" ? ax - bw / 2 : c.align === "left" ? ax : ax - bw;
      shade(false);
      ctx.fillStyle = c.accent;
      ctx.fillRect(bx, y - hs - Math.round(hs * .45), bw, bh);
      bottomUsed += Math.round(hs * .45) + bh;
    }
  }

  /* 6. הכותרת */
  if (headline && c.headlinePos !== "none"){
    let size = Math.round(W * (c.headlineSize || .078));
    const topBlocked = logoTop && badge && c.align !== "center" ? logoH + Math.round(W * .03) : 0;
    const maxW = box.w - (c.headlinePos === "top" ? topBlocked * 0 : 0);
    let lines = [];
    for (; size > W * .04; size -= 4){
      ctx.font = `400 ${size}px "${c.display}", system-ui, sans-serif`;
      lines = wrap(ctx, headline, maxW, c.headlineMax || 3);
      const fits = lines.length <= (c.headlineMax || 3) &&
        lines.every(l => ctx.measureText(l).width <= maxW);
      if (fits) break;
    }
    const lh = Math.round(size * 1.22);
    const blockH = lines.length * lh;
    const top = box.y + (logoTop && badge ? logoH + Math.round(W * .03) : 0);
    const avail = box.h - (logoTop && badge ? logoH + Math.round(W * .03) : 0) - bottomUsed - Math.round(W * .04);
    let y = c.headlinePos === "bottom" ? box.y + box.h - bottomUsed - Math.round(W * .05) - blockH + size
          : c.headlinePos === "center" ? top + Math.max(0, (avail - blockH) / 2) + size
          : top + size;

    if (c.block){
      // בלוק אטום מאחורי הכותרת: קריאוּת מלאה גם על צילום עמוס
      const wMax = Math.max(...lines.map(l => ctx.measureText(l).width), 0);
      const px = Math.round(size * .42), py = Math.round(size * .3);
      const bx = c.align === "center" ? ax - wMax / 2 : c.align === "left" ? ax : ax - wMax;
      shade(false);
      ctx.fillStyle = c.accent;
      ctx.globalAlpha = .92;
      ctx.fillRect(bx - px, y - size - py, wMax + px * 2, blockH + py * 2);
      ctx.globalAlpha = 1;
    }
    shade(c.shadow && !c.block);
    ctx.fillStyle = c.ink;
    for (const ln of lines){ ctx.fillText(ln, ax, y); y += lh; }
  }

  /* 7. הסמל, אחרון — הוא תמיד למעלה מבחינה ויזואלית */
  if (badge){
    const lx = corner.endsWith("right") ? box.x + box.w - logoW
             : corner.endsWith("center") ? box.x + (box.w - logoW) / 2 : box.x;
    const ly = logoTop ? box.y : box.y + box.h - logoH;
    shade(c.shadow);
    ctx.drawImage(badge, lx, ly, logoW, logoH);
  }

  /* 8. שכבות שמעל הכול: מדבקות, לוגו של שותף, חותמת, טקסט חופשי */
  await paintLayers(ctx, layers.filter(o => o && !o.back), W, H, c);

  /* 9. קווי עזר — רק בכיוונון, אף פעם לא בפרסום */
  if (c.showGuides){ shade(false); drawGuides(ctx, W, H, box, t); }

  return cv.toDataURL("image/jpeg", .86);
}

/* שכבה חופשית: תמונה מהספרייה או טקסט, בכל מקום על הכרטיס.
   המיקום והגודל הם שברים של המידה, לא פיקסלים — ככה אותה שכבה נוחתת
   באותו מקום יחסי גם בפיד 4:5 וגם בסטורי 9:16.
     { asset } או { text } · x,y (0–1, מרכז) · size · rot · opacity · back */
function drawGuides(ctx, W, H, box, t){
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,80,80,.85)"; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  if (t.grid){
    const side = Math.min(W, H);
    ctx.strokeStyle = "rgba(90,200,255,.85)";
    ctx.strokeRect((W - side) / 2, (H - side) / 2, side, side);
  }
  ctx.restore();
}

/* ===== לוח השעות =====
   זה הפורמט שרץ בעגלה: רשימת הימים, והיום של הפוסט מוקף.
   המקור הוא weekHours() — כלומר המשמרות ששובצו. אין כאן שום מספר
   שמישהו הקליד, ולכן הלוח לא יכול להתנתק מהשיבוץ.

   week  — כל השבוע, היום של הפוסט מסומן.
   today — אותו יום לבדו, גדול. "פתוח 09:00–12:00" או "סגור היום". */
// מספרים ושעות נכתבים משמאל לימין. בלי זה טווח שעות מתהפך והכרטיס
// מכריז שעת סגירה כשעת פתיחה.
function ltr(ctx, text, x, y){
  const d = ctx.direction;
  ctx.direction = "ltr";
  ctx.fillText(text, x, y);
  ctx.direction = d;
}

function drawBoard(ctx, o){
  const { W, H, box, c, layout, date, badge, logoW } = o;
  const days = weekHours();
  const today = weekIndex(date);
  const ink = c.ink, accent = c.accent;

  /* צעיף בצבע הלוח מעל הצילום. wash = 1 מכסה לגמרי (לוח אטום),
     0.88 משאיר רמז של המקום מאחורי הטקסט בלי להתחרות בו. */
  ctx.save();
  ctx.globalAlpha = typeof c.wash === "number" ? c.wash : 1;
  ctx.fillStyle = c.boardBg || "#596d92";
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  const R = box.x + box.w, L = box.x;
  const unit = W / 1080;
  let y = box.y;

  /* כותרת */
  ctx.textAlign = "right"; ctx.fillStyle = ink;
  /* גוש הכותרת לא יעלה על רבע מגובה הלוח. בריבוע, שבו הגובה קטן והרוחב
     לא, הכותרת לפי הרוחב בלבד בלעה את הרשימה והשורות נדרסו זו על זו. */
  const headCap = box.h * (layout === "today" ? .30 : .25);
  const tSize = Math.round(Math.min(W * (layout === "today" ? .078 : .072), headCap / 3.4));
  ctx.font = `400 ${tSize}px "${c.display}", system-ui, sans-serif`;
  y += tSize;
  ctx.fillText(layout === "today" ? "שעות הפעילות היום" : "שעות פעילות השבוע", R, y);
  y += Math.round(tSize * .95);
  ctx.font = `700 ${Math.round(tSize * .82)}px "${c.body}", system-ui, sans-serif`;
  ltr(ctx, weekRange(), R, y);
  y += Math.round(tSize * .8);

  /* פס מפריד */
  ctx.fillStyle = accent;
  ctx.fillRect(R - Math.round(W * .2), y, Math.round(W * .2), Math.max(3, Math.round(W * .006)));
  y += Math.round(tSize * .9);

  if (layout === "today"){
    const d = today >= 0 ? days[today] : null;
    const big = Math.round(W * .13);
    const mid = box.y + (box.h - box.y + box.h) / 2;     // מרכז אזור הגוף
    let ty = box.y + box.h * .38;
    ctx.textAlign = "center";
    const cx = box.x + box.w / 2;

    ctx.font = `400 ${Math.round(big * .62)}px "${c.display}", system-ui, sans-serif`;
    ctx.fillStyle = ink;
    ctx.fillText(d ? "יום " + d.day : "—", cx, ty);

    ty += Math.round(big * .95);
    if (d && d.open){
      ctx.font = `700 ${big}px "${c.body}", system-ui, sans-serif`;
      ctx.fillStyle = ink;
      // כמה חלונות באותו יום — שורה לכל אחד
      for (const part of d.text.split("  ")){
        ltr(ctx, part, cx, ty);
        ty += Math.round(big * 1.12);
      }
      pill(ctx, cx, ty + Math.round(big * .1), "פתוח", Math.round(big * .38), accent, c.boardBg || "#596d92");
    } else {
      ctx.font = `700 ${Math.round(big * .9)}px "${c.body}", system-ui, sans-serif`;
      ctx.fillStyle = accent;
      ctx.fillText("סגור היום", cx, ty);
      const nx = d ? nextOpen(date) : null;
      if (nx){
        ty += Math.round(big * .8);
        ctx.font = `600 ${Math.round(big * .4)}px "${c.body}", system-ui, sans-serif`;
        ctx.fillStyle = ink;
        ctx.fillText(`נתראה ביום ${nx.day}`, cx, ty);
        ty += Math.round(big * .5);
        ltr(ctx, nx.text, cx, ty);
      }
    }
  } else {
    /* טבלת השבוע */
    const rows = days.length;
    const bottom = box.y + box.h - (badge ? Math.round(logoW * 1.25) : 0);
    const gap = Math.max(1, (bottom - y) / rows);
    // הגופן גדל עם המקום שיש, במקום להישאר קטן ולהשאיר חצי כרטיס ריק
    // הרצפה הקודמת (W*.042) הייתה גבוהה מהמרווח בפורמט ריבועי, והשורות
    // נדרסו זו על זו. המרווח הוא מה שקובע, ולו יש רצפה נמוכה בלבד.
    const fs = Math.max(Math.round(W * .028), Math.min(Math.round(W * .08), Math.round(gap * .6)));
    for (let i = 0; i < rows; i++){
      const d = days[i];
      const ry = y + gap * i + gap * .72;
      const on = i === today;

      if (on){
        // ההקפה: זה מה שאומר "היום". אליפסה, כמו סימון ביד.
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(3, Math.round(W * .007));
        ctx.beginPath();
        ctx.ellipse(box.x + box.w / 2, ry - fs * .32, box.w * .52, gap * .46, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (c.rowRule && i){
        ctx.save();
        ctx.globalAlpha = .18;
        ctx.fillStyle = ink;
        ctx.fillRect(box.x, Math.round(y + gap * i), box.w, 1);
        ctx.restore();
      }
      ctx.globalAlpha = d.open ? 1 : .62;
      ctx.fillStyle = ink;
      ctx.textAlign = "right";
      ctx.font = `${on ? 700 : 400} ${fs}px "${c.display}", system-ui, sans-serif`;
      ctx.fillText("יום " + d.short, R - Math.round(W * .02), ry);
      ctx.textAlign = "left";
      ctx.font = `${on ? 700 : 600} ${fs}px "${c.body}", system-ui, sans-serif`;
      ctx.fillStyle = d.open ? ink : accent;
      if (d.open) ltr(ctx, d.text, L + Math.round(W * .02), ry);
      else ctx.fillText(d.text, L + Math.round(W * .02), ry);
      ctx.globalAlpha = 1;
    }
  }

  /* הסמל והמקום */
  if (badge){
    const lh = Math.round(logoW * (badge.height / badge.width || 1));
    const lx = box.x, ly = box.y + box.h - lh;
    ctx.drawImage(badge, lx, ly, logoW, lh);
    ctx.textAlign = "right"; ctx.fillStyle = ink;
    const ns = Math.round(W * .036);
    ctx.font = `700 ${ns}px "${c.body}", system-ui, sans-serif`;
    ctx.fillText(BRAND.name, R, ly + Math.round(lh * .45));
    ctx.font = `600 ${Math.round(ns * .85)}px "${c.body}", system-ui, sans-serif`;
    ctx.globalAlpha = .85;
    ctx.fillText(`${BRAND.place} · ${c.waze || ""}`, R, ly + Math.round(lh * .45) + Math.round(ns * 1.15));
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ===== הפוסטר השבועי =====
   הפורמט שנבחר: לוגו, "שעות פתיחה", טווח התאריכים, שבע שורות ימים,
   רצועת צילום עם משפט, ופוטר עם QR.

   מה שמחזיק אותו נכון לאורך זמן: כל מספר כאן מגיע מ-weekHours(), כלומר
   מהמשמרות ששובצו. אין כאן טקסט שמישהו מקליד, ולכן פוסטר לא יכול
   להכריז שעות שסותרות את הלוח.

   היום של הפרסום מודגש — לוח רך בצבע המותג, פס בקצה, וכתב מודגש.
   זה מה שהופך פוסטר שבועי אחד לשבעה פוסטים יומיים. */
function coverRect(ctx, img, dx, dy, dw, dh, focusY = .5){
  if (!img) return;
  const r = Math.max(dw / img.width, dh / img.height);
  const w = img.width * r, h = img.height * r;
  ctx.save(); ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
  ctx.drawImage(img, dx + (dw - w) / 2, dy + (dh - h) * focusY, w, h);
  ctx.restore();
}

// "יום א" עד "יום ה", ואז "שישי" ו"שבת" — כמו שכתוב על הפוסטר בעגלה.
const dayLabel = (i) => i < 5 ? "יום " + DAYS_SHORT[i] : DAYS[i];

/* הכתובת שה-QR מצביע עליה. מזהה העמוד מגיע מהשרת ונשמר בתצורה, כי
   כתובת שמבוססת על מזהה לא נשברת כששם המשתמש של העמוד משתנה. */
export function qrLinks(c = cfg()){
  const out = [];
  const which = c.qrWhich || "fb";
  const fb = c.qrFbUrl || (c.fbPageId ? `https://www.facebook.com/${c.fbPageId}` : "");
  if ((which === "fb" || which === "both") && fb) out.push({ url: fb, label: "פייסבוק" });
  if ((which === "ig" || which === "both") && BRAND.ig) out.push({ url: `https://instagram.com/${BRAND.ig}`, label: "אינסטגרם" });
  return out;
}

function drawPoster(ctx, o){
  const { W, H, box, c, date, badge, img } = o;
  const days = weekHours();
  const today = weekIndex(date);
  const ink = c.ink, accent = c.accent, bg = c.boardBg || "#f7eaca";
  const u = box.h / 1500;                 // כל המידות נגזרות מגובה האזור הבטוח
  const px = (n) => Math.round(n * u);
  ctx.save();
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const cx = box.x + box.w / 2;
  let y = box.y;
  ctx.textAlign = "center";

  /* הסמל */
  if (badge){
    const sw = px(124), sh = Math.round(sw * (badge.height / badge.width || 1));
    ctx.drawImage(badge, cx - sw / 2, y, sw, sh);
    y += sh + px(26);
  }

  /* הכותרת וטווח התאריכים */
  const tSize = px(78);
  ctx.fillStyle = ink;
  ctx.font = `400 ${tSize}px "${c.display}", system-ui, sans-serif`;
  y += tSize;
  ctx.fillText("שעות פתיחה", cx, y);
  y += px(48);
  ctx.fillStyle = accent;
  ctx.font = `700 ${px(44)}px "${c.body}", system-ui, sans-serif`;
  ltr(ctx, weekRange(), cx, y);

  /* הקו המפריד עם הנקודה */
  y += px(34);
  const dw = px(195), dgap = px(55);
  ctx.save(); ctx.globalAlpha = .3; ctx.fillStyle = ink;
  ctx.fillRect(cx - dgap - dw, y, dw, 2);
  ctx.fillRect(cx + dgap, y, dw, 2);
  ctx.restore();
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(cx, y + 1, Math.max(3, px(6)), 0, Math.PI * 2); ctx.fill();
  y += px(38);

  /* הפוטר נקבע ראשון — הוא לא תלוי בשורות, והשורות כן תלויות בו. */
  const links = qrLinks(c);
  const footH = links.length ? px(210) : px(140);
  const footTop = box.y + box.h - footH;

  /* שבע השורות. עם רצועת צילום הן בגובה קבוע; בלעדיה הן מתרחבות
     וממלאות את המקום, כדי שלא יישאר שטח ריק באמצע הפוסטר. */
  const panelW = Math.round(box.w * .94), panelX = cx - panelW / 2;
  const space = footTop - px(46) - y;
  const rh = img ? px(62) : Math.max(px(62), Math.min(px(104), Math.floor(space / days.length)));
  if (!img) y += Math.max(0, Math.floor((space - rh * days.length) / 2));

  for (let i = 0; i < days.length; i++){
    const d = days[i], on = i === today;
    if (on){
      // ההדגשה של היום: לוח רך, ופס בצבע המותג בקצה.
      ctx.save();
      ctx.globalAlpha = .12; ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(panelX - px(16), y + px(3), panelW + px(32), rh - px(6), px(14));
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillRect(panelX + panelW + px(16) - px(6), y + px(3), px(6), rh - px(6));
      ctx.restore();
    } else if (c.rowRule){
      ctx.save(); ctx.globalAlpha = .12; ctx.fillStyle = ink;
      ctx.fillRect(panelX, y + rh - 1, panelW, 1); ctx.restore();
    }

    ctx.textAlign = "right";
    ctx.fillStyle = on ? accent : ink;
    ctx.font = `700 ${px(on ? 42 : 38)}px "${c.body}", system-ui, sans-serif`;
    ctx.fillText(dayLabel(i), panelX + panelW, y + rh * .68);

    ctx.textAlign = "left";
    ctx.font = `${on ? 700 : 600} ${px(on ? 40 : 36)}px "${c.body}", system-ui, sans-serif`;
    if (d.open){
      ctx.fillStyle = on ? accent : ink;
      ltr(ctx, d.text.split("  ").join("   ·   "), panelX, y + rh * .68);
    } else {
      ctx.fillStyle = accent;
      ctx.globalAlpha = on ? 1 : .82;
      ctx.fillText("סגור", panelX, y + rh * .68);
      ctx.globalAlpha = 1;
    }
    y += rh;
  }

  /* רצועת הצילום — מקבלת את כל מה שנשאר בין השורות לפוטר.
     המשפט יושב בתוכה, על הצללה, במקום לגזול רצועה לעצמו. */
  if (img){
    const heroTop = y + px(24);
    const heroH = Math.max(px(200), footTop - px(46) - heroTop);
    coverRect(ctx, img, 0, heroTop, W, heroH, typeof c.posterFocus === "number" ? c.posterFocus : .5);
    const fadeT = px(70), fadeB = px(80);
    const gT = ctx.createLinearGradient(0, heroTop, 0, heroTop + fadeT);
    gT.addColorStop(0, bg); gT.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gT; ctx.fillRect(0, heroTop, W, fadeT);
    const gB = ctx.createLinearGradient(0, heroTop + heroH - fadeB, 0, heroTop + heroH);
    gB.addColorStop(0, "rgba(0,0,0,0)"); gB.addColorStop(1, bg);
    ctx.fillStyle = gB; ctx.fillRect(0, heroTop + heroH - fadeB, W, fadeB);

    if (c.posterTag){
      // לבן על צילום בהיר לא נקרא — לכן הצללה מתחת למשפט, תמיד.
      const scrimH = px(118), scrimBot = heroTop + heroH - fadeB;
      const gS = ctx.createLinearGradient(0, scrimBot - scrimH, 0, scrimBot);
      gS.addColorStop(0, "rgba(0,0,0,0)"); gS.addColorStop(1, "rgba(0,0,0,.58)");
      ctx.fillStyle = gS; ctx.fillRect(0, scrimBot - scrimH, W, scrimH);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff";
      ctx.font = `400 ${px(42)}px "${c.display}", system-ui, sans-serif`;
      ctx.fillText(c.posterTag, cx, scrimBot - px(16));
    }
  } else if (c.posterTag){
    // בלי צילום המשפט עדיין נאמר — בצבע הטקסט, מעל הפוטר.
    ctx.textAlign = "center"; ctx.fillStyle = ink;
    ctx.globalAlpha = .75;
    ctx.font = `400 ${px(40)}px "${c.display}", system-ui, sans-serif`;
    ctx.fillText(c.posterTag, cx, footTop - px(40));
    ctx.globalAlpha = 1;
  }

  /* הפוטר */
  ctx.save(); ctx.globalAlpha = .26; ctx.fillStyle = ink;
  ctx.fillRect(box.x, footTop, box.w, 2); ctx.restore();

  let textLeft = box.x;
  if (links.length){
    const qs = Math.min(px(172), Math.round(box.w * .19));
    let qx = box.x;
    for (const link of links){
      // אזור שקט של שלושה מודולים לפחות — בלעדיו סורקים רבים לא רואים את הקוד
      drawQR(ctx, link.url, qx, footTop + px(22), qs, { dark: ink, light: bg, quiet: 3 });
      ctx.textAlign = "center"; ctx.fillStyle = ink;
      ctx.font = `600 ${px(24)}px "${c.body}", system-ui, sans-serif`;
      ctx.globalAlpha = .75;
      ctx.fillText(link.label, qx + qs / 2, footTop + px(22) + qs + px(28));
      ctx.globalAlpha = 1;
      qx += qs + px(22);
    }
    textLeft = qx + px(24);
  }

  const fy = footTop + px(74), fy2 = fy + px(46);
  ctx.textAlign = "right"; ctx.fillStyle = ink;
  ctx.font = `700 ${px(38)}px "${c.body}", system-ui, sans-serif`;
  ctx.fillText(BRAND.place, box.x + box.w, fy);
  ctx.font = `600 ${px(30)}px "${c.body}", system-ui, sans-serif`;
  ctx.globalAlpha = .7;
  ctx.fillText(c.waze || "", box.x + box.w, fy2);
  ctx.globalAlpha = 1;

  ctx.textAlign = "left";
  ctx.font = `700 ${px(38)}px "${c.body}", system-ui, sans-serif`;
  ctx.fillText(BRAND.name, textLeft, fy);
  ctx.font = `600 ${px(30)}px "${c.body}", system-ui, sans-serif`;
  ctx.globalAlpha = .7;
  ltr(ctx, "@" + BRAND.ig, textLeft, fy2);
  ctx.globalAlpha = 1;

  ctx.restore();
}

// תגית עגולה עם טקסט במרכזה
function pill(ctx, cx, cy, text, size, bg, fg){
  ctx.save();
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  const w = ctx.measureText(text).width, px = size * .7, r = size * .95;
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(cx - w / 2 - px, cy - r, w + px * 2, r * 2, r); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy);
  ctx.restore();
  ctx.textBaseline = "alphabetic";
}

async function paintLayers(ctx, list, W, H, c){
  for (const o of list){
    if (!o) continue;
    const x = Math.round(W * (typeof o.x === "number" ? o.x : .5));
    const y = Math.round(H * (typeof o.y === "number" ? o.y : .5));
    ctx.save();
    ctx.globalAlpha = typeof o.opacity === "number" ? o.opacity : 1;
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot * Math.PI / 180);
    if (o.text){
      const size = Math.round(W * (o.size || .05));
      ctx.direction = "rtl"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `700 ${size}px "${o.font || c.body}", system-ui, sans-serif`;
      if (o.pill){
        // גלולה מאחורי הטקסט: תג מחיר, "חדש", שעת אירוע
        const w = ctx.measureText(o.text).width, px = size * .55, r = size * .8;
        ctx.fillStyle = o.pillColor || c.accent;
        ctx.beginPath();
        ctx.roundRect(-w / 2 - px, -r, w + px * 2, r * 2, r);
        ctx.fill();
      }
      ctx.fillStyle = o.color || c.ink;
      ctx.fillText(o.text, 0, 0);
    } else {
      const a = assetOf(o.asset);
      const img = await loadImage((a && a.url) || o.url || "");
      if (img){
        const w = Math.round(W * (o.size || .2));
        const h = Math.round(w * (img.height / img.width || 1));
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      }
    }
    ctx.restore();
  }
}

function paintScrim(ctx, W, H, c){
  const a = c.scrim || 0;
  if (!a || c.scrimStyle === "none") return;
  if (c.scrimStyle === "uniform"){ ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H); return; }
  if (c.scrimStyle === "band"){
    // פס אטום בתחתית במקום מעבר. קריא מאוד, ומרגיש כמו כרזה.
    const bh = Math.round(H * .26);
    ctx.fillStyle = `rgba(0,0,0,${Math.min(.92, a + .15)})`;
    ctx.fillRect(0, H - bh, W, bh);
    return;
  }
  const g = ctx.createLinearGradient(0, H * .28, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const top = ctx.createLinearGradient(0, 0, 0, H * .34);
  top.addColorStop(0, `rgba(0,0,0,${Math.min(.45, a * .6)})`); top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * .34);
}

// אותו כרטיס לכמה יעדים בלחיצה אחת. זה מה שהופך "פייסבוק + אינסטגרם + סטורי"
// משלוש עבודות לאחת.
export async function buildAll(keys, opts = {}){
  const list = (keys && keys.length ? keys : [cfg().target]);
  const out = [];
  for (const k of list) out.push({ target: targetOf(k), url: await build({ ...opts, target: k }) });
  return out;
}

// ממוזערת של הכרטיס, לשמירה במסמך הפוסט (הלוח מצייר ממנה).
export async function thumbOf(dataUrl, px = 240){
  const img = await loadImage(dataUrl);
  if (!img) return "";
  const r = Math.min(1, px / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.5);
}

/* ===== המלאי: שמירה ===== */
/* הוספה לספרייה. סמל ומדבקה נשמרים כ-PNG כדי שהשקיפות תישרד; צילום
   כ-JPEG, שהוא קטן בהרבה. כל פריט במסמך משלו, אז אין תקרה מעשית. */
export async function addAsset(file, kind = "photo", name = "", pillar = ""){
  const isMark = kind === "logo" || kind === "sticker";
  const url = await shrink(file, isMark ? MARK_MAX_PX : ASSET_MAX_PX, ASSET_QUALITY, isMark);
  if (url.length > 900000) throw new Error("התמונה כבדה מדי אחרי ההקטנה. נסה קובץ קטן יותר.");
  const id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await setDoc(doc(db, "assets", id), {
    name: name || file.name.replace(/\.[^.]+$/, "").slice(0, 40) || KINDS[kind],
    kind, pillar: pillar || "", url, at: serverTimestamp(),
  });
  return id;
}
export const setPillar = (id, pillar) => setDoc(doc(db, "assets", id), { pillar: pillar || "" }, { merge: true });
// צילומים של נושא מסוים. זה מה שמאפשר לתבנית לבחור תמונה לבד.
export const shotsFor = (pillar) => {
  const all = assets("photo");
  const hit = pillar ? all.filter(a => a.pillar === pillar) : [];
  return hit.length ? hit : all;
};
export const dropAsset = (id) => deleteDoc(doc(db, "assets", id));
export const renameAsset = (id, name) => setDoc(doc(db, "assets", id), { name: String(name).slice(0, 40) }, { merge: true });
export const saveCfg = (patch) => setDoc(doc(db, "brand", "card"), patch, { merge: true });

/* ===== הספרייה: תצוגה ===== */
let onPick = null;
export const onPickShot = (fn) => { onPick = fn; };

/* הנושא של הצילום. בלי זה "תמונה מהספרייה" היא ערימה אחת, ותבנית
   לא יכולה לבחור ממנה כלום. */
let pillarList = [];
export const setPillars = (obj) => { pillarList = Object.entries(obj || {}).map(([k, v]) => [k, v.label || k]); render(); };
function pillarPicker(a){
  if (!pillarList.length) return el("span", { class: "kindtag", text: "" });
  const sel = el("select", { class: "apillar", onchange: (e) => setPillar(a.id, e.target.value) });
  sel.append(el("option", { value: "", text: "בלי נושא", selected: !a.pillar }));
  for (const [k, label] of pillarList)
    sel.append(el("option", { value: k, text: label, selected: a.pillar === k }));
  return sel;
}

function assetCard(a){
  return el("figure", { class: "asset" },
    el("img", { src: a.url, alt: a.name, title: a.name,
      class: a.kind === "photo" ? "" : "trans",
      onclick: () => onPick && onPick(a) }),
    el("figcaption", { class: "small" },
      el("input", { class: "aname", type: "text", value: a.name,
        onchange: (e) => renameAsset(a.id, e.target.value) }),
      a.kind === "photo" ? pillarPicker(a) : el("span", { class: "kindtag", text: KINDS[a.kind] || "" }),
      el("button", { class: "link", text: "מחק", onclick: () => {
        if (confirm(`למחוק את "${a.name}"?`)) dropAsset(a.id);
      } })));
}

function render(){
  // העיצוב מתעדכן גם כשמישהו אחר שינה אותו במכשיר שני
  if ($("dsControls") && !Object.keys(draft).length){ renderDesigner(); paint(); }
  const box = $("assetList");
  if (!box) return;
  clear(box);
  if (!library.length){
    box.append(el("p", { class: "small", text: "הספרייה ריקה. העלה סמל, צילום של העגלה, או כל תמונה אחרת — ומשם אפשר לשים אותה על כל כרטיס." }));
    return;
  }
  const filter = ($("assetFilter") && $("assetFilter").value) || "";
  const list = filter ? library.filter(a => a.kind === filter) : library;
  for (const kind of ["logo", "photo", "sticker"]){
    const items = list.filter(a => a.kind === kind);
    if (!items.length) continue;
    box.append(el("h4", { class: "small kindhead", text: KINDS[kind] }));
    const grid = el("div", { class: "assets" });
    items.forEach(a => grid.append(assetCard(a)));
    box.append(grid);
  }
}

export function bind(){
  const f = $("assetFile");
  if (f) f.addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])];
    const kind = ($("assetKind") && $("assetKind").value) || "photo";
    const st = $("assetStatus");
    for (const file of files){
      if (file.size > 12 * 1024 * 1024){ if (st) st.textContent = `${file.name} גדול מ-12MB.`; continue; }
      try { await addAsset(file, kind); if (st) st.textContent = `${file.name} נוסף.`; }
      catch (err){ if (st) st.textContent = err.message; }
    }
    e.target.value = "";
  });
  const filter = $("assetFilter");
  if (filter) filter.addEventListener("change", render);
  render();
}

/* ===== פאנל העיצוב =====
   כל מה שב-CARD ניתן לכיוונון כאן, עם תצוגה חיה. הפקדים נבנים מרשימה
   אחת — להוסיף כפתור לשדה חדש זו שורה, לא טופס. */
const CONTROLS = [
  { k: "theme",       t: "select", label: "ערכה",        opts: () => Object.entries(THEMES).map(([v, o]) => [v, o.label]) },
  { k: "align",       t: "select", label: "יישור",       opts: () => [["right", "ימין"], ["center", "מרכז"], ["left", "שמאל"]] },
  { k: "headlinePos", t: "select", label: "מיקום כותרת", opts: () => [["top", "למעלה"], ["center", "מרכז"], ["bottom", "למטה"], ["none", "בלי כותרת"]] },
  { k: "headlineSize",t: "range",  label: "גודל כותרת",  min: .04, max: .13, step: .004 },
  { k: "headlineMax", t: "range",  label: "שורות כותרת", min: 1,   max: 5,   step: 1 },
  { k: "display",     t: "select", label: "גופן כותרת",  opts: () => FONTS },
  { k: "body",        t: "select", label: "גופן גוף",    opts: () => FONTS },
  { k: "ink",         t: "color",  label: "צבע טקסט" },
  { k: "accent",      t: "color",  label: "צבע מותג" },
  { k: "bg",          t: "color",  label: "רקע בלי צילום" },
  { k: "markId",      t: "select", label: "הסמל הקבוע",
    opts: () => [["", "הסבתא (ברירת מחדל)"], ...assets("logo").map(a => [a.id, a.name]), ["none", "בלי סמל"]] },
  { k: "logoCorner",  t: "select", label: "פינת הסמל",   opts: () => [["bottom-left", "שמאל למטה"], ["bottom-right", "ימין למטה"], ["bottom-center", "מרכז למטה"], ["top-left", "שמאל למעלה"], ["top-right", "ימין למעלה"], ["top-center", "מרכז למעלה"]] },
  { k: "logoSize",    t: "range",  label: "גודל הסמל",   min: .06, max: .34, step: .01 },
  { k: "scrimStyle",  t: "select", label: "הכהיה",       opts: () => [["gradient", "מעבר"], ["uniform", "אחידה"], ["band", "פס תחתון"], ["none", "בלי"]] },
  { k: "scrim",       t: "range",  label: "עוצמת הכהיה", min: 0,   max: .9,  step: .03 },
  { k: "tint",        t: "color",  label: "גוון מעל הצילום" },
  { k: "tintAlpha",   t: "range",  label: "עוצמת הגוון", min: 0,   max: .6,  step: .03 },
  { k: "hoursSize",   t: "range",  label: "גודל השעות",  min: .03, max: .11, step: .004 },
  { k: "showHours",   t: "check",  label: "שעות על התמונה" },
  { k: "showWaze",    t: "check",  label: "מיקום וניווט" },
  { k: "waze",        t: "text",   label: "שורת הניווט" },
  { k: "accentBar",   t: "check",  label: "פס צבע מעל השעות" },
  { k: "frame",       t: "check",  label: "מסגרת" },
  { k: "block",       t: "check",  label: "בלוק מאחורי הכותרת" },
  { k: "shadow",      t: "check",  label: "צל לטקסט" },
  { k: "showGuides",  t: "check",  label: "הצג אזור בטוח (לכיוונון בלבד)" },
];
// גופנים שנטענים ב-index.html. להוסיף גופן = להוסיף אותו שם ופה.
const FONTS = [["Secular One", "Secular One"], ["Assistant", "Assistant"], ["Heebo", "Heebo"],
  ["Rubik", "Rubik"], ["Alef", "Alef"], ["Frank Ruhl Libre", "Frank Ruhl Libre"]];

let draft = {};                 // מה שמכוונים כרגע, לפני שמירה
let sampleShot = "";            // הצילום שמוצג בתצוגה
export const setSample = (url) => { sampleShot = url; paint(); };

function designPreviewTarget(){
  const sel = $("dsTarget");
  return sel && sel.value ? sel.value : cfg().target;
}

let painting = false, again = false;
async function paint(){
  const box = $("dsPreview");
  if (!box) return;
  if (painting){ again = true; return; }        // מכווננים מהר יותר מהציור
  painting = true;
  try {
    const url = await build({
      photo: sampleShot || (shots()[0] || {}).url || "",
      headline: ($("dsText") && $("dsText").value) || "הכוס הזאת, והנוף הזה",
      date: ($("dsDate") && $("dsDate").value) || "",
      target: designPreviewTarget(),
      over: draft,
    });
    clear(box).append(el("img", { src: url, alt: "תצוגה מקדימה של הכרטיס" }));
    const t = targetOf(designPreviewTarget());
    const note = $("dsNote");
    if (note) note.textContent = `רוחב ${t.w} · גובה ${t.h} — ${t.note}`;
  } catch (e){ console.error(e); }
  painting = false;
  if (again){ again = false; paint(); }
}

function control(spec){
  const c = cfg(draft);
  const id = "ds_" + spec.k;
  const set = (v) => {
    draft = { ...draft, [spec.k]: v };
    // ערכה מחליפה חבילה שלמה, אז הדריסות הישנות יורדות איתה
    if (spec.k === "theme") draft = { theme: v };
    renderDesigner();
    paint();
  };
  if (spec.t === "check")
    return el("label", { class: "check", for: id },
      el("input", { type: "checkbox", id, checked: !!c[spec.k], onchange: (e) => set(e.target.checked) }),
      spec.label);
  if (spec.t === "select"){
    const sel = el("select", { id, onchange: (e) => set(e.target.value) });
    for (const [v, t] of spec.opts()) sel.append(el("option", { value: v, text: t, selected: String(c[spec.k]) === v }));
    return el("label", { for: id }, spec.label, sel);
  }
  if (spec.t === "range")
    return el("label", { for: id }, `${spec.label} — ${Math.round((c[spec.k] || 0) * 1000) / 1000}`,
      el("input", { type: "range", id, min: spec.min, max: spec.max, step: spec.step,
        value: c[spec.k], oninput: (e) => set(Number(e.target.value)) }));
  if (spec.t === "color")
    return el("label", { for: id }, spec.label,
      el("input", { type: "color", id, value: c[spec.k] || "#000000", oninput: (e) => set(e.target.value) }));
  return el("label", { for: id }, spec.label,
    el("input", { type: "text", id, value: c[spec.k] || "", oninput: (e) => set(e.target.value) }));
}

export function renderDesigner(){
  const box = $("dsControls");
  if (!box) return;
  clear(box);
  for (const spec of CONTROLS) box.append(control(spec));
  renderLayers();
  const dirty = Object.keys(draft).length > 0;
  const bar = $("dsBar");
  if (bar){
    clear(bar);
    bar.append(el("button", { class: "primary", text: dirty ? "שמור עיצוב" : "שמור עיצוב", disabled: !dirty,
      onclick: async () => { await saveCfg(draft); draft = {}; renderDesigner(); paint(); } }));
    bar.append(el("button", { class: "link", text: "בטל שינויים", disabled: !dirty,
      onclick: () => { draft = {}; renderDesigner(); paint(); } }));
    bar.append(el("button", { class: "link", text: "חזור לברירת המחדל",
      onclick: async () => { await saveCfg({ ...CARD }); draft = {}; renderDesigner(); paint(); } }));
  }
}

export function bindDesigner(){
  const t = $("dsTarget");
  if (t){
    clear(t);
    for (const x of TARGETS) t.append(el("option", { value: x.key, text: x.label }));
    t.value = cfg().target;
    t.addEventListener("change", paint);
  }
  const txt = $("dsText"); if (txt) txt.addEventListener("input", paint);
  const dt = $("dsDate");  if (dt) dt.addEventListener("change", paint);
  renderDesigner();
  paint();
}

/* ===== עורך השכבות =====
   כל מה שמעבר לסמל הקבוע ולשעות: תמונה נוספת, לוגו של שותף, מדבקה,
   חותמת, או טקסט חופשי. המיקום בשברים, אז שכבה אחת נוחתת נכון בכל
   שישה השיבוצים בלי לכוון מחדש. */
const layers = () => (cfg(draft).overlays || []).map(o => ({ ...o }));
function setLayers(list){
  draft = { ...draft, overlays: list };
  renderDesigner(); paint();
}
const patchLayer = (i, patch) => setLayers(layers().map((o, n) => n === i ? { ...o, ...patch } : o));

function layerRow(o, i){
  const num = (label, key, min, max, step) => el("label", { for: `lay${i}_${key}` },
    `${label} — ${Math.round((o[key] ?? 0) * 100) / 100}`,
    el("input", { type: "range", id: `lay${i}_${key}`, min, max, step, value: o[key] ?? 0,
      oninput: (e) => patchLayer(i, { [key]: Number(e.target.value) }) }));

  const head = el("div", { class: "layhead" },
    el("b", { text: o.text ? `טקסט: ${o.text.slice(0, 18)}` : ((assetOf(o.asset) || {}).name || "תמונה") }),
    el("button", { class: "link", text: "↑", title: "העלה שכבה", disabled: i === 0,
      onclick: () => { const l = layers(); [l[i - 1], l[i]] = [l[i], l[i - 1]]; setLayers(l); } }),
    el("button", { class: "link", text: "מחק", onclick: () => setLayers(layers().filter((_, n) => n !== i)) }));

  const body = el("div", { class: "dsgrid" });
  if (o.text){
    body.append(el("label", { for: `lay${i}_t` }, "הטקסט",
      el("input", { type: "text", id: `lay${i}_t`, value: o.text,
        oninput: (e) => patchLayer(i, { text: e.target.value }) })));
    body.append(el("label", { for: `lay${i}_c` }, "צבע",
      el("input", { type: "color", id: `lay${i}_c`, value: o.color || "#ffffff",
        oninput: (e) => patchLayer(i, { color: e.target.value }) })));
    body.append(el("label", { class: "check", for: `lay${i}_p` },
      el("input", { type: "checkbox", id: `lay${i}_p`, checked: !!o.pill,
        onchange: (e) => patchLayer(i, { pill: e.target.checked }) }), "רקע גלולה"));
  } else {
    const sel = el("select", { id: `lay${i}_a`, onchange: (e) => patchLayer(i, { asset: e.target.value }) });
    for (const a of assets()) sel.append(el("option", { value: a.id, text: `${KINDS[a.kind]}: ${a.name}`, selected: a.id === o.asset }));
    body.append(el("label", { for: `lay${i}_a` }, "מהספרייה", sel));
  }
  body.append(num("אופקי", "x", 0, 1, .01));
  body.append(num("אנכי", "y", 0, 1, .01));
  body.append(num("גודל", "size", .02, .9, .01));
  body.append(num("שקיפות", "opacity", .05, 1, .05));
  body.append(num("סיבוב", "rot", -45, 45, 1));
  body.append(el("label", { class: "check", for: `lay${i}_b` },
    el("input", { type: "checkbox", id: `lay${i}_b`, checked: !!o.back,
      onchange: (e) => patchLayer(i, { back: e.target.checked }) }), "מתחת לטקסט"));
  return el("div", { class: "layer" }, head, body);
}

export function renderLayers(){
  const box = $("dsLayers");
  if (!box) return;
  clear(box);
  const list = layers();
  list.forEach((o, i) => box.append(layerRow(o, i)));
  if (!list.length) box.append(el("p", { class: "small", text: "אין שכבות. הכרטיס מציג את הסמל הקבוע, הכותרת והשעות בלבד." }));
  box.append(el("div", { class: "actions" },
    el("button", { text: "+ תמונה מהספרייה", disabled: !assets().length,
      onclick: () => setLayers([...layers(), { asset: assets()[0].id, x: .5, y: .5, size: .22, opacity: 1, rot: 0 }]) }),
    el("button", { text: "+ טקסט",
      onclick: () => setLayers([...layers(), { text: "טקסט", x: .5, y: .5, size: .05, opacity: 1, rot: 0, pill: true }]) })));
  if (!assets().length)
    box.append(el("p", { class: "small", text: "כדי להוסיף תמונה צריך קודם להעלות אותה לספרייה." }));
}
