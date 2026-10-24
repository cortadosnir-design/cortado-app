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

  // binder clip biting the top edge of the paper: back jaw on the desk, rolled lip on the edge (svg y 84 = paper top), front plate on the page
  if ("clip" in b.dataset) add(`<svg class="clip" width="240" height="240" viewBox="0 0 200 200"><defs>
    <filter id="cl1" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="cl2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <linearGradient id="cp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4c50"/><stop offset=".18" stop-color="#1c1d20"/><stop offset=".7" stop-color="#121315"/><stop offset="1" stop-color="#2a2b2e"/></linearGradient>
    <linearGradient id="cl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16171a"/><stop offset=".45" stop-color="#7c7f84"/><stop offset=".6" stop-color="#3a3c40"/><stop offset="1" stop-color="#0e0f11"/></linearGradient>
    <linearGradient id="cj" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1012"/><stop offset="1" stop-color="#2b2c30"/></linearGradient>
    <linearGradient id="cw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#80868c"/><stop offset=".5" stop-color="#f2f4f6"/><stop offset="1" stop-color="#727880"/></linearGradient></defs>
    <path d="M60 74 L60 22 a40 13 0 0 1 80 0 L140 74" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="7" filter="url(#cl2)" transform="translate(5 6)"/>
    <path d="M42 88 h116 l-8 64 h-100z" fill="rgba(0,0,0,.5)" filter="url(#cl1)" transform="translate(6 9)"/>
    <path d="M38 62 h124 l-4 24 h-116z" fill="url(#cj)"/>
    <path d="M60 74 L60 22 a40 13 0 0 1 80 0 L140 74" fill="none" stroke="url(#cw)" stroke-width="6.5" stroke-linecap="round"/>
    <path d="M36 84 h128 l-9 62 a8 8 0 0 1 -8 7 h-94 a8 8 0 0 1 -8 -7z" fill="url(#cp)"/>
    <path d="M44 100 h112" stroke="rgba(255,255,255,.16)" stroke-width="2"/>
    <rect x="31" y="74" width="138" height="18" rx="9" fill="url(#cl)"/>
    <rect x="40" y="78" width="120" height="3" rx="1.5" fill="rgba(255,255,255,.45)"/>
    <path d="M52 154 h96" stroke="rgba(0,0,0,.35)" stroke-width="3" stroke-linecap="round" filter="url(#cl2)"/></svg>`);

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
  // phone-photo look: the notebook sits slightly askew on the desk, light falls from the top left, a little sensor grain
  const stage = document.createElement("div"); stage.className = "stage";
  for (const n of [...b.children]) if (!n.matches("script,.doodles,.desk-noise,.desk-vig")) stage.appendChild(n);
  b.appendChild(stage);
  add('<div class="light"></div>');
  add('<svg class="grain-all" viewBox="0 0 1080 1350" preserveAspectRatio="none"><filter id="sn"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="11"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .5 0"/></filter><rect width="1080" height="1350" filter="url(#sn)"/></svg>');
})();
