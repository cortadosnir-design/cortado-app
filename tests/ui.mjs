// playwright עשוי להיות מותקן גלובלית ולא במאגר
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }
const PORT = process.env.PORT || 8899;
const PAGE = `http://127.0.0.1:${PORT}/harness.html`;
const PHOTO = new URL("photo.jpg", import.meta.url).pathname;
let pass = 0, fail = 0;
const ok  = (n, c, extra="") => { c ? (pass++, console.log("  ✓ " + n + (extra?"  "+extra:""))) : (fail++, console.log("  ✗ " + n + "  " + extra)); };

// חוברת אקסל מינימלית לבדיקת נתיב ה-xlsx בדפדפן אמיתי.
const XLSX = await (async () => {
  const { deflateRawSync } = await import("zlib");
  const files = {
    "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": '<sst><si><t>תאריך</t></si><si><t>לקוחות</t></si></sst>',
    "xl/styles.xml": '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" s="1"><v>46266</v></c><c r="B2"><v>55</v></c></row>' +
      '<row r="3"><c r="A3" s="1"><v>46267</v></c><c r="B3"><v>42</v></c></row>' +
      '</sheetData></worksheet>',
  };
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  const u16 = (n) => [n & 255, (n >> 8) & 255], u32 = (n) => [...u16(n & 0xffff), ...u16(n >>> 16)];
  for (const [name, text] of Object.entries(files)){
    const nm = enc.encode(name), raw = enc.encode(text), data = deflateRawSync(raw);
    const local = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(raw.length), ...u16(nm.length), ...u16(0), ...nm]);
    cd.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0), ...u32(0), ...u32(data.length), ...u32(raw.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...nm]));
    parts.push(local, data); off += local.length + data.length;
  }
  const cdBytes = Buffer.concat(cd.map(Buffer.from));
  const eocd = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(cd.length), ...u16(cd.length), ...u32(cdBytes.length), ...u32(off), ...u16(0)]);
  return Buffer.concat([...parts.map(Buffer.from), cdBytes, Buffer.from(eocd)]);
})();

const b = await chromium.launch();
const errors = [];
async function fresh(opts = {}){
  if (typeof opts === "number") opts = { w: opts };
  const p = await b.newPage({ viewport: { width: opts.w || 390, height: opts.h || 844 },
    colorScheme: opts.scheme || "light", deviceScaleFactor: opts.dpr || 1 });
  p.on("pageerror", e => errors.push("JS: " + e.message));
  p.on("console", m => { const t = m.text();
    if (m.type() === "error" && !t.includes("ERR_CERT")) errors.push("CONSOLE: " + t); });
  await p.goto(opts.url || PAGE, { waitUntil: "domcontentloaded" });
  if (!opts.url){ await p.waitForFunction(() => window.__ready === true); await p.waitForTimeout(250); }
  return p;
}

/* ── 1. הלוך-חזור של התמונה דרך פיירסטור המזויף ── */
console.log("\n1. התמונה נשמרת ומצוירת בלוח");
{
  const p = await fresh();
  await p.evaluate(() => window.C.newPost());
  await p.setInputFiles("#cPhoto", PHOTO);
  await p.waitForFunction(() => document.querySelector("#igImg img"));
  await p.fill("#cText", "הבוקר הראשון שבו היה צריך סוודר. שלושה קבועים על הספסל.");
  await p.fill("#cLine", "דני לקח כפול, כרגיל.");
  await p.click("#saveReady");
  await p.waitForTimeout(600);
  const w = await p.evaluate(() => window.__writes.filter(x => x.col === "posts"));
  ok("נכתב מסמך פוסט", w.length === 1, JSON.stringify(w.map(x=>x.keys.length)));
  ok("המסמך מכיל thumb", w[0] && w[0].keys.includes("thumb"));
  const st = await p.evaluate(() => { const k = Object.keys(window.__store.posts)[0];
    const d = window.__store.posts[k]; return { thumbLen: (d.thumb||"").length, status: d.status, bytes: JSON.stringify(d).length }; });
  ok("הממוזערת קטנה מ-20KB", st.thumbLen > 1000 && st.thumbLen < 20000, `${Math.round(st.thumbLen/1024)}KB`);
  ok("המסמך כולו קטן מ-1MB (מגבלת פיירסטור)", st.bytes < 1000000, `${Math.round(st.bytes/1024)}KB`);
  ok("הסטטוס 'מוכן' נשמר", st.status === "ready", st.status);
  // הלוח מתרענן מה-snapshot, בדיוק כמו באפליקציה האמיתית
  await p.evaluate(() => { document.getElementById("closeComposer").click(); });
  await p.waitForTimeout(300);
  const tiles = await p.locator(".wstrip .wtile img").count();
  ok("התמונה מופיעה ברצועת השבוע", tiles >= 1, `${tiles} תאים עם תמונה`);
  // רענון: טעינה מחדש מהמסמך השמור
  const persisted = await p.evaluate(async () => {
    const id = Object.keys(window.__store.posts)[0];
    window.C.loadPost(id);
    await new Promise(r => setTimeout(r, 200));
    const im = document.querySelector("#igImg img");
    return !!im && im.src.startsWith("data:image/jpeg");
  });
  ok("פתיחה מחדש מציגה את התמונה השמורה", persisted);
  await p.close();
}

