# Construit les guides PDF à partir des sources HTML (gen.py) avec Chromium (Playwright) :
# mise en page A4 fidèle au CSS, pied de page avec titre et numéro de page (sauf couverture).
import os, io
from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter
D = os.path.dirname(os.path.abspath(__file__))
DOCS = [('technicien', 'Cubage-SBF-Guide-technicien-terrain.pdf', 'Cubage SBF · Guide du technicien terrain'),
        ('bureau', 'Cubage-SBF-Guide-administratif-bureau.pdf', 'Cubage SBF · Guide administratif bureau')]
FOOT = '''<div style="width:100%;font:7.5pt Arial,sans-serif;color:#788088;margin:0 16mm;display:flex;justify-content:space-between;border-top:.4pt solid #d6dbe0;padding-top:4px">
<span>{label}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'''
with sync_playwright() as pw:
    b = pw.chromium.launch(); p = b.new_page()
    for src, out, label in DOCS:
        if not os.path.exists(os.path.join(D, src + '.html')): continue
        p.goto('file://' + os.path.join(D, src + '.html')); p.wait_for_load_state('networkidle')
        pdf = p.pdf(format='A4', print_background=True, display_header_footer=True, header_template='<div></div>',
                    footer_template=FOOT.format(label=label), margin={'top': '16mm', 'bottom': '18mm', 'left': '16mm', 'right': '16mm'})
        r = PdfReader(io.BytesIO(pdf)); w = PdfWriter()
        for pg in r.pages: w.add_page(pg)
        w.add_metadata({'/Title': label, '/Author': 'Services Bois et Forêts SAS'})
        with open(os.path.join(D, out), 'wb') as f: w.write(f)
        print(out, len(r.pages), 'pages', os.path.getsize(os.path.join(D, out)) // 1024, 'Ko')
    b.close()
