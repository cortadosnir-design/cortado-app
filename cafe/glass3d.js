// כוס הקורטדו בתלת־ממד (three.js), מתוך התצוגה של 12.11.2026 שהבעלים אהב. כאן הגלילה עצמה ממלאת אותה:
// אספרסו, ואז חלב חם באותה כמות, ופס דק של קצף. three.js (600KB) נטען רק כשמתקרבים לפס.
// בלי WebGL, או בתנועה מופחתת, נשארת תמונת הכוס.
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const $ = (s, r = document) => r.querySelector(s);
const HEAD_AT = 0.62;
const pour = $("#pour");
if (pour && !still){
  const io = new IntersectionObserver((es) => {
    if (!es[0].isIntersecting) return;
    io.disconnect();
    const s = document.createElement("script");
    s.src = new URL("vendor/three.min.js", import.meta.url).href;
    s.onload = () => { try { glass3d(window.THREE); } catch (e) { pour.classList.remove("gl-on"); const c = $(".gl3d", pour); if (c) c.remove(); } };
    document.head.append(s);
  }, { rootMargin: "150% 0px" });
  io.observe(pour);
}

function glass3d(T){
  const stage = $(".band-art", pour), wrap = $(".band-art img", pour);
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
    const ppw = Math.max(40, w.height * 0.78 / 2.4);           // פיקסלים ליחידת עולם: גובה הכוס 2.4
    dist = SH / (2 * TAN * ppw);
    shiftX = -((w.left + w.width / 2) - (s.left + SW / 2)) / ppw;
    shiftY = ((w.top + w.height * 0.5) - (s.top + SH / 2)) / ppw;
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
    const pr = pour.getBoundingClientRect();
    const p0 = clamp((innerHeight * 0.92 - pr.top) / (pr.height + innerHeight * 0.2), 0, 1);   // ההתקדמות: מהרגע שהפס נכנס ועד שהוא כמעט יוצא
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
