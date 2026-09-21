// בונה harness.html: אותו index.html בדיוק, עם import map שמחליף את
// core.js/shifts.js בדמה. ככה הבדיקות רצות על קוד האפליקציה האמיתי.
import { readFileSync, writeFileSync, unlinkSync } from "fs";
const ROOT = new URL("..", import.meta.url).pathname;
export const HARNESS = ROOT + "harness.html";

export function build(){
  let s = readFileSync(ROOT + "index.html", "utf8");
  s = s.replace("</head>", `<script type="importmap">{"imports":{
  "/core.js":"/tests/stubs/core.js","/shifts.js":"/tests/stubs/shifts.js",
  "/weather.js":"/tests/stubs/weather.js","/season.js":"/tests/stubs/season.js"}}</script>
</head>`);
  s = s.replace('<script type="module" src="app.js"></script>', `<script type="module">
  import * as C from "./creative.js";
  import * as L from "./launch.js";
  import * as A from "./analyze.js";
  import { S } from "./core.js";
  window.C = C; window.L = L; window.S = S;
  window.__api = {};
  document.getElementById("p-creative").hidden = false;
  // מה ש-app.js עושה אחרי כניסה מוצלחת
  document.querySelectorAll("[data-owner]").forEach(n => n.hidden = !S.isOwner);
  document.querySelectorAll("[data-api]").forEach(n => n.hidden = !S.isOwner);
  C.init(); L.init(); A.init();
  C.subscribe();
  window.__ready = true;
</script>`);
  writeFileSync(HARNESS, s);
}
export function clean(){ try { unlinkSync(HARNESS); } catch {} }
