import numpy as np
from common import caps

# Slider columns on the reference page (p05), in the order of patch.js SLIDERS
# minus the three knobs. Found by clustering the thick marks of all 64 pages.
SLIDERS={'lfoRate':544,'lfoDelay':588,'vcoModLfo':748,'vcoModEnv':788,'pwm':912,'crossMod':1048,
 'hpf':1860,'cutoff':1940,'resonance':1984,'envMod':2092,'vcfLfo':2200,'keyFollow':2244,'vcaLevel':2312,
 'env1Attack':2456,'env1Decay':2500,'env1Sustain':2540,'env1Release':2580,
 'env2Attack':2744,'env2Decay':2788,'env2Sustain':2828,'env2Release':2870}
# Scale ticks on the reference page (averaged over all pages): the 10 and 0 rows per column.
TICKS={'lfoRate':(399,484),'lfoDelay':(400,484),'vcoModLfo':(399,484),'vcoModEnv':(399,484),'pwm':(399,483),'crossMod':(399,482),
 'hpf':(399,481),'cutoff':(399,481),'resonance':(399,481),'envMod':(399,481),'vcfLfo':(399,481),'keyFollow':(399,481),'vcaLevel':(398,480),
 'env1Attack':(398,480),'env1Decay':(398,480),'env1Sustain':(398,480),'env1Release':(398,480),
 'env2Attack':(397,481),'env2Decay':(397,479),'env2Sustain':(397,479),'env2Release':(397,479)}
TOP,BOTTOM=397,484
HALF=17  # half-width of the column window (caps are ~45 px wide, columns ≥ 40 px apart)

def cap_y(a,x,dx,dy,lo=TOP-14,hi=BOTTOM+10):
  """Centre row of the thickest cap-like run in the column window, in reference coordinates."""
  win=caps(a[lo+dy-10:hi+dy+10,x+dx-HALF-14:x+dx+HALF+14])[:,14:-14]
  fill=win.mean(1)
  rows=np.where(fill>.6)[0]
  if not len(rows):return None
  runs=np.split(rows,np.where(np.diff(rows)>1)[0]+1)
  best=max(runs,key=lambda r:(len(r),fill[r].sum()))
  return lo-10+float(best.mean())

def value(k,y):
  if y is None:return None
  top,bottom=TICKS[k];return float(np.clip((bottom-y)/(bottom-top),0,1))