/* ── 2. שער ההוספה ── */
console.log("\n2. שער ההוספה: טיוטת AI לא יוצאת בלי משפט שלך");
{
  const p = await fresh();
  await p.evaluate(() => { window.__api["/ai/post"] = { text: "בוקר של סוף ספטמבר בעגלה. הקפה חם והנוף פתוח לגולן.", hashtags: ["#קורטדו"] }; });
  await p.evaluate(() => window.C.newPost());
  await p.click("#aiWrite");
  await p.waitForTimeout(400);
  const drafted = await p.inputValue("#cText");
  ok("הטיוטה נכנסה לשדה", drafted.length > 20);
  await p.click("#saveReady");
  await p.waitForTimeout(300);
  let writes = await p.evaluate(() => window.__writes.filter(x => x.col === "posts").length);
  const msg = await p.textContent("#compStatus");
  ok("נחסם בלי משפט משלך", writes === 0, msg.slice(0, 40));
  await p.fill("#cLine", "שלמה ישב שעה וחצי ולא נגע בטלפון.");
  await p.click("#saveReady");
  await p.waitForTimeout(400);
  writes = await p.evaluate(() => window.__writes.filter(x => x.col === "posts").length);
  ok("נשמר אחרי שהוספת שורה", writes === 1);
  const learned = await p.evaluate(() => (window.__store.brand.memory || {}).examples || []);
  ok("התיקון נשמר ללימוד הקול", learned.length === 1);
  await p.close();
}

/* ── 4. מסך הכתיבה ── */
console.log("\n4. מסך הכתיבה");
{
  const p = await fresh();
  ok("סגור בהתחלה", await p.locator("#composer").isHidden());
  await p.evaluate(() => window.C.newPost());
  ok("נפתח כשכבה", await p.evaluate(() => getComputedStyle(document.getElementById("composer")).position) === "fixed");
  ok("גלילת הרקע ננעלת", await p.evaluate(() => document.body.classList.contains("sheeton")));
  ok("'פרטים' נפתח לפוסט מעבר לקצב", await p.evaluate(() => document.getElementById("compMore").open));
  ok("שדה התאריך נגיש", await p.locator("#cDate").isVisible());
  const bar = await p.evaluate(() => { const r = document.querySelector(".sheetbar").getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.height > 30; });
  ok("סרגל הפעולות בתוך המסך", bar);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  ok("Escape סוגר", await p.locator("#composer").isHidden() && !(await p.evaluate(() => document.body.classList.contains("sheeton"))));
  // שבוע בלי חומר: הצעד הבא הוא לספר, לא לכתוב על דף ריק
  const heroLabel = await p.textContent(".nextup button.primary");
  ok("בשבוע ריק הכפתור הוא 'ספר לי'", /ספר לי/.test(heroLabel), heroLabel);
  await p.click(".nextup button.primary");
  await p.waitForTimeout(300);
  ok("הכפתור פותח את השיחה השבועית", await p.locator("#briefCard").isVisible());
  // משבצת של הקצב: אין טופס תאריך, יש שורת מידע
  await p.click(".slotrow");
  await p.waitForTimeout(300);
  ok("משבצת קצב: שורת מידע ולא טופס",
    await p.locator("#slotMeta").isVisible() && await p.locator("#cFixed").isHidden());
  ok("'פרטים' סגור במשבצת קצב", !(await p.evaluate(() => document.getElementById("compMore").open)));
  await p.close();
}

