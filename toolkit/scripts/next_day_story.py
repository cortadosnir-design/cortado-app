"""Build the data for the next-day story (template 56) and render it.

Usage: python scripts/next_day_story.py --date 2026-10-12 --hours 17:00–19:00 [09:00–12:00 ...] --out DIR
Evening day (a range ending 17:00 or later): two photos from two different categories
(coffee → pastry → acai), "יש פיצה!" sticker and pizza first in the text, but no pizza photo. Morning-only day: the rotating photo is big, the sandwich small, no pizza.
The rotation state lives in story-rotation.json next to this toolkit, so commit it after a run.
"""
import argparse, datetime, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATE = ROOT / "story-rotation.json"
# Two levels of variety: the category turns coffee → pastry → acai, and inside each
# category the photo turns too, so the same picture comes back as late as possible.
# Only photos that sit well next to the pizza: warm wood, daylight, food as the subject
# (owner, 10.10.2026: "the photos must look very beautiful together"). Left out on purpose:
# coffee-4 (green barrel, soft), coffee-5 (dark, hand), hero (mostly the cart), pastry-3 and
# pastry-5 (busy backgrounds), pizza.jpg (blurry).
POOLS = {
    "coffee": ["cortado-lawn.jpg", "coffee-2.jpg", "coffee-3.jpg"],
    "pastry": ["pastry-2.jpg", "pastry-4.jpg", "pastry-3.jpg"],  # pastry-tray: owner said not for publishing (10.10.2026)
    "acai": ["acai.jpg"],  # the owner's one bowl photo (10.10.2026)
}
CATS = ["coffee", "pastry", "acai"]
DAYS = ["שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון"]  # date.weekday() order


def take(state, cat):
    i = state.setdefault("idx", {}).get(cat, -1) + 1
    state["idx"][cat] = i
    return POOLS[cat][i % len(POOLS[cat])]


def story(date, ranges, state):
    """Returns the story data; advances state (a dict) in place."""
    cat = CATS[(CATS.index(state["cat"]) + 1) % len(CATS)] if state.get("cat") in CATS else CATS[0]
    state["cat"] = cat
    pick = take(state, cat)
    starts = [int(r[:2]) for r in ranges]
    ends = [int(r.split("–")[1][:2]) for r in ranges]
    evening = max(ends) >= 17
    s = {"day": DAYS[date.weekday()], "date": f"{date.day}.{date.month}", "hours": ranges}
    if evening:
        # owner 10.10.2026: no pizza photo; pizza stays in the sticker and the text
        other = CATS[(CATS.index(cat) + 1) % len(CATS)]
        s.update(main=pick, second=take(state, other), sticker="יש פיצה!",
                 sub="<b>פיצה</b>, קערת אסאי, מאפים, שייקים וקפה")
    else:
        s.update(main=pick, second="sandwich.jpg", sub="קפה, כריכים, מאפים ושייקים")
    s["line"] = ("אחר הצהריים רגוע, בצל האורנים" if min(starts) >= 15 else
                 "בוקר רגוע על הדשא, בצל האורנים" if not evening else "על הדשא, בצל האורנים")
    return s


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--date", required=True)
    a.add_argument("--hours", nargs="+", required=True)
    a.add_argument("--out", required=True)
    o = a.parse_args()
    for r in o.hours:  # guard: exactly "HH:MM–HH:MM" with an en dash
        assert len(r) == 11 and r[5] == "–" and r[2] == r[8] == ":", f"bad range {r!r}"
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    s = story(datetime.date.fromisoformat(o.date), o.hours, state)
    out = pathlib.Path(o.out); out.mkdir(parents=True, exist_ok=True)
    data = out / f"story-{o.date}.json"
    data.write_text(json.dumps({"week": "", "days": [], "story": s}, ensure_ascii=False))
    subprocess.run([sys.executable, str(ROOT / "scripts/render.py"), "--hours", str(data),
                    "--only", "56", "--out", str(out)], check=True)
    (out / "56-next-day-story.png").rename(out / f"next-day-story-{o.date}.png")
    STATE.write_text(json.dumps(state) + "\n")
    print(json.dumps(s, ensure_ascii=False))


if __name__ == "__main__":
    # self-check: categories turn, photos inside a category turn, no photo repeats early
    st, d = {}, datetime.date(2026, 10, 12)
    seen = [story(d, ["17:00–19:00"], st) for _ in range(3)]
    assert [x["main"] for x in seen] == ["cortado-lawn.jpg", "pastry-4.jpg", "acai.jpg"], seen
    assert [x["second"] for x in seen] == ["pastry-2.jpg", "acai.jpg", "coffee-2.jpg"], seen
    assert all("pizza" not in x["main"] + x["second"] for x in seen)
    assert all((ROOT / "assets/photos" / f).exists() for v in POOLS.values() for f in v)
    main()
