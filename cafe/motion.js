// תנועה: GSAP + ScrollTrigger (vendor/, מוגשים מהאתר עצמו). מצבי ההתחלה נקבעים כאן ולא ב-CSS,
// כך שבלי סקריפט, או בתנועה מופחתת, הדף שלם ועומד.
const { gsap, ScrollTrigger } = window;
gsap.registerPlugin(ScrollTrigger);
const mm = gsap.matchMedia();
mm.add("(prefers-reduced-motion: no-preference)", () => {
  const ease = "power3.out";
  // פתיחה: התמונה מתיישבת, הכותרת עולה שורה אחרי שורה
  gsap.from(".hero-photo img", { scale: 1.08, duration: 1.6, ease });
  gsap.from(".hero-card .ln, .hero-sub, .hero-card .actions", { y: 28, opacity: 0, duration: 0.9, ease, stagger: 0.09, delay: 0.15 });
  // עומק: התמונות זזות לאט מהדף
  gsap.to(".hero-photo img", { yPercent: 10, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.fromTo(".wide img", { yPercent: -7, scale: 1.14 }, { yPercent: 7, scale: 1.14, ease: "none", scrollTrigger: { trigger: ".wide", start: "top bottom", end: "bottom top", scrub: true } });
  gsap.utils.toArray(".split figure img, .visit figure img").forEach((img) => {
    gsap.fromTo(img, { scale: 1.12 }, { scale: 1, ease: "none", scrollTrigger: { trigger: img, start: "top bottom", end: "top 35%", scrub: true } });
  });
  // כותרות ופסקאות: כניסה אחת, פעם אחת
  gsap.utils.toArray("main section:not(.hero) h2").forEach((h) => {
    const set = [h, ...[...h.parentElement.children].filter((el) => el !== h && el.matches("p, .btn, .lists, .ratio, .sign, .actions"))];
    gsap.from(set, { y: 32, opacity: 0, duration: 0.9, ease, stagger: 0.08, scrollTrigger: { trigger: h, start: "top 86%", once: true } });
  });
  // הוויטרינה: הכרטיסים מסתובבים פנימה בתלת־ממד
  gsap.set(".track", { perspective: 1100 });
  gsap.from(".card", { rotateY: -38, z: -160, opacity: 0, duration: 1.1, ease, stagger: 0.1, transformOrigin: "100% 50%", scrollTrigger: { trigger: ".track", start: "top 82%", once: true } });
  gsap.from(".facts > div", { y: 36, opacity: 0, duration: 0.8, ease, stagger: 0.1, scrollTrigger: { trigger: ".facts", start: "top 88%", once: true } });
  gsap.from(".rev-grid figure", { y: 36, opacity: 0, duration: 0.8, ease, stagger: 0.12, scrollTrigger: { trigger: ".rev-grid", start: "top 86%", once: true } });
  gsap.from(".hours tr", { x: 24, opacity: 0, duration: 0.6, ease, stagger: 0.05, scrollTrigger: { trigger: ".hours", start: "top 88%", once: true } });
});
// המנות בוויטרינה נוטות אחרי העכבר (מחשב בלבד): הריבוע מסתובב והמנה צפה מעליו
mm.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
  const tiles = gsap.utils.toArray(".tile");
  const offs = tiles.map((tile) => {
    const img = tile.querySelector("img");
    gsap.set(tile, { transformPerspective: 700, transformStyle: "preserve-3d" });
    const rx = gsap.quickTo(tile, "rotationX", { duration: 0.5, ease: "power3" }), ry = gsap.quickTo(tile, "rotationY", { duration: 0.5, ease: "power3" });
    const ix = gsap.quickTo(img, "x", { duration: 0.5, ease: "power3" }), iy = gsap.quickTo(img, "y", { duration: 0.5, ease: "power3" });
    const move = (e) => { const r = tile.getBoundingClientRect(), u = (e.clientX - r.left) / r.width - 0.5, v = (e.clientY - r.top) / r.height - 0.5; ry(u * 14); rx(-v * 14); ix(u * 18); iy(v * 18); };
    const leave = () => { rx(0); ry(0); ix(0); iy(0); };
    tile.addEventListener("pointermove", move); tile.addEventListener("pointerleave", leave);
    return () => { tile.removeEventListener("pointermove", move); tile.removeEventListener("pointerleave", leave); };
  });
  return () => offs.forEach((f) => f());
});
