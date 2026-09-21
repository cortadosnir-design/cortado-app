// קריאת CSV והפרופיל שנשלח לסוכן הניתוח — על הקוד האמיתי.
import { parseDelimited, asNumber, profile, payload } from "../table.js";
let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n)) : (fail++, console.log("  ✗ " + n + "  " + x));
console.log("\n15. טבלאות לניתוח");

const t = parseDelimited("﻿תאריך,לקוחות,מזג אוויר\n2026-09-01,42,שמש\n2026-09-02,\"38\",\"גשם, קל\"\n\n2026-09-03,55,\"שורה\nכפולה\"\n");
ok("כותרות", t.columns.join("|") === "תאריך|לקוחות|מזג אוויר", t.columns.join("|"));
ok("שלוש שורות, שורה ריקה נזרקת", t.rows.length === 3, String(t.rows.length));
ok("פסיק בתוך מרכאות", t.rows[1][2] === "גשם, קל", t.rows[1][2]);
ok("שורה חדשה בתוך מרכאות", t.rows[2][2] === "שורה\nכפולה");
ok("BOM מוסר", !t.columns[0].startsWith("﻿"));

const tsv = parseDelimited("a\tb\n1\t2\n");
ok("TSV מזוהה לבד", tsv.columns.length === 2 && tsv.rows[0][1] === "2");
const semi = parseDelimited("a;b;c\n1;2;3\n");
ok("נקודה-פסיק מזוהה לבד", semi.columns.length === 3);
ok("שורה קצרה מתמלאת בריק", parseDelimited("a,b\n1\n").rows[0][1] === "");
ok("קלט ריק", parseDelimited("").columns.length === 0);

ok("מספר עם פסיק אלפים", asNumber("1,234") === 1234);
ok("מספר עם שקל", asNumber("₪45.5") === 45.5);
ok("טקסט אינו מספר", asNumber("שמש") === null);

const p = profile(t);
ok("עמודת מספרים", p[1].type === "number" && p[1].min === 38 && p[1].max === 55 && p[1].sum === 135, JSON.stringify(p[1]));
ok("עמודת תאריך", p[0].type === "date");
ok("עמודת טקסט עם נפוצים", p[2].type === "text" && p[2].top.length === 3);

const big = { columns: ["x"], rows: Array.from({ length: 20000 }, (_, i) => [String(i)]) };
const pl = payload(big);
ok("דגימה מוגבלת בגודל", pl.sampled && pl.rowCount === 20000 && pl.rows.length < 20000 && JSON.stringify(pl.rows).length <= 40000 + 20000);
ok("טבלה קטנה נשלחת במלואה", !payload(t).sampled);

console.log(`\n${pass} עברו · ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
