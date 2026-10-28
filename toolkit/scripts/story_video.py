#!/usr/bin/env python3
"""Turn a story image into a short story video with music, next to it with the same name (.mp4).

Owner, 28.10.2026: "חייב שיהיה מוזיקה בכל ... הסטטוסים בפייסבוק ובאינסטגרם". The Graph API has no
Instagram-library song for stories, so the music goes inside the file. Shula (the bot) publishes the
.mp4 instead of the image whenever it exists; the image stays the story's once-only key.

Usage: python3 story_video.py IMAGE [IMAGE ...] [--seconds 8]
Music: a licensed track in toolkit/assets/music/*.mp3 if there is one (picked by the image name),
otherwise music.py "cafe", made here for free. Output: 1080x1920, H.264 + AAC, -14 LUFS, slow push-in.
.github/workflows/story-music.yml runs this for every story the outbox queues.
"""
import argparse, pathlib, re, subprocess, sys, tempfile, zlib

TK = pathlib.Path(__file__).resolve().parent.parent
MUSIC = TK / "assets/music"


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode:
        sys.exit(f"story_video: {' '.join(map(str, cmd[:3]))}… failed\n{p.stderr[-800:]}")
    return p.stderr


def make(img, seconds):
    img = pathlib.Path(img)
    out = img.with_suffix(".mp4")
    seed = zlib.crc32(img.name.encode())  # same image, same music; different images, different music
    with tempfile.TemporaryDirectory() as d:
        wav = pathlib.Path(d) / "music.wav"
        tracks = sorted(MUSIC.glob("*.mp3")) if MUSIC.is_dir() else []
        if tracks:
            run(["ffmpeg", "-y", "-v", "error", "-i", str(tracks[seed % len(tracks)]), "-t", str(seconds), "-ar", "48000", str(wav)])
        else:
            run([sys.executable, str(TK / "reel/music.py"), "--seconds", str(seconds), "--seed", str(seed % 1000), "--style", "cafe", "--out", str(wav)])
        n = int(seconds * 30)
        # 2x scale before zoompan keeps the push-in smooth (no 1px jitter on text)
        vf = (f"scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,"
              f"zoompan=z='1+0.05*on/{n}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={n}:s=1080x1920:fps=30,format=yuv420p")
        af = f"afade=t=in:d=0.4,afade=t=out:st={seconds - 1.2}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=7"
        run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", str(img), "-i", str(wav), "-t", str(seconds), "-vf", vf, "-af", af,
             "-c:v", "libx264", "-profile:v", "high", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
             "-movflags", "+faststart", "-shortest", str(out)])
    # the check that matters: the file really has sound
    lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", run(["ffmpeg", "-hide_banner", "-i", str(out), "-af", "ebur128", "-f", "null", "-"]))
    if not lufs or float(lufs[-1]) < -20:
        out.unlink(missing_ok=True)
        sys.exit(f"story_video: {out.name} came out without sound ({lufs[-1] if lufs else '?'} LUFS)")
    print(f"{out} ({lufs[-1]} LUFS, {out.stat().st_size // 1024}KB)")
    return out


def main():
    a = argparse.ArgumentParser()
    a.add_argument("images", nargs="+")
    a.add_argument("--seconds", type=float, default=8)
    o = a.parse_args()
    for img in o.images:
        make(img, o.seconds)


if __name__ == "__main__":
    main()
