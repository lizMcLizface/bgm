import numpy as np

# Knob centres and radii on the reference page, fitted on the mean of all registered pages
# (fit_centres); angles are measured clockwise from 12 o'clock, in degrees.
GUESS={'lfoWave':(668,440),'vco1Range':(1135,442),'vco1Wave':(1225,442),'vco2Range':(1453,440),
 'vco2Fine':(1550,442),'vco2Wave':(1645,442),'sourceMix':(1770,445)}
MEAN_ORIGIN=(350,230)  # reference coordinates of mean.npy's (0, 0)
# Continuous knobs turn 300 degrees (7 to 5 o'clock); their pointers are read inside that travel and
# close to the knob, clear of the printed scale and the arrows below it.
CONTINUOUS={'vco2Range','vco2Fine','sourceMix'}

def fit_centres(mean):
  """Circle centre and radius per knob: the ring of printed ink around each guess."""
  out={}
  t=np.linspace(0,2*np.pi,180,endpoint=False)
  for k,(gx,gy) in GUESS.items():
    best=(-1,None)
    for r in range(20,40):
      for cy in range(gy-14,gy+15):
        for cx in range(gx-14,gx+15):
          xs=(cx-MEAN_ORIGIN[0]+r*np.sin(t)).astype(int);ys=(cy-MEAN_ORIGIN[1]-r*np.cos(t)).astype(int)
          s=np.median(mean[ys,xs])  # median: the ring is drawn all round, pointers and labels only in places
          if s>best[0]:best=(s,(cx,cy,r))
    out[k]=best[1]
  return out

def angle(a,template,centre,dx,dy,reach=1.6,travel=180):
  """Pointer direction: the angle whose ray (0.35 r to reach) carries the most ink not in the printed template."""
  cx,cy,r=centre
  def ray(deg):
    th=np.radians(deg);s=0
    for f in np.linspace(.35,reach,24):
      x=int(round(cx+f*r*np.sin(th)));y=int(round(cy-f*r*np.cos(th)))
      s+=a[y+dy,x+dx] and template[y-MEAN_ORIGIN[1],x-MEAN_ORIGIN[0]]<.5
    return s/24
  best=max(range(-travel,travel+1,2),key=ray)
  # (direction, its ink, the ink straight opposite: high when a bar is drawn right through the knob)
  return best,ray(best),ray(best+180 if best<0 else best-180)

def read(a,template,centres,dx,dy):
  return {k:angle(a,template,c,dx,dy,*((1.25,154) if k in CONTINUOUS else (1.6,180))) for k,c in centres.items()}
