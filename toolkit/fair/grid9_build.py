"""Fair flyer 14.11: redraw the stalls grid (below the beer row) as 3x3 with a 9th item, on top of the existing frames."""
import base64, io, json, sys, subprocess, pathlib
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
SM = pathlib.Path('/home/claude/sm'); OUT = pathlib.Path('/home/claude/fair2/out'); OUT.mkdir(exist_ok=True)
FONT = base64.b64encode((SM/'toolkit/assets/fonts/Rubik-VF.ttf').read_bytes()).decode()
src = Image.open(SM/'2026-11-11/yarid-od-3.jpg').convert('RGB')

def icon(cx, cy, r=37):
    box = src.crop((cx-r, cy-r, cx+r, cy+r)).convert('RGBA')
    m = Image.new('L', (r*8, r*8), 0); ImageDraw.Draw(m).ellipse((0, 0, r*8-1, r*8-1), fill=255)
    box.putalpha(m.resize((r*2, r*2), Image.LANCZOS)); b = io.BytesIO(); box.save(b, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()

CENTERS = json.load(open('centers.json'))
NEW = "<svg viewBox='0 0 76 76' width='74' height='74'><circle cx='38' cy='38' r='38' fill='{bg}'/><g fill='none' stroke='{st}' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'><circle cx='38' cy='38' r='18'/><path d='M20 38h36M38 20v36M25.200 25.400c6 6.300 6 18.900 0 25.200M50.800 25.400c-6 6.300-6 18.900 0 25.200'/></g></svg>"
ITEMS = [("כלים מקרמיקה", "ליאת בן אדיבה", 0), ("דבש", "מהגליל והגולן", 1), ("לדר בטעמים", "מהגולן", 2),
         ("ריבות בוטיק", "של מרגנית", 3), ("תכשיטים", "מאפוקסי", 4), ("בגדי יד 2", "", 5),
         ("אקססוריז", "וינטאג' יד 2", 6), ("כלי וינטאג'", "ועבודות יד, גלריה כפיים", 7),
         ("עמדות משחק", "ספורטיביות, יאיר ברקוביץ", None)]
X0, X1, Y0, Y1 = 86, 994, 1492, 1792

def overlay(card, name_c, sub_c, icon_bg, icon_st, path):
    cells = []
    for name, sub, i in ITEMS:
        ic = f"<img src='{icon(*CENTERS[i])}' width=74 height=74>" if i is not None else NEW.format(bg=icon_bg, st=icon_st)
        cells.append(f"<div class=cell>{ic}<div class=t><b>{name}</b>" + (f"<i>{sub}</i>" if sub else "") + "</div></div>")
    css = f"""@font-face{{font-family:Rubik;src:url(data:font/ttf;base64,{FONT})}}
    html,body{{margin:0;width:1080px;height:1920px;background:transparent;font-family:Rubik;direction:rtl}}
    .g{{position:absolute;left:{X0}px;top:{Y0}px;width:{X1-X0}px;height:{Y1-Y0}px;background:{card};box-sizing:border-box;
       display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr)}}
    .cell{{display:flex;align-items:center;gap:14px;padding-inline-start:8px}}
    .cell img,.cell svg{{flex:none}}
    .t{{display:flex;flex-direction:column;line-height:1.12;white-space:nowrap}}
    b{{font-weight:700;font-size:29px;color:{name_c}}} i{{font-style:normal;font-weight:400;font-size:19.5px;color:{sub_c};margin-top:4px}}"""
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={"width": 1080, "height": 1920})
        pg.set_content(f"<html><head><meta charset=utf-8><style>{css}</style></head><body><div class=g>{''.join(cells)}</div></body></html>")
        pg.wait_for_timeout(300)
        over = pg.evaluate("[...document.querySelectorAll('.cell')].filter(c=>c.scrollWidth>c.clientWidth+1).length")
        pg.screenshot(path=path, omit_background=True); br.close()
    print(path, "overflowing cells:", over)

if __name__ == '__main__':
    hexc = lambda im, p: '#%02x%02x%02x' % im.getpixel(p)
    overlay(hexc(src, (540, 1500)), sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], str(OUT/'ov-jpg.png'))
