import numpy as np,json,math,sys
from PIL import Image
from detect import conv,peaks
from knobs import load,knob_kernel
from leds import led_kernel

S=1.21  # display → full-resolution scale of the A1 reference crop (page 5, top half)
KNOBS={  # display coordinates on the reference panel
 'volume':(333,380),'balance':(419,380),'portamento':(527,380),'lfo_rate':(645,380),'freq_mod_depth':(724,380),'pw_mod_depth':(802,380),
 'osc1_freq':(929,380),'osc_pw':(1020,380),'osc2_freq':(1113,380),'filter_freq':(1224,377),'resonance':(1316,377),'filter_env_amount':(1408,377),
 'filter_attack':(1503,377),'filter_decay':(1567,377),'filter_sustain':(1631,377),'filter_release':(1695,377),
 'amp_attack':(1503,445),'amp_decay':(1567,445),'amp_sustain':(1631,445),'amp_release':(1695,445),
 'master_tune':(377,524),'osc2_detune':(529,524),'mod_rate':(271,742),'mod_depth':(424,742),
}
LEDS={
 'auto':(333,437),'hold':(376,436),'chord':(419,436),'unison':(528,436),
 'lfo_sine':(645,433),'lfo_square':(645,492),'lfo_sh':(645,551),
 'freq_mod_osc1':(724,433),'freq_mod_osc2':(724,492),'freq_mod_filter':(724,551),
 'pw_mod_osc1':(802,433),'pw_mod_osc2':(802,492),
 'osc1_saw':(912,430),'osc1_pulse':(951,430),'sync':(998,430),'osc2_filter_env':(1045,430),'osc2_saw':(1094,430),'osc2_pulse':(1133,430),
 'mix_osc1':(1205,429),'mix_osc2_half':(1250,429),'mix_osc2_full':(1295,429),'mix_noise':(1340,429),'four_pole':(1385,429),'track':(1430,429),
 'split':(919,549),'double':(963,549),'lower':(1007,549),'upper':(1051,549),
 'group_a':(1195,548),'group_b':(1235,548),'group_c':(1275,548),'group_d':(1315,548),
 **{f'program_{i+1}':(1357+40*i,548) for i in range(8)},
 'wheel_lower':(330,733),'wheel_upper':(367,733),'mod_osc1':(256,858),'mod_osc2':(292,858),
 'bend_osc2_only':(331,858),'bend_narrow':(369,858),'transpose_down':(408,858),'transpose_up':(440,858),
}
TITLE_BOX=((560,1215),(1330,1420))  # full-res reference coordinates of the title and pitch notes

def candidates(img):
  r=conv(img,knob_kernel());m=r.max()
  return [(float(x),float(y),v/m) for x,y,v in peaks(r,m*0.55,40)]

def refine(img,x,y,rad=5):
  # best knob-centre in a small window, by ring symmetry
  yy,xx=np.mgrid[-30:31,-30:31];d=np.hypot(xx,yy);best=None
  for dy in range(-rad,rad+1):
    for dx in range(-rad,rad+1):
      cx,cy=int(round(x+dx)),int(round(y+dy));p=img[cy-30:cy+31,cx-30:cx+31]
      if p.shape!=d.shape:continue
      s=p[(d>=23)&(d<=25.5)].mean()+p[(d>=9.5)&(d<=14)].mean()-p[d<8].mean()
      if not best or s>best[0]:best=(s,cx,cy)
  return best[1],best[2]

def fit_affine(src,dst):
  A=np.hstack([np.array(src),np.ones((len(src),1))]);M,*_=np.linalg.lstsq(A,np.array(dst),rcond=None);return M
def apply(M,pt):return np.array([pt[0],pt[1],1])@M

