"""Festive overlay (bunting, balloons, confetti) for event posts. Deterministic.
Usage: python scripts/festive.py  -> assets/art/festive-post.svg, festive-story.svg"""
import math, random, pathlib

C = ["#F2C14E", "#E7A3AE", "#F2AF75", "#CB7E4D", "#8EC5C9", "#F7F2DC"]
OUT = pathlib.Path(__file__).resolve().parent.parent / "assets" / "art"


def bunting(w, y0, sag, n, seed):
    r = random.Random(seed)
    pts = [(i * w / (n - 1), y0 + sag * math.sin(math.pi * i / (n - 1))) for i in range(n)]
    path = "M" + " L".join(f"{x:.0f} {y:.0f}" for x, y in pts)
    s = [f'<path d="{path}" stroke="#F4F1EA" stroke-width="3" fill="none" opacity=".85"/>']
    for i in range(n - 1):
        (x1, y1), (x2, y2) = pts[i], pts[i + 1]
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        s.append(f'<polygon points="{x1+6:.0f},{y1:.0f} {x2-6:.0f},{y2:.0f} {mx:.0f},{my+62:.0f}" fill="{C[i % len(C)]}"/>')
    return s


def balloons(x, y, scale, seed):
    r = random.Random(seed)
    s, knot = [], (x + 60 * scale, y + 260 * scale)
    for i, (dx, dy) in enumerate([(0, 40), (70, 0), (130, 50)]):
        cx, cy = x + dx * scale, y + dy * scale
        rx, ry = 34 * scale, 42 * scale
        col = C[(i + seed) % 5]
        s.append(f'<path d="M{cx:.0f} {cy+ry:.0f} Q{cx-10*scale:.0f} {(cy+ry+knot[1])/2:.0f} {knot[0]:.0f} {knot[1]:.0f}" stroke="#F4F1EA" stroke-width="2" fill="none" opacity=".8"/>')
        s.append(f'<ellipse cx="{cx:.0f}" cy="{cy:.0f}" rx="{rx:.0f}" ry="{ry:.0f}" fill="{col}"/>')
        s.append(f'<ellipse cx="{cx-rx*.35:.0f}" cy="{cy-ry*.4:.0f}" rx="{rx*.22:.0f}" ry="{ry*.3:.0f}" fill="#fff" opacity=".45"/>')
        s.append(f'<polygon points="{cx-5:.0f},{cy+ry+8:.0f} {cx+5:.0f},{cy+ry+8:.0f} {cx:.0f},{cy+ry-2:.0f}" fill="{col}"/>')
    return s


def confetti(w, h, keep_out, n, seed):
    r, s, tries = random.Random(seed), [], 0
    while len(s) < n and tries < 20000:
        tries += 1
        x, y = r.uniform(10, w - 10), r.uniform(10, h - 10)
        if any(a <= x <= c and b <= y <= d for a, b, c, d in keep_out):
            continue
        col, rot = r.choice(C), r.uniform(0, 180)
        if r.random() < .5:
            s.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="16" height="7" rx="2" fill="{col}" transform="rotate({rot:.0f} {x:.0f} {y:.0f})"/>')
        else:
            s.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r.uniform(4,7):.1f}" fill="{col}"/>')
    return s


def svg(w, h, parts):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">' + "".join(parts) + "</svg>"


post_keep = [(350, 20, 730, 145), (425, 140, 1025, 630), (25, 135, 445, 615), (45, 640, 1035, 1135),
             (335, 1120, 745, 1250), (25, 1225, 295, 1345), (650, 1275, 1055, 1325)]
(OUT / "festive-post.svg").write_text(svg(1080, 1350,
    bunting(1080, -6, 70, 13, 1) + confetti(1080, 1350, post_keep, 80, 2) + balloons(800, 1142, .5, 3)))

story_keep = [(350, 240, 730, 360), (420, 370, 1025, 905), (10, 370, 440, 860), (45, 905, 1035, 1460),
              (335, 1455, 745, 1570), (55, 1550, 335, 1675), (650, 1590, 1030, 1645)]
(OUT / "festive-story.svg").write_text(svg(1080, 1920,
    bunting(1080, 120, 80, 13, 1) + confetti(1080, 1920, story_keep, 110, 2) + balloons(840, 1468, .42, 3)))
print("ok")

