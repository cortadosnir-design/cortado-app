"""White line-doodle pattern (Cortado's own motifs) for the green brand background.

python scripts/doodles.py  -> assets/art/doodles-post.svg (1080x1350), doodles-cover.svg (1640x624)
Each motif is drawn in a 100x100 box.
"""
import pathlib, random

ART = pathlib.Path(__file__).resolve().parent.parent / "assets" / "art"

MOTIFS = {
    "cup": '<path d="M20 40H72V58C72 74 62 82 46 82C30 82 20 74 20 58Z"/><path d="M72 46C87 46 87 64 72 64"/>'
           '<path d="M8 88C22 94 70 94 84 88"/><path d="M36 30C30 22 42 18 36 8"/><path d="M52 30C46 22 58 18 52 8"/>',
    "glass": '<path d="M28 18L34 88H66L72 18Z"/><path d="M30 38H70"/><path d="M33 72H67"/>'
             '<path d="M50 30C46 25 41 28 44 32L50 36L56 32C59 28 54 25 50 30Z"/>',
    "moka": '<path d="M36 18H64L60 46H40Z"/><path d="M45 18V12H55V18"/><path d="M64 22L76 17"/>'
            '<path d="M40 46L33 86H67L60 46"/><path d="M36 24C21 24 20 40 31 44"/><path d="M38 64H62"/>',
    "beans": '<ellipse cx="34" cy="50" rx="13" ry="20" transform="rotate(-25 34 50)"/>'
             '<path d="M40 33C30 44 40 56 28 67"/>'
             '<ellipse cx="66" cy="52" rx="13" ry="20" transform="rotate(20 66 52)"/>'
             '<path d="M60 34C70 46 60 58 72 69"/>',
    "pine": '<path d="M50 8L33 38H42L26 64H40L22 88H78L60 64H74L58 38H67Z"/><path d="M50 88V97"/>',
    "falls": '<path d="M8 30C24 22 34 24 40 30"/><path d="M60 30C66 24 78 22 94 30"/><path d="M40 30V72"/><path d="M60 30V72"/>'
             '<path d="M45 32V78"/><path d="M50 32V80"/><path d="M55 32V78"/><path d="M22 86C38 78 62 78 78 86"/><path d="M34 94H66"/>',
    "hermon": '<path d="M4 84L38 28L52 50L64 36L96 84"/><path d="M30 41L35 46L39 40L43 46L47 43"/><path d="M58 45L63 48L68 44"/>',
    "cart": '<path d="M14 44H86V80H14Z"/><path d="M8 44H92L86 34H14Z"/><path d="M22 54H58V70H22Z"/>'
            '<path d="M22 54L18 47H62L58 54"/><path d="M66 52H80V80H66"/><circle cx="30" cy="86" r="6"/><circle cx="70" cy="86" r="6"/>'
            '<path d="M10 26C30 12 70 12 90 26"/><circle cx="30" cy="18" r="2.2"/><circle cx="50" cy="15" r="2.2"/><circle cx="70" cy="18" r="2.2"/>',
    "leaf": '<path d="M50 92C50 64 50 40 50 10"/><path d="M50 72C36 66 30 56 32 46C42 50 48 60 50 72Z"/>'
            '<path d="M50 50C62 44 68 34 66 24C56 28 50 38 50 50Z"/><path d="M50 30C42 26 38 18 40 10C46 14 50 20 50 30Z"/>',
    "sun": '<circle cx="50" cy="50" r="13"/><path d="M50 22V30M50 70V78M22 50H30M70 50H78M30 30L36 36M64 64L70 70M30 70L36 64M64 36L70 30"/>',
    "heart": '<path d="M50 78C22 60 20 36 36 32C44 30 50 37 50 42C50 37 56 30 64 32C80 36 78 60 50 78Z"/>',
    "tank": '<path d="M14 62H86C92 62 92 78 86 78H14C8 78 8 62 14 62Z"/><circle cx="23" cy="70" r="4"/><circle cx="37" cy="70" r="4"/>'
            '<circle cx="50" cy="70" r="4"/><circle cx="63" cy="70" r="4"/><circle cx="77" cy="70" r="4"/>'
            '<path d="M20 62L26 50H74L80 62"/><path d="M36 50C36 38 64 38 64 50"/><path d="M62 44H94"/>',
    "river": '<path d="M6 44C18 36 30 52 42 44C54 36 66 52 78 44C84 40 90 42 94 44"/><path d="M6 60C18 52 30 68 42 60C54 52 66 68 78 60C84 56 90 58 94 60"/>'
             '<path d="M14 76C26 68 38 84 50 76C62 68 74 84 86 76"/><path d="M18 34V10M24 34V16M76 30V8M82 30V14"/><path d="M18 10C14 14 14 18 18 20M76 8C72 12 72 16 76 18"/>',
    "spark": '<path d="M50 28V72M28 50H72"/><path d="M38 38L44 44M56 56L62 62M38 62L44 56M56 44L62 38"/>',
}
BIG = ["cup", "falls", "moka", "pine", "glass", "hermon", "cart", "leaf", "river", "beans"]
SMALL = ["heart", "spark", "sun", "beans", "leaf"]


def pattern(w, h, cols, rows, size, seed, opacity, color="#F4F1EA"):
    rnd = random.Random(seed)
    cw, ch = w / cols, h / rows
    out, k = [], 0
    for r in range(rows):
        for c in range(cols):
            big = (r + c) % 3 != 2
            name = BIG[k % len(BIG)] if big else SMALL[k % len(SMALL)]
            k += 1
            s = size * (rnd.uniform(.85, 1.1) if big else rnd.uniform(.4, .55))
            x = c * cw + rnd.uniform(.1, .9) * (cw - s)
            y = r * ch + rnd.uniform(.1, .9) * (ch - s)
            rot = rnd.uniform(-14, 14)
            sc = s / 100
            out.append(f'<g transform="translate({x:.0f} {y:.0f}) rotate({rot:.0f} {s/2:.0f} {s/2:.0f}) scale({sc:.3f})">{MOTIFS[name]}</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            '<defs><filter id="chalk" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="4"/>'
            '<feDisplacementMap in="SourceGraphic" scale="2.2"/></filter></defs>'
            f'<g filter="url(#chalk)" fill="none" stroke="{color}" stroke-opacity="{opacity}" stroke-width="{3.2/ (size/100):.2f}" '
            f'stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">'
            + "".join(out) + "</g></svg>")


def icon(name, color="#FFFFFF", width=4):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="{color}" '
            f'stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round">{MOTIFS[name]}</g></svg>')


if __name__ == "__main__":
    ART.mkdir(parents=True, exist_ok=True)
    (ART / "doodles-post.svg").write_text(pattern(1080, 1350, 5, 6, 150, 7, .30))
    (ART / "doodles-story.svg").write_text(pattern(1080, 1920, 5, 8, 150, 11, .30))
    (ART / "doodles-cover.svg").write_text(pattern(1640, 624, 9, 3, 140, 3, .30))
    (ART / "doodles-post-light.svg").write_text(pattern(1080, 1350, 5, 6, 150, 7, .16, "#34494A"))
    (ART / "doodles-profile.svg").write_text(pattern(720, 720, 4, 4, 130, 5, .22))
    for n in MOTIFS:
        (ART / f"icon-{n}.svg").write_text(icon(n))
        (ART / f"icon-{n}-board.svg").write_text(icon(n, "#34494A"))
        (ART / f"icon-{n}-pink.svg").write_text(icon(n, "#E7A3AE", 6))
    print("ok", len(MOTIFS), "motifs")
