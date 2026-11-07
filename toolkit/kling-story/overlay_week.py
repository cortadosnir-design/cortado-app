"""Layers (transparent 1080x1920 PNGs) for the weekly hours story, same look as overlay_today.py.
usage: python overlay_week.py week.json outdir fontsdir   (no QR codes: owner, 7.11.2026)
week.json: {"range": "1.11–7.11", "days": [["ראשון", ["16:30–18:30"]], ["שלישי", ["סגור"]], ...]}
Hours only from what was published through בוט קורטדו, never guessed.
"""
import json, sys, pathlib, base64
from playwright.sync_api import sync_playwright

week = json.load(open(sys.argv[1]))
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
fonts = pathlib.Path(sys.argv[3])
b64 = lambda p: base64.b64encode(p.read_bytes()).decode()

CSS = f"""
@font-face{{font-family:Rubik;src:url(data:font/ttf;base64,{b64(fonts/'Rubik-VF.ttf')})}}
html,body{{margin:0;width:1080px;height:1920px;background:transparent;font-family:Rubik;direction:rtl}}
.shade{{position:absolute;inset:0 0 auto 0;height:1120px;background:linear-gradient(rgba(20,20,23,.78),rgba(20,20,23,.62) 80%,rgba(20,20,23,0))}}
.c{{position:absolute;width:100%;text-align:center;color:#F7F2DC;text-shadow:0 3px 14px rgba(0,0,0,.45)}}
.h{{top:150px;font-weight:800;font-size:82px}}
.d{{top:250px;font-weight:500;font-size:42px;opacity:.92}}
.m{{font-weight:600;font-size:40px;color:#F7F2DC;line-height:1.3}}
.rule{{position:absolute;top:322px;left:300px;width:480px;height:3px;background:#C9774A;border-radius:2px}}
.row{{position:absolute;right:170px;left:170px;display:flex;justify-content:space-between;align-items:baseline;color:#fff;text-shadow:0 3px 12px rgba(0,0,0,.5)}}
.row .n{{font-weight:600;font-size:50px;color:#F7F2DC}}
.row .t{{font-weight:700;font-size:56px;direction:ltr;unicode-bidi:isolate;text-align:left;line-height:1.12}}
.note{{font-weight:800;font-size:46px;color:#fff;background:#C9774A;border-radius:24px;padding:4px 20px;margin-right:12px;vertical-align:middle;white-space:nowrap}}
.row.off .t{{color:#F7F2DC;opacity:.75;font-weight:500}}
.end{{position:absolute;left:44px;top:{week.get("end_top", 1360)}px;width:300px;text-align:center}}
.end span{{display:inline-block;background:#141417;color:#F7F2DC;font-weight:800;font-size:64px;line-height:1.1;padding:22px 34px;border-radius:40px}}
"""
html = lambda body: f"<html><head><meta charset=utf-8><style>{CSS}</style></head><body>{body}</body></html>"

layers = [("00-shade", "<div class=shade></div>"),
          ("01-head", "<div class='c h'>השבוע בעגלה</div>"),
          ("02-date", f"<div class='c d'>{week.get('place', '') + ' · ' if week.get('place') else ''}<span style='direction:ltr;unicode-bidi:isolate'>{week['range']}</span></div><div class=rule></div>")]
y = 360
for i, (name, times, *note) in enumerate(week["days"]):  # optional 3rd item: a short note beside the day
    off = times == ["סגור"]
    t = "סגור" if off else "<br>".join(times)
    layers.append((f"1{i}-day", f"<div class='row{' off' if off else ''}' style='top:{y}px'>"
                   f"<span class=n>{name}{f' <b class=note>{note[0]}</b>' if note else ''}</span><span class=t{' style=direction:rtl' if off else ''}>{t}</span></div>"))
    y += 80 + 63 * (len(times) - 1)
if week.get("menu"):  # what's on (owner 31.10.2026)
    layers.append(("17-menu", f"<div class='c m' style='top:{y + 14}px'>{week['menu']}</div>")); y += 74
assert y < week.get("end_top", 1360) - 20, f"rows run into כולם מוזמנים ({y}px)"  # end_top 1170 for base-hot: clear of the glasses
layers.append(("90-end", "<div class=end><span>כולם<br>מוזמנים</span></div>"))
if week.get("logo"):  # grandma's logo, the cut-out version (owner, 31.10.2026: not a round crop)
    lg = week["logo"]
    layers.append(("03-logo", f"<img src='data:image/png;base64,{b64(pathlib.Path(__file__).parent / 'logo-cut.png')}' "
                   f"style='position:absolute;right:{lg['right']}px;top:{lg['top']}px;width:{lg['w']}px;"
                   f"filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))'>"))

with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={"width": 1080, "height": 1920})
    for name, body in layers:
        pg.set_content(html(body)); pg.wait_for_timeout(150)
        pg.screenshot(path=str(out / f"{name}.png"), omit_background=True)
    br.close()
print(" ".join(n for n, _ in layers))