def register(cands,ref):
  # ref: name → (x,y) reference full-res; cands: detected knob centres in one panel
  names=list(ref);R=np.array([ref[n] for n in names]);C=np.array([(x,y) for x,y,_ in cands])
  # initial: bounding boxes
  def bbox(P):return P.min(0),P.max(0)
  (r0,r1),(c0,c1)=bbox(R),bbox(C)
  sc=(c1-c0)/(r1-r0);M=np.array([[sc[0],0],[0,sc[1]],list(c0-r0*sc)])
  for _ in range(4):
    proj=np.array([apply(M,p) for p in R]);pairs=[]
    for i,p in enumerate(proj):
      j=int(np.argmin(np.hypot(*(C-p).T)));pairs.append((i,j,float(np.hypot(*(C[j]-p)))))
    good=[(i,j) for i,j,dist in pairs if dist<25]
    M=fit_affine([R[i] for i,_ in good],[C[j] for _,j in good])
  resid=[float(np.hypot(*(apply(M,R[i])-C[j]))) for i,j,_ in pairs]
  return M,{names[i]:tuple(C[j]) for i,j,_ in pairs},max(resid)

def knob_value(img,x,y):
  ang=np.arange(0,360,1.0);rs=np.arange(15.5,22.5,0.5);dark=np.zeros(len(ang))
  for k,a in enumerate(ang):
    t=math.radians(a);xs=x+rs*math.sin(t);ys=y-rs*math.cos(t)   # clockwise from up
    dark[k]=img[np.round(ys).astype(int),np.round(xs).astype(int)].mean()
  sm=np.convolve(np.r_[dark[-10:],dark,dark[:10]],np.ones(9)/9,'same')[10:-10]
  a=float(ang[int(np.argmax(sm))]);a=a-360 if a>180 else a
  contrast=float(sm.max()-np.median(sm))
  return round(max(0,min(10,(a+150)/30)),1),a,contrast

def led_state(img,x,y):
  k=led_kernel();best=None
  for dy in range(-7,8):
    for dx in range(-7,8):
      cx,cy=int(round(x+dx)),int(round(y+dy));p=img[cy-11:cy+12,cx-11:cx+12]
      if p.shape!=k.shape:continue
      s=float((p*k).sum())
      if not best or s>best[0]:best=(s,cx,cy)
  _,cx,cy=best;yy,xx=np.mgrid[-3:4,-3:4];inner=img[cy-3:cy+4,cx-3:cx+4][np.hypot(xx,yy)<=3].mean()
  return float(inner)

def main():
  ref_img=load('pages/p05.png')
  refK={n:refine(ref_img,x*S,y*S,8) for n,(x,y) in KNOBS.items()}
  refL={n:(x*S,y*S) for n,(x,y) in LEDS.items()}
  out=[];titles=[]
  for page in range(5,53):
    img=load(f'pages/p{page:02d}.png');H=img.shape[0];c=candidates(img)
    for half in (0,1):
      cs=sorted([p for p in c if (p[1]<H/2)==(half==0)],key=lambda p:-p[2])[:24]
      M,match,resid=register(cs,refK)
      knobs={};low=[]
      for n,(x,y) in match.items():
        x,y=refine(img,x,y,3);v,a,con=knob_value(img,x,y);knobs[n]=v
        if con<0.25:low.append(n)
      leds={n:led_state(img,*apply(M,p)) for n,p in refL.items()}
      (tx0,ty0),(tx1,ty1)=TITLE_BOX;a0=apply(M,(tx0,ty0));a1=apply(M,(tx1,ty1))
      Image.fromarray(((1-img[int(a0[1]):int(a1[1]),int(a0[0]):int(a1[0])])*255).astype(np.uint8)).save(f'titles/{page:02d}{"ab"[half]}.png')
      out.append({'page':page,'half':'ab'[half],'resid':round(resid,1),'knobs':knobs,'leds':{n:round(v,2) for n,v in leds.items()},'weak_pointer':low})
      print(page,'ab'[half],'resid',round(resid,1),'weak',low,flush=True)
  json.dump(out,open('panels.json','w'),indent=0)
if __name__=="__main__":main()
