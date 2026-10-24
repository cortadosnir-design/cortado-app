// Real-notebook frame (24.10.2026). Include after the page's own markup.
// body[data-lined] rules the paper; body[data-clip] adds the binder clip.
// Fill-ins: .pin .pen .stain .heart .paperclip get their SVG from here, placed by their inline style.
(function () {
  const b = document.body, NS = "http://www.w3.org/2000/svg";
  const add = (html, before) => { const t = document.createElement("template"); t.innerHTML = html.trim(); const n = t.content.firstChild;
    before ? b.insertBefore(n, b.firstChild) : b.appendChild(n); return n; };

  // the layers under the page, inserted back to front at the start of <body>
  const under = [
    '<img class="doodles" src="../assets/art/doodles-post.svg" alt="">',
    '<svg class="desk-noise" viewBox="0 0 1080 1350" preserveAspectRatio="none"><filter id="dn"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .16 0"/></filter><rect width="1080" height="1350" filter="url(#dn)"/></svg>',
    '<div class="desk-vig"></div>',
    '<div class="sheet s3"></div>', '<div class="sheet s2"></div>',
    `<div class="paper${"lined" in b.dataset ? " lined" : ""}"><svg class="grain" viewBox="0 0 880 1170" preserveAspectRatio="none"><filter id="pg"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .4  0 0 0 0 .33  0 0 0 .13 0"/></filter><rect width="880" height="1170" filter="url(#pg)"/></svg><div class="edge"></div></div>`,
  ];
  for (const h of under.reverse()) add(h, true);

  // punched holes and the wire coil, over everything on the page
  let g = "", x = 910;
  for (let y = 150; y <= 1222; y += 67) {
    g += `<ellipse cx="${x}" cy="${y}" rx="10" ry="9" fill="#3d3b38"/><ellipse cx="${x}" cy="${y + 1.5}" rx="10" ry="7.5" fill="#24221f"/>`;
    g += `<path d="M${x + 2} ${y + 5} C${x + 40} ${y - 16},${x + 112} ${y - 10},${x + 108} ${y + 9} C${x + 104} ${y + 24},${x + 66} ${y + 26},${x + 32} ${y + 20}" fill="none" stroke="rgba(0,0,0,.38)" stroke-width="8" stroke-linecap="round" filter="url(#cs)" transform="translate(4 7)"/>`;
    g += `<path d="M${x + 108} ${y + 9} C${x + 104} ${y + 24},${x + 66} ${y + 26},${x + 32} ${y + 20}" fill="none" stroke="url(#wb)" stroke-width="6.5" stroke-linecap="round"/>`;
    g += `<path d="M${x + 1} ${y + 3} C${x + 40} ${y - 18},${x + 112} ${y - 12},${x + 108} ${y + 9}" fill="none" stroke="url(#wf)" stroke-width="8" stroke-linecap="round"/>`;
  }
  add(`<svg class="over" viewBox="0 0 1080 1350"><defs>
    <filter id="cs" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.6"/></filter>
    <linearGradient id="wf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".35" stop-color="#c3c7cc"/><stop offset=".7" stop-color="#6c7176"/><stop offset="1" stop-color="#d8dbdf"/></linearGradient>
    <linearGradient id="wb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b6f74"/><stop offset="1" stop-color="#2e3134"/></linearGradient>
  </defs>${g}</svg>`);

  if ("clip" in b.dataset) add(`<svg class="clip" width="180" height="170" viewBox="0 0 180 170"><defs>
    <linearGradient id="cb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f5f6"/><stop offset=".3" stop-color="#d4d7da"/><stop offset=".62" stop-color="#8f959a"/><stop offset=".85" stop-color="#c9cdd1"/><stop offset="1" stop-color="#9aa0a5"/></linearGradient>
    <linearGradient id="cw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7b8187"/><stop offset=".5" stop-color="#eef0f2"/><stop offset="1" stop-color="#6d7379"/></linearGradient></defs>
    <path d="M56 92 V40 a34 34 0 0 1 68 0 V92" fill="none" stroke="url(#cw)" stroke-width="10" stroke-linecap="round"/>
    <path d="M64 90 V44 a26 26 0 0 1 52 0 V90" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
    <path d="M18 92 h144 a8 8 0 0 1 8 9 l-10 52 a10 10 0 0 1 -10 8 h-110 a10 10 0 0 1 -10 -8 l-10 -52 a8 8 0 0 1 8 -9z" fill="url(#cb)"/>
    <path d="M22 96 h136" stroke="rgba(255,255,255,.85)" stroke-width="3" stroke-linecap="round"/>
    <path d="M26 150 h128" stroke="rgba(0,0,0,.18)" stroke-width="2"/></svg>`);

  const fill = (sel, svg) => document.querySelectorAll(sel).forEach((e, i) => { e.innerHTML = svg(i, e); });
  fill(".pin", (i) => `<svg width="70" height="84" viewBox="0 0 70 84"><defs><radialGradient id="pn${i}" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#F6C3A0"/><stop offset=".35" stop-color="#D98B5C"/><stop offset=".8" stop-color="#A9592F"/><stop offset="1" stop-color="#7a3d1e"/></radialGradient><filter id="pb${i}"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <ellipse cx="44" cy="70" rx="16" ry="6" fill="rgba(0,0,0,.35)" filter="url(#pb${i})"/><path d="M33 44 L40 72" stroke="#9aa0a6" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M22 40 a12 6 0 0 0 24 0 l-3 -8 h-18z" fill="#A9592F"/><circle cx="34" cy="24" r="19" fill="url(#pn${i})"/><ellipse cx="27" cy="17" rx="6" ry="4" fill="rgba(255,255,255,.7)"/></svg>`);
  fill(".pen", (i) => `<svg width="420" height="420" viewBox="0 0 420 420"><defs><linearGradient id="pk${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0d0d0e"/><stop offset=".35" stop-color="#4a4b4e"/><stop offset=".55" stop-color="#1b1b1d"/><stop offset="1" stop-color="#050506"/></linearGradient><linearGradient id="pc${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8e9399"/><stop offset=".45" stop-color="#f3f4f5"/><stop offset="1" stop-color="#7d8288"/></linearGradient><filter id="ps${i}"><feGaussianBlur stdDeviation="6"/></filter></defs>
    <g transform="rotate(-42 210 210)"><rect x="196" y="40" width="30" height="330" rx="14" fill="rgba(0,0,0,.4)" filter="url(#ps${i})" transform="translate(14 16)"/>
    <rect x="195" y="30" width="30" height="300" rx="14" fill="url(#pk${i})"/><rect x="195" y="112" width="30" height="16" fill="url(#pc${i})"/><rect x="189" y="34" width="9" height="104" rx="4.5" fill="url(#pc${i})"/>
    <path d="M195 326 h30 l-10 44 h-10z" fill="url(#pc${i})"/><path d="M207 370 h6 l-3 16z" fill="#1c1c1e"/></g></svg>`);
  fill(".stain", (i) => `<svg width="230" height="230" viewBox="0 0 230 230"><filter id="st${i}"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="${4 + i}"/><feDisplacementMap in="SourceGraphic" scale="9"/></filter>
    <g filter="url(#st${i})"><circle cx="115" cy="115" r="92" fill="rgba(150,95,45,.05)"/><circle cx="115" cy="115" r="92" fill="none" stroke="rgba(130,80,35,.24)" stroke-width="7"/><path d="M40 90 a80 80 0 0 1 110 -60" fill="none" stroke="rgba(120,70,30,.18)" stroke-width="4"/></g></svg>`);
  fill(".heart", (i, e) => `<svg width="100%" height="100%" viewBox="0 0 70 62" fill="none" stroke="${e.dataset.c || "#D9858F"}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M35 56 C10 38 4 26 6 17 C9 5 26 3 35 17 C44 3 61 5 64 17 C66 26 60 38 35 56 Z"/><path d="M31 50 C13 36 9 26 10 19" opacity=".6"/></svg>`);
  fill(".paperclip", () => `<svg width="70" height="190" viewBox="0 0 70 190"><path d="M44 30 V150 a14 14 0 0 1 -28 0 V40 a22 22 0 0 1 44 0 V160 a28 28 0 0 1 -56 0 V60" fill="none" stroke="#b9bec3" stroke-width="5" stroke-linecap="round"/><path d="M44 30 V150 a14 14 0 0 1 -28 0 V40" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="1.6"/></svg>`);
})();
