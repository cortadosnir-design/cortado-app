"""Render the election-day carousel (13 pages, 1080x1350): real-notebook pages (templates 80-84) in the cart's colors."""
import pathlib, shutil, sys
TK = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TK / "scripts"))
from render import render  # noqa: E402

OUT = TK.parent / "2026-10-24/election-carousel"
import tempfile
tmp = pathlib.Path(tempfile.mkdtemp())  # renders land here; only the carousel pages go into OUT
P = "../../"  # templates/ -> repo root

partners = [
    ("גלריה כפיים", "השכנים שלנו בשניר.\nהסטודיו פתוח במיוחד ביום הבוחר", "2026-10-24/election-carousel/kapayim.jpg", "50% 50%", ""),
    ("ללוש", "מאפייה ביתית בגליל, מחמצת ושמרים", "2026-10-23/partners/lalush-cinnabon.jpg", "50% 50%", "line-cinnabon"),
    ("Secret", "תכשיטים בעבודת יד מכפר בלום, מאז 2006", "2026-10-24/partners/secret-card.jpg", "50% 50%", "line-jewelry"),
    ("ilo", "גלידה מחומרים טבעיים", "2026-10-23/partners/ilo-poster.jpg", "50% 50%", "line-icecream"),
    ("בירליך", "בירה משפחתית מקיבוץ מנרה", "2026-10-24/election-carousel/beerlich.jpg", "50% 50%", "line-beer"),
    ("מלביהו", "מלבי ביתי מדפנה, חלבי וטבעוני", "2026-10-24/partners/malabiahu.jpg", "50% 70%", "line-malabi"),
    ("צמר גפן ופופקורן", "שני חברים שהתחילו בדוכן לימונדה במלחמה", "2026-10-25/partners/popcorn.jpg", "50% 50%", "line-cotton"),
    ("YNL", "קהילת הברייקדאנס של הגליל העליון", "2026-10-25/partners/ynl-logo.jpg", "50% 50%", "line-dance"),
    ("ספורט עם יאיר", "עמדות משחק ספורטיביות לכל המשפחה", "2026-10-24/election-carousel/yair.jpg", "50% 50%", "line-sport"),
]
all_tiles = {"date": "שלישי 27.10 · יום הבחירות", "hours": "15:00–19:00",
             "more": "ברייקדאנס מ-16:30 · עמדות משחק · גן שעשועים",
             "tiles": [{"photo": f"{P}2026-10-26/all/{k}.jpg", "name": n, "what": w} for k, n, w in [
                 ("lalush", "ללוש", "סינבונים"), ("secret", "Secret", "תכשיטים בעבודת יד"),
                 ("ilo", "ilo", "גלידה מחומרים טבעיים"), ("beerlich", "בירליך", "בירה מהחבית"),
                 ("malabiahu", "מלביהו", "מלבי ביתי"), ("popcorn", "צמר גפן ופופקורן", "דוכן של שני חברים"),
                 ("ynl", "YNL", "מעגל ברייקדאנס"), ("yair", "ספורט עם יאיר", "עמדות משחק"),
                 ("kapayim", "גלריה כפיים", "וינטג' ועתיקות"), ("cortado", "קורטדו", "פיצות, קפה ומאפים")]]}

base = {"week": "", "days": []}
pages = []
render({**base, "all": all_tiles}, ["80", "81", "83", "84"], tmp, False)
pages += [tmp / "80-nb-cover.png", tmp / "81-nb-together.png"]
for i, (name, line, photo, pos, icon) in enumerate(partners, 3):
    render({**base, "partner": {"name": name, "line": line, "photo": P + photo, "pos": pos,
                                "rot": (-2, 2.5, -1.5)[i % 3], "pen": i % 3 == 0}}, ["82"], tmp, False)
    dst = tmp / f"p{i:02d}.png"
    shutil.move(tmp / "82-nb-partner.png", dst)
    pages.append(dst)
pages += [tmp / "83-nb-support.png", tmp / "84-nb-all.png"]
assert len(pages) == 13, len(pages)
for i, f in enumerate(pages, 1):
    shutil.copy(f, OUT / f"{i:02d}.png")

from PIL import Image
cols, w, h = 4, 360, 450
c = Image.new("RGB", (cols * w + 5 * 12, 4 * h + 5 * 12), "#DDD8CC")
for i in range(13):
    im = Image.open(OUT / f"{i+1:02d}.png").convert("RGB"); im.thumbnail((w, h))
    c.paste(im, (12 + (i % cols) * (w + 12), 12 + (i // cols) * (h + 12)))
c.save(tmp / "sheet.jpg", quality=88)
print("done", OUT, "sheet:", tmp / "sheet.jpg")
