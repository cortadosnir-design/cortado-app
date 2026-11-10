// ניסוי: הסקריפטים נטענים רק אחרי שהמסך הראשון צויר
const go = () => {
  const s = document.createElement("script");
  s.src = "sc/scrollcraft.js";
  s.onload = s.onerror = () => { const m = document.createElement("script"); m.type = "module"; m.src = "cafe.js"; document.head.append(m); };
  document.head.append(s);
};
let done = false;
const once = () => { if (!done){ done = true; requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(go, 0))); } };
if (document.readyState === "complete") once(); else addEventListener("load", once, { once: true });
setTimeout(once, 2500);