/* ── 5. ייצוא ── */
console.log("\n5. ייצוא למתזמן");
{
  const p = await fresh();
  await p.evaluate(() => window.C.newPost());
  await p.fill("#cText", "שישי בבוקר, הנוף פתוח והקפה חזק.");
  await p.fill("#cLine", "אורנה הביאה עוגת תפוחים.");
  await p.click("#saveReady"); await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById("closeComposer").click());
  await p.evaluate(() => document.getElementById("exportCsv").click());
  await p.waitForTimeout(300);
  const d = await p.evaluate(() => window.__downloaded);
  ok("CSV נוצר עם תוכן", !!d && d.size > 80, d ? `${d.size} תווים` : "לא ירד");
  ok("שם הקובץ נכון", !!d && /^cortado-.*\.csv$/.test(d.name), d && d.name);
  await p.close();
}

/* ── 6. מצבי הרצועה ── */
console.log("\n6. רצועת השבוע");
{
  const p = await fresh();
  ok("שבעה תאים", await p.locator(".wday").count() === 7);
  const today = await p.locator(".wday.today").count();
  ok("יום אחד מסומן כהיום", today === 1, `${today}`);
  const cart = await p.locator(".wday.cart").count();
  ok("ימי פתיחה מודגשים", cart === 4, `${cart} ימים`);
  ok("צעד אחד בלבד", await p.locator(".nextup").count() === 1);
  ok("כפתור ראשי אחד בצעד הבא", await p.locator(".nextup button.primary").count() === 1);
  await p.close();
}

