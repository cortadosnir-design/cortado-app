"""Build the data for the next-day story (template 56) and render it.

Usage: python scripts/next_day_story.py --date 2026-10-12 --hours 17:00–19:00 [09:00–12:00 ...] --out DIR
Evening day (a range ending 17:00 or later): pizza is the big photo, the small one rotates
coffee → pastry → acai. Morning-only day: the rotating photo is big, the sandwich small, no pizza.
The rotation state lives in story-rotation.json next to this toolkit, so commit it after a run.
"""
import argparse, datetime, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
STATE = ROOT / "story-rotation.json"
ROTATION = ["cortado-lawn.jpg", "pastry-tray.jpg", "acai.jpg"]  # coffee, pastry, acai bowl
DAYS = ["שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון"]  # date.weekday() order


def story(date, ranges, last):
    nxt = ROTATION[(ROTATION.index(last) + 1) % len(ROTATION)] if last in ROTATION else ROTATION[0]
    starts = [int(r[:2]) for r in ranges]
    ends = [int(r.split("–")[1][:2]) for r in ranges]
    evening = max(ends) >= 17
    s = {"day": DAYS[date.weekday()], "date": f"{date.day}.{date.month}", "hours": ranges}
    if evening:
        s.update(main="pizza.jpg", second=nxt, sticker="יש פיצה!",
                 sub="<b>פיצה</b>, קערת אסאי, מאפים, שייקים וקפה")
    else:
        s.update(main=nxt, second="sandwich.jpg", sub="קפה, כריכים, מאפים ושייקים")
    s["line"] = ("אחר הצהריים רגוע, בצל האורנים" if min(starts) >= 15 else
                 "בוקר רגוע על הדשא, בצל האורנים" if not evening else "על הדשא, בצל האורנים")
    return s, nxt


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--date", required=True)
    a.add_argument("--hours", nargs="+", required=True)
    a.add_argument("--out", required=True)
    o = a.parse_args()
    for r in o.hours:  # guard: exactly "HH:MM–HH:MM" with an en dash
        assert len(r) == 11 and r[5] == "–" and r[2] == r[8] == ":", f"bad range {r!r}"
    last = json.loads(STATE.read_text())["last"] if STATE.exists() else None
    s, nxt = story(datetime.date.fromisoformat(o.date), o.hours, last)
    out = pathlib.Path(o.out); out.mkdir(parents=True, exist_ok=True)
    data = out / f"story-{o.date}.json"
    data.write_text(json.dumps({"week": "", "days": [], "story": s}, ensure_ascii=False))
    subprocess.run([sys.executable, str(ROOT / "scripts/render.py"), "--hours", str(data),
                    "--only", "56", "--out", str(out)], check=True)
    (out / "56-next-day-story.png").rename(out / f"next-day-story-{o.date}.png")
    STATE.write_text(json.dumps({"last": nxt}) + "\n")
    print(json.dumps(s, ensure_ascii=False))


if __name__ == "__main__":
    # self-check of the rotation and the evening rule
    d = datetime.date(2026, 10, 12)
    assert story(d, ["17:00–19:00"], "acai.jpg")[0]["main"] == "pizza.jpg"
    assert story(d, ["17:00–19:00"], "acai.jpg")[1] == "cortado-lawn.jpg"
    assert story(d, ["09:00–15:00"], "cortado-lawn.jpg")[0]["main"] == "pastry-tray.jpg"
    main()
