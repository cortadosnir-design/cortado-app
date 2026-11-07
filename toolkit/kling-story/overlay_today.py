"""Layers (transparent 1080x1920 PNGs) for the 'open today' reel.
usage: python overlay_today.py today.json outdir fontsdir
today.json: {"day": "שבת", "date": "31.10", "times": ["09:00–14:00", "16:00–19:00"]}
No QR codes on anything, ever (owner, 7.11.2026: "לא יוצא יותר ברקודים").
"""
import json, sys, pathlib, base64
from playwright.sync_api import sync_playwright

today = json.load(open(sys.argv[1]))
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
fonts = pathlib.Path(sys.argv[3])
b64 = lambda p: base64.b64encode(p.read_bytes()).decode()

CSS = f"""
@font-face{{font-family:Rubik;src:url(data:font/ttf;base64,{b64(fonts/'Rubik-VF.ttf')})}}
html,body{{margin:0;width:1080px;height:1920px;background:transparent;font-family:Rubik;direction:rtl}}
.shade{{position:absolute;inset:0 0 auto 0;height:960px;background:linear-gradient(rgba(20,20,23,.74),rgba(20,20,23,.55) 75%,rgba(20,20,23,0))}}
.c{{position:absolute;width:100%;text-align:center;color:#F7F2DC;text-shadow:0 3px 14px rgba(0,0,0,.45)}}
.h{{top:178px;font-weight:800;font-size:82px}}
.d{{top:280px;font-weight:500;font-size:42px;opacity:.92}}
.t{{font-weight:700;font-size:88px;color:#fff;direction:ltr;unicode-bidi:isolate;letter-spacing:1px}}
.m{{font-weight:600;font-size:50px;color:#F7F2DC}}
.n{{font-weight:500;font-size:38px;color:#F7F2DC}}
.end{{position:absolute;left:44px;top:{today.get('end_top', 1360)}px;width:300px;text-align:center}}
.end span{{display:inline-block;background:#141417;color:#F7F2DC;font-weight:800;font-size:64px;line-height:1.1;padding:22px 34px;border-radius:40px}}
"""
html = lambda body: f"<html><head><meta charset=utf-8><style>{CSS}</style></head><body>{body}</body></html>"

layers = [("00-shade", "<div class=shade></div>"),
          ("01-head", f"<div class='c h'>{today.get('head', 'פתוחים היום')}</div>"),
          ("02-date", f"<div class='c d'>{today['place'] + ' · ' if today.get('place') else ''}{today['day']} · <span style='direction:ltr;unicode-bidi:isolate'>{today['date']}</span></div>")]
for i, t in enumerate(today["times"]):
    layers.append((f"1{i}-time", f"<div class='c t' style='top:{372 + i * 96}px'>{t}</div>"))
if today.get("menu"):  # what's on, under the hours (owner 31.10.2026: "אין כיתוב על הפיצות ועל הקפה")
    layers.append(("15-menu", f"<div class='c m' style='top:{372 + len(today['times']) * 96 + 14}px'>{today['menu']}</div>"))
if today.get("note"):  # a smaller line under the menu (owner 6.11.2026: closing "או בגשם הראשון", updates on the networks)
    layers.append(("16-note", f"<div class='c n' style='top:{372 + len(today['times']) * 96 + 80}px'>{today['note']}</div>"))
if today.get("end", True):  # a closed-day story leaves "כולם מוזמנים" out
    layers.append(("90-end", "<div class=end><span>כולם<br>מוזמנים</span></div>"))

with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={"width": 1080, "height": 1920})
    for name, body in layers:
        pg.set_content(html(body)); pg.wait_for_timeout(150)
        pg.screenshot(path=str(out / f"{name}.png"), omit_background=True)
    br.close()
print(" ".join(n for n, _ in layers))
