"""Build a Cortado reel (1080x1920, no talking, music + on-screen text) from a short JSON spec,
render it with HyperFrames, master the sound and check the result.

Usage (from anywhere):
  python3 toolkit/reel/build_reel.py spec.json --out /tmp/reel

spec.json:
{
  "hook": "שישי בבוקר על הדשא",                 // big card on the first scene, <= 6 words
  "scenes": [                                    // 3-6 scenes, real photos or clips only
    {"media": "toolkit/assets/photos/lawn.jpg", "text": "צל של אורנים", "dur": 2.6},
    {"media": "2026-10-20/clip-1.mp4", "text": "קפה טוב", "dur": 2.4, "from": 1.5}
  ],
  "end": "נתראה בעגלה",                          // ribbon on the closing card
  "seed": 7                                      // picks the music; any integer
}
Paths are relative to the social-media branch root. Writes <out>/reel.mp4, cover.jpg, sheet.jpg.
Exits non-zero, with the reason, when anything is off: nothing half-made is left as reel.mp4.
"""
import argparse, html, json, os, pathlib, re, shutil, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent                 # the social-media branch
TK = HERE.parent                          # toolkit/
W, H, FPS = 1080, 1920, 30
END_DUR, XFADE = 2.8, 0.5                 # closing card, scene push
BANNED = ["כשר", "חוויה", "מוזמנים", "מחכים לכם", "קסום", "מדהים"]
CHROME = ["/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]


def fail(msg):
    sys.exit(f"build_reel: {msg}")


def check_spec(s):
    words = lambda t: len(t.split())
    if not s.get("hook") or words(s["hook"]) > 6:
        fail("hook missing or longer than 6 words")
    sc = s.get("scenes") or []
    if not 3 <= len(sc) <= 6:
        fail("need 3-6 scenes")
    texts = [s["hook"], s.get("end", "")] + [x.get("text", "") for x in sc]
    for t in texts:
        if re.search(r"\d{1,2}[:.]\d{2}|₪|ש\"ח|#", t) or any(b in t for b in BANNED):
            fail(f"text breaks the cart's voice rules: {t!r}")
    for x in sc:
        if x.get("text") and words(x["text"]) > 6:
            fail(f"scene text over 6 words: {x['text']!r}")
        p = ROOT / x["media"]
        if not p.is_file():
            fail(f"media not found: {x['media']}")
        x["dur"] = float(x.get("dur", 2.5))
        if not 1.6 <= x["dur"] <= 6:
            fail("scene duration must be 1.6-6s")
    return sc


def compose(s, sc, total):
    t, parts, anims = 0.0, [], []
    for i, x in enumerate(sc):
        start = max(0.0, t - (XFADE if i else 0))
        dur = x["dur"] + (XFADE if i else 0) + XFADE        # overlaps the next scene's push
        ext = pathlib.Path(x["media"]).suffix.lower()
        src = f"assets/m{i}{ext}"
        if ext in (".mp4", ".mov", ".webm"):
            media = (f'<video class="media" src="{src}" muted playsinline data-start="{start:.2f}" data-duration="{dur:.2f}" '
                     f'data-media-start="{float(x.get("from", 0)):.2f}"></video>')
        else:
            media = f'<img class="media" src="{src}" alt="">'
        cap = f'<div class="chip" id="c{i}">{html.escape(x["text"])}</div>' if x.get("text") else ""
        hook = (f'<div class="hookwrap" id="hook"><div class="badge"><img src="assets/logo.png" alt=""><span>cortado</span></div>'
                f'<div class="hook">{html.escape(s["hook"])}</div></div>') if i == 0 else ""
        parts.append(f'<section class="scene clip" id="s{i}" data-start="{start:.2f}" data-duration="{dur:.2f}" style="z-index:{i + 1}">'
                     f'<div class="kb" id="k{i}">{media}</div><div class="shade"></div>{hook}{cap}<div class="dim" id="d{i}"></div></section>')
        a = f'tl.fromTo("#k{i}",{{scale:1.0,x:{-30 if i % 2 else 30}}},{{scale:1.09,x:{30 if i % 2 else -30},duration:{dur:.2f},ease:"none"}},{start:.2f});'
        if i:
            a += f'tl.fromTo("#s{i}",{{y:{H}}},{{y:0,duration:{XFADE},ease:"power3.inOut"}},{start:.2f});'
            a += f'tl.fromTo("#d{i - 1}",{{opacity:0}},{{opacity:0.45,duration:{XFADE},ease:"power2.in"}},{start:.2f});'
        if i == 0:
            a += 'tl.fromTo("#hook .badge",{opacity:0,y:-30},{opacity:1,y:0,duration:0.5,ease:"power3.out"},0.1);'
            a += 'tl.fromTo("#hook .hook",{opacity:0,y:70},{opacity:1,y:0,duration:0.6,ease:"back.out(1.4)"},0.25);'
        if x.get("text"):
            cs = start + (1.2 if i == 0 else XFADE + 0.15)
            a += f'tl.fromTo("#c{i}",{{opacity:0,y:40}},{{opacity:1,y:0,duration:0.45,ease:"power3.out"}},{cs:.2f});'
        anims.append(a)
        t = start + dur - XFADE
    es = t - XFADE
    parts.append(f'<section class="scene clip end" id="end" data-start="{es:.2f}" data-duration="{total - es:.2f}" style="z-index:20">'
                 f'<img class="doodles" src="assets/doodles-story.svg" alt="">'
                 f'<div class="badge big" id="eb"><img src="assets/logo.png" alt=""><span>cortado</span></div>'
                 f'<div class="ribbon" id="er">{html.escape(s.get("end") or "נתראה בעגלה")}</div>'
                 f'<div class="place" id="ep">קיבוץ שניר · על הדשא ליד המרכולית</div>'
                 '<div class="socials" id="eq"><div class="s"><span class="q"><img src="assets/qr-instagram.svg" alt=""></span><span>אינסטגרם</span></div>'
                 '<div class="s"><span class="q"><img src="assets/qr-facebook.svg" alt=""></span><span>פייסבוק</span></div>'
                 '<div class="s"><span class="q"><img src="assets/qr-whatsapp.svg" alt=""></span><span>וואטסאפ</span></div></div></section>')
    anims.append(f'tl.fromTo("#end",{{y:{H}}},{{y:0,duration:{XFADE},ease:"power3.inOut"}},{es:.2f});'
                 f'tl.fromTo("#eb",{{opacity:0,scale:0.8}},{{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"}},{es + 0.35:.2f});'
                 f'tl.fromTo("#er",{{opacity:0,y:30}},{{opacity:1,y:0,duration:0.45,ease:"power3.out"}},{es + 0.6:.2f});'
                 f'tl.fromTo(["#ep","#eq"],{{opacity:0}},{{opacity:1,duration:0.4,stagger:0.12}},{es + 0.85:.2f});')
    return f"""<!doctype html>
<html lang="he" dir="rtl" data-resolution="portrait">
<head><meta charset="UTF-8"><meta name="viewport" content="width={W}, height={H}">
<script src="assets/gsap.min.js"></script>
<style>
@font-face{{font-family:Rubik;src:url(assets/Rubik-VF.ttf);font-weight:300 900}}
@font-face{{font-family:"Playpen Sans Hebrew";src:url(assets/PlaypenSansHebrew-VF.ttf);font-weight:100 800}}
:root{{--board:#34494A;--cart:#141417;--foam:#F7F2DC;--chalk:#F4F1EA;--aida:#CB7E4D}}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px;overflow:hidden;background:var(--cart);font-family:Rubik}}
#root{{position:relative;width:100%;height:100%;overflow:hidden}}
.scene{{position:absolute;inset:0;overflow:hidden;background:var(--cart)}}
.kb{{position:absolute;inset:-60px;transform-origin:50% 45%}}
.media{{width:100%;height:100%;object-fit:cover;display:block}}
.shade{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.28) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 55%,rgba(0,0,0,.55) 100%)}}
.hookwrap{{position:absolute;top:200px;left:64px;right:116px;display:flex;flex-direction:column;align-items:center;gap:36px}}
.badge{{display:flex;align-items:center;gap:14px;direction:ltr;padding:8px 30px 8px 8px;border:4px solid var(--cart);border-radius:999px;background:var(--foam)}}
.badge img{{width:66px;height:66px;border-radius:50%}}
.badge span{{font-weight:800;font-size:42px;line-height:1;color:var(--cart)}}
.hook{{background:var(--foam);color:var(--cart);border-radius:44px;padding:34px 48px 40px;font-weight:900;font-size:96px;line-height:1;
  letter-spacing:-1px;text-align:center;text-wrap:balance;box-shadow:0 22px 50px rgba(0,0,0,.35)}}
.chip{{position:absolute;right:116px;left:64px;top:1290px;margin:auto;width:fit-content;max-width:900px;background:var(--foam);color:var(--cart);
  border-radius:999px;padding:18px 44px 22px;font-weight:800;font-size:64px;line-height:1.05;text-align:center;text-wrap:balance;box-shadow:0 14px 34px rgba(0,0,0,.35)}}
.dim{{position:absolute;inset:0;background:#000;opacity:0;z-index:5}}
.end{{background:var(--board)}}
.doodles{{position:absolute;inset:0;width:100%;height:100%;opacity:.55}}
.badge.big{{position:absolute;top:470px;left:50%;margin-left:-260px;width:520px;justify-content:center;padding:14px 40px 14px 14px}}
.badge.big img{{width:120px;height:120px}}
.badge.big span{{font-size:78px}}
.ribbon{{position:absolute;top:760px;left:0;right:0;margin:auto;width:fit-content;background:var(--cart);color:var(--chalk);border-radius:999px;
  padding:16px 64px 24px;font-family:"Playpen Sans Hebrew";font-weight:600;font-size:66px;transform:rotate(-2deg);box-shadow:0 10px 24px rgba(0,0,0,.3)}}
.place{{position:absolute;top:960px;left:64px;right:116px;text-align:center;color:var(--chalk);font-size:40px;font-weight:500}}
.socials{{position:absolute;left:64px;top:1160px;display:flex;gap:16px;direction:ltr}}
.socials .s{{display:flex;flex-direction:column;align-items:center;gap:6px}}
.socials .q{{background:var(--foam);border-radius:10px;padding:5px;line-height:0}}
.socials .q img{{width:72px;height:72px}}
.socials .s span{{font-weight:600;font-size:22px;color:var(--chalk);line-height:1}}
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{total:.2f}" data-width="{W}" data-height="{H}">
{''.join(parts)}
<audio id="music" src="assets/music.wav" data-start="0" data-duration="{total:.2f}" data-volume="1"></audio>
</div>
<script>
window.__timelines = window.__timelines || {{}};
const tl = gsap.timeline({{ paused: true }});
{''.join(anims)}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body></html>
"""


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        fail(f"{' '.join(map(str, cmd[:3]))} failed:\n{(r.stdout + r.stderr)[-2500:]}")
    return r.stdout + r.stderr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out", required=True)
    ap.add_argument("--draft", action="store_true", help="fast low-quality render for checking layout")
    a = ap.parse_args()
    s = json.loads(pathlib.Path(a.spec).read_text(encoding="utf-8"))
    sc = check_spec(s)
    total = round(sum(x["dur"] for x in sc) + END_DUR, 2)
    if total > 40:
        fail(f"{total}s is too long for this cart's reels (keep under 40s)")
    out = pathlib.Path(a.out).resolve()
    proj = out / "project"
    shutil.rmtree(out, ignore_errors=True)
    (proj / "assets").mkdir(parents=True)
    for i, x in enumerate(sc):
        shutil.copy(ROOT / x["media"], proj / "assets" / f"m{i}{pathlib.Path(x['media']).suffix.lower()}")
    for f in ["fonts/Rubik-VF.ttf", "fonts/PlaypenSansHebrew-VF.ttf", "logo.png", "qr-instagram.svg", "qr-facebook.svg", "qr-whatsapp.svg", "art/doodles-story.svg"]:
        shutil.copy(TK / "assets" / f, proj / "assets" / pathlib.Path(f).name)
    shutil.copy(HERE / "node_modules/gsap/dist/gsap.min.js", proj / "assets/gsap.min.js")
    tracks = sorted((TK / "assets/music").glob("*.mp3")) if (TK / "assets/music").is_dir() else []
    seed = int(s.get("seed", 1))
    if tracks:  # a real licensed track wins over the generated one
        run(["ffmpeg", "-y", "-v", "error", "-i", str(tracks[seed % len(tracks)]), "-t", str(total), "-af", f"afade=t=out:st={total - 1.8}:d=1.8", "-ar", "48000", str(proj / "assets/music.wav")])
    else:
        run([sys.executable, str(HERE / "music.py"), "--seconds", str(total), "--seed", str(seed), "--out", str(proj / "assets/music.wav")])
    (proj / "index.html").write_text(compose(s, sc, total), encoding="utf-8")
    (proj / "hyperframes.json").write_text('{"paths":{"assets":"assets"},"media":{"autoProxy":true}}')
    (proj / "meta.json").write_text(json.dumps({"id": "cortado-reel", "name": "cortado reel"}))

    env = {**os.environ, "HYPERFRAMES_SKIP_SKILLS": "1", "DO_NOT_TRACK": "1"}
    if not env.get("HYPERFRAMES_BROWSER_PATH"):
        env["HYPERFRAMES_BROWSER_PATH"] = next((c for c in CHROME if os.path.exists(c)), "")
    hf = str(HERE / "node_modules/.bin/hyperframes")
    run([hf, "lint", "."], cwd=proj, env=env)
    raw = out / "raw.mp4"
    run([hf, "render", "-f", str(FPS), "-q", "draft" if a.draft else "high", "-o", str(raw)], cwd=proj, env=env, timeout=1800)

    # sound: -14 LUFS integrated, -1 dBTP; picture: H.264 high, yuv420p; AAC 48k. Instagram's spec.
    final = out / "reel.tmp.mp4"
    run(["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-af", "loudnorm=I=-14:TP=-1.5:LRA=7", "-c:v", "libx264", "-profile:v", "high",
         "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", str(final)])
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(final)], capture_output=True, text=True).stdout)
    v = next((x for x in probe["streams"] if x["codec_type"] == "video"), None)
    au = next((x for x in probe["streams"] if x["codec_type"] == "audio"), None)
    dur, size = float(probe["format"]["duration"]), int(probe["format"]["size"])
    problems = []
    if not v or (v["width"], v["height"]) != (W, H): problems.append("picture is not 1080x1920")
    if not au: problems.append("no sound")
    if abs(dur - total) > 0.6: problems.append(f"length {dur:.1f}s, expected {total}s")
    if size > 38e6: problems.append(f"file is {size / 1e6:.0f}MB (the bot passes up to 40MB)")
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", run(["ffmpeg", "-hide_banner", "-i", str(final), "-af", "ebur128=peak=true", "-f", "null", "-"]))
    if not lufs or not -16 <= float(lufs[-1]) <= -12.5: problems.append(f"loudness {lufs[-1] if lufs else '?'} LUFS")
    if problems:
        fail("; ".join(problems))
    final.rename(out / "reel.mp4")
    raw.unlink()

    # review stills: the hook settled, every scene caption settled, the closing card
    times, t = [], 0.0
    for i, x in enumerate(sc):
        st = max(0.0, t - (XFADE if i else 0))
        times.append(st + (1.8 if i == 0 else XFADE + 1.0))
        t = st + x["dur"] + (XFADE if i else 0)
    times.append(total - 0.6)
    for k, tt in enumerate(times):
        run(["ffmpeg", "-y", "-v", "error", "-ss", f"{tt:.2f}", "-i", str(out / "reel.mp4"), "-frames:v", "1", str(out / f"still-{k}.jpg")])
    shutil.copy(out / "still-0.jpg", out / "cover.jpg")
    # house rule (8.10.2026): the three QRs must scan on a frame of the encoded video
    import cv2
    im, qr = cv2.imread(str(out / f"still-{len(times) - 1}.jpg")), cv2.QRCodeDetector()
    want = {"instagram.com/cortado_snir", "facebook.com/122109319071470402", "chat.whatsapp.com/HVwYjRh8VBfAzGT2AmoXyP"}
    got = set()
    for x0 in range(50, 420, 8):  # slide a QR-sized window across the row: robust to small layout shifts
        crop = cv2.resize(im[1150:1265, x0:x0 + 110], None, fx=4, fy=4, interpolation=cv2.INTER_NEAREST)
        got |= {w for w in want if w in (qr.detectAndDecode(crop)[0] or "")}
    if got != want:
        (out / "reel.mp4").rename(out / "reel.bad.mp4")
        fail(f"QR codes on the closing card don't all scan (read: {sorted(got)})")
    from PIL import Image
    ims = [Image.open(out / f"still-{k}.jpg").convert("RGB") for k in range(len(times))]
    for im in ims: im.thumbnail((270, 480))
    sheet = Image.new("RGB", (len(ims) * 282 + 12, 504), "#DDD8CC")
    for k, im in enumerate(ims): sheet.paste(im, (12 + k * 282, 12))
    sheet.save(out / "sheet.jpg", quality=88)
    print(json.dumps({"reel": str(out / "reel.mp4"), "cover": str(out / "cover.jpg"), "sheet": str(out / "sheet.jpg"),
                      "seconds": round(dur, 1), "mb": round(size / 1e6, 1), "lufs": float(lufs[-1])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
