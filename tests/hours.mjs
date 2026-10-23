/* דף העגלה (cafe/): מה שהוא מצייר מ-public/hours, והשעות שנאפות ל-HTML.
   את המסמך כותב רק השרת (botPlan/botHours); tests/worker.mjs בודק את הצורה שלו.
   כאן מוודאים שהקורא מבין בדיוק את הצורה הזו: מחרוזת לכל יום, בלי מערך בתוך מערך. */
import { readFileSync, existsSync } from "fs";
import { spawn } from "child_process";
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = process.env.HOURS_PORT || 8904;

const server = spawn("npx", ["--yes", "http-server", ROOT, "-p", String(PORT), "-s"], { cwd: ROOT, stdio: "ignore" });
const cleanup = () => { try { server.kill(); } catch {} };
await new Promise(r => setTimeout(r, 2500));


let pass = 0, fail = 0;
const ok = (n, c, x = "") => c ? (pass++, console.log("  ✓ " + n + (x ? "  " + x : "")))
                               : (fail++, console.log("  ✗ " + n + "  " + x));

console.log("\n28. דף השעות הציבורי");
const b = await chromium.launch();
try {
  // המסמך כמו שהשרת כותב אותו (botPlan ב-worker/src/index.js; tests/worker.mjs בודק את הצורה):
  // שלישי בוקר וערב, שישי בוקר, שאר הימים סגורים. מחרוזת לכל יום — Firestore לא מקבל מערך בתוך מערך.
  const res = { doc: { days: ["", "", "09:00–12:00, 16:00–19:00", "", "", "09:00–12:00", ""], range: "1.1 – 7.1" } };

  /* דף הנחיתה (cafe/) — הדף שגוגל מאנדקסת. השעות בו מגיעות מאותו מסמך,
     דרך REST של Firestore בלי SDK; כאן הבקשה נתפסת ומקבלת את המסמך שנכתב. */
  const cafe = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const cafeErrors = [];
  cafe.on("pageerror", e => cafeErrors.push(e.message));
  cafe.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_/.test(m.text())) cafeErrors.push(m.text()); });
  let restHit = "";
  await cafe.route(/firestore\.googleapis\.com/, (route) => {
    restHit = route.request().url();
    const fields = { days: { arrayValue: { values: res.doc.days.map(s => ({ stringValue: s })) } }, range: { stringValue: res.doc.range } };
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fields }) });
  });
  await cafe.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await cafe.goto(`http://127.0.0.1:${PORT}/cafe/`, { waitUntil: "domcontentloaded" });
  await cafe.waitForTimeout(900);
  const cf = await cafe.evaluate(() => ({
    rows: [...document.querySelectorAll("#hours tr")].map(tr => tr.children[0].textContent + ": " + tr.children[1].textContent),
    today: document.querySelectorAll("#hours tr.today").length,
    status: document.querySelector("#status span").textContent,
    note: document.getElementById("hours-note").textContent,
    inline: [...document.querySelectorAll("script")].filter(s => !s.src && s.type !== "application/ld+json").length,
    ld: (() => { try { return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent); } catch { return null; } })(),
    imgs: [...document.images].map(i => i.getAttribute("src")),
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  ok("דף הנחיתה מושך את השעות מ-public/hours דרך REST", restHit.includes("/documents/public/hours"), restHit);
  ok("הטבלה בדף הנחיתה היא מה שבמסמך", cf.rows[2] === "שלישי: 09:00–12:00 · 16:00–19:00" && cf.rows[0] === "ראשון: סגור", cf.rows.join(" · "));
  ok("היום מסומן בטבלה", cf.today === 1);
  ok("תווית המצב מחושבת", /פתוח עכשיו|נפתח/.test(cf.status), cf.status);
  ok("השבוע שהשעות שייכות לו כתוב ליד הטבלה", cf.note.startsWith("השעות לשבוע"), cf.note.slice(0, 40));
  ok("בלי סקריפט inline (CSP, CLAUDE.md §5)", cf.inline === 0, String(cf.inline));
  ok("JSON-LD של בית קפה עם מיקום", !!cf.ld && cf.ld["@type"] === "CafeOrCoffeeShop" && !!cf.ld.geo && !!cf.ld.address);
  const ldHours = (cf.ld.openingHoursSpecification || []).map(o => o.dayOfWeek + " " + o.opens + "–" + o.closes).join(" · ");
  ok("השעות ב-JSON-LD הן השעות שבטבלה, לא ברירת המחדל שב-HTML", ldHours === "Tuesday 09:00–12:00 · Tuesday 16:00–19:00 · Friday 09:00–12:00", ldHours);
  ok("התמונות הן קבצים, לא data:", cf.imgs.length >= 10 && cf.imgs.every(x => x.startsWith("img/")), cf.imgs.join(","));
  ok("בלי גלילה אופקית", cf.over <= 0, cf.over + "px");
  ok("בלי שגיאות בקונסולה בדף הנחיתה", cafeErrors.length === 0, cafeErrors.slice(0, 2).join(" | "));

  /* איזה שבוע מוצג בטבלה: הנוכחי כל עוד נשארו בו שעות פתיחה, והבא ברגע שנגמרו.
     המפתחות מחושבים כמו בדף: יום ראשון של השבוע, לפי שעון ישראל. */
  {
    const il = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const sun = new Date(il + "T12:00:00Z"); sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay());
    const keyOf = (plus) => { const x = new Date(sun); x.setUTCDate(x.getUTCDate() + plus); return x.toISOString().slice(0, 10); };
    const week = (line) => ({ arrayValue: { values: Array(7).fill(line).map(s => ({ stringValue: s })) } });
    const show = async (curLine) => {
      const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
      await pg.route(/firestore\.googleapis\.com/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fields: {
        days: week(curLine), range: { stringValue: "x" },
        weeks: { mapValue: { fields: { [keyOf(0)]: week(curLine), [keyOf(7)]: week("10:00–11:00") } } } } }) }));
      await pg.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
      await pg.goto(`http://127.0.0.1:${PORT}/cafe/`, { waitUntil: "domcontentloaded" });
      await pg.waitForTimeout(900);
      const out = await pg.evaluate(() => ({ row: document.querySelector("#hours tr").children[1].textContent,
        ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent).openingHoursSpecification[0],
        today: document.querySelectorAll("#hours tr.today").length, note: document.getElementById("hours-note").textContent }));
      await pg.close();
      return out;
    };
    const dmOf = (plus) => { const x = new Date(sun); x.setUTCDate(x.getUTCDate() + plus); return `${x.getUTCDate()}.${x.getUTCMonth() + 1}`; };
    const open = await show("00:00–23:59");   // נשארו שעות השבוע (חוץ מהדקה האחרונה של שבת)
    ok("כל עוד נשארו שעות פתיחה השבוע, הטבלה היא של השבוע הנוכחי", open.row === "00:00–23:59" && open.today === 1 && open.note.includes(dmOf(0) + " – "), open.row + " | " + open.note.slice(0, 30));
    const done = await show("");              // השבוע הנוכחי סגור כולו: לא נשאר בו כלום
    ok("כשלא נשארו שעות השבוע והשבוע הבא פורסם, הטבלה עוברת אליו", done.row === "10:00–11:00" && done.note.includes(dmOf(7) + " – "), done.row + " | " + done.note.slice(0, 30));
    ok("בטבלה של השבוע הבא אין יום שמסומן כהיום", done.today === 0, String(done.today));
    ok("שעות של שבוע ידוע מתוארכות ב-JSON-LD לשבוע שבטבלה", done.ld.opens === "10:00" && done.ld.validFrom === keyOf(7) && done.ld.validThrough === keyOf(13), JSON.stringify(done.ld));
  }
  /* השבוע הנוכחי לא פורסם, ורק שבוע שעבר במסמך: אף שעה של שבוע שעבר לא מוצגת כאילו היא של עכשיו. */
  {
    const il = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const sun = new Date(il + "T12:00:00Z"); sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay() - 7);
    const lastKey = sun.toISOString().slice(0, 10);
    const week = (line) => ({ arrayValue: { values: Array(7).fill(line).map(s => ({ stringValue: s })) } });
    const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await pg.route(/firestore\.googleapis\.com/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fields: {
      days: week("00:00–23:59"), range: { stringValue: "x" }, from: { stringValue: lastKey },
      weeks: { mapValue: { fields: { [lastKey]: week("00:00–23:59") } } } } }) }));
    await pg.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    await pg.goto(`http://127.0.0.1:${PORT}/cafe/`, { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(900);
    const st = await pg.evaluate(() => ({ cells: [...document.querySelectorAll("#hours td")].map(td => td.textContent).join("|"),
      status: document.querySelector("#status span").textContent, note: document.getElementById("hours-note").textContent }));
    await pg.close();
    ok("השבוע לא פורסם: אין בטבלה שעות של שבוע שעבר", !/\d{1,2}:\d{2}/.test(st.cells), st.cells);
    ok("השבוע לא פורסם: \"פתוח עכשיו\" לא מחושב משבוע שעבר", st.status === "שעות פתיחה", st.status);
    ok("השבוע לא פורסם: הדף אומר את זה", st.note.startsWith("השעות לשבוע הזה עוד לא פורסמו"), st.note.slice(0, 40));
  }
  /* שעות ב-HTML: שעות קבועות שנכתבו שם פעם התיישנו, ומי שקרא את הדף בלי JavaScript קיבל אותן כאילו הן
     של השבוע. היום .github/scripts/bake-hours.mjs אופה את השבוע הנוכחי, מתוארך, בשביל מנועי חיפוש ועוזרי AI
     שלא מריצים JavaScript. הבדיקות כאן לא תלויות במה שאפוי כרגע בקובץ: הן אופות בעצמן ומגישות את התוצאה. */
  {
    const { bake, ilToday, sundayOf, plusDays } = await import("../.github/scripts/bake-hours.mjs");
    const src = readFileSync(ROOT + "cafe/index.html", "utf8");
    const rowsOf = (html) => /<tbody id="hours"[^>]*>([\s\S]*?)<\/tbody>/.exec(html)[1];
    const ldOf = (html) => JSON.parse(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/.exec(html)[1]);
    const today = ilToday(), cur = sundayOf(today);
    const LINES = ["", "17:00–19:00", "", "", "", "09:00–12:00", "09:00-12:00, 16:00–19:00"];
    const docOf = (key) => ({ fields: { weeks: { mapValue: { fields: { [key]: { arrayValue: { values: LINES.map(s => ({ stringValue: s })) } } } } } } });
    const baked = bake(src, docOf(cur), today), empty = bake(src, { fields: {} }, today);
    const stale = bake(src, docOf(plusDays(cur, -7)), plusDays(today, -7));

    const timed = /\d{1,2}:\d{2}/.test(rowsOf(src)), specs = ldOf(src).openingHoursSpecification || [];
    ok("שעות ב-HTML של דף הנחיתה קיימות רק כשהן מתוארכות לשבוע שלהן",
      timed === /<tbody id="hours" data-week="\d{4}-\d\d-\d\d">/.test(src) && timed === /id="hours-note"><b>השעות לשבוע /.test(src)
      && (specs.length > 0) === timed && specs.every(x => x.validFrom && x.validThrough), rowsOf(src).replace(/\s+/g, " ").slice(0, 80));
    ok("האפייה כותבת את הטבלה, את השבוע ואת ה-JSON-LD, כמו שקורא בלי JavaScript רואה אותם",
      rowsOf(baked).includes('<tr data-d="6"><th scope="row">שבת</th><td dir="ltr">09:00–12:00 · 16:00–19:00</td></tr>')
      && rowsOf(baked).includes('<tr data-d="0"><th scope="row">ראשון</th><td class="closed">סגור</td></tr>')
      && baked.includes(`<tbody id="hours" data-week="${cur}">`) && /id="hours-note"><b>השעות לשבוע \d+\.\d+ – \d+\.\d+\. <\/b>/.test(baked)
      && ldOf(baked).openingHoursSpecification.map(x => x.dayOfWeek + " " + x.opens + "–" + x.closes).join(" · ") === "Monday 17:00–19:00 · Friday 09:00–12:00 · Saturday 09:00–12:00 · Saturday 16:00–19:00"
      && ldOf(baked).openingHoursSpecification.every(x => x.validFrom === cur && x.validThrough === plusDays(cur, 6)));
    ok("שבוע שלא פורסם נאפה כטבלה ריקה, בלי שבוע ובלי שעות ב-JSON-LD",
      !/\d{1,2}:\d{2}/.test(rowsOf(empty)) && !empty.includes("data-week") && !empty.includes("openingHoursSpecification") && !/id="hours-note"><b>/.test(empty));
    ok("האפייה יציבה: ריצה שנייה לא משנה כלום, ומחיקה מחזירה בדיוק את הדף בלי השעות",
      bake(baked, docOf(cur), today) === baked && bake(empty, { fields: {} }, today) === empty && bake(baked, { fields: {} }, today) === empty);
    ok("האפייה לא נוגעת בשום דבר אחר ב-JSON-LD", JSON.stringify({ ...ldOf(baked), openingHoursSpecification: undefined }) === JSON.stringify(ldOf(empty)));

    // הדף בדפדפן, עם HTML אפוי. live = public/hours עונה; אחרת הרשת נפלה.
    const open = async (html, live) => {
      const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
      await pg.route(/\/cafe\/$/, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
      await pg.route(/firestore\.googleapis\.com/, (route) => live ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(live) }) : route.abort());
      await pg.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
      await pg.goto(`http://127.0.0.1:${PORT}/cafe/`, { waitUntil: "domcontentloaded" });
      await pg.waitForTimeout(700);
      const out = await pg.evaluate(() => ({ status: document.querySelector("#status span").textContent,
        cells: [...document.querySelectorAll("#hours td")].map(td => td.textContent).join("|"), rows: document.querySelectorAll("#hours tr").length,
        today: document.querySelectorAll("#hours tr.today").length, labels: document.querySelectorAll("#hours-note b").length,
        note: document.getElementById("hours-note").textContent.slice(0, 12),
        ld: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent).openingHoursSpecification,
        fonts: [...document.fonts].filter(f => f.status === "error").map(f => f.family + " " + f.weight) }));
      await pg.close();
      return out;
    };
    const o = await open(empty), bk = await open(baked), st = await open(stale), lv = await open(baked, docOf(cur));
    ok("בלי שעות אפויות וכשהרשת נופלת: שבעה ימים בלי שעות, ובלי \"פתוח עכשיו\"", o.rows === 7 && o.cells === "||||||" && o.status === "שעות פתיחה" && o.ld === undefined, JSON.stringify(o));
    ok("שעות אפויות של השבוע הזה נשארות על המסך כשהרשת נופלת, מתוארכות",
      bk.cells === "סגור|17:00–19:00|סגור|סגור|סגור|09:00–12:00|09:00–12:00 · 16:00–19:00" && bk.note === "השעות לשבוע " && bk.today === 1 && bk.ld.length === 4, JSON.stringify(bk));
    ok("\"פתוח עכשיו\" לא מחושב משעות אפויות, רק מ-public/hours", bk.status === "שעות פתיחה", bk.status);
    ok("שעות אפויות של שבוע שעבר נמחקות בדפדפן: מהטבלה, מהתווית ומה-JSON-LD",
      st.cells === "||||||" && st.rows === 7 && st.labels === 0 && st.ld === undefined && st.status === "שעות פתיחה", JSON.stringify(st));
    // במוצאי שבת אחרי 19:00 לא נשארה בשבוע שום שעת פתיחה, ואין "פתוח עכשיו" או "נפתח" (נפל ב-17.10.2026 בלילה)
    const afterLast = new Date(today + "T12:00:00Z").getUTCDay() === 6
      && new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()) >= "19:00";
    ok("הדף מצייר מ-public/hours בדיוק את מה שנאפה מאותו מסמך, ותווית השבוע לא מוכפלת",
      lv.cells === bk.cells && lv.labels === 1 && (/פתוח עכשיו|נפתח/.test(lv.status) || afterLast)
      && lv.ld.map(x => x.dayOfWeek + x.opens + x.closes + x.validFrom + x.validThrough).join() === bk.ld.map(x => x.dayOfWeek + x.opens + x.closes + x.validFrom + x.validThrough).join(), JSON.stringify(lv));
    const fontFiles = [...src.matchAll(/(?:url\(|href=")(fonts\/[^)"]+\.woff2)/g)].map(m => m[1]);
    ok("הגופנים מוגשים מהאתר עצמו, וכל קובץ שהדף מפנה אליו קיים", !/fonts\.(googleapis|gstatic)\.com/.test(src) && fontFiles.length >= 10
      && fontFiles.every(f => existsSync(ROOT + "cafe/" + f)) && o.fonts.length === 0, fontFiles.filter(f => !existsSync(ROOT + "cafe/" + f)).concat(o.fonts).join(", "));
    const maps = [...src.matchAll(/https:\/\/www\.google\.com\/maps[^"]*/g)].map(m => m[0]);
    ok("כל קישור לגוגל מפות פותח את דף העסק, לא סיכה על קואורדינטות", maps.length >= 4 && maps.every(u => u.includes("query_place_id=")), maps.filter(u => !u.includes("query_place_id=")).join(" "));
  }
  if (process.env.CAFE_SHOT) await cafe.screenshot({ path: process.env.CAFE_SHOT, fullPage: true });
  await cafe.setViewportSize({ width: 390, height: 844 });
  await cafe.waitForTimeout(200);
  ok("בלי גלילה אופקית בטלפון", await cafe.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0);
  if (process.env.CAFE_SHOT) await cafe.screenshot({ path: process.env.CAFE_SHOT.replace(".png", "-mobile.png"), fullPage: true });
  await cafe.close();
  const sitemap = readFileSync(ROOT + "sitemap.xml", "utf8");
  ok("דף הנחיתה ב-sitemap", sitemap.includes("/cortado-app/cafe/"));
  ok("robots.txt מצביע על ה-sitemap", /Sitemap:/.test(readFileSync(ROOT + "robots.txt", "utf8")));

  /* הכותב והקורא לא יכולים להיפרד שוב: זו בדיקה סטטית על הקוד עצמו. */
  const reader = readFileSync(ROOT + "cafe/cafe.js", "utf8");
  ok("דף הנחיתה קורא את השדה days", /fields\.days\b/.test(reader));
  ok("דף הנחיתה קורא את הטווח לכותרת", /fields\.range\b/.test(reader));
  ok("hours.html מפנה לדף הנחיתה", /http-equiv="refresh"[^>]*cafe\//.test(readFileSync(ROOT + "hours.html", "utf8")));
  // הכתובות הישנות (השורש, דף העובד) מפנות לדף העגלה, ומי שהתקין פעם את האפליקציה מקבל קובץ שמנקה ומסיר את עצמו
  ok("השורש ו-z.html מפנים לדף העגלה", ["index.html", "z.html"].every(f => /http-equiv="refresh"[^>]*cafe\//.test(readFileSync(ROOT + f, "utf8"))));
  const sw = readFileSync(ROOT + "sw.js", "utf8");
  ok("sw.js מוחק את המטמון ומסיר את עצמו", /caches\.delete/.test(sw) && /registration\.unregister\(\)/.test(sw) && !/addEventListener\("fetch"/.test(sw));
} catch (e){
  fail++; console.log("  ✗ הבדיקה נפלה  " + e.message);
}

console.log(`\n${pass} עברו · ${fail} נכשלו`);
await b.close();
cleanup();
process.exit(fail ? 1 : 0);
