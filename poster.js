// מחולל תמונת הפוסט. הצילום שלך, הטיפוגרפיה שלנו. הכל בדפדפן, בלי שרת.
import { S, $, el, clear, DAYS, dm, addDays, status, download, on, api, withBusy, WORKER_URL } from "./core.js";
import { hoursByDay } from "./shifts.js";

const SIZES = { portrait: [1080, 1350], square: [1080, 1080], story: [1080, 1920] };

const THEMES = {
  cream:  { bg: "#F1EBE0", ink: "#22201C", accent: "#2C5A87", sub: "#6B655C" },
  night:  { bg: "#1A1D19", ink: "#F2EFE8", accent: "#D8B36A", sub: "#A7A79C" },
  olive:  { bg: "#3C4A36", ink: "#F4F1E6", accent: "#E0C27C", sub: "#BFC4B2" },
  clay:   { bg: "#A8654A", ink: "#FDF6EC", accent: "#F3D9A4", sub: "#EBCDBB" },
};
const THEME_LABEL = { cream: "שמנת", night: "לילה", olive: "זית", clay: "חמרה" };
const LAYOUTS = { photo: "תמונה עם טקסט", plain: "טקסט בלבד", hours: "לוח שעות" };

/* ===== תבניות =====
   3 גדלים × 4 ערכות × 3 פריסות = 36 צירופים, ועוד שלושה שדות טקסט. זה ביקש
   מהבעלים להיות מעצב. במקום זה: ארבע תבניות. הטקסט נלקח מהפוסט לבד, והפקדים
   יורדים ל"לשנות ידנית" — לא נמחקים, רק מפסיקים להיות השלב הראשון. */
const TEMPLATES = [
  { key: "daily",   label: "יומיומי", hint: "הצילום שלך",     layout: "photo", theme: "cream", size: "portrait" },
  { key: "hours",   label: "שעות",    hint: "מתי ואיפה",       layout: "hours", theme: "olive", size: "portrait" },
  { key: "special", label: "מיוחד",   hint: "חג, אירוע",       layout: "photo", theme: "night", size: "portrait" },
  { key: "free",    label: "פתוח",    hint: "תאר במילים",      free: true },
];
let activeTpl = "";

let photo = null;   // HTMLImageElement
let ready = false;
let canvas = null;

const state = { layout: "photo", theme: "cream", size: "portrait", head: "", sub: "", badge: "" };

