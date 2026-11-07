"""One day's hours stories, all in the moving format (owner, 31.10 and 5.11.2026: no static hours story, ever).

usage (hours exactly as published through בוט קורטדו, never guessed):
  python3 daily.py --date 2026-11-07 --hours 09:00–13:00 15:00–19:00 --out ../../2026-11-07
  python3 daily.py --date 2026-11-10 --reopens 2026-11-11 16:30–18:30 --out ../../2026-11-10   # a closed day

Open day:   open-tomorrow (evening before, 18:30) · open-today (09:00) · open-now-HHMM (when a range that starts
            after 09:00 opens — the 09:00 story already covers an earlier one).
Closed day: closed-tomorrow (evening before, 18:30) · closed-today (09:00), both saying when we reopen.
Writes <name>.mp4 and <name>.jpg (its last frame) into --out and prints one JSON line per story: file, at
(Israel time, for the outbox row) and what is written on it. Look at every jpg before queueing.
"""
import argparse, datetime, json, os, pathlib, re, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
DAYS = ["שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון"]  # date.weekday()
PLACE = "קפה קורטדו · קיבוץ שניר"
# a range that starts before 15:00 is a morning; end_top keeps "כולם מוזמנים" clear of the item.
# No QR codes on any story (owner, 7.11.2026: "לא יוצא יותר ברקודים").
SCENES = {
    # owner, 6.11.2026: tea instead of the iced coffee, with a sahlab and a hot coffee beside it
    "morning": {"menu": "כריכים, מאפים וקפה על הדשא", "env": {"BASE": str(HERE / "base-hot.mp4"), "LOGO": "none"},
                "layout": {"end_top": 1086}},
    "evening": {"menu": "פיצה וקפה חם על הדשא", "env": {"BASE": str(HERE / "base-pizza.mp4"), "LOGO": "none"},
                "layout": {"end_top": 1180}},
    # owner, 7.11.2026: the format for rain days. The morning frame with nobody there, the cart shut, a grey winter
    # sky (scene-rain.jpg), falling drops on top (rain.html) and rainy piano (rain.wav)
    "rain": {"menu": "", "env": {"BASE": str(HERE / "base-rain.mp4"), "LOGO": "none", "SOUND": str(HERE / "rain.wav")},
             "layout": {}},
    # owner, 7.11.2026: a closed day must look closed: the cart shut, nobody on the lawn, a wintry sky, the tea,
    # sahlab and hot coffee in front. Same frame as rain, without the drops and with the calm music
    "closed": {"menu": "", "env": {"BASE": str(HERE / "base-rain.mp4"), "LOGO": "none"}, "layout": {}},
}
# days without the winter rain line, even by default (owner, 7.11.2026: the fair, Saturday 14.11)
NO_NOTE = {"2026-11-14"}
SORRY = "סליחה מכל הלב"
RANGE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d–([01]\d|2[0-3]):[0-5]\d$")


def hours(x):
    x = x.replace("-", "–")
    if not RANGE.match(x) or x[:5] >= x[6:]:
        raise argparse.ArgumentTypeError(f"not HH:MM–HH:MM: {x}")
    return x


def plan(date, times=(), reopens=None, note=None, rain=False):
    eve, am = f"{date - datetime.timedelta(1)}T18:30", f"{date}T09:00"
    day = {"day": DAYS[date.weekday()], "date": f"{date.day}.{date.month}", "place": PLACE}
    if rain:  # closed because of rain (owner, 7.11.2026); reopens is optional: unknown = "נתראה כשיתבהר"
        back = reopens and f"נתראה {'מחר' if reopens[0] == date + datetime.timedelta(1) else 'ב' + DAYS[reopens[0].weekday()]}, {', '.join(reopens[1])}"
        return [dict(day, name=n, at=at, head=h, times=[], menu=m, note=f"{SORRY} · {back or 'נתראה כשיתבהר'}", end=False, scene="rain")
                for n, at, h, m in [("rain-tomorrow", eve, "מחר סגורים", "מחר צפוי גשם חזק, אז נשארים בבית"),
                                    ("rain-today", am, "היום סגורים", "הגשם חזק מדי, אז היום נשארנו בבית")]]
    if not times:
        back, when = reopens
        on = "ב" + DAYS[back.weekday()]
        return [dict(day, name=n, at=at, head=h, times=[], menu=f"נתראה {w}, {', '.join(when)}", end=False, scene="closed")
                for n, at, h, w in [("closed-tomorrow", eve, "מחר סגורים", on),
                                    ("closed-today", am, "היום סגורים", "מחר" if back == date + datetime.timedelta(1) else on)]]
    if note:  # one small line under the menu, e.g. closing early in rain; only when the owner asked for it
        day["note"] = note
    scene = lambda r: "morning" if r[:5] < "15:00" else "evening"
    menu = SCENES[scene(times[0])]["menu"] if len({scene(r) for r in times}) == 1 else "בבוקר כריכים ומאפים · בערב פיצה"
    out = [dict(day, name=n, at=at, head=h, times=list(times), menu=menu, scene=scene(times[0]))
           for n, at, h in [("open-tomorrow", eve, "פתוחים מחר"), ("open-today", am, "פתוחים היום")]]
    return out + [dict(day, name="open-now-" + r[:5].replace(":", ""), at=f"{date}T{r[:5]}", head="פתוחים עכשיו",
                       times=[r], menu=SCENES[scene(r)]["menu"], scene=scene(r)) for r in times if r[:5] > "09:00"]


