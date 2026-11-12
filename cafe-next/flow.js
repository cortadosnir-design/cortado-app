// הקפה שמוביל את הדף (12.11.2026, בבקשת הבעלים): "הקפה פשוט נשפך מדף לדף".
// שלושה דברים, כולם רק תוספת מעל הדף הקיים. בלי הקובץ הזה הדף עובד בדיוק כמו קודם:
//   1. עומק אמיתי בהירו: perspective ב-CSS, וכאן רק הנדנוד העדין.
//   2. הזרם: קו קפה אחד שיוצא מהכוסות, יורד לאורך השוליים ונמזג לכוס; ממנה ממשיך עד כפתור הניווט.
//   3. כוס הקורטדו בתלת־ממד (three.js, נטען רק כשמתקרבים אליה). בלי WebGL נשארת כוס ה-SVG.
//   4. תמונות חיות: וידאו שקט בלולאה מעל התמונות האמיתיות.
// תנועה מופחתת: בלי נדנוד ובלי תלת־ממד, והזרם מצויר שלם ועומד.
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
/** smoothstep: 0 עד a, 1 מ-b, ריכוך באמצע. עובד גם כש-a גדול מ-b (יורד). */
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const $ = (s, r = document) => r.querySelector(s);

const ESPRESSO = "#2A1409", CORTADO = "#9A6230";
const HEAD_AT = 0.62;                       // ראש הזרם רוכב ב-62% מגובה המסך, כדי שהעין תלך אחריו

/* ===== 1 · ההירו: נדנוד ===== */
const hero = $("#hero"), heroStage = $(".hero-stage");
if (hero && heroStage && !still){
  hero.classList.add("d3");
  let on = false, id = 0;
  const sway = (t) => {
    if (!on) return;
    t /= 1000;
    heroStage.style.setProperty("--swy", (Math.sin(t * 0.6) * 2.2).toFixed(2) + "deg");
    heroStage.style.setProperty("--swx", (Math.cos(t * 0.45) * 1).toFixed(2) + "deg");
    id = requestAnimationFrame(sway);
  };
  new IntersectionObserver((es) => {
    on = es[0].isIntersecting; cancelAnimationFrame(id);
    if (on) id = requestAnimationFrame(sway);
  }).observe(heroStage);
}

/* ===== תמונות חיות ===== */
// וידאו שקט בלולאה שנוצר מהתמונה עצמה (Kling) ומונח מעליה. נטען רק כשמתקרבים, מנגן רק כשרואים אותו,
// ולא נטען בכלל בתנועה מופחתת או במצב חיסכון בנתונים: אז נשארת התמונה.
if (!still && !(navigator.connection && navigator.connection.saveData)){
  const io = new IntersectionObserver((es) => {
    for (const e of es){
      const v = e.target;
      if (e.isIntersecting){
        if (!v.src){ v.src = v.dataset.live; v.addEventListener("playing", () => v.classList.add("on"), { once: true }); }
        v.play().catch(() => {});                 // דפדפן שחוסם ניגון אוטומטי: התמונה נשארת
      } else if (v.src) v.pause();
    }
  }, { rootMargin: "40% 0px" });
  document.querySelectorAll("video.live").forEach((v) => io.observe(v));
}