/* ===== ציור ===== */
function wrap(ctx, text, maxWidth){
  const out = [];
  for (const para of String(text || "").split("\n")){
    if (!para.trim()){ out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)){
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line){ out.push(line); line = word; }
      else line = test;
    }
    if (line) out.push(line);
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(){
  const [W, H] = SIZES[state.size] || SIZES.portrait;
  const t = THEMES[state.theme] || THEMES.cream;
  if (!canvas) canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "right";
  ctx.direction = "rtl";

  const pad = Math.round(W * 0.085);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);

  let textTop = pad;

  if (state.layout === "photo" && photo){
    // התמונה ממלאת את הפריים, והטקסט יושב על שיפוע כהה בתחתית
    const scale = Math.max(W / photo.width, H / photo.height);
    const dw = photo.width * scale, dh = photo.height * scale;
    ctx.drawImage(photo, (W - dw) / 2, (H - dh) / 2, dw, dh);
    const g = ctx.createLinearGradient(0, H * 0.32, 0, H);
    g.addColorStop(0, "rgba(10,10,8,0)");
    g.addColorStop(0.55, "rgba(10,10,8,0.62)");
    g.addColorStop(1, "rgba(10,10,8,0.92)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (state.layout === "photo" && !photo){
    // בלי צילום — זוהר חם מהפינה, כדי שזה לא ייראה כמו טופס ריק
    const g = ctx.createRadialGradient(W * 0.78, H * 0.22, W * 0.05, W * 0.5, H * 0.6, H * 0.95);
    g.addColorStop(0, t.accent + "3A");
    g.addColorStop(1, t.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = t.accent + "55"; ctx.lineWidth = Math.max(2, W * 0.004);
    const m = W * 0.045;
    roundRect(ctx, m, m, W - m*2, H - m*2, W * 0.03); ctx.stroke();
  }

  const onPhoto = state.layout === "photo" && photo;
  const ink = onPhoto ? "#FFFFFF" : t.ink;
  const subInk = onPhoto ? "rgba(255,255,255,.82)" : t.sub;

  /* ---- לוח שעות ---- */
  if (state.layout === "hours"){
    const hrs = hoursByDay();
    ctx.fillStyle = t.accent;
    ctx.font = `600 ${Math.round(W*0.035)}px Assistant, sans-serif`;
    ctx.fillText(state.badge || "שעות השבוע", W - pad, pad + W*0.04);

    ctx.fillStyle = t.ink;
    ctx.font = `400 ${Math.round(W*0.075)}px "Secular One", sans-serif`;
    ctx.fillText(state.head || "מתי אנחנו פתוחים", W - pad, pad + W*0.145);

    let y = pad + W * 0.28;
    const rowH = (H - y - pad * 2.2) / 7;
    ctx.font = `600 ${Math.round(W*0.042)}px Assistant, sans-serif`;
    for (let i = 0; i < 7; i++){
      const open = hrs[i] && hrs[i].length;
      ctx.globalAlpha = open ? 1 : 0.38;
      ctx.fillStyle = t.ink;
      ctx.textAlign = "right";
      ctx.fillText(DAYS[i], W - pad, y);
      ctx.textAlign = "left";
      ctx.fillStyle = open ? t.accent : t.sub;
      ctx.fillText(open ? hrs[i].join(", ") : "סגור", pad, y);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = t.sub + "33"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pad, y + rowH*0.28); ctx.lineTo(W - pad, y + rowH*0.28); ctx.stroke();
      y += rowH;
    }
    footer(ctx, W, H, pad, t.sub, t.accent);
    return canvas;
  }

  /* ---- טקסט ---- */
  const maxW = W - pad * 2;
  const headSize = Math.round(W * (state.head.length > 60 ? 0.068 : state.head.length > 30 ? 0.085 : 0.105));
  ctx.font = `400 ${headSize}px "Secular One", sans-serif`;
  const headLines = wrap(ctx, state.head || "כתוב כותרת", maxW);
  ctx.font = `400 ${Math.round(W*0.042)}px Assistant, sans-serif`;
  const subLines = state.sub ? wrap(ctx, state.sub, maxW) : [];

  const headLH = headSize * 1.22, subLH = W * 0.042 * 1.45;
  const blockH = headLines.length * headLH + (subLines.length ? subLines.length * subLH + W*0.04 : 0);

  let y = onPhoto ? H - pad * 1.45 - blockH + headLH
        : (H - blockH) / 2 + headLH * 0.75;

  if (state.badge){
    ctx.font = `700 ${Math.round(W*0.031)}px Assistant, sans-serif`;
    const bw = ctx.measureText(state.badge).width + W*0.05;
    const bh = W * 0.065;
    const by = y - headLH - bh * 1.5;
    ctx.fillStyle = onPhoto ? "rgba(255,255,255,.16)" : t.accent + "22";
    roundRect(ctx, W - pad - bw, by, bw, bh, bh/2); ctx.fill();
    ctx.fillStyle = onPhoto ? "#FFFFFF" : t.accent;
    ctx.fillText(state.badge, W - pad - W*0.025, by + bh*0.68);
  }

  ctx.fillStyle = ink;
  ctx.font = `400 ${headSize}px "Secular One", sans-serif`;
  for (const line of headLines){ ctx.fillText(line, W - pad, y); y += headLH; }

  if (subLines.length){
    y += W * 0.02;
    ctx.fillStyle = subInk;
    ctx.font = `400 ${Math.round(W*0.042)}px Assistant, sans-serif`;
    for (const line of subLines){ ctx.fillText(line, W - pad, y); y += subLH; }
  }

  footer(ctx, W, H, pad, onPhoto ? "rgba(255,255,255,.72)" : t.sub, onPhoto ? "#FFFFFF" : t.accent);
  return canvas;
}

function footer(ctx, W, H, pad, subColor, accent){
  ctx.textAlign = "right";
  ctx.font = `700 ${Math.round(W*0.032)}px Assistant, sans-serif`;
  ctx.fillStyle = accent;
  ctx.fillText("קפה קורטדו", W - pad, H - pad * 0.62);
  ctx.textAlign = "left";
  ctx.font = `400 ${Math.round(W*0.028)}px Assistant, sans-serif`;
  ctx.fillStyle = subColor;
  ctx.fillText("קיבוץ שניר", pad, H - pad * 0.62);
}

/* ===== תצוגה ===== */
export function wake(){ if (!ready){ ready = true; refresh(); } }
async function refresh(){
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch {}
  const c = draw();
  const img = $("posterPreview");
  img.src = c.toDataURL("image/png");
  img.hidden = false;
  $("posterMeta").textContent = `${c.width}×${c.height}`;
}

function setPhoto(file){
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => { photo = im; state.layout = "photo"; $("posterLayout").value = "photo"; refresh(); };
    im.onerror = () => status("posterStatus", "bad", "לא הצלחתי לקרוא את התמונה.");
    im.src = r.result;
  };
  r.readAsDataURL(file);
}

// silent: כשתבנית נבחרת, הטקסט נמשך מהפוסט בלי הודעה ובלי נדנוד אם אין טקסט.
function fromPost(silent){
  const text = ($("cText").value || "").trim();
  if (!text){ if (!silent) status("posterStatus", "warn", "אין טקסט בפוסט. כתוב קודם."); return false; }
  const lines = text.split("\n").filter(l => l.trim());
  state.head = (lines[0] || "").slice(0, 90);
  state.sub = lines.slice(1, 3).join(" ").slice(0, 140);
  syncControls();
  refresh();
  if (!silent) status("posterStatus", "ok", "נלקח מהפוסט. אפשר לקצר ולערוך.");
  return true;
}

