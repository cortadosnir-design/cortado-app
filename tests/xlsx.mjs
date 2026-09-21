// קריאת xlsx על הקוד האמיתי: בונים חוברת אקסל מינימלית (ZIP של XML) ובודקים שהיא נקראת.
import { deflateRawSync } from "zlib";
import { parseXlsx, serialToDate } from "../xlsx.js";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n + "  " + x));
console.log("\n16. קריאת אקסל");

function zip(files, compress = true){
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255], u32 = (n) => [...u16(n & 0xffff), ...u16(n >>> 16)];
  for (const [name, text] of Object.entries(files)){
    const nm = enc.encode(name), raw = enc.encode(text), data = compress ? deflateRawSync(raw) : raw, m = compress ? 8 : 0;
    const local = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(m), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(raw.length), ...u16(nm.length), ...u16(0), ...nm]);
    cd.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(m), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(raw.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...nm]));
    parts.push(local, data); off += local.length + data.length;
  }
  const cdStart = off, cdBytes = Buffer.concat(cd.map(Buffer.from));
  const eocd = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(cd.length), ...u16(cd.length), ...u32(cdBytes.length), ...u32(cdStart), ...u16(0)]);
  return Buffer.concat([...parts.map(Buffer.from), cdBytes, Buffer.from(eocd)]);
}
const files = {
  "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="נתונים" sheetId="1" r:id="rId7"/></sheets></workbook>',
  "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId7" Type="ws" Target="worksheets/sheet3.xml"/></Relationships>',
  "xl/sharedStrings.xml": '<sst><si><t>תאריך</t></si><si><t>לקוחות</t></si><si><r><t>מזג </t></r><r><t>אוויר</t></r></si><si><t>שמש &amp; רוח</t></si></sst>',
  "xl/styles.xml": '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="[$-he]dd/mm/yyyy"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs></styleSheet>',
  "xl/worksheets/sheet3.xml": '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
    '<row r="2"><c r="A2" s="1"><v>46266</v></c><c r="B2"><v>42</v></c><c r="C2" t="s"><v>3</v></c></row>' +
    '<row r="3"><c r="A3" s="2"><v>46267.5</v></c><c r="C3" t="inlineStr"><is><t>גשם</t></is></c></row>' +
    '<row r="4"></row>' +
    '</sheetData></worksheet>',
};
const t = await parseXlsx(zip(files));
ok("כותרות ממחרוזות משותפות, כולל ריצות", t.columns.join("|") === "תאריך|לקוחות|מזג אוויר", t.columns.join("|"));
ok("שתי שורות נתונים, שורה ריקה נזרקת", t.rows.length === 2, String(t.rows.length));
ok("תאריך בפורמט מותאם", t.rows[0][0] === "2026-09-01", t.rows[0][0]);
ok("תאריך בפורמט מובנה עם שעה", t.rows[1][0] === "2026-09-02 12:00", t.rows[1][0]);
ok("מספר רגיל", t.rows[0][1] === "42");
ok("תא חסר → ריק", t.rows[1][1] === "");
ok("XML escapes", t.rows[0][2] === "שמש & רוח", t.rows[0][2]);
ok("inlineStr", t.rows[1][2] === "גשם");
ok("הגיליון הראשון לפי rels, לא sheet1", true);
const t2 = await parseXlsx(zip(files, false));
ok("ZIP בלי דחיסה", t2.rows.length === 2);
ok("serialToDate", serialToDate(45658) === "2025-01-01", serialToDate(45658));
let threw = false; try { await parseXlsx(Buffer.from("hello")); } catch { threw = true; }
ok("קובץ שאינו ZIP זורק", threw);
console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
