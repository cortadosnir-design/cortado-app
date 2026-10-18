"""Warm, quiet café music for the reels, made here so it costs nothing and has no license to check.

Usage: python3 music.py --seconds 14 --seed 3 --out music.wav

Rhodes-like chords, a soft bass, a plucked-guitar arpeggio (Karplus-Strong) and brushed hats,
with a gentle fade in and out. The seed picks key, tempo, progression and pattern, so every reel
gets its own track. A real licensed track dropped in assets/music/ is used instead (build_reel.py).
"""
import argparse, wave
import numpy as np

SR = 48000
PROGS = [  # semitone offsets of chord roots inside a major key, with chord qualities
    [(0, "maj7"), (9, "m7"), (5, "maj7"), (7, "7")],
    [(0, "maj7"), (5, "maj7"), (9, "m7"), (7, "sus")],
    [(9, "m7"), (5, "maj7"), (0, "maj7"), (7, "7")],
    [(0, "maj7"), (4, "m7"), (5, "maj7"), (5, "m6")],
]
SHAPES = {"maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10], "7": [0, 4, 7, 10], "sus": [0, 5, 7, 10], "m6": [0, 3, 7, 9]}
f = lambda midi: 440.0 * 2 ** ((midi - 69) / 12)


def env(n, a=0.01, d=1.2):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1.0) * np.exp(-t / d)


def rhodes(freq, n):
    t = np.arange(n) / SR
    tone = sum(w * np.sin(2 * np.pi * freq * k * t) for k, w in [(1, 1.0), (2, 0.28), (3, 0.08), (4, 0.03)])
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.2 * t)
    return tone * trem * env(n, 0.006, 1.6)


