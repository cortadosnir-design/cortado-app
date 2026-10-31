"""Happy, bright story soundtrack with birds — owner 31.10.2026: "אני רוצה ציפורים, אבל מוזיקה קצת יותר שמחה".
Ukulele-style strums, a glockenspiel hook, bouncy bass, claps on 2 and 4, at 125 BPM so the text entries
in make_today.sh / make_week.sh (beat 0.48s, first beat 0.47s) stay on the beat. Made here: free, no license.
usage: python3 happy.py out.wav [seed]   -> 8.04s stereo 44.1k, birds from birds.py mixed on top
"""
import sys, wave, subprocess, tempfile, pathlib
import numpy as np

SR, DUR, BPM = 44100, 8.04, 125
beat = 60 / BPM; first = 0.47
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 7
rng = np.random.default_rng(seed)
n = int(SR * DUR); L = np.zeros(n); R = np.zeros(n)
f = lambda m: 440.0 * 2 ** ((m - 69) / 12)
key = 60 + int(rng.choice([0, 2, 5, 7]))  # C, D, F or G major
CH = [(0, [0, 4, 7]), (7, [0, 4, 7]), (9, [0, 3, 7]), (5, [0, 4, 7])]  # I V vi IV


def put(sig, t, pan=0.5, g=1.0):
    i = int(t * SR)
    if i < 0: sig, i = sig[-i:], 0  # pickup notes that start before 0
    if i >= n: return
    s = sig[: n - i] * g
    L[i:i + len(s)] += s * (1 - pan); R[i:i + len(s)] += s * pan


def pluck(freq, length, damp=0.994):
    p = max(2, int(SR / freq)); buf = rng.uniform(-1, 1, p); m = int(length * SR); out = np.empty(m)
    for i in range(m):
        out[i] = buf[i % p]; buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * damp
    return out


def bell(freq, length):
    t = np.arange(int(length * SR)) / SR
    return (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2.76 * t)) * np.exp(-t * 5)


def clap(length=0.12):
    t = np.arange(int(length * SR)) / SR
    return rng.standard_normal(len(t)) * np.exp(-t * 38) * 0.6


bar = 4 * beat
for b in range(5):
    root, shape = CH[b % 4]; t0 = first + b * bar - beat  # bar starts one beat before the first downbeat
    for k, (pos, down) in enumerate([(0, 1), (1, 1), (1.5, 0), (2, 1), (2.5, 0), (3, 1), (3.5, 0)]):  # strum pattern
        tt = t0 + pos * beat
        for j, iv in enumerate(shape if down else shape[::-1]):
            put(pluck(f(key + root + iv), 0.45), tt + j * 0.012, pan=0.35, g=0.22 if down else 0.15)
    for pos in (0, 1.5, 2, 3):  # bouncy bass
        put(pluck(f(key - 24 + root), 0.35, 0.99) * np.hanning(int(0.35 * SR)), t0 + pos * beat, 0.5, 0.5)
    for pos in (1, 3):
        put(clap(), t0 + pos * beat, 0.6, 0.35)
HOOK = [(0, 12), (0.5, 16), (1, 19), (2, 16), (2.5, 19), (3, 21), (4, 19), (5, 16), (6, 14), (6.5, 16), (7, 12)]
for rep in range(2):  # glockenspiel hook over two bars, twice
    for pos, iv in HOOK:
        put(bell(f(key + iv), 0.6), first + rep * 2 * bar + pos * beat * 0.5 * 2 - beat, 0.65, 0.28)

music = np.stack([L, R], 1); music /= np.abs(music).max() + 1e-9
fade = int(0.35 * SR); r = np.linspace(0, 1, fade)[:, None]
music[:fade] *= r; music[-fade:] *= r[::-1]
with tempfile.TemporaryDirectory() as d:
    bw = pathlib.Path(d) / "birds.wav"
    subprocess.run([sys.executable, str(pathlib.Path(__file__).with_name("birds.py")), str(bw)], check=True)
    with wave.open(str(bw)) as w:
        birds = np.frombuffer(w.readframes(w.getnframes()), "<i2").reshape(-1, 2) / 32767
mix = 0.72 * music + 0.55 * birds[:n]
mix /= np.abs(mix).max(); mix *= 0.9
raw = pathlib.Path(sys.argv[1]).with_suffix(".raw.wav")
with wave.open(str(raw), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype("<i2").tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "44100", sys.argv[1]], check=True)
raw.unlink()
print(sys.argv[1])
