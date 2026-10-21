import glob,json,os,sys
import numpy as np
from PIL import Image
from scipy import ndimage as nd

# Usage: python pipeline.py <Juno-60-Patch-Book.pdf> <out.json>
# Renders the Juno-60 patch book (its pages are composited images, so they need rendering) and reads
# every panel drawing: slider caps, LEDs and lever dots, relative to the panel's black header bar.
# The first 56 panels are the factory programs 11–78; the rest are the owner's-manual sound examples.
import pymupdf
doc=pymupdf.open(sys.argv[1])

# Positions on a panel, relative to its header bar's top row (300 dpi).
SLIDERS={'lfoRate':772,'lfoDelay':817,'dcoLfo':970,'pwm':1020,'sub':1337,'noise':1386,'hpf':1478,'cutoff':1570,'res':1616,
 'env':1749,'vcfLfo':1796,'kybd':1843,'level':1994,'attack':2086,'decay':2133,'sustain':2176,'release':2225}
TOP,BOTTOM=101,198            # cap centre at 10 and at 0 (the scale's end ticks)
LEDS={'pulse':(1158,102),'saw':(1205,102),'sub':(1258,102),'chorus1':(2377,104),'chorus2':(2427,104)}
LEVERS={'pwmSource':1080,'envPolarity':1675,'vcaMode':1918}   # dot height: top / middle / bottom

def caps_y(a,H,x):
  """Centre of the slider cap (drawn as a double bar) in the column window."""
  win=nd.binary_opening(a[H+80:H+220,x-20:x+20],structure=np.ones((6,30)))
  rows=np.where(win.mean(1)>.6)[0]
  if not len(rows):return None
  return H+80+float(rows.min()+rows.max())/2

def dot_y(a,H,x):
  """Centre row of the filled lever dot in the lever's column, relative to the header."""
  yy,xx=np.mgrid[-6:7,-6:7]
  win=nd.binary_opening(a[H+110:H+200,x-14:x+14],structure=(xx**2+yy**2)<=36)
  rows=np.where(win.any(1))[0]
  return None if not len(rows) else 110+float(rows.mean())

panels=[]
for pi,page in enumerate(doc):
  pix=page.get_pixmap(dpi=300,colorspace=pymupdf.csGRAY)
  a=np.frombuffer(pix.samples,np.uint8).reshape(pix.height,pix.width)<128
  frac=a[:,60:2500].mean(1);rows=np.where(frac>.55)[0]
  for r in [r for r in np.split(rows,np.where(np.diff(rows)>1)[0]+1) if len(r)>15]:
    H=int(r[0])
    v={k:(None if (y:=caps_y(a,H,x)) is None else round(min(1,max(0,(BOTTOM-(y-H))/(BOTTOM-TOP)))*20)/20) for k,x in SLIDERS.items()}
    # lit LEDs are filled: the darkest 9x9 patch near the LED (positions vary by a few pixels)
    led={k:bool(nd.uniform_filter(a[H+y-6:H+y+18,x-12:x+12].astype(float),9).max()>.85) for k,(x,y) in LEDS.items()}
    lev={k:dot_y(a,H,x) for k,x in LEVERS.items()}
    panels.append({'page':pi+1,'header':H,'sliders':v,'leds':led,'levers':lev})
  print(pi+1,len(panels),flush=True)
json.dump({'schema':1,'source':'Juno-60 patch book, measured from the drawings (tools/j60-patch-book)','panels':panels},open(sys.argv[2],'w'),indent=1)