/* ── 7. לשוניות אחרות לא נשברו ── */
console.log("\n7. שאר האפליקציה");
{
  const p = await fresh({ w: 1000, h: 900 });
  const bad = await p.evaluate(() => {
    const out = [];
    for (const s of document.querySelectorAll("section.tabpanel")){
      s.hidden = false;
      if (s.scrollWidth > document.documentElement.clientWidth + 2) out.push(s.id + " גולש לרוחב");
    }
    return out;
  });
  ok("אין גלישה לרוחב באף לשונית", bad.length === 0, bad.join(", "));
  await p.close();
}
const m = await fresh({ w: 360, h: 780 });
{
  const over = await m.evaluate(() => {
    for (const s of document.querySelectorAll("section.tabpanel")) s.hidden = false;
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
  ok("אין גלילה אופקית ב-360px", over <= 0, `${over}px`);
  await m.close();
}

/* ── 8. תקציב הנתונים: 150 פוסטים עם תמונות ── */
console.log("\n8. תקציב פיירסטור");
{
  const p = await fresh();
  const r = await p.evaluate(async () => {
    const k = document.createElement("canvas"); k.width = k.height = 240;
    const g = k.getContext("2d");
    g.fillStyle = "#6B4A32"; g.fillRect(0,0,240,240);
    for (let i=0;i<300;i++){ g.fillStyle = `hsl(${i*7%360} 40% ${30+i%40}%)`;
      g.fillRect(Math.random()*240, Math.random()*240, 18, 18); }   // רעש, כמו צילום אמיתי
    const thumb = k.toDataURL("image/jpeg", 0.5);
    const t0 = performance.now();
    for (let i = 0; i < 150; i++){
      window.__store.posts["bulk" + i] = { week:"wtest", date:"2026-09-01", status:"done",
        text:"פוסט לדוגמה ".repeat(12), hashtags:["#קורטדו","#קיבוץשניר"], thumb };
    }
    const bytes = JSON.stringify(Object.values(window.__store.posts)).length;
    return { thumbKB: Math.round(thumb.length/1024), totalMB: +(bytes/1048576).toFixed(2), ms: Math.round(performance.now()-t0) };
  });
  ok("ממוזערת של צילום רועש", r.thumbKB < 20, `${r.thumbKB}KB`);
  ok("150 פוסטים מתחת ל-3MB", r.totalMB < 3, `${r.totalMB}MB`);
  // הלוח מצייר רק את השבוע הנוכחי — לא 150 תמונות
  const t0 = Date.now();
  await p.evaluate(() => window.C.render());
  await p.waitForTimeout(300);
  const imgs = await p.locator(".wstrip img, .slotrow img, .nextup img").count();
  ok("הלוח מצייר רק את השבוע", imgs <= 8, `${imgs} תמונות, ${Date.now()-t0}ms`);
  await p.close();
}

/* ── 9. מצב כהה ── */
console.log("\n9. מצב כהה");
{
  const p = await fresh({ scheme: "dark", dpr: 2 });
  await p.evaluate(() => window.C.newPost());
  await p.waitForTimeout(300);
  const c = await p.evaluate(() => {
    const g = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
    const lum = (s) => { const m = s.match(/\d+/g); return m ? (+m[0]*.299 + +m[1]*.587 + +m[2]*.114) : -1; };
    return { bodyBg: lum(g("body","backgroundColor")), sheetBg: lum(g("#composer","backgroundColor")),
      barBg: lum(g(".sheetbar","backgroundColor")), igBg: lum(g(".igimg","backgroundColor")),
      capInk: lum(g("#igText","color")) };
  });
  ok("הרקע כהה", c.bodyBg < 70, `${Math.round(c.bodyBg)}`);
  ok("שכבת הכתיבה כהה ולא לבנה", c.sheetBg < 90, `${Math.round(c.sheetBg)}`);
  ok("סרגל הפעולות כהה", c.barBg < 90, `${Math.round(c.barBg)}`);
  ok("מסגרת התמונה כהה", c.igBg < 90, `${Math.round(c.igBg)}`);
  ok("הטקסט בהיר על רקע כהה", c.capInk > 150, `${Math.round(c.capInk)}`);
  await p.evaluate(() => document.getElementById("closeComposer").click());
  await p.waitForTimeout(200);
  await p.close();
}

/* ── 10. נגישות ── */
console.log("\n10. נגישות");
{
  const p = await fresh();
  const a = await p.evaluate(() => {
    const out = { unnamed: [], small: [] };
    for (const n of document.querySelectorAll(".wday, .slotrow, .nextup button, #posterGo, .sheetbar button")){
      const name = (n.getAttribute("aria-label") || n.textContent || "").trim();
      if (!name) out.unnamed.push(n.className);
      const r = n.getBoundingClientRect();
      if (r.height && r.height < 40) out.small.push(n.className + ":" + Math.round(r.height));
    }
    return out;
  });
  ok("לכל כפתור בלוח יש שם נגיש", a.unnamed.length === 0, a.unnamed.join(", "));
  ok("אזורי נגיעה 40px ומעלה", a.small.length === 0, a.small.slice(0,4).join(", "));
  await p.evaluate(() => window.C.newPost());
  await p.waitForTimeout(200);
  const dlg = await p.evaluate(() => { const c = document.getElementById("composer");
    return { role: c.getAttribute("role"), modal: c.getAttribute("aria-modal"), label: c.getAttribute("aria-labelledby") }; });
  ok("המסך מוצהר כדיאלוג", dlg.role === "dialog" && dlg.modal === "true" && !!dlg.label, JSON.stringify(dlg));
  const labels = await p.evaluate(() => [...document.querySelectorAll("#composer input, #composer textarea, #composer select")]
    .filter(n => n.type !== "hidden" && !n.labels?.length && !n.getAttribute("aria-label")).map(n => n.id));
  ok("לכל שדה במסך הכתיבה יש תווית", labels.length === 0, labels.join(", "));
  await p.close();
}

/* ── 11. שאר העמודים ── */
console.log("\n11. עמודי העובד והשעות");
for (const [name, url] of [["z.html", "http://127.0.0.1:8899/z.html"], ["hours.html", "http://127.0.0.1:8899/hours.html"]]){
  const p = await fresh({ url });
  await p.waitForTimeout(600);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const txt = (await p.textContent("body")).trim().length;
  ok(name + " נטען ומציג תוכן", txt > 40, `${txt} תווים`);
  ok(name + " בלי גלילה אופקית", over <= 0, `${over}px`);
  await p.close();
}

/* ── 15. גוגל: הצעד הידני נספר ── */
console.log("\n15. מעקב אחרי העדכון הידני בגוגל");
{
  const p = await fresh();
  const has = await p.evaluate(() => {
    const L = window.L;
    return { exported: typeof L.googleMarked === "function", marked: L.googleMarked() };
  });
  ok("launch.js חושף את מצב הסימון", has.exported);
  ok("שבוע חדש מתחיל כלא-מסומן", has.marked === false);
  // סימון כותב על מסמך השבוע ומכבה את הכפתור
  await p.evaluate(async () => {
    window.S.week = { phase: "locked", launchedAt: {}, shifts: [] };
    document.getElementById("launchList").innerHTML = "";
  });
  const wrote = await p.evaluate(async () => {
    const before = window.__writes.length;
    window.S.week = { phase: "locked", googleAt: { seconds: Math.floor(Date.now()/1000) } };
    return { marked: window.L.googleMarked(), grew: window.__writes.length >= before };
  });
  ok("googleAt על מסמך השבוע נקרא כ'סומן'", wrote.marked === true);
  await p.close();
}
/* ── 16. מה שהאפליקציה עושה לבד ── */
console.log("\n16. סימוני סטטוס שנעשים לבד");
{
  const p = await fresh();
  // פוסט שתוזמן ל-אתמול → "פורסם" בלי נגיעה
  const r = await p.evaluate(async () => {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const d = `${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,"0")}-${String(y.getDate()).padStart(2,"0")}`;
    window.__store.posts["old"] = { week: "wtest", date: d, time: "10:00", status: "scheduled", text: "אתמול" };
    window.__store.posts["fut"] = { week: "wtest", date: "2099-01-01", time: "10:00", status: "scheduled", text: "עתיד" };
    window.S.posts = Object.entries(window.__store.posts).map(([id, x]) => ({ id, ...x }));
    window.C.render();
    await new Promise(r => setTimeout(r, 200));
    return { old: window.__store.posts.old.status, fut: window.__store.posts.fut.status, by: window.__store.posts.old.doneBy };
  });
  ok("מתוזמן שזמנו עבר → פורסם, לבד", r.old === "done" && r.by === "auto", JSON.stringify(r));
  ok("מתוזמן לעתיד נשאר מתוזמן", r.fut === "scheduled");
  // "כולם תוזמנו" — נגיעה אחת לכל המוכנים
  await p.evaluate(() => { window.__store.posts = {}; window.S.posts = []; });
  await p.evaluate(() => window.C.newPost());
  await p.fill("#cText", "פוסט ראשון מוכן לתזמון."); await p.fill("#cLine", "שורה שלי.");
  await p.click("#saveReady"); await p.waitForTimeout(300);
  await p.evaluate(() => document.getElementById("closeComposer").click());
  await p.evaluate(() => { document.getElementById("exportCard").open = true; });
  await p.click("#scheduleAll"); await p.waitForTimeout(300);
  const st = await p.evaluate(() => Object.values(window.__store.posts).map(x => x.status));
  ok("'כולם תוזמנו ✓' מסמן את כל המוכנים", st.length === 1 && st[0] === "scheduled", st.join(","));
  await p.close();
}
/* ── 17. שאל את הנתונים ── */
console.log("\n17. שאל את הנתונים");
{
  const p = await fresh();
  await p.evaluate(() => { document.getElementById("p-log").hidden = false; });
  await p.evaluate(() => { window.__api["/ai/analyze"] = { answer: "יום שישי הכי חזק: 55 לקוחות.", table: { columns: ["יום", "לקוחות"], rows: [["שישי", "55"], ["ראשון", "42"]] }, followups: ["ומה עם השעות?"] }; });
  await p.setInputFiles("#anaFile", { name: "קופה.csv", mimeType: "text/csv",
    buffer: Buffer.from("\uFEFFתאריך,יום,לקוחות\n2026-09-04,שישי,55\n2026-09-06,ראשון,42\n", "utf8") });
  await p.waitForFunction(() => !document.getElementById("anaAsk").hidden);
  const info = await p.textContent("#anaInfo");
  ok("הקובץ נקרא ומוצג", /2 שורות/.test(info) && /3 עמודות/.test(info), info);
  await p.fill("#anaQ", "איזה יום הכי חזק?");
  await p.press("#anaQ", "Enter");
  await p.waitForSelector(".ana-item");
  const call = await p.evaluate(() => window.__apiCalls.find(c => c.path === "/ai/analyze"));
  ok("נשלחו כותרות, שורות ופרופיל", call && call.body.columns.length === 3 && call.body.rows.length === 2 && call.body.profile.length === 3 && call.body.question === "איזה יום הכי חזק?", JSON.stringify(call && Object.keys(call.body)));
  ok("פרופיל מזהה עמודת מספרים", call && call.body.profile[2].type === "number" && call.body.profile[2].max === 55);
  const a = await p.textContent(".ana-a");
  ok("התשובה מוצגת", /55/.test(a), a);
  ok("הטבלה מוצגת", await p.locator(".ana-table tbody tr").count() === 2);
  ok("שאלת המשך היא כפתור", await p.locator(".ana-item .chip").count() === 1);
  ok("שדה השאלה התרוקן", (await p.inputValue("#anaQ")) === "");
  // כישלון ברשת: הודעה בעברית, לא קריסה
  await p.evaluate(() => { window.__api["/ai/analyze"] = { fail: "הגעת למכסה החינמית של Gemini." }; });
  await p.fill("#anaQ", "ומה עכשיו?"); await p.click("#anaGo");
  await p.waitForFunction(() => document.getElementById("anaStatus").classList.contains("bad"));
  ok("שגיאה מוצגת בעברית", /מכסה/.test(await p.textContent("#anaStatus")));
  // יומן המשמרות ריק → הסבר, לא שליחה
  await p.click("#anaLogs");
  ok("יומן ריק מסביר מה לעשות", /דיווח/.test(await p.textContent("#anaStatus")));
  // קובץ אקסל אמיתי, דרך שדה הקובץ, בדפדפן אמיתי
  await p.setInputFiles("#anaFile", { name: "מכירות.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX });
  await p.waitForFunction(() => /מכירות\.xlsx/.test(document.getElementById("anaInfo").textContent));
  const xi = await p.textContent("#anaInfo");
  ok("xlsx נקרא בדפדפן", /2 שורות/.test(xi) && /תאריך, לקוחות/.test(xi), xi);
  // xls ישן: הסבר, לא ניסיון קריאה
  await p.setInputFiles("#anaFile", { name: "ישן.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from("old") });
  await p.waitForFunction(() => document.getElementById("anaStatus").classList.contains("bad"));
  ok("xls ישן מוסבר, לא נקרא", /xlsx|CSV/.test(await p.textContent("#anaStatus")));
  await p.close();
}

/* ── 18. תזמון בנגיעה אחת ── */
console.log("\n18. תזמון ופרסום מהקומפוזר");
{
  const p = await fresh();
  await p.evaluate(() => {
    window.__api["/publish/schedule"] = (b) => ({
      fbPostId: "fb_1", fbPhotoId: "ph_1", publishAt: b.at, igPending: true, saved: false,
    });
  });
  await p.evaluate(() => window.C.newPost());
  await p.fill("#cText", "שישי בבוקר, הנוף פתוח והקפה חזק.");
  await p.fill("#cLine", "אורנה הביאה עוגת תפוחים.");
  ok("כפתור התזמון גלוי", await p.locator("#schedulePost").isVisible());
  await p.click("#schedulePost");
  await p.waitForTimeout(700);
  const sent = await p.evaluate(() => (window.__apiCalls.find(c => c.path === "/publish/schedule") || {}).body);
  ok("נשלח לשרת עם טקסט והאשטגים", !!sent && sent.text.includes("אורנה") && sent.text.includes("#"), sent && sent.text.slice(0, 30));
  ok("נשלח עם זמן עתידי", !!sent && sent.at > Date.now() - 86400000);
  const doc = await p.evaluate(() => Object.values(window.__store.posts)[0]);
  ok("הפוסט סומן מתוזמן ונשמר מזהה פייסבוק", doc.status === "scheduled" && doc.fbPostId === "fb_1", doc.status);
  ok("אינסטגרם מסומן כממתין בתור", doc.igPending === true);
  const msg = await p.textContent("#compStatus");
  ok("ההודעה מסבירה מה קרה בשתי הרשתות", /פייסבוק/.test(msg) && /אינסטגרם/.test(msg), msg.slice(0, 60));
  // פוסט שממתין לאינסטגרם לא מסומן "פורסם" ע"י ה-sweep
  const after = await p.evaluate(async () => {
    const id = Object.keys(window.__store.posts)[0];
    window.__store.posts[id].date = "2020-01-01"; window.__store.posts[id].time = "10:00";
    window.S.posts = Object.entries(window.__store.posts).map(([i, x]) => ({ id: i, ...x }));
    window.C.render(); await new Promise(r => setTimeout(r, 200));
    return window.__store.posts[id].status;
  });
  ok("ממתין לאינסטגרם לא נסגר כ'פורסם'", after === "scheduled", after);
  await p.close();
}
/* ── 21. הפצה: מספרים שנמשכים לבד ── */
console.log("\n21. משיכת מספרים ממטא");
{
  const p = await fresh();
  await p.evaluate(() => { document.getElementById("p-reach").hidden = false; });
  // שני פוסטים שפורסמו דרך האפליקציה, אחד ישן עם מספר גבוה שכבר נשמר
  await p.evaluate(() => {
    window.__api["/insights/posts"] = (b) => ({ posts: b.posts.map(x => ({ id: x.id, reach: 120, likes: 9, saves: 3 })) });
    window.__store.posts = {
      a: { week: "wtest", date: "2026-09-01", time: "10:00", status: "done", text: "פוסט א", fbPostId: "fb_a", igPostId: "ig_a", network: ["facebook","instagram"] },
      b: { week: "wtest", date: "2026-09-02", time: "10:00", status: "done", text: "פוסט ב", fbPostId: "fb_b", performance: { reach: 500, likes: 40, saves: 5, auto: true }, network: ["facebook"] },
      c: { week: "wtest", date: "2026-09-03", time: "10:00", status: "done", text: "ידני", network: ["facebook"] },
    };
    window.S.posts = Object.entries(window.__store.posts).map(([id, x]) => ({ id, ...x }));
    window.R.render();
  });
  await p.waitForTimeout(600);
  const call = await p.evaluate(() => window.__apiCalls.find(c => c.path === "/insights/posts"));
  ok("נשלחו רק פוסטים עם מזהה פרסום", !!call && call.body.posts.length === 2, call && call.body.posts.map(x => x.id).join(","));
  const after = await p.evaluate(() => ({ a: window.__store.posts.a.performance, b: window.__store.posts.b.performance }));
  ok("פוסט בלי מספרים התמלא", after.a && after.a.reach === 120 && after.a.auto === true, JSON.stringify(after.a));
  ok("מספר גבוה שכבר נשמר לא נדרס", after.b.reach === 500, String(after.b.reach));
  // שורה אוטומטית היא תצוגה, שורה ידנית היא שדות
  await p.waitForTimeout(300);
  const shape = await p.evaluate(() => ({ nums: document.querySelectorAll(".perfnums").length,
    inputs: document.querySelectorAll("#perfList input").length }));
  ok("פוסט אוטומטי מוצג בלי שדות", shape.nums === 2, String(shape.nums));
  ok("פוסט ידני שומר על ההקלדה", shape.inputs === 3, String(shape.inputs));
  // כפתור העתקה אחד, לא אחד לכל קבוצה
  const copies = await p.evaluate(() => [...document.querySelectorAll("#p-reach button")].filter(b => /העתק את טקסט השבוע/.test(b.textContent)).length);
  ok("כפתור העתקה אחד לכל הקבוצות", copies === 1, String(copies));
  await p.close();
}
console.log("\n" + (errors.length ? "שגיאות JS:\n" + [...new Set(errors)].join("\n") : "אין שגיאות JS"));
console.log(`\n${pass} עברו · ${fail} נכשלו`);
await b.close();
process.exit(fail ? 1 : 0);




