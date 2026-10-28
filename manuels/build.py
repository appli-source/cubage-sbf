import subprocess, io, sys
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont('DejaVu','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
DOCS=[('technicien','Cubage-SBF-Guide-technicien-terrain.pdf','Cubage SBF · Guide du technicien terrain'),
      ('bureau','Cubage-SBF-Guide-administratif-bureau.pdf','Cubage SBF · Guide administratif bureau')]
for src,out,label in DOCS:
    tmp=src+'_raw.pdf'
    subprocess.run(['wkhtmltopdf','-q','--enable-local-file-access','--disable-smart-shrinking','--dpi','96','--zoom','1.25','--page-size','A4','--margin-top','16mm','--margin-bottom','20mm','--margin-left','16mm','--margin-right','16mm',src+'.html',tmp],check=True,stderr=subprocess.DEVNULL)
    r=PdfReader(tmp);w=PdfWriter();n=len(r.pages)
    for i,p in enumerate(r.pages):
        if i>0:
            buf=io.BytesIO();c=canvas.Canvas(buf,pagesize=A4);W,H=A4
            c.setFont('DejaVu',7.5);c.setFillColorRGB(0.47,0.50,0.53)
            c.setStrokeColorRGB(0.84,0.86,0.88);c.setLineWidth(0.4);c.line(16*2.835,34,W-16*2.835,34)
            c.drawString(16*2.835,24,label);c.drawRightString(W-16*2.835,24,f'Page {i+1} / {n}');c.save()
            p.merge_page(PdfReader(io.BytesIO(buf.getvalue())).pages[0])
        w.add_page(p)
    w.add_metadata({'/Title':label,'/Author':'Services Bois et Forêts SAS'})
    with open(out,'wb') as f:w.write(f)
    print(out,n,'pages')
