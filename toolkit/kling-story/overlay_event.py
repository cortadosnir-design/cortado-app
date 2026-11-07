"""Event flyer layer (one transparent 1080x1920 PNG), same look as overlay_today.py / overlay_week.py.
usage: python overlay_event.py event.json out.png fontsdir
event.json: {"head": "...", "sub": "...", "day": "חמישי", "date": "12.11", "time": "16:00–18:30",
             "lines": ["..."], "special": "...", "end": ["כולן", "מוזמנות"], "logo": {"right": 50, "top": 1180, "w": 250},
             "shade": 1000, "end_top": 1180}
No QR codes, no emoji on the image (owner rules).
"""
import json, sys, pathlib, base64
from playwright.sync_api import sync_playwright

ev = json.load(open(sys.argv[1]))
fonts = pathlib.Path(sys.argv[3])
b64 = lambda p: base64.b64encode(p.read_bytes()).decode()
ltr = lambda s: f"<span style='direction:ltr;unicode-bidi:isolate'>{s}</span>"

CSS = f"""
@font-face{{font-family:Rubik;src:url(data:font/ttf;base64,{b64(fonts/'Rubik-VF.ttf')})}}
html,body{{margin:0;width:1080px;height:1920px;background:transparent;font-family:Rubik;direction:rtl}}
.shade{{position:absolute;inset:0 0 auto 0;height:{ev.get('shade', 1000)}px;background:linear-gradient(rgba(20,20,23,.78),rgba(20,20,23,.62) 78%,rgba(20,20,23,0))}}
.c{{position:absolute;width:100%;text-align:center;color:#F7F2DC;text-shadow:0 3px 14px rgba(0,0,0,.45)}}
.h{{font-weight:800;font-size:84px;line-height:1.08}}
.s{{font-weight:700;font-size:54px;color:#E9A57B}}
.d{{font-weight:500;font-size:40px;opacity:.92}}
.rule{{position:absolute;left:300px;width:480px;height:3px;background:#C9774A;border-radius:2px}}
.w{{font-weight:700;font-size:64px;color:#fff}}
.m{{font-weight:500;font-size:40px;line-height:1.35;padding:0 90px;box-sizing:border-box}}
.sp{{display:inline-block;background:#C9774A;color:#fff;font-weight:700;font-size:42px;padding:12px 30px;border-radius:30px;text-shadow:none}}
.pill{{display:inline-block;background:#141417;color:#F7F2DC;font-weight:800;font-size:54px;padding:14px 40px;border-radius:40px;text-shadow:none}}
.end{{position:absolute;left:44px;top:{ev.get('end_top', 1180)}px;width:300px;text-align:center}}
.end span{{display:inline-block;background:#141417;color:#F7F2DC;font-weight:800;font-size:64px;line-height:1.1;padding:22px 34px;border-radius:40px}}
"""

y = ev.get('top', 140)
body = ["<div class=shade></div>", f"<div class='c h' style='top:{y}px'>{ev['head']}</div>"]
y += 100 * ev['head'].count('<br>') + 106
if ev.get("sub"):
    body.append(f"<div class='c s' style='top:{y}px'>{ev['sub']}</div>"); y += 74
body.append(f"<div class='c d' style='top:{y}px'>קפה קורטדו · קיבוץ שניר</div>"); y += 70
body.append(f"<div class=rule style='top:{y}px'></div>"); y += 26
body.append(f"<div class='c w' style='top:{y}px'>{ev['day']} · {ltr(ev['date'])} · {ltr(ev['time'])}</div>"); y += 84
for line in ev.get("lines", []):
    body.append(f"<div class='c m' style='top:{y}px'>{line}</div>"); y += 54 * (1 + line.count('<br>')) + 6
if ev.get("special"):
    body.append(f"<div class=c style='top:{y + 16}px'><span class=sp>{ev['special']}</span></div>"); y += 96
body.append(f"<div class=c style='top:{y + 22}px'><span class=pill>{ev.get('end', 'כולם מוזמנים')}</span></div>"); y += 120
if ev.get("logo"):  # grandma's cut-out logo, never a round crop (owner, 31.10.2026)
    lg = ev["logo"]
    body.append(f"<img src='data:image/png;base64,{b64(pathlib.Path(__file__).parent / 'logo-cut.png')}' "
                f"style='position:absolute;right:{lg['right']}px;top:{lg['top']}px;width:{lg['w']}px;"
                f"filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))'>")

with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={"width": 1080, "height": 1920})
    pg.set_content(f"<html><head><meta charset=utf-8><style>{CSS}</style></head><body>{''.join(body)}</body></html>")
    pg.wait_for_timeout(200)
    pg.screenshot(path=sys.argv[2], omit_background=True)
    br.close()
print("text ends at", y)
