"""
Generate Open Graph share cards (1200x630) in the site's own design language.

One default card plus one per track. Composed with PIL rather than an SVG
rasteriser so the real Inter Tight faces are loaded from file, with no
fontconfig involved. Run after changing a photo, a headline or the city:

    python3 scripts/prep-og-fonts.py && python3 scripts/build-og.py
"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / 'scripts' / 'og-fonts'
PHOTOS = ROOT / 'public' / 'images'
OUT = ROOT / 'public' / 'og'
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1200, 630
MEDIA_W = 500
PAD = 56

BG = (250, 247, 242)
INK = (10, 10, 10)
BODY = (58, 57, 56)
META = (154, 152, 149)
CORAL = (255, 95, 56)
GHOST = (250, 238, 231)
RULE = (226, 223, 218)

F = lambda name, size: ImageFont.truetype(str(FONTS / f'{name}.ttf'), size)

TRACKS = [
    ('train',   '01', 'PREVENT INJURIES', ['train', 'without', 'injuries']),
    ('build',   '02', 'BODY SCULPTING',   ['build the', 'body you', 'want']),
    ('perform', '03', 'ATHLETIC AGING',   ['perform', 'better as', 'you age']),
    ('recover', '04', 'REHABILITATION',   ['strong', 'through', 'injuries']),
    ('connect', '05', 'ONLINE COACHING',  ['1-on-1', 'chat']),
]


def tracked(draw, xy, text, font, fill, spacing):
    """PIL has no letter-spacing, and every label in this design has some."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + spacing
    return x


def cover(path, box_w, box_h):
    im = Image.open(path).convert('RGB')
    scale = max(box_w / im.width, box_h / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left = (im.width - box_w) // 2
    top = (im.height - box_h) // 2
    return im.crop((left, top, left + box_w, top + box_h))


def wordmark(draw, x, y):
    an = F('InterTight-SemiBold', 44)
    draw.text((x, y), 'AN', font=an, fill=INK)
    w = draw.textlength('AN', font=an)
    dot = F('Inter-Regular', 20)
    draw.text((x + w + 12, y + 16), '•', font=dot, fill=CORAL)
    dw = draw.textlength('•', font=dot)
    tracked(draw, (x + w + 12 + dw + 12, y + 22), 'ATELIER',
            F('Inter-Regular', 15), META, 2.4)


def card(photo, kicker, lines, num, out_name, headline_size=62):
    img = Image.new('RGB', (W, H), BG)
    img.paste(cover(PHOTOS / photo, MEDIA_W, H), (0, 0))
    d = ImageDraw.Draw(img)

    x = MEDIA_W + PAD

    # Oversized number watermark, clipped by the right edge as on the site.
    if num:
        gf = F('InterTight-Regular', 300)
        nw = d.textlength(num, font=gf)
        d.text((W - nw + 46, 96), num, font=gf, fill=GHOST)

    wordmark(d, x, 52)

    tracked(d, (x, 232), kicker, F('Inter-Bold', 17), CORAL, 1.6)

    hf = F('InterTight-Regular', headline_size)
    y = 272
    for line in lines:
        d.text((x, y), line, font=hf, fill=INK)
        y += round(headline_size * 0.94)

    d.line([(x, H - 108), (W - PAD, H - 108)], fill=RULE, width=1)
    tracked(d, (x, H - 84), 'ANNA NEFEDOVA', F('Inter-Bold', 15), INK, 1.8)
    tracked(d, (x, H - 58), 'PHYSIOTHERAPIST · COACH · TRAINER · BOLOGNA',
            F('Inter-Regular', 14), META, 1.4)

    img.save(OUT / out_name, 'PNG', optimize=True)
    kb = (OUT / out_name).stat().st_size // 1024
    print(f'  {out_name:22s} {W}x{H}  {kb}KB')


# Default card, used for the hub and as the site-wide fallback.
card('train.jpg', 'PHYSIOTHERAPY · TRAINING · BOLOGNA',
     ['physiotherapeutic', 'training atelier.'], '', 'default.png', headline_size=56)

for slug, num, kicker, lines in TRACKS:
    card(f'{slug}.jpg', kicker, lines, num, f'{slug}.png')
