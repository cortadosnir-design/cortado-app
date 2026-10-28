---
name: cortado-flyers
description: Make on-brand weekly-hours flyers and Instagram/Facebook post images (1080x1350) for קפה קורטדו, the coffee cart in Kibbutz Snir. Real-photo nature compositions (Mount Hermon, the Banias waterfall, the lawn and tall pines) with the cart, a cortado cup inside the scene, grandma Aida's logo and the week's opening hours, rendered to PNG. Use whenever the owner asks for a פלייר, פוסט שעות, "השבוע בעגלה", a weekly-hours image, a new design or template for the cart's Instagram/Facebook, or wants the flyers updated for a new week — even if they don't say "flyer".
---

# Cortado flyers

## THE HOUSE STYLE (owner's decision, 7.10.2026) — every new post uses it

The owner chose Café Blue (Jaffa) as the branding idea and asked that every post
"speak the same design language, all the time". Its logic, in Cortado's own colors:

- **One signature color everywhere: latte** `--board #CDBBA5` (owner, 27.10.2026: "every
  template, the whole platform, goes out in the latte option"; it replaced the green
  chalkboard `#34494A`, which was too strong). Soft brown line-doodles on it
  (`assets/art/doodles-*.svg`, from `scripts/doodles.py`, color `--on-board`: cart, Banias
  falls, Hermon, pine, river, tank, cortado glass, moka pot, cup, beans, leaf, hearts).
- **Text on the background**: `--on-board #4E3D31`. Never light text on the latte; accent
  text on it is `--aida-dark`.
- **Logo badge**: grandma Aida inside an oval outline with "cortado" (Rubik 800),
  top center. Use the rebuilt `assets/logo.png` (1200px, exact concentric circles);
  never the old 240px file.
- **Headline**: Rubik 900, huge, soft dark brown `--cart #5A4636` on a foam card
  `--foam #FCF8F1` (radius 44px) or `--on-board` directly on the latte.
- **Lists**: rows with round `--aida-dark` circles (day letters / numbers), Rubik 500–600.
  Secondary text and dots on foam: `--ink #6E5646`.
- **Ribbon**: soft dark brown pill (`--cart`) at the bottom, Playpen Sans Hebrew in foam
  ("נתראה בעגלה").
- **Accents**: soft terracotta `--aida #B98C69` (number circles, sticker ring, highlighted
  row), `--aida-dark #8A5D3E` for accent text, soft pink hearts `--chalk-pink #E2B9B5`.
  Nothing else. Shadows stay light (brown, ≤ .18 opacity).
- **Photos**: real ones, in rounded cards with a foam border.
- Shared CSS: `templates/board.css` (+ `slide.css` for carousel slides). Templates:
  `11-hours-board` (weekly hours), `21–26` (carousel "יום קצר בצפון"),
  `31-home` (emotional post), `41-fb-cover` (1640×624), `42-fb-profile` (720×720).
  A template sets its size with `<meta name="size" content="WxH">`.