/* ===== 2 · הזרם ===== */
const pour = $("#pour");
const thread = (() => {
  const cv = document.createElement("canvas");
  cv.className = "thread"; cv.setAttribute("aria-hidden", "true");
  document.body.append(cv);
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1, segs = [], head = 0, raf = 0, last = "";

  /** מיקום ביחס לראש המסמך (לא למסך). */
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right, cx: r.left + r.width / 2 }; };

  /** דוגם מסלול דרך נקודות עם משיקים אנכיים: הקפה תמיד נופל למטה, אף פעם לא מטפס. */
  function sample(pts){
    const xs = [pts[0][0]], ys = [pts[0][1]];
    for (let i = 1; i < pts.length; i++){
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], my = (y0 + y1) / 2;
      const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 5));
      for (let k = 1; k <= n; k++){
        const t = k / n, u = 1 - t;
        xs.push(u * u * u * x0 + 3 * u * u * t * x0 + 3 * u * t * t * x1 + t * t * t * x1);
        ys.push(u * u * u * y0 + 3 * u * u * t * my + 3 * u * t * t * my + t * t * t * y1);
      }
    }
    return { xs, ys };
  }

  /** בונה את שני חלקי הזרם ממיקומי הקטעים בפועל. נקרא שוב בכל שינוי גודל (גם כשקטע רחוק מצויר לראשונה). */
  function build(){
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    const gut = clamp(W * 0.05, 20, 80), L = gut / 2, R = W - gut / 2, PAD = Math.min(70, H * 0.09);   // gut = --gutter של הדף
    const glass = $(".glass-wrap"), cups = $(".f-front .cups");
    const mid = glass ? box(glass).cx : W / 2;
    segs = [];
    const stage = heroStage && box(heroStage), lawn = $("#lawn"), st = $(".statement");
    if (stage && pour){
      const pts = [[cups ? box(cups).cx : W / 2, stage.bottom - 4]];
      for (const el of [lawn, st]) if (el){ const b = box(el); pts.push([L, b.top + PAD], [L, b.bottom - PAD]); }
      pts.push([mid, box(pour).top]);
      segs.push({ color: ESPRESSO, ...sample(pts) });
    }
    const go = $("#visit .btn-apricot");
    if (pour && go){
      const pts = [[mid, box(pour).bottom - 2]];
      // בטלפון הזרם מחליף צד בין קטע לקטע (מעבר קצר במרווח שביניהם). במסך רחב הוא נשאר בצד אחד, כדי שלא יחצה את התוכן.
      let side = L;
      for (const el of [$("#story"), $("#offer"), $("#reviews")]) if (el){ const b = box(el); pts.push([side, b.top + PAD], [side, b.bottom - PAD]); if (W < 900) side = side === L ? R : L; }
      // בקטע הביקור יורדים בצד של הכפתור ונכנסים אליו בקשת קצרה מלמעלה
      const e = box(go), v = box($("#visit")), near = W < 900 ? (e.cx > W / 2 ? R : L) : side;
      pts.push([near, v.top + PAD], [near, Math.max(v.top + PAD + 1, e.top - 1.3 * PAD)], [e.cx, e.top - 2]);
      segs.push({ color: CORTADO, end: go, ...sample(pts) });
    }
    last = ""; kick();
  }

  function draw(){
    raf = 0;
    const target = still ? Infinity : scrollY + H * HEAD_AT;
    head = still || !head ? target : lerp(head, target, 0.22);
    if (Math.abs(target - head) < 0.4) head = target;
    const key = scrollY + "|" + head;
    if (key !== last){
      last = key;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = W < 700 ? 6 : 8; ctx.lineCap = ctx.lineJoin = "round";
      let drew = false;
      for (const s of segs){
        const n = s.ys.length, top = scrollY - 40, bot = Math.min(head, scrollY + H + 40);
        const done = head >= s.ys[n - 1];
        if (s.end) s.end.classList.toggle("poured", done);
        if (s.ys[0] > bot || s.ys[n - 1] < top) continue;
        let lo = 0, hi = n - 1;                              // הנקודה הראשונה שבתוך המסך
        while (lo < hi){ const m = (lo + hi) >> 1; if (s.ys[m] < top) lo = m + 1; else hi = m; }
        let i = Math.max(0, lo - 1), x = s.xs[i], y = s.ys[i];
        ctx.strokeStyle = ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.moveTo(x, y - scrollY);
        for (i++; i < n && s.ys[i] <= bot; i++){ x = s.xs[i]; y = s.ys[i]; ctx.lineTo(x, y - scrollY); }
        ctx.stroke(); drew = true;
        if (!done && !still && y - scrollY < H + 10){ ctx.beginPath(); ctx.arc(x, y - scrollY, ctx.lineWidth * 0.85, 0, 7); ctx.fill(); }
      }
      cv.style.visibility = drew ? "" : "hidden";   // קנבס ריק לא נשאר על המסך (גם לא כשכבה ישנה של המרכיב הגרפי)
    }
    if (head !== target) kick();
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };

  let t = 0;
  const rebuild = () => { clearTimeout(t); t = setTimeout(build, 120); };
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", rebuild);
  addEventListener("load", rebuild);
  if (window.ResizeObserver && $("main")) new ResizeObserver(rebuild).observe($("main"));
  build();
  return { get head(){ return head; } };
})();