def pluck(freq, n, rng):
    p = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, p)
    out = np.empty(n)
    for i in range(n):  # Karplus-Strong: a noise burst averaged around a delay line
        out[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * 0.996
    return out * env(n, 0.002, 0.9)


def lowpass(x, k):
    return np.convolve(x, np.ones(k) / k, mode="same")


def make(seconds, seed):
    rng = np.random.default_rng(seed)
    key = 48 + int(rng.integers(0, 7))          # C3..F#3
    bpm = int(rng.integers(72, 90))
    prog = PROGS[seed % len(PROGS)]
    beat = 60 / bpm
    n = int(seconds * SR)
    mix = np.zeros(n)
    bar = 4 * beat
    arp = rng.permutation([0, 1, 2, 3, 2, 1, 3, 0])
    t0, i = 0.0, 0
    while t0 < seconds:
        root, q = prog[i % len(prog)]
        notes = [key + root + s for s in SHAPES[q]]
        s = int(t0 * SR)
        m = min(int(bar * SR * 1.3), n - s)
        if m <= 0:
            break
        for k, note in enumerate(notes):  # chord, gently rolled
            off = int(k * 0.018 * SR)
            if off < m:
                mix[s + off:s + m] += 0.16 * rhodes(f(note + 12), m - off)
        bl = min(int(bar * SR), n - s)    # bass on 1 and the "and" of 3
        mix[s:s + bl] += 0.30 * np.sin(2 * np.pi * f(key + root - 12) * np.arange(bl) / SR) * env(bl, 0.01, 0.8)
        s3 = s + int(2.5 * beat * SR)
        if s3 < n:
            b3 = min(int(1.5 * beat * SR), n - s3)
            mix[s3:s3 + b3] += 0.22 * np.sin(2 * np.pi * f(key + root - 12 + 7) * np.arange(b3) / SR) * env(b3, 0.01, 0.5)
        for j in range(8):                # plucked arpeggio in eighths
            sj = s + int(j * beat / 2 * SR)
            if sj >= n:
                break
            lj = min(int(1.2 * SR), n - sj)
            mix[sj:sj + lj] += 0.07 * pluck(f(notes[arp[j] % 4] + 24), lj, rng)
        for j in range(8):                # brushed hats, softer on the beat
            sj = s + int(j * beat / 2 * SR)
            if sj >= n:
                break
            lj = min(int(0.09 * SR), n - sj)
            noise = rng.normal(0, 1, lj)
            hat = noise - lowpass(noise, 6)
            mix[sj:sj + lj] += (0.025 if j % 2 else 0.015) * hat * env(lj, 0.001, 0.03)
        t0 += bar
        i += 1
    mix += 0.0025 * lowpass(rng.normal(0, 1, n), 3)   # a little room noise so it never sounds sterile
    fade = np.ones(n)
    fi, fo = int(0.6 * SR), int(1.8 * SR)
    fade[:fi] = np.linspace(0, 1, fi)
    fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
    mix = lowpass(mix, 3) * fade
    return mix / (np.max(np.abs(mix)) + 1e-9) * 0.7


def make_drive(seconds, seed, bpm=None, drop_bars=2):
    """Moving and energetic (owner, 16.10.2026: reels need a beat and a drop, not sleepy café music).
    Quiet piano and strings for drop_bars bars, then kick, claps and bass, through to the end."""
    rng = np.random.default_rng(seed)
    key, bpm = 50 + int(rng.integers(0, 5)), bpm or 100 + int(rng.integers(0, 9))   # D3..F#3
    prog = [(9, "m7"), (5, "maj7"), (0, "maj7"), (7, "sus")]                  # vi-IV-I-V, the warm one
    beat = 60 / bpm; bar = 4 * beat; n = int(seconds * SR); mix = np.zeros(n)
    t = np.arange(n) / SR
    drop = drop_bars * bar
    for i in range(int(seconds / bar) + 1):
        s = int(i * bar * SR)
        if s >= n:
            break
        root, q = prog[i % 4]
        notes = [key + root + x for x in SHAPES[q]]
        m = min(int(bar * SR * 1.2), n - s)
        loud = 1.0 if i >= drop_bars else 0.6
        for k, note in enumerate(notes):                     # strings: detuned saws, slow swell
            tt = np.arange(m) / SR
            saw = sum(((tt * f(note + 12) * d) % 1) * 2 - 1 for d in (0.997, 1.0, 1.004))
            mix[s:s + m] += 0.035 * loud * lowpass(saw, 24) * np.minimum(tt / 0.6, 1) * np.exp(-tt / 6)
        for j in range(8):                                   # piano eighths, chord tones up and down
            sj = s + int(j * beat / 2 * SR)
            if sj >= n:
                break
            lj = min(int(1.0 * SR), n - sj)
            mix[sj:sj + lj] += 0.10 * rhodes(f(notes[[0, 2, 1, 3, 2, 1, 3, 2][j]] + 24), lj)
        if i < drop_bars:
            continue
        bl = min(int(bar * SR), n - s)                       # driving bass in eighths
        for j in range(8):
            sj = s + int(j * beat / 2 * SR); lj = min(int(beat / 2 * SR), n - sj)
            if lj > 0:
                mix[sj:sj + lj] += 0.20 * np.sin(2 * np.pi * f(key + root - 12) * np.arange(lj) / SR) * env(lj, 0.004, 0.25)
        for j in range(4):
            sj = s + int(j * beat * SR); lj = min(int(0.35 * SR), n - sj)
            if lj <= 0:
                break
            tt = np.arange(lj) / SR                          # kick: a falling sine
            mix[sj:sj + lj] += 0.55 * np.sin(2 * np.pi * (50 * tt + 60 * (1 - np.exp(-tt * 30)) / 30)) * np.exp(-tt / 0.12)
            if j % 2 and n - sj > 400:                       # claps on 2 and 4
                lc = min(int(0.15 * SR), n - sj); no = rng.normal(0, 1, lc)
                mix[sj:sj + lc] += 0.16 * (no - lowpass(no, 4)) * env(lc, 0.002, 0.05)
            sh = sj + int(beat / 2 * SR); lh = min(int(0.05 * SR), n - sh)
            if lh > 100:                                     # off-beat shaker
                no = rng.normal(0, 1, lh); mix[sh:sh + lh] += 0.05 * (no - lowpass(no, 3)) * env(lh, 0.001, 0.02)
    ds, rs = int(drop * SR), int((drop - bar / 2) * SR)      # noise riser into the drop, then a crash
    if ds < n:
        r = np.linspace(0, 1, ds - rs) ** 2; no = rng.normal(0, 1, ds - rs)
        mix[rs:ds] += 0.10 * r * (no - lowpass(no, 8))
        lc = min(int(1.5 * SR), n - ds); no = rng.normal(0, 1, lc)
        mix[ds:ds + lc] += 0.14 * (no - lowpass(no, 3)) * env(lc, 0.001, 0.5)
    fade = np.ones(n); fo = int(1.8 * SR)
    fade[:int(0.3 * SR)] = np.linspace(0, 1, int(0.3 * SR)); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
    mix *= fade
    return mix / (np.max(np.abs(mix)) + 1e-9) * 0.7


def write(path, x):
    st = np.stack([x, np.roll(x, int(0.012 * SR))], axis=1)  # a touch of width
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((st * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, required=True)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", required=True)
    ap.add_argument("--style", choices=["cafe", "drive"], default="cafe")
    ap.add_argument("--bpm", type=int)                 # drive only
    ap.add_argument("--drop-bars", type=int, default=2)  # drive only
    a = ap.parse_args()
    x = make_drive(a.seconds, a.seed, a.bpm, a.drop_bars) if a.style == "drive" else make(a.seconds, a.seed)
    assert len(x) == int(a.seconds * SR) and np.isfinite(x).all() and np.max(np.abs(x)) <= 0.71
    write(a.out, x)
    print(a.out)
