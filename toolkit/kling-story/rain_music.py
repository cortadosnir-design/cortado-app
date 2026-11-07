"""Rainy-day story soundtrack (owner, 7.11.2026, closed because of rain; approved on the rain story).
calm.py in A minor (im9 VImaj9 ivm9 VIImaj9), slower melody, soft rain and droplets instead of birds.
usage: python3 rain_music.py out.wav [seed] [seconds]   (rain.wav = seed 5)
"""
import sys, wave, subprocess, tempfile, pathlib
import numpy as np

SR = 44100
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 3
DUR = float(sys.argv[3]) if len(sys.argv) > 3 else 8.04
rng = np.random.default_rng(seed)
n = int(SR * DUR)
f = lambda m: 440.0 * 2 ** ((m - 69) / 12)
key = 57  # A minor
PROG = [(0, [0, 3, 7, 10, 14]), (8, [0, 4, 7, 11, 14]), (5, [0, 3, 7, 10, 14]), (10, [0, 4, 7, 11, 14])]  # im9 VImaj9 ivm9 VIImaj9
chord_len = DUR / 4 + 0.4  # four slow chords across the clip, overlapping


def tone(freq, length, attack, decay, harm=((1, 1.0), (2, 0.18), (3, 0.04))):
    t = np.arange(int(length * SR)) / SR
    s = sum(w * np.sin(2 * np.pi * freq * k * t) for k, w in harm)
    env = np.minimum(t / attack, 1.0) * np.exp(-t / decay)
    return s * env * (1 + 0.06 * np.sin(2 * np.pi * 3.5 * t))


def put(buf, sig, t):
    i = int(t * SR)
    if i >= n: return
    sig = sig[: n - i]; buf[i:i + len(sig)] += sig


keys = np.zeros(n); pad = np.zeros(n); bass = np.zeros(n); mel = np.zeros(n)
for c, (root, shape) in enumerate(PROG):
    t0 = c * DUR / 4
    for j, iv in enumerate(shape):  # gentle roll, low to high
        put(keys, tone(f(key + root + iv - 12), chord_len + 1.5, 0.04, 2.2), t0 + j * 0.06)
        put(pad, tone(f(key + root + iv), chord_len + 0.8, 0.9, 6.0, ((1, 1.0), (2, 0.05))), t0)
    put(bass, tone(f(key + root - 24), chord_len, 0.08, 3.0, ((1, 1.0), (2, 0.1))), t0)
scale = [0, 3, 5, 7, 10, 12, 15, 17]
t, prev = 0.9, 4
while t < DUR - 0.9:  # a few soft notes, stepwise, plenty of space
    prev = int(np.clip(prev + rng.choice([-2, -1, 1, 2]), 0, len(scale) - 1))
    put(mel, tone(f(key + 12 + scale[prev]), 1.6, 0.02, 0.9, ((1, 1.0), (2, 0.25), (4, 0.05))), t)
    t += rng.choice([0.9, 1.2, 1.5])

dry = 0.55 * keys + 0.25 * pad + 0.35 * bass + 0.30 * mel
k = 9; dry = np.convolve(dry, np.ones(k) / k, mode="same")  # take the edge off the highs
wet = np.zeros(n)
for d, g in [(0.029, .5), (0.037, .45), (0.053, .4), (0.071, .35), (0.113, .3), (0.167, .25)]:
    s = int(d * SR); w = np.zeros(n); w[s:] = dry[:-s] * g; wet += w
music = np.stack([dry + 0.5 * wet, dry + 0.5 * np.roll(wet, 331)], 1)
music /= np.abs(music).max() + 1e-9
fi, fo = int(0.6 * SR), int(0.8 * SR)
music[:fi] *= np.linspace(0, 1, fi)[:, None]; music[-fo:] *= np.linspace(1, 0, fo)[:, None]

rain = rng.standard_normal(n)
rain = np.convolve(rain, np.ones(6) / 6, mode="same") * (1 + 0.25 * np.sin(2 * np.pi * 0.23 * np.arange(n) / SR))
for _ in range(int(DUR * 14)):  # droplets
    i = int(rng.random() * (n - 2000)); L = int(rng.integers(300, 1600))
    rain[i:i + L] += rng.standard_normal(L) * np.exp(-np.arange(L) / (L / 4)) * rng.uniform(1.5, 3.5)
rain /= np.abs(rain).max()
b = np.stack([rain, np.roll(rain, 97)], 1)
mix = 0.85 * music + 0.22 * b  # rain stays in the background
mix /= np.abs(mix).max(); mix *= 0.9
raw = pathlib.Path(sys.argv[1]).with_suffix(".raw.wav")
with wave.open(str(raw), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype("<i2").tobytes())
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", sys.argv[1]], check=True)
raw.unlink()
print(sys.argv[1])
