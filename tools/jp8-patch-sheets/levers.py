import numpy as np
from scipy import ndimage as nd

# Lever switches: the drawn lever is a filled oval whose height shows the position.
# Columns on the reference page, from the clustered thick marks.
LEVERS={'freqModDest':848,'pwmSource':968,'sync':1332,'vco2Low':1388,'vcfSlope':2036,'vcfEnvSource':2148,
 'vcaLfo':2352,'env1KeyFollow':2628,'env1Polarity':2676,'env2KeyFollow':2920}
LO,HI=405,480  # search band (reference rows); the fixed arrow boxes sit lower, the labels higher

def lever_y(a,x,dx,dy,half=7):
  """Centre row of the filled dot (about 22 px across), or None when nothing filled is drawn."""
  win=nd.binary_opening(a[LO+dy:HI+dy,x+dx-half-10:x+dx+half+10],structure=np.ones((9,9)))[:,10:-10]
  fill=win.mean(1);rows=np.where(fill>.6)[0]
  if not len(rows):return None
  runs=np.split(rows,np.where(np.diff(rows)>1)[0]+1)
  return LO+float(max(runs,key=len).mean())
