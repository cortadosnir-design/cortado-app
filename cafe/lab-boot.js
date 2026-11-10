addEventListener("load", () => setTimeout(() => {
  const s = document.createElement("script");
  s.src = "sc/scrollcraft.js";
  s.onload = s.onerror = () => import("./cafe.js");
  document.head.append(s);
}, 0));
