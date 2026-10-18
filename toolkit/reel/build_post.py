"""Static feed post (1080x1350) in the house style, for the Friday "המקום והאנשים" slot.

Usage: python3 toolkit/reel/build_post.py spec.json --out /tmp/post
spec.json: {"photo": "toolkit/assets/photos/lawn.jpg", "head": "חזרנו הביתה", "line": "חשוב לנו שמי שמגיע ירגיש כמו בבית."}
head: <= 4 words. line: optional, <= 12 words. Writes <out>/post.jpg and checks that the QRs scan.
Same layout family as templates/31-home.html: real photo in a foam frame, chalk headline, foam card, QR row.
"""
import argparse, html, json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_reel import ROOT, TK, fail, voice_ok, media_ok

TEMPLATE = """<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="base.css"><link rel="stylesheet" href="board.css">
<style>
.p{{position:absolute;left:110px;top:200px;width:860px;height:560px;object-fit:cover;object-position:50% 45%;border:14px solid var(--foam);border-radius:30px;
  transform:rotate(-1.5deg);box-shadow:0 18px 40px rgba(0,0,0,.35)}}
.h{{position:absolute;top:812px;left:64px;right:64px;text-align:center;font-weight:900;font-size:118px;line-height:1;color:var(--chalk);letter-spacing:-1px;text-wrap:balance}}
.quote{{position:absolute;left:150px;right:150px;top:980px;background:var(--foam);border-radius:36px;padding:32px 46px 36px;text-align:center;
  font-family:"Playpen Sans Hebrew";font-weight:600;font-size:42px;line-height:1.35;color:var(--espresso);box-shadow:0 14px 30px rgba(0,0,0,.3);text-wrap:balance}}
.badge{{top:96px}}
</style></head><body class="board-bg">
<img class="doodles" src="../assets/art/doodles-post.svg" alt="">
<img class="p" src="{photo}" alt="">
<div class="badge"><img src="../assets/logo.png" alt=""><span>cortado</span></div>
<div class="h">{head}</div>
{line}
<div class="socials"><div class="s"><span class="q"><img src="../assets/qr-instagram.svg" alt=""></span><span>אינסטגרם</span></div><div class="s"><span class="q"><img src="../assets/qr-facebook.svg" alt=""></span><span>פייסבוק</span></div><div class="s"><span class="q"><img src="../assets/qr-whatsapp.svg" alt=""></span><span>וואטסאפ</span></div></div>
<div class="foot r">קיבוץ שניר · על הדשא ליד המרכולית</div>
</body></html>"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    s = json.loads(pathlib.Path(a.spec).read_text(encoding="utf-8"))
    if not s.get("head") or len(s["head"].split()) > 4:
        fail("head missing or longer than 4 words")
    if len(s.get("line", "").split()) > 12:
        fail("line longer than 12 words")
    for t in (s["head"], s.get("line", "")):
        voice_ok(t)
    media_ok(s["photo"])
    out = pathlib.Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    page = TK / "templates" / "_auto-post.html"   # beside the other templates, so base.css, board.css and fonts resolve
    line = f'<div class="quote">{html.escape(s["line"])}</div>' if s.get("line") else ""
    page.write_text(TEMPLATE.format(photo=(ROOT / s["photo"]).as_uri(), head=html.escape(s["head"]), line=line), encoding="utf-8")
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch()
            pg = b.new_page(viewport={"width": 1080, "height": 1350})
            pg.goto(page.as_uri()); pg.wait_for_load_state("networkidle"); pg.evaluate("document.fonts.ready")
            if pg.evaluate("document.documentElement.scrollHeight > 1350"):
                fail("layout overflows 1350px")
            pg.screenshot(path=str(out / "post.png"), clip={"x": 0, "y": 0, "width": 1080, "height": 1350})
            b.close()
    finally:
        page.unlink(missing_ok=True)
    from PIL import Image
    Image.open(out / "post.png").convert("RGB").save(out / "post.jpg", quality=92)
    import cv2
    im, qr = cv2.imread(str(out / "post.jpg")), cv2.QRCodeDetector()
    want = {"instagram.com/cortado_snir", "facebook.com/122109319071470402", "chat.whatsapp.com/HVwYjRh8VBfAzGT2AmoXyP"}
    got = set()
    for x0 in range(20, 330, 8):
        crop = cv2.resize(im[1200:1310, x0:x0 + 90], None, fx=4, fy=4, interpolation=cv2.INTER_NEAREST)
        got |= {w for w in want if w in (qr.detectAndDecode(crop)[0] or "")}
    if got != want:
        fail(f"QR codes don't all scan (read: {sorted(got)})")
    print(json.dumps({"post": str(out / "post.jpg")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