def rain_frames(dst, n=194):
    """Transparent 1080x1920 PNGs of falling drops (rain.html), one per frame at 24fps."""
    from playwright.sync_api import sync_playwright
    dst.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1080, "height": 1920})
        pg.goto((HERE / "rain.html").as_uri()); pg.wait_for_timeout(200)
        for i in range(n):
            pg.evaluate(f"document.getAnimations().forEach(a=>{{a.pause();a.currentTime={i * 1000 / 24}}})")
            pg.screenshot(path=str(dst / f"{i:03d}.png"), omit_background=True)
        b.close()


def build(s, out):
    sc = SCENES[s["scene"]]
    with tempfile.TemporaryDirectory() as tmp:
        t = pathlib.Path(tmp)
        extra = {}
        if s["scene"] == "rain":
            rain_frames(t / "rain"); extra["RAIN"] = str(t / "rain")
        # a time range inside the menu line stays left-to-right (bare, it renders as 18:30–16:30)
        menu = re.sub(r"\d\d:\d\d–\d\d:\d\d", r"<span style='direction:ltr;unicode-bidi:isolate'>\g<0></span>", s["menu"])
        (t / "today.json").write_text(json.dumps({**s, **sc["layout"], "menu": menu}, ensure_ascii=False), encoding="utf-8")
        subprocess.run([sys.executable, HERE / "overlay_today.py", t / "today.json", t / "layers",
                        HERE.parent / "assets/fonts"], check=True, capture_output=True)
        mp4 = out / f"{s['name']}.mp4"
        # calm.wav for every story (owner, 31.10.2026: "נעימה, זרימה", not the happy soundtrack.wav)
        subprocess.run(["bash", HERE / "make_today.sh", t / "layers", mp4], check=True, capture_output=True,
                       env={**os.environ, "SOUND": str(HERE / "calm.wav"), **sc["env"], **extra,
                            # no time rows (closed / rain): the second line sits right under the note
                            "LINE_B_DY": str(-45 if not s["times"] and s.get("note") else
                                             96 * max(0, len(s["times"]) - 1) + (56 if s.get("note") else 0))})
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "7.8", "-i", mp4, "-frames:v", "1", "-q:v", "2",
                    mp4.with_suffix(".jpg")], check=True)


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--date", required=True, type=datetime.date.fromisoformat)
    a.add_argument("--hours", nargs="+", type=hours, default=[], help="the day's published ranges")
    a.add_argument("--reopens", nargs="+", metavar=("DATE", "RANGE"), help="closed day: the next open date and its ranges")
    # owner, 7.11.2026: the rain line is standing on every open day for the winter; --note '' drops it (summer)
    a.add_argument("--note", default="אם יירד גשם ניאלץ לסגור · עדכונים ברשתות",
                   help="open day: a small line under the menu, in the owner's words; '' for none")
    a.add_argument("--rain", action="store_true", help="closed because of rain: the rain format (--reopens optional)")
    a.add_argument("--out", required=True, type=pathlib.Path)
    o = a.parse_args()
    if str(o.date) in NO_NOTE and "--note" not in sys.argv:
        o.note = ""
    if o.rain and o.hours:
        a.error("--rain is for a day we close; give --reopens (or nothing) instead of --hours")
    if (not o.rain and bool(o.hours) == bool(o.reopens)) or (o.reopens and len(o.reopens) < 2):
        a.error("give --hours for an open day, or --reopens DATE RANGE... for a closed one (add --rain for a rain day)")
    back = o.reopens and (datetime.date.fromisoformat(o.reopens[0]), [hours(r) for r in o.reopens[1:]])
    if back and back[0] <= o.date:
        a.error("--reopens must be after --date")
    o.out.mkdir(parents=True, exist_ok=True)
    for s in plan(o.date, o.hours, back, o.note, o.rain):
        build(s, o.out)
        print(json.dumps({"file": s["name"] + ".jpg", **{k: s[k] for k in ("at", "head", "day", "date", "times", "menu")}},
                         ensure_ascii=False), flush=True)


if __name__ == "__main__":
    # self-check: which stories a day gets, when they go up, and on which scene
    D = datetime.date
    sat = plan(D(2026, 11, 7), ["09:00–13:00", "15:00–19:00"])
    assert [(s["name"], s["at"], s["scene"]) for s in sat] == [
        ("open-tomorrow", "2026-11-06T18:30", "morning"), ("open-today", "2026-11-07T09:00", "morning"),
        ("open-now-1500", "2026-11-07T15:00", "evening")] and sat[2]["times"] == ["15:00–19:00"] and sat[0]["day"] == "שבת"
    thu = plan(D(2026, 11, 5), ["16:30–18:30"])
    assert [s["name"] for s in thu] == ["open-tomorrow", "open-today", "open-now-1630"] and thu[0]["menu"] == SCENES["evening"]["menu"]
    shut = plan(D(2026, 11, 3), reopens=(D(2026, 11, 4), ["16:30–18:30"]))
    assert [s["menu"] for s in shut] == ["נתראה ברביעי, 16:30–18:30", "נתראה מחר, 16:30–18:30"] and not shut[0]["times"]
    assert hours("09:00-13:00") == "09:00–13:00"
    assert plan(D(2026, 11, 6), ["09:00–15:00"], note="x")[1]["note"] == "x" and "note" not in sat[0]
    wet = plan(D(2026, 11, 7), rain=True)
    assert [(s["name"], s["at"], s["scene"]) for s in wet] == [("rain-tomorrow", "2026-11-06T18:30", "rain"),
                                                               ("rain-today", "2026-11-07T09:00", "rain")]
    assert wet[1]["note"] == "סליחה מכל הלב · נתראה כשיתבהר" and wet[1]["menu"] == "הגשם חזק מדי, אז היום נשארנו בבית"
    assert plan(D(2026, 11, 7), reopens=(D(2026, 11, 8), ["09:00–13:00"]), rain=True)[1]["note"].endswith("נתראה מחר, 09:00–13:00")
    main()
