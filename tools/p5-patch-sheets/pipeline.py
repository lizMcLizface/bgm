import glob,json,os,sys
import numpy as np
from PIL import Image
from scipy import ndimage as nd

# Usage: python pipeline.py <pages dir> <out.json>
# Reads the panel drawing of each Prophet-5 patch sheet (one program per page, 1-1 … 5-6) into
# knob angles and button states, registered onto page 2 with an affine fit on the knob discs.
pages,out=sys.argv[1],sys.argv[2]

# Template on page 2 (p02.png, 3470 px wide): knob disc centres and button centres.
KNOBS={'pmEnv':(172,213),'pmOscB':(304,213),'aFreq':(719,212),'aPw':(1018,212),'mixA':(1283,212),'mixB':(1417,213),
 'mixNoise':(1546,209),'cutoff':(1744,210),'res':(1877,210),'fEnv':(2010,209),'masterTune':(2329,210),
 'lfoRate':(307,362),'bFreq':(718,361),'bFine':(849,362),'bPw':(1226,362),
 'fAttack':(1744,361),'fDecay':(1877,361),'fSustain':(2008,359),'fRelease':(2142,359),
 'aAttack':(2333,360),'aDecay':(2463,359),'aSustain':(2593,359),'aRelease':(2725,360),
 'wheelMix':(175,512),'glide':(719,512),'volume':(2531,510)}
BUTTONS={'pmFreqA':(416,209),'pmPwA':(493,209),'pmFilter':(570,209),'aSaw':(830,209),'aPulse':(906,209),'sync':(1132,209),
 'kbdTrack':(2140,206),'lfoSaw':(416,361),'lfoTri':(492,361),'lfoSquare':(570,361),
 'bSaw':(957,361),'bTri':(1036,361),'bPulse':(1113,361),'bLow':(1341,361),'bKybd':(1412,359),
 'wmFreqA':(273,511),'wmFreqB':(347,511),'wmPwA':(419,511),'wmPwB':(494,511),'wmFilter':(570,511),
 'unison':(905,511),'release':(2328,504)}
T=np.array(list(KNOBS.values()),float);KEYS=list(KNOBS)
# knob pairs tried as registration anchors (left half × right half): any of them may be missing on a page
LEFT=['pmEnv','pmOscB','lfoRate','aFreq','bFreq','wheelMix','glide']
RIGHT=['aRelease','aSustain','aDecay','aAttack','fRelease','fEnv','cutoff','volume','masterTune']
ANCHORS=[(l,r) for l in LEFT for r in RIGHT]

def ink(path):
  """Grey page, ink mask and knob discs. The threshold starts halfway between the darkest ink and the
  paper and rises until the panel's discs show (some scans print them grey)."""
  g=np.array(Image.open(path).convert('L')).astype(float)
  top=g[:int(g.shape[0]*.4)];dark,paper=np.percentile(top,[.5,50])
  t=min(140,(dark+paper)/2)
  while True:
    a=g<t;D=discs(a)
    if len(D)>=24 or t>=190:return g,a,D
    t+=10

def discs(a):
  """Centres of filled round marks the size of a knob disc (the panels are drawn at 0.7-1.1x page 2)."""
  top=a[:int(a.shape[0]*.4)]
  yy,xx=np.mgrid[-6:7,-6:7]
  lab,n=nd.label(nd.binary_opening(top,structure=(xx**2+yy**2)<=36))
  out=[]
  for i,s in enumerate(nd.find_objects(lab)):
    m=lab[s]==i+1;h,w=m.shape;fill=m.sum()/(h*w)
    if 20<=w<=52 and 20<=h<=52 and .6<=fill<=.84 and .75<w/h<1.33:
      cy,cx=nd.center_of_mass(m);out.append((s[1].start+cx,s[0].start+cy,(w+h)/4))
  return np.array(out)

