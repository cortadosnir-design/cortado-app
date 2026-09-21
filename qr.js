// קוד QR — מקודד מלא, בלי ספרייה חיצונית.
//
// למה כאן ולא מ-CDN: ה-CSP במאגר הזה חוסם סקריפטים מבחוץ ביום שהוא
// ייאכף, והפוסטר נבנה בקנבס גם כשאין רשת. שירות QR חיצוני היה גם
// מכניס כתובת של צד שלישי לתוך כל פוסטר שמתפרסם.
//
// מה יש כאן: מצב בייטים (UTF-8), רמת תיקון M, גרסאות 1–10 — יותר
// ממספיק לכתובת של עמוד. מעבר לזה זורקים שגיאה במקום להוציא קוד שבור.

/* ===== שדה גלואה GF(256) לתיקון השגיאות ===== */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => {
  let v = 1;
  for (let i = 0; i < 255; i++){
    EXP[i] = v; LOG[v] = i;
    v <<= 1; if (v & 0x100) v ^= 0x11d;      // הפולינום של התקן
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

// פולינום היוצר לאורך ec — מכפלת (x - α^i)
function genPoly(ec){
  let p = [1];
  for (let i = 0; i < ec; i++){
    const next = new Array(p.length + 1).fill(0);
    for (let j = 0; j < p.length; j++){
      // מקדמים בסדר יורד: הכפלה ב-x מזיזה אותם קדימה, והכפלה ב-α^i
      // נשארת באותה דרגה. הפוך מזה מייצר פולינום אחר לגמרי.
      next[j] ^= p[j];
      next[j + 1] ^= mul(p[j], EXP[i]);
    }
    p = next;
  }
  return p;
}
function ecBytes(data, ec){
  const gen = genPoly(ec);
  const rem = new Uint8Array(data.length + ec);
  rem.set(data);
  for (let i = 0; i < data.length; i++){
    const f = rem[i];
    if (!f) continue;
    for (let j = 0; j < gen.length; j++) rem[i + j] ^= mul(gen[j], f);
  }
  return rem.slice(data.length);
}

/* ===== טבלאות הגרסאות, רמת תיקון M בלבד =====
   [בייטים לתיקון בכל בלוק, בלוקים בקבוצה 1, נתונים בבלוק,
    בלוקים בקבוצה 2, נתונים בבלוק]
   מספר בייטי הנתונים הכולל נגזר מהבלוקים — לא נכתב בנפרד, כדי שלא
   יוכל לסטות מהם. */
const V = {
  1:  [10, 1, 16, 0, 0],
  2:  [16, 1, 28, 0, 0],
  3:  [26, 1, 44, 0, 0],
  4:  [18, 2, 32, 0, 0],
  5:  [24, 2, 43, 0, 0],
  6:  [16, 4, 27, 0, 0],
  7:  [18, 4, 31, 0, 0],
  8:  [22, 2, 38, 2, 39],
  9:  [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};
// בייטי הנתונים של גרסה — סכום הבלוקים
const dataBytes = (v) => V[v][1] * V[v][2] + V[v][3] * V[v][4];
const ALIGN = { 1: [], 2: [6,18], 3: [6,22], 4: [6,26], 5: [6,30],
  6: [6,34], 7: [6,22,38], 8: [6,24,42], 9: [6,26,46], 10: [6,28,50] };
const VERSION_BITS = { 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3 };
// מידע הפורמט, רמת M, לכל אחת משמונה המסכות — כולל ה-BCH וה-XOR של התקן
const FORMAT = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

/* ===== המטריצה =====
   modules  — 0/1, מה שמצויר.
   reserved — מה שאסור לנתונים לדרוך עליו (תבניות, פורמט, גרסה). */
function frame(ver){
  const n = ver * 4 + 17;
  const m = Array.from({ length: n }, () => new Uint8Array(n));
  const res = Array.from({ length: n }, () => new Uint8Array(n));
  const set = (r, c, v) => { m[r][c] = v; res[r][c] = 1; };

  // תבניות האיתור והמפרידים
  for (const [br, bc] of [[0,0],[0,n-7],[n-7,0]]){
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++){
      const rr = br + r, cc = bc + c;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                 (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                 (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      set(rr, cc, on ? 1 : 0);
    }
  }
  // תבניות היישור — מדלגות על מה שחופף לתבניות האיתור
  const ac = ALIGN[ver];
  for (const r of ac) for (const c of ac){
    if ((r === 6 && c === 6) || (r === 6 && c === ac[ac.length-1]) || (r === ac[ac.length-1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      set(r + dr, c + dc, (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (!dr && !dc)) ? 1 : 0);
  }
  // התזמון
  for (let i = 8; i < n - 8; i++){ set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0); }
  // המודול הכהה הקבוע
  set(n - 8, 8, 1);
  // שמירת מקום למידע הפורמט
  for (let i = 0; i <= 8; i++){ if (!res[8][i]) res[8][i] = 1; if (!res[i][8]) res[i][8] = 1; }
  for (let i = 0; i < 8; i++){ res[8][n - 1 - i] = 1; res[n - 1 - i][8] = 1; }
  // ולמידע הגרסה, מגרסה 7
  if (ver >= 7){
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++){ res[i][n - 11 + j] = 1; res[n - 11 + j][i] = 1; }
  }
  return { n, m, res };
}

function placeData(f, bytes){
  const { n, m, res } = f;
  let bit = 0;
  const total = bytes.length * 8;
  const next = () => {
    if (bit >= total) return 0;
    const b = (bytes[bit >> 3] >> (7 - (bit & 7))) & 1;
    bit++; return b;
  };
  let up = true;
  for (let right = n - 1; right > 0; right -= 2){
    if (right === 6) right--;                 // עמודת התזמון נדלגת
    for (let i = 0; i < n; i++){
      const r = up ? n - 1 - i : i;
      for (const c of [right, right - 1]){
        if (res[r][c]) continue;
        m[r][c] = next();
      }
    }
    up = !up;
  }
}

// העונשים של התקן — בוחרים את המסכה עם הציון הנמוך ביותר
function penalty(m, n){
  let p = 0;
  const run = (get) => {
    for (let a = 0; a < n; a++){
      let last = -1, len = 0;
      for (let b = 0; b < n; b++){
        const v = get(a, b);
        if (v === last) len++; else { if (len >= 5) p += len - 2; last = v; len = 1; }
      }
      if (len >= 5) p += len - 2;
    }
  };
  run((a, b) => m[a][b]);
  run((a, b) => m[b][a]);
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++){
    const v = m[r][c];
    if (v === m[r][c+1] && v === m[r+1][c] && v === m[r+1][c+1]) p += 3;
  }
  const pat = [1,0,1,1,1,0,1,0,0,0,0];
  const hit = (get, a, b) => { for (let i = 0; i < 11; i++) if (get(a, b + i) !== pat[i]) return false; return true; };
  for (let a = 0; a < n; a++) for (let b = 0; b + 11 <= n; b++){
    if (hit((x, y) => m[x][y], a, b)) p += 40;
    if (hit((x, y) => m[y][x], a, b)) p += 40;
  }
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dark += m[r][c];
  p += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
  return p;
}

function putFormat(m, n, mask){
  const bits = FORMAT[mask];
  // הביט הגבוה נכתב ראשון: (8,0) מקבל את ביט 14, לא את ביט 0.
  for (let i = 0; i < 15; i++){
    const b = (bits >> (14 - i)) & 1;
    // העותק סביב תבנית האיתור השמאלית־עליונה
    if (i < 6) m[8][i] = b;
    else if (i < 8) m[8][i + 1] = b;
    else if (i === 8) m[7][8] = b;
    else m[14 - i][8] = b;
    // והעותק השני, מפוצל בין שתי הפינות האחרות
    if (i < 8) m[n - 1 - i][8] = b;
    else m[8][n - 15 + i] = b;
  }
  m[n - 8][8] = 1;
}
function putVersion(m, n, ver){
  if (ver < 7) return;
  const bits = VERSION_BITS[ver];
  for (let i = 0; i < 18; i++){
    const b = (bits >> i) & 1;
    const r = Math.floor(i / 3), c = i % 3;
    m[r][n - 11 + c] = b;
    m[n - 11 + c][r] = b;
  }
}

/* בייטי הנתונים והתיקון, שזורים כמו שהתקן דורש. מיוצא כדי שאפשר יהיה
   לבדוק את השלב הזה לבדו מול מימוש ידוע. */
export function qrStream(text){
  const data = new TextEncoder().encode(String(text || ""));
  let ver = 0;
  for (let v = 1; v <= 10; v++){
    // 4 ביט מצב + ספירה (8 ביט עד גרסה 9, 16 מגרסה 10) + הנתונים
    const need = Math.ceil((4 + (v < 10 ? 8 : 16) + data.length * 8) / 8);
    if (need <= dataBytes(v)){ ver = v; break; }
  }
  if (!ver) throw new Error("הכתובת ארוכה מדי לקוד QR.");
  const [ec, g1, d1, g2, d2] = V[ver];
  const cap = dataBytes(ver);
  const countBits = ver < 10 ? 8 : 16;

  // זרם הביטים
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(4, 4);                       // מצב בייטים
  push(data.length, countBits);
  for (const b of data) push(b, 8);
  const capBits = cap * 8;
  for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const used = bits.length / 8;
  const codewords = new Uint8Array(cap);
  for (let i = 0; i < used; i++){
    let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i * 8 + j];
    codewords[i] = v;
  }
  for (let i = used, k = 0; i < cap; i++, k++) codewords[i] = k % 2 ? 0x11 : 0xEC;

  // חלוקה לבלוקים, תיקון שגיאות, ושזירה — בדיוק בסדר של התקן
  const blocks = [];
  let at = 0;
  for (let i = 0; i < g1; i++){ blocks.push(codewords.slice(at, at + d1)); at += d1; }
  for (let i = 0; i < g2; i++){ blocks.push(codewords.slice(at, at + d2)); at += d2; }
  const ecs = blocks.map(b => ecBytes(b, ec));
  const out = [];
  const maxD = Math.max(d1, d2);
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]);
  const stream = Uint8Array.from(out);

  return { ver, stream };
}

/* מטריצה בוליאנית של הקוד. זורק אם הטקסט ארוך מדי. */
export function qrMatrix(text){
  const { ver, stream } = qrStream(text);

  // המסכה הזולה ביותר מבין השמונה
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++){
    const f = frame(ver);
    placeData(f, stream);
    for (let r = 0; r < f.n; r++) for (let c = 0; c < f.n; c++)
      if (!f.res[r][c] && MASKS[mask](r, c)) f.m[r][c] ^= 1;
    putFormat(f.m, f.n, mask);
    putVersion(f.m, f.n, ver);
    const s = penalty(f.m, f.n);
    if (s < bestScore){ bestScore = s; best = f; }
  }
  return best.m.map(row => Array.from(row, v => !!v));
}

/* ציור על קנבס. quiet = שוליים לבנים במודולים — בלי ארבעה מודולים
   לפחות סורקים רבים פשוט לא רואים את הקוד. */
export function drawQR(ctx, text, x, y, size, { dark = "#000", light = "#fff", quiet = 4 } = {}){
  const m = qrMatrix(text);
  const n = m.length + quiet * 2;
  const px = size / n;
  ctx.save();
  ctx.fillStyle = light;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = dark;
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++){
    if (!m[r][c]) continue;
    // עיגול כלפי מעלה: מודולים סמוכים חייבים להיגע, אחרת נוצרים חריצים
    const px0 = Math.floor(x + (c + quiet) * px), py0 = Math.floor(y + (r + quiet) * px);
    const px1 = Math.ceil(x + (c + quiet + 1) * px), py1 = Math.ceil(y + (r + quiet + 1) * px);
    ctx.fillRect(px0, py0, px1 - px0, py1 - py0);
  }
  ctx.restore();
}
