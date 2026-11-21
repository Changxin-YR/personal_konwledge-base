"""Regenerate synthetic PDFs only. Runtime tests use the frozen PDFs directly.

Pass an embeddable Noto Sans SC TrueType font, e.g. Windows NotoSansSC-VF.ttf.
The checked-in PDFs contain only the rendered sample text and embedded subsets.
Dependencies: fonttools==4.61.1, reportlab==4.4.10.
"""
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as PdfFont
from reportlab.pdfgen.canvas import Canvas


root = Path(__file__).resolve().parent
pages = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import{pdfPages,revised}from'./corpus.mjs';console.log(JSON.stringify([pdfPages,[revised]]))",
], cwd=root))
font = TTFont(sys.argv[1])
assert font['name'].getDebugName(1) == 'Noto Sans SC' and font['OS/2'].fsType == 0
if 'fvar' in font:
    font = instantiateVariableFont(font, {'wght': 400}, updateFontNames=True)
assert all(ord(char) in font.getBestCmap() for version in pages for page in version for char in page)
out = root / 'fixtures'
out.mkdir(exist_ok=True)
with TemporaryDirectory() as temporary:
    path = str(Path(temporary) / 'regular.ttf')
    font.save(path)
    pdfmetrics.registerFont(PdfFont('Corpus', path, asciiReadable=False))
    for i, version in enumerate(pages, 1):
        pdf = Canvas(str(out / f'chinese-search-v{i}.pdf'), pagesize=(470, 220), invariant=True)
        pdf.setTitle(f'Synthetic KnowledgeOS search sample v{i}')
        for page in version:
            if page:
                pdf.setFont('Corpus', 14)
                pdf.drawString(30, 144, page)
            else:
                pdf.setFillColorRGB(.6, .8, .8)
                pdf.rect(30, 30, 120, 80, stroke=0, fill=1)
            pdf.showPage()
        pdf.save()