def register(D):
  """Similarity map template → page from the knob discs. Every pair of discs is tried as each pair of
  anchor knobs; the map that lands most knobs on discs seeds a closest-point refinement."""
  best=(-1,None)
  for k0,k1 in ANCHORS:
   a0,a1=T[KEYS.index(k0)],T[KEYS.index(k1)];v=a1-a0
   for p in D:
     for q in D:
       if q[0]-p[0]<.5*v[0]:continue
       w=q[:2]-p[:2];s=np.linalg.norm(w)/np.linalg.norm(v)
       if not .55<s<1.25:continue
       ang=np.arctan2(w[1],w[0])-np.arctan2(v[1],v[0])
       if abs(ang)>.15:continue
       R=s*np.array([[np.cos(ang),-np.sin(ang)],[np.sin(ang),np.cos(ang)]])
       P=(T-a0)@R.T+p[:2];d=np.linalg.norm(P[:,None,:]-D[None,:,:2],axis=2).min(1)
       score=(d<8*s).sum()+1e-3*s
       if score>best[0]:best=(score,np.hstack([R,(p[:2]-R@a0)[:,None]]))
  A=best[1];s=abs(A[0,0])
  for _ in range(8):
    P=T@A[:,:2].T+A[:,2]
    d=np.linalg.norm(P[:,None,:]-D[None,:,:2],axis=2);j=d.argmin(1);ok=d[np.arange(len(T)),j]<10*s
    if ok.sum()<4:break
    A=similarity(T[ok],D[j[ok],:2]);s=abs(np.linalg.det(A[:,:2]))**.5
  P=T@A[:,:2].T+A[:,2];d=np.linalg.norm(P[:,None,:]-D[None,:,:2],axis=2)
  return A,float(np.median(d.min(1))),int((d.min(1)<10*s).sum())

def similarity(X,Y):
  """Least-squares scale, rotation and shift taking points X onto Y (Umeyama), as a 2x3 matrix."""
  mx,my=X.mean(0),Y.mean(0);Xc,Yc=X-mx,Y-my
  U,S,Vt=np.linalg.svd(Yc.T@Xc);R=U@Vt
  if np.linalg.det(R)<0:U[:,-1]*=-1;R=U@Vt
  sc=S.sum()/(Xc**2).sum();M=sc*R
  return np.hstack([M,(my-M@mx)[:,None]])

def pointer(g,cx,cy,r):
  """Angle (clockwise from 12 o'clock) of the darkest ray just outside the disc, where the pointer runs."""
  best=None
  for deg in range(-180,180,2):
    th=np.radians(deg);s=0
    for f in np.linspace(1.2,1.75,10):
      x=int(round(cx+f*r*np.sin(th)));y=int(round(cy-f*r*np.cos(th)));s+=255-g[y,x]
    if best is None or s>best[0]:best=(s,deg)
  return best[1]

rows=[]
files=sorted(glob.glob(os.path.join(pages,'p*.png')))
for i,f in enumerate(files):
  g,a,D=ink(f);A,res,matched=register(D)
  at=lambda p:np.array(p,float)@A[:,:2].T+A[:,2]
  knobs={}
  for k,c in KNOBS.items():
    x,y=at(c);j=np.linalg.norm(D[:,:2]-[x,y],axis=1).argmin()
    if np.linalg.norm(D[j,:2]-[x,y])<12:x,y,r=D[j]
    else:r=19*abs(np.linalg.det(A[:,:2]))**.5
    r=min(r,24*abs(np.linalg.det(A[:,:2]))**.5)
    knobs[k]=pointer(g,x,y,r)
  buttons={}
  for k,c in BUTTONS.items():
    x,y=at(c);sc=abs(np.linalg.det(A[:,:2]))**.5;hw,hh=int(10*sc),int(14*sc)
    buttons[k]=bool(a[int(y)-hh:int(y)+hh,int(x)-hw:int(x)+hw].mean()>.6)
  code=f'{i//8+1}{i%8+1}'
  rows.append({'code':code,'page':i+1,'registration':{'median_px':round(res,1),'knobs_matched':matched},'knobs':knobs,'buttons':buttons})
  print(code,round(res,1),matched,flush=True)
json.dump({'schema':1,'source':'Prophet-5 patch sheets, measured from the drawings (tools/p5-patch-sheets)','pages':rows},open(out,'w'),indent=1)
