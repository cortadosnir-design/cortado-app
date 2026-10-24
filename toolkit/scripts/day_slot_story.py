"""On-the-day product stories (template 66), one per published opening range.

Usage: python scripts/day_slot_story.py --date 2026-10-31 --hours 09:00–15:00 [17:00–19:00] --out DIR
The owner's rule (24.10.2026): a morning range is sandwiches, pastries and coffee; an afternoon or
evening range (starting 15:00 or later) is pizza and coffee. Friday never shows the acai photo.
Each range gets one story that goes out when the range opens, so the picture never states hours:
it says "פתוח עכשיו" and the bot publishes it at the range's start. Photos rotate through the same
pools and state as the next-day story (story-rotation.json), so a photo does not come back early.
Prints one JSON line per story: {"at": "YYYY-MM-DDTHH:MM", "file": "<png>"}.
"""
import argparse, datetime, json, pathlib, subprocess, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from next_day_story import ROOT, STATE, DAYS, take, CATS


def slot(date, rng, state):
    start = int(rng[:2])
    friday = date.weekday() == 4
    afternoon = start >= 15
    cat = CATS[(CATS.index(state["cat"]) + 1) % len(CATS)] if state.get("cat") in CATS else CATS[0]
    if (friday or afternoon) and cat == "acai":   # acai only on a weekday morning
        cat = CATS[(CATS.index(cat) + 1) % len(CATS)]
    if cat == "coffee" and not afternoon:            # morning second photo: pastries, the sandwich is the main
        cat = "pastry"
    state["cat"] = cat
    s = {"day": DAYS[date.weekday()], "date": f"{date.day}.{date.month}", "hours": []}
    if afternoon:
        s.update(word="אחר הצהריים", main=take(state, "pizza"), second=take(state, "coffee"), sticker="יש פיצה!",
                 sub="<b>פיצה</b> וקפה", line="אחר הצהריים על הדשא, בצל האורנים")
    else:
        s.update(word="בוקר", main="sandwich.jpg", second=take(state, cat), sticker="יש כריכים",
                 sub="<b>כריכים</b>, מאפים וקפה", line="בוקר על הדשא, בצל האורנים")
    return s


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--date", required=True)
    a.add_argument("--hours", nargs="+", required=True)
    a.add_argument("--out", required=True)
    o = a.parse_args()
    for r in o.hours:
        assert len(r) == 11 and r[5] == "–" and r[2] == r[8] == ":", f"bad range {r!r}"
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    out = pathlib.Path(o.out); out.mkdir(parents=True, exist_ok=True)
    date = datetime.date.fromisoformat(o.date)
    for r in o.hours:
        s = slot(date, r, state)
        hhmm = r[:5]
        data = out / f"slot-{o.date}-{hhmm.replace(':', '')}.json"
        data.write_text(json.dumps({"week": "", "days": [], "story": s}, ensure_ascii=False))
        subprocess.run([sys.executable, str(ROOT / "scripts/render.py"), "--hours", str(data), "--only", "66", "--out", str(out)], check=True)
        png = out / f"day-slot-{o.date}-{hhmm.replace(':', '')}.png"
        (out / "66-day-slot-story.png").rename(png)
        print(json.dumps({"at": f"{o.date}T{hhmm}", "file": str(png)}, ensure_ascii=False))
    STATE.write_text(json.dumps(state) + "\n")


if __name__ == "__main__":
    st = {}
    m = slot(datetime.date(2026, 10, 31), "09:00–15:00", st)      # Saturday morning
    assert m["main"] == "sandwich.jpg" and m["word"] == "בוקר" and "acai" not in m["second"], m
    e = slot(datetime.date(2026, 10, 31), "16:00–19:00", st)      # afternoon
    assert e["main"] == "pizza.jpg" and e["word"] == "אחר הצהריים" and e["second"].startswith(("cortado", "coffee")), e
    f = slot(datetime.date(2026, 10, 30), "09:00–12:00", st)      # Friday: no acai
    assert "acai" not in f["second"], f
    main()
