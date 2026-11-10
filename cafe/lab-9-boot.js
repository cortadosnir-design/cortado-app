requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
  const s = document.createElement("script");
  s.src = "sc/scrollcraft.js";
  s.onload = s.onerror = () => import("./lab-9.js");
  document.head.append(s);
})));
