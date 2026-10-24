"""One story per day of a week, posted on the morning of that day (owner, 24.10.2026):
open days show the day's hours (template 56, same photo rotation as "מחר בעגלה"),
closed days say "סגורים" with the cart photo and when we open next.

Usage: python scripts/week_day_stories.py --hours ../<date>/week/hours.json --start 2026-10-25 --out DIR
hours.json: the weekly file (week, days[7] Sunday→Saturday). Optional per day: "sticker", "sub" overrides.
Writes DIR/day-story-<date>.png for each day and prints one JSON line per day.
Commit story-rotation.json after a run (it advances, like next_day_story.py).
"""
import argparse, datetime, json, pathlib, subprocess, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from next_day_story import ROOT, STATE, story  # noqa: E402

FOOT = "קיבוץ שניר · העגלה ליד המרכולית"  # owner, 24.10.2026: the cart, not the lawn


def build(days, start, state):
    out = []
    for i, d in enumerate(days):
        date = start + datetime.timedelta(days=i)
        if d["times"] == ["סגור"]:
            nxt = next(((days[j], j) for j in range(i + 1, 7) if days[j]["times"] != ["סגור"]), None)
            s = {"day": d["day"], "date": f"{date.day}.{date.month}", "closed": True,
                 "main": "cart.jpg", "second": "evening.jpg",
                 "sub": f"נפתחים שוב ב{nxt[0]['day']}, <span class=\"t\">{nxt[0]['times'][0]}</span>" if nxt else "",
                 "line": "העגלה נחה היום"}
        else:
            s = story(date, d["times"], state)
            s["line"] = s["line"].replace("על הדשא", "בעגלה")
        s["foot"] = FOOT
        for k in ("sticker", "sub"):
            if d.get(k):
                s[k] = d[k]
        out.append((date, s))
    return out


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--hours", required=True)
    a.add_argument("--start", required=True, help="the Sunday the week starts on, YYYY-MM-DD")
    a.add_argument("--out", required=True)
    o = a.parse_args()
    start = datetime.date.fromisoformat(o.start)
    assert start.weekday() == 6, "the week starts on Sunday"
    days = json.loads(pathlib.Path(o.hours).read_text(encoding="utf-8"))["days"]
    assert len(days) == 7
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    out = pathlib.Path(o.out); out.mkdir(parents=True, exist_ok=True)
    for date, s in build(days, start, state):
        data = out / f"day-{date}.json"
        data.write_text(json.dumps({"week": "", "days": [], "story": s}, ensure_ascii=False))
        subprocess.run([sys.executable, str(ROOT / "scripts/render.py"), "--hours", str(data),
                        "--only", "56", "--out", str(out)], check=True, capture_output=True)
        (out / "56-next-day-story.png").rename(out / f"day-story-{date}.png")
        print(json.dumps({"date": str(date), **s}, ensure_ascii=False))
    STATE.write_text(json.dumps(state) + "\n")


if __name__ == "__main__":
    # self-check: closed days point at the next open day; open days keep their hours
    wk = [{"day": n, "times": t} for n, t in [("ראשון", ["סגור"]), ("שני", ["17:00–19:00"]), ("שלישי", ["סגור"]),
          ("רביעי", ["09:00–12:00"]), ("חמישי", ["סגור"]), ("שישי", ["סגור"]), ("שבת", ["סגור"])]]
    r = build(wk, datetime.date(2026, 10, 25), {})
    assert r[0][1]["closed"] and "שני" in r[0][1]["sub"] and r[6][1]["sub"] == ""
    assert r[1][1]["hours"] == ["17:00–19:00"] and r[1][1]["foot"] == FOOT
    main()