# Delicate line drawings of the stalls (owner, 20.10.2026): one stroke color each, 100x100.
ICONS = {
 "cinnabon": '<path d="M52.0 44.0 L52.1 44.1 L52.2 44.2 L52.3 44.3 L52.4 44.5 L52.4 44.6 L52.4 44.7 L52.4 44.9 L52.4 45.1 L52.3 45.2 L52.2 45.4 L52.1 45.5 L52.0 45.7 L51.8 45.8 L51.6 46.0 L51.3 46.1 L51.1 46.2 L50.8 46.3 L50.5 46.5 L50.1 46.5 L49.8 46.6 L49.4 46.7 L49.0 46.7 L48.6 46.7 L48.2 46.7 L47.7 46.7 L47.3 46.6 L46.9 46.5 L46.4 46.4 L46.0 46.3 L45.6 46.2 L45.2 46.0 L44.9 45.8 L44.5 45.6 L44.2 45.4 L43.9 45.1 L43.7 44.8 L43.4 44.5 L43.3 44.2 L43.1 43.9 L43.0 43.6 L43.0 43.2 L43.0 42.9 L43.1 42.5 L43.2 42.2 L43.3 41.8 L43.6 41.5 L43.8 41.2 L44.2 40.8 L44.5 40.5 L45.0 40.2 L45.5 39.9 L46.0 39.7 L46.6 39.4 L47.2 39.2 L47.8 39.0 L48.5 38.9 L49.2 38.7 L50.0 38.6 L50.7 38.6 L51.5 38.6 L52.3 38.6 L53.1 38.6 L53.9 38.7 L54.6 38.9 L55.4 39.0 L56.2 39.2 L56.9 39.5 L57.6 39.8 L58.2 40.1 L58.9 40.5 L59.4 40.9 L60.0 41.3 L60.4 41.7 L60.8 42.2 L61.2 42.7 L61.4 43.2 L61.6 43.8 L61.7 44.3 L61.8 44.9 L61.7 45.4 L61.6 46.0 L61.4 46.6 L61.1 47.1 L60.8 47.7 L60.3 48.2 L59.8 48.7 L59.2 49.2 L58.5 49.7 L57.7 50.1 L56.9 50.6 L56.0 50.9 L55.1 51.2 L54.1 51.5 L53.1 51.8 L52.0 52.0 L50.9 52.1 L49.7 52.2 L48.6 52.2 L47.4 52.2 L46.2 52.1 L45.1 52.0 L43.9 51.8 L42.8 51.5 L41.7 51.2 L40.6 50.9 L39.6 50.5 L38.7 50.0 L37.8 49.5 L36.9 49.0 L36.2 48.4 L35.5 47.7 L34.9 47.1 L34.4 46.3 L34.0 45.6 L33.7 44.9 L33.5 44.1 L33.4 43.3 L33.4 42.5 L33.6 41.7 L33.8 41.0 L34.2 40.2 L34.7 39.4 L35.3 38.7 L36.0 37.9 L36.7 37.3 L37.6 36.6 L38.6 36.0 L39.7 35.4 L40.9 34.9 L42.1 34.4 L43.5 34.0 L44.8 33.7 L46.3 33.4 L47.7 33.2 L49.3 33.1 L50.8 33.0 L52.3 33.0 L53.9 33.1 L55.5 33.2 L57.0 33.4 L58.5 33.7 L60.0 34.1 L61.4 34.6 L62.7 35.1 L64.0 35.6 L65.3 36.3 L66.4 37.0 L67.4 37.7 L68.4 38.5 L69.2 39.4 L69.9 40.3 L70.4 41.2 L70.9 42.2 L71.2 43.2 L71.4 44.2 L71.4 45.2 L71.3 46.2 L71.0 47.2 L70.6 48.2 L70.1 49.2 L69.4 50.2 L68.6 51.1 L67.6 52.0 L66.6 52.8 L65.4 53.6 L64.0 54.4 L62.6 55.1 L61.1 55.7 L59.5 56.2 L57.8 56.7 L56.0 57.1 L54.2 57.4 L52.3 57.6 L50.4 57.8 L48.4 57.8 L46.5 57.8 L44.6 57.6 L42.6 57.4 L40.7 57.1 L38.9 56.7 L37.1 56.2 L35.3 55.6 L33.7 54.9 L32.1 54.1 L30.7 53.3 L29.3 52.4 L28.1 51.5 L27.0 50.4 L26.1 49.4 L25.3 48.2 L24.7 47.1 L24.2 45.9 L23.9 44.7 L23.8 43.4 L23.8 42.2 L24.0 41.0 L24.4 39.7 L25.0 38.5 L25.7 37.3 L26.6 36.2 L27.7 35.1 L28.9 34.0 L30.3 33.0 L31.8 32.0 L33.5 31.2 L35.3 30.4 L37.2 29.7 L39.1 29.0 L41.2 28.5 L43.4 28.1 L45.6 27.7 L47.9 27.5 L50.2 27.4 L52.6 27.4 L54.9 27.5 L57.2 27.7 L59.5 28.0 L61.8 28.5 L63.9 29.0 L66.1 29.7 L68.1 30.4 L70.0 31.2 L71.8 32.2 L73.5 33.2 L75.0 34.3 L76.4 35.5 L77.7 36.7 L78.7 38.0 L79.6 39.4 L80.2 40.7 L80.7 42.2 L81.0 43.6 L81.1 45.1 L80.9 46.6 L80.6 48.0 L80.1 49.5 L79.3 50.9 L78.4 52.3 L77.2 53.6 L75.9 54.9"/><path d="M18 44V58A32 18.6 0 0 0 82 58V44"/><path d="M26 60q0 9 3 9q3 0 3-7M44 63q0 7 3 7q3 0 3-6M60 62q0 10 3 10q3 0 3-8M73 57q0 6 2.5 6q2.5 0 2.5-6"/><path d="M10 86q40 10 80 0"/>',
 "jewelry": '<path d="M18 16H82"/><path d="M28 16q22 52 44 0"/><circle cx="34" cy="31" r="2.5"/><circle cx="42" cy="40" r="2.5"/><circle cx="58" cy="40" r="2.5"/><circle cx="66" cy="31" r="2.5"/><path d="M50 44l8 10-8 12-8-12z"/><path d="M44 54h12"/><circle cx="74" cy="80" r="9"/><path d="M70 71l4-6 4 6"/><path d="M22 92h36"/>',
 "icecream": '<path d="M36 50L50 92L64 50"/><path d="M40 62l18 14M60 62L44 80M38 56l22 0"/><circle cx="50" cy="38" r="15"/><path d="M36 46q4 6 8 2q4 6 8 0q4 6 10-2"/><path d="M50 23q6-12 18-10q-2 12-18 10z"/>',
 "beer": '<path d="M30 36V84q0 6 6 6H62q6 0 6-6V36"/><path d="M68 46h8q8 0 8 10v8q0 10-8 10h-8"/><path d="M27 36q-2-12 11-12q6-11 18-4q13-4 14 16z"/><circle cx="42" cy="58" r="2.5"/><circle cx="54" cy="70" r="2.5"/><circle cx="46" cy="78" r="2"/>',
 "malabi": '<ellipse cx="50" cy="56" rx="22" ry="6"/><path d="M28 56L32 84Q50 90 68 84L72 56"/><path d="M30 67q10-5 20 0t20 0"/><circle cx="42" cy="54" r="1.8"/><circle cx="50" cy="57" r="1.8"/><circle cx="57" cy="54" r="1.8"/><path d="M45 52l3-2M54 59l3 1"/><path d="M60 54L74 36"/><ellipse cx="76" cy="33" rx="4" ry="2.5" transform="rotate(-52 76 33)"/>',
 "cotton": '<path d="M36 62q-14 0-14-12q-6-10 4-16q0-12 12-12q8-10 18-2q12 0 12 12q8 8 0 18q-2 12-16 12z"/><path d="M38 62L38 94"/><path d="M60 64l4 28h18l4-28z"/><path d="M66 64l2 28M74 64v28M82 64l-2 28"/><path d="M60 64q-2-8 6-8q2-6 8-2q6-4 9 2q6 2 3 8"/>',
 "pizza": '<path d="M18 30q32-14 64 0L50 90z"/><path d="M22 37q28-11 56 0"/><circle cx="42" cy="50" r="5"/><circle cx="58" cy="56" r="5"/><circle cx="50" cy="70" r="4"/><path d="M60 44q4-5 8-1q-4 4-8 1z"/>',
 "more": '<path d="M50 14v18M50 68v18M14 50h18M68 50h18"/><path d="M50 36l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/><circle cx="24" cy="24" r="3"/><circle cx="78" cy="76" r="3"/><circle cx="78" cy="22" r="2.5"/>',
 "dance": '<path d="M16 90H84"/><circle cx="38" cy="78" r="7"/><path d="M43 71L58 42"/><path d="M58 42L46 16M58 42L80 24"/><path d="M50 57L30 88M52 54L72 66"/><path d="M70 82q6-4 10 0M76 92q4-3 8 0"/>',
 "sport": '<circle cx="42" cy="56" r="22"/><path d="M42 46l9 7-3 10H36l-3-10z"/><path d="M42 34v12M51 53l11-5M48 63l7 11M36 63l-7 11M33 53l-11-5"/><path d="M70 88l8-36 8 36z"/><path d="M73 74h10M75 64h6"/>',
 "swing": '<path d="M16 92L32 16H68L84 92"/><path d="M42 16V66M58 16V66"/><path d="M36 66H64"/><path d="M24 54h8M68 54h8"/>',
}
TILE = {"cinnabon": "#CB7E4D", "jewelry": "#C9687A", "icecream": "#3E8E93", "beer": "#C8921A",
        "malabi": "#C9687A", "cotton": "#CB7E4D", "pizza": "#34494A", "more": "#C8921A"}
for k, body in ICONS.items():
    col = TILE.get(k, "#FFFFFF")
    (OUT / f"line-{k}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="none" stroke="{col}" stroke-width="3.2" '
        f'stroke-linecap="round" stroke-linejoin="round">{body}</g></svg>')
print("icons ok")