/* ===== 3 · הכוס בתלת־ממד ===== */
if (pour && !still){
  const io = new IntersectionObserver((es) => {
    if (!es[0].isIntersecting) return;
    io.disconnect();
    const s = document.createElement("script");
    s.src = new URL("sc/three.min.js", import.meta.url).href;
    s.onload = () => { try { glass3d(window.THREE); } catch (e) { pour.classList.remove("gl-on"); } };
    document.head.append(s);
  }, { rootMargin: "150% 0px" });
  io.observe(pour);
}

function glass3d(T){
  const stage = $(".pour-stage", pour), wrap = $(".glass-wrap", pour);
  if (!stage || !wrap) return;
  const canvas = document.createElement("canvas");
  canvas.className = "gl3d"; canvas.setAttribute("aria-hidden", "true");
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });   // זורק אם אין WebGL, ואז נשארת כוס ה-SVG
  stage.prepend(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.localClippingEnabled = true;

  const scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, 0.1, 80);
  /** צבע sRGB → ליניארי, כדי שהגוונים יתאימו לדף ולא יישטפו. */
  const C = (hex) => new T.Color(hex).convertSRGBToLinear();
  scene.add(new T.HemisphereLight(0xffffff, 0x6b4a2e, 0.75));
  const key = new T.DirectionalLight(0xffffff, 0.55); key.position.set(3, 5, 4); scene.add(key);

  const glass = new T.Group(); scene.add(glass);
  const V = (r, y) => new T.Vector2(r, y);
  const FLOOR = -0.95, BREAK = -0.15, BRIM = 1.2, R0 = 0.69, R1 = 0.93;   // רצפת הכוס, סוף הפאות, שפה, רדיוס פנימי למטה ולמעלה
  const radiusAt = (y) => y < BREAK ? lerp(R0, R1, (y - FLOOR) / (BREAK - FLOOR)) : R1;

  // כך מכינים קורטדו (נבדק 12.11.2026): אספרסו כפול, כ-60 מ"ל, וחלב מאודה קלות באותה כמות, 1:1, בכוס ג'יברלטר
  // של 4.5 אונקיות (133 מ"ל). החלב נמזג לתוך האספרסו ומתערבב בו מיד, ובסוף נשאר למעלה רק פס דק של מיקרו-קצף.
  // לכן הגבהים כאן נגזרים מנפח ולא מחצי גובה (הכוס צרה למטה), והמשקה מתבהר בהדרגה במקום לשבת בשכבות.
  const GLASS_ML = 133, SHOT_ML = 60, MILK_ML = 60;
  const volTo = (y) => {                                      // נפח פנים הכוס מהרצפה עד גובה y
    const yf = Math.min(y, BREAK), r = radiusAt(yf);
    return Math.PI / 3 * (yf - FLOOR) * (R0 * R0 + R0 * r + r * r) + Math.max(0, y - BREAK) * Math.PI * R1 * R1;
  };
  const levelFor = (ml) => {                                   // הגובה שאליו מגיעים ml מיליליטר
    const want = ml / GLASS_ML * volTo(BRIM); let a = FLOOR, b = BRIM;
    for (let i = 0; i < 24; i++){ const m = (a + b) / 2; if (volTo(m) < want) a = m; else b = m; }
    return (a + b) / 2;
  };
  const MID = levelFor(SHOT_ML), TOP = levelFor(SHOT_ML + MILK_ML), FOAM = 0.07;   // FOAM: עובי פס הקצף

  // נוזל: צורה אחת של פנים הכוס, שנחשפת עד מישור חיתוך. בלי לבנות גיאומטריה בכל פריים.
  const liquid = new T.LatheGeometry([V(0, FLOOR), V(R0, FLOOR), V(R1, BREAK), V(R1, 1.1)], 72);
  const clipLow = new T.Plane(new T.Vector3(0, -1, 0), FLOOR), clipHigh = new T.Plane(new T.Vector3(0, -1, 0), FLOOR);
  const clipFrom = new T.Plane(new T.Vector3(0, 1, 0), 0);          // מעליו: פס הקצף
  const lowMat = new T.MeshStandardMaterial({ color: C(0x2a1409), roughness: 0.4, clippingPlanes: [clipLow] });
  const highMat = new T.MeshStandardMaterial({ color: C(0xdcc19a), roughness: 0.6, clippingPlanes: [clipHigh, clipFrom] });
  const low = new T.Mesh(liquid, lowMat), high = new T.Mesh(liquid, highMat);
  glass.add(low, high);

  const capMat = new T.MeshStandardMaterial({ color: C(0x6b3a17), roughness: 0.6 });
  const cap = new T.Mesh(new T.CircleGeometry(1, 64), capMat); cap.rotation.x = -Math.PI / 2; glass.add(cap);

  // ציור לאטה: רוזטה של חצאי סהר ולב למעלה, מצויר על קנבס (בלי קובץ תמונה)
  const ac = document.createElement("canvas"); ac.width = ac.height = 256;
  const a = ac.getContext("2d"); a.translate(128, 128); a.fillStyle = "#fbf3e4";
  for (let i = 0; i < 5; i++){
    const s = 1 - i * 0.13, y = 74 - i * 30;
    a.globalCompositeOperation = "source-over"; a.beginPath(); a.ellipse(0, y, 78 * s, 34 * s, 0, 0, 7); a.fill();
    a.globalCompositeOperation = "destination-out"; a.beginPath(); a.ellipse(0, y + 17 * s, 70 * s, 27 * s, 0, 0, 7); a.fill();
  }
  a.globalCompositeOperation = "source-over";
  a.beginPath(); a.moveTo(0, -62); a.bezierCurveTo(-46, -98, -46, -128, -16, -118); a.bezierCurveTo(-6, -115, 0, -106, 0, -100);
  a.bezierCurveTo(0, -106, 6, -115, 16, -118); a.bezierCurveTo(46, -128, 46, -98, 0, -62); a.fill();
  a.globalCompositeOperation = "destination-out"; a.fillRect(-2, -96, 4, 190);
  const artTex = new T.CanvasTexture(ac); artTex.encoding = T.sRGBEncoding;
  const artMat = new T.MeshBasicMaterial({ map: artTex, transparent: true, opacity: 0, depthWrite: false });
  const art = new T.Mesh(new T.CircleGeometry(0.84, 48), artMat); art.rotation.x = -Math.PI / 2; art.renderOrder = 1; glass.add(art);

  // זכוכית: קצה חם וכהה בזווית שטוחה ושני הבהקי חלון. הפאות מקבלות נורמל שטוח לכל פאה.
  const glassMat = (facet, side) => new T.ShaderMaterial({
    transparent: true, depthWrite: false, side, extensions: { derivatives: true }, uniforms: { uFacet: { value: facet } },
    vertexShader: "varying vec3 vN;varying vec3 vP;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vP=mv.xyz;gl_Position=projectionMatrix*mv;}",
    fragmentShader: `uniform float uFacet;varying vec3 vN;varying vec3 vP;
      void main(){
        vec3 n=normalize(vN); if(uFacet>.5) n=normalize(cross(dFdx(vP),dFdy(vP)));
        vec3 v=normalize(-vP); if(dot(n,v)<0.) n=-n;
        float fres=pow(1.-abs(dot(n,v)),2.4);
        vec3 l1=normalize(vec3(.55,.5,.67)), l2=normalize(vec3(-.62,.2,.76));
        float s=pow(max(dot(reflect(-l1,n),v),0.),42.)*.95+pow(max(dot(reflect(-l2,n),v),0.),16.)*.3;
        float f=uFacet*pow(max(dot(n,l1),0.),3.)*.45;
        float hi=clamp(s+f,0.,1.);
        gl_FragColor=vec4(mix(vec3(.30,.23,.17),vec3(1.),hi),clamp(fres*.42+.015+hi*.9,0.,1.));
      }` });
  const wall = new T.LatheGeometry([V(0, -1.2), V(0.74, -1.2), V(1, BREAK), V(1, 1.2), V(0.94, 1.2), V(0.94, BREAK), V(0.70, FLOOR), V(0, FLOOR)], 72);
  const shell = new T.Mesh(wall, glassMat(0, T.DoubleSide)); shell.renderOrder = 3;
  const facets = new T.Mesh(new T.LatheGeometry([V(0.745, -1.2), V(1.012, BREAK)], 14), glassMat(1, T.FrontSide)); facets.renderOrder = 4;
  const rim = new T.Mesh(new T.TorusGeometry(0.97, 0.03, 10, 72), glassMat(0, T.FrontSide));
  rim.rotation.x = Math.PI / 2; rim.position.y = 1.2; rim.renderOrder = 5;
  glass.add(shell, facets, rim);

  const streamMat = new T.MeshStandardMaterial({ color: C(0x2a1409), roughness: 0.3 });
  const stream = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 16), streamMat); stream.visible = false; scene.add(stream);

  const sc = document.createElement("canvas"); sc.width = sc.height = 128;
  const sg = sc.getContext("2d"), rg = sg.createRadialGradient(64, 64, 6, 64, 64, 64);
  rg.addColorStop(0, "rgba(60,38,20,.42)"); rg.addColorStop(1, "rgba(60,38,20,0)"); sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
  const shadow = new T.Mesh(new T.PlaneGeometry(4.6, 4.6), new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.21; scene.add(shadow);

  const cEsp = C(0x2a1409), cBody = C(0x9a6230), cCrema = C(0xa86a33), cTop = C(0xc39762),
        cStreamE = C(0x2a1409), cStreamM = C(0xfaf1e0);
  const TAN = Math.tan(15 * Math.PI / 180);

  // הכוס יושבת בדיוק במקום של כוס ה-SVG (.glass-wrap), בכל רוחב מסך. נמדד רק בשינוי גודל.
  let SW = 1, SH = 1, dist = 10, shiftX = 0, shiftY = 0;
  function place(){
    const s = stage.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    SW = s.width; SH = s.height;
    renderer.setSize(SW, SH, false); cam.aspect = SW / SH; cam.updateProjectionMatrix();
    const ppw = Math.max(40, w.height * 0.62 / 2.4);           // פיקסלים ליחידת עולם: גובה הכוס 2.4
    dist = SH / (2 * TAN * ppw);
    shiftX = -((w.left + w.width / 2) - (s.left + SW / 2)) / ppw;
    shiftY = ((w.top + w.height * 0.56) - (s.top + SH / 2)) / ppw;
  }
  place(); addEventListener("resize", place);
  if (window.ResizeObserver) new ResizeObserver(place).observe(stage);

  // גרירה לצדדים מסובבת. גרירה אנכית עדיין גוללת את הדף (touch-action: pan-y).
  let drag = 0, vel = 0, down = false, lastX = 0;
  canvas.addEventListener("pointerdown", (e) => { down = true; lastX = e.clientX; });
  addEventListener("pointermove", (e) => { if (!down) return; vel = (e.clientX - lastX) * 0.012; drag += vel; lastX = e.clientX; }, { passive: true });
  addEventListener("pointerup", () => { down = false; }); addEventListener("pointercancel", () => { down = false; });

  const look = new T.Vector3();
  let ps = 0;
  function frame(t){
    t /= 1000;
    const p0 = parseFloat(pour.style.getPropertyValue("--sc-p")) || 0;   // ההתקדמות של המנוע: אותה אחת שמניעה את המונים
    ps += (p0 - ps) * 0.14; const p = ps;
    const q = clamp(1 - pour.getBoundingClientRect().top / innerHeight, 0, 1);   // הקטע נכנס למסך, לפני הנעיצה
    if (!down){ drag += vel; vel *= 0.94; }

    // אספרסו (p .12→.42) עם קרמה מעליו; החלב (p .44→.70) נמזג לתוכו והכול מתבהר יחד. אותם טווחים של המונים בדף.
    const eA = ss(0.12, 0.42, p), mB = ss(0.44, 0.70, p), up = ss(0.78, 0.96, p);
    const level = mB > 0 ? lerp(MID, TOP, mB) : lerp(FLOOR, MID, eA);
    const foam = FOAM * ss(0.55, 1, mB);
    clipLow.constant = level - foam; clipHigh.constant = level; clipFrom.constant = -(level - foam);
    high.visible = foam > 0.002;
    lowMat.color.copy(cEsp).lerp(cBody, Math.pow(mB, 0.6));
    const rr = radiusAt(level); cap.position.y = level; cap.scale.set(rr, rr, 1); cap.visible = eA > 0.004;
    capMat.color.copy(cCrema).lerp(cTop, mB);
    const artIn = ss(0.3, 1, mB), as = 0.25 + 0.75 * artIn;
    art.position.y = level + 0.004; art.scale.set(as, as, 1); artMat.opacity = artIn;

    const d = dist * lerp(1, 0.9, up), half = d * TAN;
    cam.position.set(shiftX, shiftY + lerp(0.55, 4.2, up), d);
    look.set(shiftX, shiftY + lerp(0.1, 0.5, up), 0); cam.lookAt(look);

    // הזרם שהוביל לכאן ממשיך ליפול אל הכוס: נכנס מראש המסך כשהקטע עולה, ונוגע ברצפה רגע לפני שהמילוי מתחיל
    const topY = look.y + half + 0.6;
    const u = q < 1 ? clamp((q - (1 - HEAD_AT)) / HEAD_AT, 0, 1) * 0.75 : 0.75 + 0.25 * clamp(p / 0.12, 0, 1);
    const pouring = (u > 0 && eA < 1) || (mB > 0 && mB < 1);
    stream.visible = pouring;
    if (pouring){
      const k = mB > 0 ? mB : eA, thick = 0.008 + 0.022 * ss(1, 0.82, k);      // מתדקק בסוף כל מזיגה
      const bottom = eA > 0 || mB > 0 ? level : lerp(topY, FLOOR, u), len = topY - bottom + 0.001;
      streamMat.color.copy(mB > 0 ? cStreamM : cStreamE);
      stream.scale.set(thick, len, thick); stream.position.set(0, bottom + len / 2, 0);
    }
    glass.rotation.y = p * Math.PI * 1.6 + drag + t * 0.12;
    renderer.render(scene, cam);
  }
  frame(0);
  pour.classList.add("gl-on");
  let on = false, id = 0;
  const tick = (t) => { if (!on) return; frame(t); id = requestAnimationFrame(tick); };
  new IntersectionObserver((es) => { on = es[0].isIntersecting; cancelAnimationFrame(id); if (on) id = requestAnimationFrame(tick); }, { rootMargin: "10% 0px" }).observe(pour);
}
