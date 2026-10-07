"""Render flyer HTML templates to PNG with this week's hours.

Usage:
  python scripts/render.py --hours hours.json [--only 03,07] [--out out/] [--sheet]

Each template in templates/NN-*.html is a full 1080x1350 page. It reads
window.HOURS (injected here from hours.json) and fills every element that
carries data-hours="<variant>" using the matching <template id="row-<variant>">.
"""
import argparse, json, pathlib, re, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent


def render(hours, only, out, sheet):
    out.mkdir(parents=True, exist_ok=True)
    files = sorted((ROOT / "templates").glob("[0-9][0-9]-*.html"))
    if only:
        files = [f for f in files if f.name[:2] in only]
    pngs = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        for f in files:
            m = re.search(r'name="size" content="(\d+)x(\d+)"', f.read_text(encoding="utf-8"))
            w, h = (int(m[1]), int(m[2])) if m else (1080, 1350)
            pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            pg.add_init_script(f"window.HOURS = {json.dumps(hours, ensure_ascii=False)};")
            pg.goto(f.as_uri())
            pg.wait_for_load_state("networkidle")
            pg.evaluate("document.fonts.ready")
            overflow = pg.evaluate(
                f"document.documentElement.scrollHeight > {h} || document.documentElement.scrollWidth > {w}")
            dst = out / (f.stem + ".png")
            pg.screenshot(path=str(dst), clip={"x": 0, "y": 0, "width": w, "height": h})
            pg.close()
            pngs.append(dst)
            print(dst.name, "OVERFLOW" if overflow else "ok")
        b.close()
    if sheet and pngs:
        from PIL import Image
        cols, w, h = 5, 360, 450
        rows = (len(pngs) + cols - 1) // cols
        c = Image.new("RGB", (cols * w + (cols + 1) * 12, rows * h + (rows + 1) * 12), "#DDD8CC")
        for i, f in enumerate(pngs):
            im = Image.open(f).convert("RGB"); im.thumbnail((w, h))
            c.paste(im, (12 + (i % cols) * (w + 12), 12 + (i // cols) * (h + 12)))
        c.save(out / "sheet.jpg", quality=88)
        print("sheet.jpg")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--hours", required=True)
    a.add_argument("--only", default="")
    a.add_argument("--out", default=str(ROOT / "out"))
    a.add_argument("--sheet", action="store_true")
    o = a.parse_args()
    hours = json.loads(pathlib.Path(o.hours).read_text(encoding="utf-8"))
    for k in ("week", "days"):
        if k not in hours:
            sys.exit(f"hours.json missing '{k}'")
    render(hours, [x for x in o.only.split(",") if x], pathlib.Path(o.out), o.sheet)