// הפקדים הידניים משקפים תמיד את המצב, כדי שמי שפותח "לשנות" יראה מה יש עכשיו.
function syncControls(){
  const set = (id, v) => { const n = $(id); if (n) n.value = v; };
  set("posterLayout", state.layout); set("posterTheme", state.theme); set("posterSize", state.size);
  set("posterHead", state.head); set("posterSub", state.sub); set("posterBadge", state.badge);
}

function renderTemplates(){
  const box = $("posterTpl"); if (!box) return;
  clear(box);
  TEMPLATES.forEach(t => {
    if (t.free && !(S.isOwner && WORKER_URL)) return;     // בלי שרת אין "פתוח"
    box.append(el("button", {
      class: "tplbtn" + (activeTpl === t.key ? " on" : ""),
      onclick: () => pickTemplate(t.key),
    }, el("b", { text: t.label }), el("span", { class: "small", text: t.hint })));
  });
}

function pickTemplate(key){
  const t = TEMPLATES.find(x => x.key === key); if (!t) return;
  activeTpl = key;
  renderTemplates();
  const free = $("posterFreeBox");
  if (free) free.hidden = !t.free;
  if (t.free){ const i = $("posterFree"); if (i) i.focus(); return; }

  state.layout = t.layout; state.theme = t.theme; state.size = t.size;
  // "שעות" מצייר את השעות עצמן, אז כותרת מהפוסט רק תסתיר אותן.
  if (t.layout === "hours"){ state.head = ""; state.sub = ""; state.badge = state.badge || "שעות השבוע"; }
  const took = t.layout === "hours" ? true : fromPost(true);
  syncControls();
  refresh();
  status("posterStatus", "ok", took ? `תבנית "${t.label}" מוכנה.` : `תבנית "${t.label}" מוכנה. כתוב טקסט בפוסט והוא ייכנס לבד.`);
}

// "פתוח": מתארים במילים, והמודל מחזיר מפרט. לא מחזיר את 36 הצירופים.
async function freeBuild(btn){
  const want = ($("posterFree").value || "").trim();
  if (!want){ status("posterStatus", "warn", "כתוב במילים מה אתה רוצה שיהיה בתמונה."); return; }
  await withBusy(btn, async () => {
    try {
      const r = await api("/ai/poster", {
        want,
        text: ($("cText").value || "").slice(0, 500),
        hasPhoto: !!photo,
      });
      state.layout = r.layout; state.theme = r.theme; state.size = r.size;
      state.head = r.head || state.head; state.sub = r.sub || ""; state.badge = r.badge || "";
      syncControls();
      refresh();
      status("posterStatus", "ok", "נבנה. אפשר לשנות ידנית למטה.");
    } catch (e){ status("posterStatus", "bad", e.message); }
  });
}

function save(){
  if (!canvas){ refresh(); return; }
  canvas.toBlob((blob) => {
    if (!blob){ status("posterStatus", "bad", "השמירה נכשלה."); return; }
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `cortado-${state.size}-${Date.now()}.png` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    status("posterStatus", "ok", "התמונה ירדה. העלה אותה למתזמן יחד עם הטקסט.");
  }, "image/png");
}

/* ===== חיווט ===== */
export function init(){
  const lay = $("posterLayout");
  Object.entries(LAYOUTS).forEach(([k,v]) => lay.append(el("option", { value: k, text: v })));
  const th = $("posterTheme");
  Object.keys(THEMES).forEach(k => th.append(el("option", { value: k, text: THEME_LABEL[k] })));
  const sz = $("posterSize");
  [["portrait","פוסט (4:5)"],["square","ריבוע (1:1)"],["story","סטורי (9:16)"]]
    .forEach(([k,v]) => sz.append(el("option", { value: k, text: v })));

  lay.addEventListener("change", (e) => { state.layout = e.target.value; refresh(); });
  th.addEventListener("change", (e) => { state.theme = e.target.value; refresh(); });
  sz.addEventListener("change", (e) => { state.size = e.target.value; refresh(); });
  $("posterHead").addEventListener("input", (e) => { state.head = e.target.value; refresh(); });
  $("posterSub").addEventListener("input", (e) => { state.sub = e.target.value; refresh(); });
  $("posterBadge").addEventListener("input", (e) => { state.badge = e.target.value; refresh(); });
  $("posterPhoto").addEventListener("change", (e) => setPhoto(e.target.files && e.target.files[0]));
  $("posterClearPhoto").addEventListener("click", () => { photo = null; $("posterPhoto").value = ""; refresh(); });
  $("posterFromPost").addEventListener("click", () => fromPost(false));
  $("posterSave").addEventListener("click", save);

  renderTemplates();
  const go = $("posterFreeGo");
  if (go) go.addEventListener("click", (e) => freeBuild(e.currentTarget));
  const fr = $("posterFree");
  if (fr) fr.addEventListener("keydown", (e) => { if (e.key === "Enter"){ e.preventDefault(); freeBuild($("posterFreeGo")); } });

  on("week", () => { if (ready && state.layout === "hours") refresh(); });
  on("state", renderTemplates);   // "פתוח" מופיע רק כשיש שרת ומנהל
}
