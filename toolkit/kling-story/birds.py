"""Soft procedural birdsong + light breeze, 8.04s stereo 44.1k -> birds.wav. Deterministic (seeded)."""
import numpy as np, wave, sys
sr, dur = 44100, 8.04
rng = np.random.default_rng(31)
n = int(sr * dur); L = np.zeros(n); R = np.zeros(n)

def chirp(f0, f1, length, vib=0.0):
    t = np.arange(int(sr * length)) / sr
    f = f0 + (f1 - f0) * (t / length) ** 0.7 + vib * np.sin(2 * np.pi * 38 * t) * 300
    ph = 2 * np.pi * np.cumsum(f) / sr
    env = np.sin(np.pi * t / length) ** 2
    return (np.sin(ph) + 0.25 * np.sin(2 * ph)) * env

# two birds at different pan positions, each singing short phrases
for pan, base, gap in [(0.25, 3600, 1.3), (0.8, 4700, 1.7)]:
    t0 = rng.uniform(0.2, 0.9)
    while t0 < dur - 0.6:
        for k in range(rng.integers(2, 5)):  # a phrase of 2-4 notes
            ln = rng.uniform(0.05, 0.14)
            f0 = base * rng.uniform(0.85, 1.15); f1 = f0 * rng.uniform(0.7, 1.4)
            s = chirp(f0, f1, ln, vib=rng.uniform(0, 1)) * rng.uniform(0.5, 1.0)
            i = int(t0 * sr); j = min(n, i + len(s)); s = s[: j - i]
            L[i:j] += s * (1 - pan); R[i:j] += s * pan
            t0 += ln + rng.uniform(0.03, 0.09)
        t0 += gap * rng.uniform(0.7, 1.4)

# breeze: low-passed noise with slow swell
noise = rng.standard_normal(n)
k = 400; br = np.convolve(noise, np.ones(k) / k, mode="same")
br *= 0.6 + 0.4 * np.sin(2 * np.pi * np.arange(n) / sr / 6.0)
L += br * 6; R += np.roll(br, 300) * 6

st = np.stack([L, R], 1); st /= np.abs(st).max(); st *= 0.5
fade = int(0.4 * sr); ramp = np.linspace(0, 1, fade)[:, None]
st[:fade] *= ramp; st[-fade:] *= ramp[::-1]
with wave.open(sys.argv[1] if len(sys.argv) > 1 else "birds.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((st * 32767).astype("<i2").tobytes())
