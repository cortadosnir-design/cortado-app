// מסילת התפריט: חיצים ומונה. בלי הסקריפט המסילה נגללת באצבע כרגיל.
const track = document.getElementById("track");
const ctl = document.querySelector(".rail-ctl");
if (track && ctl){
  const cards = [...track.children];
  const out = ctl.querySelector("output");
  const [prev, next] = ctl.querySelectorAll("button");
  const edge = (el) => el.getBoundingClientRect().right;
  const index = () => { const t = edge(track); let b = 0, d = Infinity; cards.forEach((c, i) => { const x = Math.abs(edge(c) - t); if (x < d){ d = x; b = i; } }); return b; };
  const sync = () => { const i = index(); out.textContent = (i + 1) + " / " + cards.length; prev.disabled = i === 0; next.disabled = track.scrollWidth - track.clientWidth - Math.abs(track.scrollLeft) < 4; };
  ctl.hidden = false;
  ctl.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const i = Math.min(cards.length - 1, Math.max(0, index() + +b.dataset.dir)); cards[i].scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", inline: "start", block: "nearest" }); });
  let raf = 0; track.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); }, { passive: true });
  sync();
}
