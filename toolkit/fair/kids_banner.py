"""Fair flyer 14.11: add a bold "הפעלות לילדים" banner (Yair) under the beer row.
Works on the existing frames: the top block is scaled to 92% to free 105px, the beer row moves up, the banner fills the gap.
usage: python kids.py in.(jpg|mp4) out.(jpg|mp4) [badge.png]"""
import base64, sys, subprocess, pathlib, numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
W, H, SPLIT, HEAD_END, S = 1080, 1920, 1310, 1480, 0.92
TW, TH = round(W * S), round(SPLIT * S); GAP = SPLIT - TH; TX = (W - TW) // 2
FONT = base64.b64encode(pathlib.Path('/home/claude/sm/toolkit/assets/fonts/Rubik-VF.ttf').read_bytes()).decode()

def banner(path, sub=False):
    top = TH + (HEAD_END - SPLIT) + 8
    css = f"""@font-face{{font-family:Rubik;src:url(data:font/ttf;base64,{FONT})}}
    html,body{{margin:0;width:{W}px;height:{H}px;background:transparent;font-family:Rubik;direction:rtl}}
    .b{{position:absolute;left:96px;top:{top}px;width:888px;height:88px;box-sizing:border-box;border-radius:30px;padding:0 14px 0 30px;
       background:linear-gradient(#d28a52,#c47a44);box-shadow:0 7px 0 #a4602f,0 14px 22px rgba(120,70,30,.28);
       display:flex;align-items:center;gap:16px;color:#fff8e9;white-space:nowrap}}
    .ic{{flex:none;width:64px;height:64px;border-radius:50%;background:#fff8e9;display:flex;align-items:center;justify-content:center}}
    .big{{font-weight:900;font-size:36px;line-height:1;flex:1;text-align:center}} .big span{{opacity:.7;font-weight:500;margin:0 4px}}
    .sep{{flex:none;width:3px;height:48px;border-radius:2px;background:rgba(255,248,233,.55);margin:0 6px}}
    .st{{position:absolute;left:58px;top:{round(1040*S)-74}px;height:62px;padding:0 24px 0 20px;border-radius:31px;background:#3f2912;color:#fff8e9;
        border:4px solid #fff8e9;font-weight:800;font-size:31px;display:flex;align-items:center;gap:10px;white-space:nowrap;transform:rotate(-5deg);box-shadow:0 8px 18px rgba(60,35,10,.35)}}
    .sm{{display:flex;flex-direction:column;line-height:1.14;font-size:25px;font-weight:500}} .sm b{{font-weight:800}}"""
    swing = "<svg viewBox='0 0 40 40' width='40' height='40' fill='none' stroke='#fff8e9' stroke-width='2.8' stroke-linecap='round' stroke-linejoin='round'><path d='M6 36 14 6h12l8 30M15 7v17M25 7v17M12.500 24.500h15'/></svg>"
    ball = "<svg viewBox='0 0 40 40' width='42' height='42' fill='none' stroke='#b96a35' stroke-width='2.8' stroke-linecap='round'><circle cx='20' cy='20' r='16'/><path d='M4 20h32M20 4v32M8.600 8.600c5.300 5.600 5.300 17.200 0 22.800M31.400 8.600c-5.300 5.600-5.300 17.200 0 22.800'/></svg>"
    html = f"<div class=b><div class=ic>{ball}</div><div class=big>עמדות משחק ספורטיביות לילדים <span>–</span> יאיר ברקוביץ'</div></div><div class=st>{swing}גן שעשועים צמוד</div>"
    if sub:  # sub-line under "בגדי יד 2", fades in with its cell (frames 84-92)
        css += ".u{position:absolute;left:540px;top:1765px;width:230px;text-align:center;font-size:20px;line-height:26px;font-weight:400;color:#6b5a48}"
        html = "<div class=u>גברים ונשים</div><div class=b style='visibility:hidden'></div>"
    with sync_playwright() as p:
        br = p.chromium.launch(); pg = br.new_page(viewport={"width": W, "height": H})
        pg.set_content(f"<html><head><meta charset=utf-8><style>{css}</style></head><body>{html}</body></html>"); pg.wait_for_timeout(300)
        over = pg.evaluate("(()=>{const b=document.querySelector('.b');return b.scrollWidth>b.clientWidth+1})()")
        pg.screenshot(path=path, omit_background=True); br.close()
    assert not over, "banner text overflows"
    return np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)

def remap(f):
    """f: HxWx3 uint8 -> new layout, same size."""
    out = f.copy()
    out[:HEAD_END] = f[8:16, 8:16].reshape(-1, 3).mean(0)                                  # page colour
    out[:TH, TX:TX + TW] = np.asarray(Image.fromarray(f[:SPLIT]).resize((TW, TH), Image.LANCZOS))
    out[TH:TH + HEAD_END - SPLIT] = f[SPLIT:HEAD_END]                                      # beer row, moved up
    out[TH + HEAD_END - SPLIT:HEAD_END] = f[HEAD_END - 5:HEAD_END - 4]                     # plain card row, repeated
    return out

def blend(out, layer, a=1.0, dy=0):
    l = np.roll(layer, dy, axis=0) if dy else layer
    al = l[..., 3:4] / 255 * a
    return (out * (1 - al) + l[..., :3] * al).clip(0, 255).astype(np.uint8)

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    bn = banner('out/banner.png'); sb = banner('out/sub.png', True)
    if src.endswith('.jpg'):
        o = blend(blend(remap(np.asarray(Image.open(src).convert('RGB'))), bn), sb)
        if len(sys.argv) > 3: o = blend(o, np.asarray(Image.open(sys.argv[3]).convert('RGBA')).astype(np.float32))
        Image.fromarray(o).save(dst, quality=93, subsampling=0); sys.exit()
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '24', '-i', '-', '-i', src,
                            '-map', '0:v', '-map', '1:a', '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
                            '-movflags', '+faststart', dst], stdin=subprocess.PIPE)
    n = 0
    while True:
        raw = dec.stdout.read(W * H * 3)
        if len(raw) < W * H * 3: break
        o = remap(np.frombuffer(raw, np.uint8).reshape(H, W, 3))
        t = min(1.0, max(0.0, (n - 66) / 10))                                              # card is fully in at frame 66
        if t > 0: e = 1 - (1 - t) ** 3; o = blend(o, bn, e, int(round((1 - e) * 16)))
        if n > 84: o = blend(o, sb, min(1.0, (n - 84) / 8))
        enc.stdin.write(o.tobytes()); n += 1
    enc.stdin.close(); enc.wait(); assert n == 192, n; print(dst, 'frames', n)
