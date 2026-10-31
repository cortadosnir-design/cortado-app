"""Frames of thin accent lines drawing right-to-left (RTL), full-frame 1080x1920 RGBA.
usage: python lines.py outdir name y x_left x_right [frames]
"""
import sys, pathlib
from PIL import Image, ImageDraw, ImageFilter
out = pathlib.Path(sys.argv[1]); name = sys.argv[2]
y, xl, xr = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
N = int(sys.argv[6]) if len(sys.argv) > 6 else 16
out.mkdir(parents=True, exist_ok=True)
A, Bc = (0xCB, 0x7E, 0x4D), (0xF7, 0xD9, 0xB8)  # terracotta -> peach
S = 2  # supersample
for k in range(N + 1):
    p = 1 - (1 - k / N) ** 3  # ease-out
    x0 = xr - (xr - xl) * p
    im = Image.new("RGBA", (1080 * S, 1920 * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if p > 0:
        steps = max(2, int((xr - x0) / 4))
        for i in range(steps):  # gradient segments
            t = i / steps; xa = xr - (xr - x0) * t; xb = xr - (xr - x0) * (i + 1) / steps
            c = tuple(int(A[j] + (Bc[j] - A[j]) * t) for j in range(3))
            d.line([(xa * S, y * S), (xb * S, y * S)], fill=c + (255,), width=4 * S)
        d.ellipse([(xr - 2) * S, (y - 2) * S, (xr + 2) * S, (y + 2) * S], fill=A + (255,))
        if k < N:  # glowing tip while drawing
            glow = Image.new("RGBA", im.size, (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
            g.ellipse([(x0 - 9) * S, (y - 9) * S, (x0 + 9) * S, (y + 9) * S], fill=(255, 236, 210, 200))
            im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(6 * S)))
        d = ImageDraw.Draw(im)
        d.ellipse([(x0 - 2) * S, (y - 2) * S, (x0 + 2) * S, (y + 2) * S], fill=Bc + (255,))
    im.resize((1080, 1920), Image.LANCZOS).save(out / f"{name}_{k:02d}.png")
