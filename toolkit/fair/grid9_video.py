"""Re-composite a fair story video with the 3x3 grid: grid area cleared to the card colour once the card is in, cells staggered in."""
import sys, subprocess, numpy as np
from PIL import Image
import build
src, dst = sys.argv[1], sys.argv[2]
W, H, N = 1080, 1920, 192
X0, X1, Y0, Y1 = build.X0, build.X1, build.Y0, build.Y1
build.overlay('transparent', "#141417", "#6b5a48", "#f6e6d6", "#b8794f", 'out/ov-cells.png')
cells = np.asarray(Image.open('out/ov-cells.png').convert('RGBA')).astype(np.float32)
cw, ch = (X1 - X0) / 3, (Y1 - Y0) / 3
boxes = [(int(X1 - (c + 1) * cw), int(Y0 + r * ch), int(X1 - c * cw), int(Y0 + (r + 1) * ch)) for r in range(3) for c in range(3)]
START, STEP, DUR, RISE, CARD_IN = 72, 3, 9, 14, 66
dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '24', '-i', '-',
                        '-i', src, '-map', '0:v', '-map', '1:a', '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
                        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst], stdin=subprocess.PIPE)
n = 0
while True:
    raw = dec.stdout.read(W * H * 3)
    if len(raw) < W * H * 3: break
    f = np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(np.float32)
    if n >= CARD_IN:
        f[Y0:Y1, X0:X1] = f[1496:1504, 536:544].reshape(-1, 3).mean(0)
        for i, (x0, y0, x1, y1) in enumerate(boxes):
            t = min(1.0, max(0.0, (n - START - i * STEP) / DUR))
            if t <= 0: continue
            e = 1 - (1 - t) ** 3; dy = int(round((1 - e) * RISE))
            c = cells[y0:y1, x0:x1]; a = c[..., 3:4] / 255 * e
            tgt = f[y0 + dy:min(y1 + dy, Y1), x0:x1]; hh = tgt.shape[0]
            tgt[:] = tgt * (1 - a[:hh]) + c[:hh, :, :3] * a[:hh]
    enc.stdin.write(f.clip(0, 255).astype(np.uint8).tobytes()); n += 1
enc.stdin.close(); enc.wait(); print(dst, 'frames', n)
