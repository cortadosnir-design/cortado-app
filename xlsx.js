// קריאת קובץ אקסל (xlsx) בדפדפן, בלי ספריות. xlsx הוא ZIP של קובצי XML:
// פותחים את ה-ZIP עם DecompressionStream של הדפדפן, קוראים את מחרוזות
// הטקסט המשותפות ואת הגיליון הראשון, ומחזירים { columns, rows } כמו parseDelimited.
// קובץ טהור, בלי DOM ובלי Firebase — נבדק ב-tests/xlsx.mjs.

const td = new TextDecoder("utf-8");

async function inflateRaw(bytes){
  const ds = new DecompressionStream("deflate-raw");
  const w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

// כל הקבצים ב-ZIP לפי שם, מתוך ה-central directory.
export async function unzip(buf){
  const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip");
  const count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
  const files = {};
  let p = cdOff;
  for (let i = 0; i < count; i++){
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const lOff = dv.getUint32(p + 42, true);
    const name = td.decode(b.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(lOff + 26, true), lelen = dv.getUint16(lOff + 28, true);
    const start = lOff + 30 + lnlen + lelen;
    files[name] = { method, data: b.subarray(start, start + csize) };
    p += 46 + nlen + elen + clen;
  }
  return {
    has: (n) => n in files,
    text: async (n) => { const f = files[n]; if (!f) return null;
      return td.decode(f.method === 8 ? await inflateRaw(f.data) : f.data); },
  };
}

const unesc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
const tText = (xml) => unesc((xml.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || []).map(m => m.replace(/<t(?:\s[^>]*)?>|<\/t>/g, "")).join(""));
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

// תאריכי אקסל: מספר ימים מ-1899-12-30. מחזיר yyyy-mm-dd, עם שעה אם יש.
export function serialToDate(n){
  const ms = Math.round((n - 25569) * 86400000);
  const d = new Date(ms);
  const pad = (x) => String(x).padStart(2, "0");
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return n % 1 ? `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
}
const BUILTIN_DATE = new Set([14,15,16,17,18,19,20,21,22,27,28,29,30,31,32,33,34,35,36,45,46,47]);

// אילו סגנונות (s="...") הם תאריכים, לפי styles.xml.
function dateStyles(styles){
  if (!styles) return new Set();
  const custom = new Set();
  for (const m of styles.matchAll(/<numFmt\s[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)){
    const code = m[2].replace(/\[[^\]]*\]|&quot;[^&]*&quot;|"[^"]*"/g, "");
    if (/[ymdh]/i.test(code)) custom.add(+m[1]);
  }
  const xfs = (styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [""])[0];
  const out = new Set();
  (xfs.match(/<xf\b[^>]*>/g) || []).forEach((xf, i) => {
    const id = +((xf.match(/numFmtId="(\d+)"/) || [])[1] || 0);
    if (BUILTIN_DATE.has(id) || custom.has(id)) out.add(i);
  });
  return out;
}

// הגיליון הראשון בסדר של חוברת העבודה.
async function firstSheetPath(zip){
  const wb = await zip.text("xl/workbook.xml");
  const rels = await zip.text("xl/_rels/workbook.xml.rels");
  const rid = wb && (wb.match(/<sheet\b[^>]*r:id="([^"]+)"/) || wb.match(/<sheet\b[^>]*\sid="([^"]+)"/) || [])[1];
  if (rid && rels){
    const re = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`);
    const m = rels.match(re) || rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`));
    if (m) return "xl/" + m[1].replace(/^\/?xl\//, "").replace(/^\//, "");
  }
  return "xl/worksheets/sheet1.xml";
}

export async function parseXlsx(buf){
  const zip = await unzip(buf);
  const ss = await zip.text("xl/sharedStrings.xml");
  const strings = ss ? (ss.match(/<si>[\s\S]*?<\/si>/g) || []).map(tText) : [];
  const dates = dateStyles(await zip.text("xl/styles.xml"));
  const sheet = await zip.text(await firstSheetPath(zip));
  if (!sheet) return { columns: [], rows: [] };

  const grid = [];
  for (const rowXml of sheet.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || []){
    const row = [];
    for (const c of rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []){
      const ref = (c.match(/\br="([A-Z]+)\d*"/) || [])[1]; if (!ref) continue;
      const type = (c.match(/\bt="(\w+)"/) || [])[1] || "n";
      const style = +((c.match(/\bs="(\d+)"/) || [])[1] || -1);
      const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = "";
      if (type === "s") val = strings[+v] ?? "";
      else if (type === "inlineStr") val = tText(c);
      else if (type === "b") val = v === "1" ? "כן" : "לא";
      else if (v != null){
        val = unesc(v);
        if (type === "n" && dates.has(style) && !isNaN(+val)) val = serialToDate(+val);
      }
      row[colIndex(ref)] = String(val).trim();
    }
    if (row.some(x => x)) grid.push(row);
  }
  if (!grid.length) return { columns: [], rows: [] };
  const width = Math.max(...grid.map(r => r.length));
  const columns = Array.from({ length: width }, (_, i) => (grid[0][i] || "").trim() || `עמודה ${i + 1}`);
  const rows = grid.slice(1).map(r => columns.map((_, i) => r[i] ?? ""));
  return { columns, rows };
}
