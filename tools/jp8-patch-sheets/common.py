import numpy as np
from PIL import Image
from scipy import ndimage as nd

# Shared helpers: load a page as a boolean ink mask and register it to the
# reference page (p05) by cross-correlating projection profiles of the panel's
# header row (the black section labels), which every page draws identically.
REF='p05'
def ink(path):return np.array(Image.open(path))<128

def _profiles(a):
  head=a[200:340,300:3100]
  return head.sum(0).astype(float),a[150:700,300:3100].sum(1).astype(float)

def _shift(p,q,max_shift=80):
  p=p-p.mean();q=q-q.mean();best=(-1e18,0)
  for s in range(-max_shift,max_shift+1):
    v=np.dot(p[max(0,s):len(p)+min(0,s)],q[max(0,-s):len(q)-max(0,s)])
    if v>best[0]:best=(v,s)
  return best[1]

def offset(a,ref):
  """(dx, dy) to add to reference coordinates to land on this page."""
  (cx,ry),(rcx,rry)=_profiles(a),_profiles(ref)
  return _shift(cx,rcx),_shift(ry,rry)

def caps(a,height=4):
  """Thick horizontal marks in the slider band: slider caps and lever ovals (some sheets draw them thin)."""
  return nd.binary_opening(a,structure=np.ones((height,22)))
