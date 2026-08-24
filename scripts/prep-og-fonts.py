"""
Convert the shipped Inter woff2 files into static TTFs so the OG image
generator can load the real brand faces directly.

fontconfig cannot read woff2, and the variable axis needs pinning before a
rasteriser will pick a weight reliably, so each weight is instantiated as its
own static font.
"""
import pathlib
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import decompress
from fontTools.varLib import instancer
import io

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'scripts' / 'og-fonts'
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = [
    ('@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2',
     [('InterTight-Regular', 400), ('InterTight-SemiBold', 600)]),
    ('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
     [('Inter-Regular', 400), ('Inter-Bold', 700)]),
]

for rel, weights in SOURCES:
    src = ROOT / 'node_modules' / rel
    buf = io.BytesIO()
    decompress(str(src), buf)
    buf.seek(0)
    for name, wght in weights:
        font = TTFont(buf)
        buf.seek(0)
        static = instancer.instantiateVariableFont(font, {'wght': wght})
        dst = OUT / f'{name}.ttf'
        static.save(str(dst))
        print(f'  {dst.name:26s} {dst.stat().st_size // 1024}KB  (wght={wght})')