- **Social QR row (owner's rule, 8.10.2026): every image or video that goes out on Facebook carries
  three small QRs at the bottom-left — Instagram (https://instagram.com/cortado_snir), Facebook
  (https://www.facebook.com/122109319071470402) and the WhatsApp group
  (https://chat.whatsapp.com/HVwYjRh8VBfAzGT2AmoXyP)** — `assets/qr-*.svg`, `.socials` in board.css,
  Hebrew labels under each; the footer text moves right (`.foot.r`) and is just
  "קיבוץ שניר · על הדשא ליד המרכולית". QRs ~58px on a post, ~72px on a reel frame. Reels: keep
  everything inside the safe zone (150px top, 420px bottom, 100px right are covered by the app);
  template 53 scales the post frame to fit. Don't draw the platforms' logos. Before publishing,
  check all three scan (cv2 on the render, and on a frame of the encoded video).
- **Spacing (8.10.2026, after the owner asked for clear gaps):** 8px scale. ~48px between blocks
  (badge→photos, photos→card), ~56px between side-by-side photos, 16–24px for tight pairs
  (text→ribbon, card→QR row, ribbon→footer). Nothing touches or overlaps except the ribbon riding
  the card's bottom edge. Outer margins: 64px left; on reels 116px right (buttons) and content
  between y 150 and 1500. Measure real gaps (rotation included) with
  `python scripts/measure.py templates/<file>.html 1080x1920` before rendering.
- Before sending anything, put it next to the existing set (contact sheet) and check
  it reads as the same family.

Publishing (owner's instruction 7.10.2026): Facebook posts go out through Metricool
(brand 6858296, Facebook page only) with autoPublish. Images are hosted on the
`social-media` branch of cortadosnir-design/cortado-app (no workflows run on it):
`https://raw.githubusercontent.com/cortadosnir-design/cortado-app/social-media/<date>/<file>.jpg`.
Cover and profile pictures can't be set through Metricool — the owner sets them by hand.


## What every flyer must have (the owner's brief, 6.10.2026)

1. **The cart** — the real one, from its photos (see motifs below).
2. **The Banias waterfall** — a real photo, not a drawing.
3. **Mount Hermon** — a real photo; the landscape behind everything.
4. **A coffee cup** — a real cortado, placed *inside* the landscape (in the
   foreground of the scene), never in a circle or box on the side.
5. **Grandma Aida's logo.**
6. **The week's opening hours**, day by day, with the week's dates.

## How it should look (what the owner approved and rejected)

Approved (template 01): one continuous landscape from top to bottom —
Hermon and sky at the top, the Banias falls in the middle, the cups in the
foreground — with the photos melting into each other through soft gradient
masks, so it reads as a single place. Title on the sky, hours on a dark band
between the falls and the cups, logo small in a corner.

Rejected, don't bring back:
- Anything childish: cartoon/flat illustrations, polaroids, tape, stamps,
  wooden-sign textures, leaves, stickers, handwriting fonts (Playpen,
  Amatic, Karantina), chunky slab display (Suez One).
- Photos pasted in circles, frames or cards with drop shadows.
- An illustrated waterfall standing in for the real Banias.

Keep: nature and green (forest, trail, waterfall, lawn, tall trees), clean
clear lines, lots of air, one serif + one sans: **Frank Ruhl Libre** for
headlines and hour numbers, **Heebo** for everything else. Thin 1.5px rules,
no boxes around text. Line art (`assets/art/banias-line-*.svg`) may be used as
a quiet accent only, never instead of the photos.

## The cart's motifs (use them, get them right)

- Matte black caravan with the round grandma Aida logo on its side.
- A big front window that opens upward as an awning; warm wood inside.
- String lights; the cart glows at dusk.
- A green chalkboard door with "CORTADO / HOLA!".
- Stands on the lawn in the center of Kibbutz Snir, under tall pines and old
  trees, next to the grocery store (המרכולית), with picnic tables and shade.
- The story: three brothers-in-law (Nitzan, Shahar, Amit) opened it in July
  2025 after returning from the evacuation; grandma Aida and the perfect
  cortado. Use story elements only as written in the owners' story-bank.

Photos that show these: `hero.jpg` (two cortados in front of the black cart and
logo — the best single cart + cup image), `team.jpg` (green chalkboard door),
`evening.jpg` (lit at dusk), `lawn.jpg` (lawn under the pines).

## 1. Get the hours right first

A wrong hour sends people to a closed cart, so the hours are never improvised.

- Source of truth: the hours the owners already published. Read them from the
  landing page source (regenerated hourly from the published week):
  `curl -sS https://raw.githubusercontent.com/cortadosnir-design/cortado-app/main/cafe/index.html`
  — the `#hours` table and the line `השעות לשבוע D.M – D.M`.
- Hours the owner gives in chat win. If the week is unclear, ask one question.
- Write `hours.json` (copy `hours.example.json`): `week`, and seven `days` with
  `day`, `short`, `times` (two shifts = two entries; closed = `["סגור"]`).
- Hours appear only on the image, never in a caption (house rule).

## 2. Render

```bash
cd <skill-dir>
python scripts/render.py --hours hours.json --out <work-dir>/out --sheet
python scripts/render.py --hours hours.json --only 01 --out <work-dir>/out
```

Needs `playwright` + Chromium and Pillow (present in the workspace). Fonts and
photos are local. The script prints `OVERFLOW` if a page grew past 1080x1350.

## 3. Look at every flyer before showing anyone

Open the PNG (or `sheet.jpg`) with Read, at a size where text is legible.
Check: all six required elements · hours match `hours.json` day by day · week
label correct · nothing overlapping (text over a cup, label over a label) ·
no hard photo edges or rectangle seams · no ghosting where two photos overlap
semi-transparently (make the upper photo fully opaque over the lower one and
keep the fade band short, ~15% of its height) · Hebrew right-to-left, numbers
left-to-right.

Fixes that came up:
- Reversed ranges ("10.10–4.10"): every time/date range goes inside
  `<span class="t">` (LTR isolate, nowrap). `hours.js` does this for hours and
  `{week}`.
- Two shifts breaking mid-range in a narrow column: `data-join="<br>"`.
- Cups covering the hours: shrink the cups box and move the hours band up.
- Edges of a blended photo showing: combine a horizontal and a vertical mask
  (`-webkit-mask-composite:source-in`).

## 4. Deliver

Send the PNGs with SendUserFile. They are drafts: nothing is published without
an exact preview and an explicit "כן" from the owners. Say which week's hours
are on them and where they came from.

**Stories go out as video with music (owner, 28.10.2026: "חייב").** Queue the image in the outbox as
always; on the push, `.github/workflows/story-music.yml` runs `scripts/story_video.py` and puts
`<image>.mp4` (8s, slow push-in, music, -14 LUFS) next to it, and the bot publishes that video
instead of the image. Pushing a story image without its outbox row makes no video. Licensed tracks
in `assets/music/*.mp3` beat the generated `reel/music.py` music, for stories and reels alike.

## Templates (`templates/`)

Five options, all with the six required elements, logo as a clear seal (~140–150px):
- `01-poster` — Hermon sky with title and hours; falls on the left, the cart and cups on the right.
- `02-dusk` — Hermon at last light, the cart glowing at dusk, falls among the trees, cups in front.
- `03-split` — falls down the left half with title and hours; Hermon above the cart on the right.
- `04-triptych` — Hermon, falls and the cart at dusk as three blended strips; cups in front.
- `05-paper` — light version: photos dissolving into paper, text on clean paper.

## Assets and credits

- `assets/photos/banias.jpg` — Banias falls, Wikimedia Commons "Banias 1.JPG",
  public domain (no credit needed).
- `assets/photos/hermon.jpg` — Mount Hermon from the Agamon Hula lookout, by
  Jotpe, **CC BY-SA 4.0: every flyer that uses it carries the line
  "Hermon photo: Jotpe, CC BY-SA 4.0"**. Replace with the owners' own Hermon
  photo when they send one, and drop the credit.
- `assets/logo.png` — grandma Aida, 240px; keep it ≤180px on the flyer.
- Other photos: from the landing page (`raw.githubusercontent.com/cortadosnir-design/cortado-app/main/cafe/img/`)
  and the owners' Drive folder "01 - חומרי גלם" (`1SCNrF1yxyGZfpYkxpy0TGsaloWksuxww`,
  download with the Drive connector; big results land in a file — decode its
  base64 `content`). In this workspace Wikimedia, Unsplash, github.io and Canva
  are blocked by the proxy; ask the owner to attach photos instead of trying to
  get around it.
- Facts allowed on flyers (landing page): על הדשא ליד המרכולית · 8 דקות הליכה
  מהבניאס והשביל התלוי · 5 דקות הליכה מהטנק הסורי · קיבוץ שניר. No prices, no
  superlatives, no emoji on the image, and none of: כשר, חוויה, מוזמנים,
  מחכים לכם, קסום, מדהים.

## Making a new layout

Copy `01-poster.html`, keep the frame (`base.css`, `hours.js`, 1080x1350,
`dir=rtl`) and the six elements. Hours go in an element with `data-hours="x"`
(optional `data-group="1"` to merge identical consecutive days, and
`data-join`), filled from `<template id="row-x">` with `{day}` `{short}`
`{times}`; the week goes in an element with `data-week` containing `{week}`.
Name it `NN-name.html`.

## Acai bowl photo (owner, 10.10.2026)
`assets/photos/acai.jpg` is the owner's bowl photo (wooden bowl on marble: berries, banana, blueberries, granola). From 10.10.2026 it is the only acai bowl image used in any design. Do not bring back the older hand-held bowl photos.

## Not for publishing (owner, 10.10.2026)
- `pastry-tray.jpg` (tray with iced coffee, muffin, cheese pastry, croissant): do not use in anything published.
- `pizza.jpg` is the owner's margherita photo from 10.10.2026, cropped above the hand. It is the only pizza image; the old olive pizza and the board photo with the woman are gone.

## Reels (18.10.2026): `reel/build_reel.py`

Owner's choice: HyperFrames (Apache-2.0, pinned in `reel/package.json`), no talking — music and
on-screen text only — and no paid tools. One command builds a finished 1080x1920 reel in the house
style from a JSON spec (hook card + 3–6 real photos/clips with ≤6-word chips + the board closing card
with logo, "נתראה בעגלה" ribbon and the three QRs):

    cd toolkit/reel && npm ci && cd -
    python3 toolkit/reel/build_reel.py spec.json --out /tmp/reel     # spec format: top of build_reel.py

It refuses texts with hours, prices, hashtags or the banned words; masters the sound to −14 LUFS;
checks size (<38MB for the bot), length, and that all three QRs scan on the encoded closing frame;
writes `reel.mp4`, `cover.jpg` and `sheet.jpg` (one settled still per scene). Look at `sheet.jpg`
before it goes anywhere. Each reel has one motion rule, `"motion"` in the spec (21.10.2026, owner
approved): `chalk` (dissolves + a chalk line drawing under the hook and the last caption only, its colour picked by the seed, for story reels), `kinetic`
(punch-in cuts, words landing one by one, for reels with a beat) or `push` (default). Which one, and
the rest of the per-reel decisions: `instagram/reel-brief.md`. Music comes from `reel/music.py` (generated, seeded, no license); a real
licensed track dropped into `assets/music/*.mp3` is used instead. Render takes ~2–3 minutes.
Static feed post (Friday slot): `python3 toolkit/reel/build_post.py spec.json --out /tmp/post` → `post.jpg` (spec at its top).
Media must be real: the cart's photos in `assets/photos/` or clips the owners sent. Never generated footage.
