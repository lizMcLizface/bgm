import numpy as np,sys
from PIL import Image
from detect import conv,peaks
def load(p):return 1-np.asarray(Image.open(p).convert('L'),dtype=np.float32)/255
def knob_kernel():
  y,x=np.mgrid[-30:31,-30:31];d=np.hypot(x,y);k=np.zeros_like(d)
  k[(d>=9)&(d<=14.5)]=1;k[(d>=23)&(d<=25.5)]=1.5;k[d<8]=-1.2;k[(d>=16)&(d<=21.5)]=-0.6
  return k-k.mean()
def find_knobs(img):
  r=conv(img,knob_kernel())
  p=peaks(r,r.max()*0.45,40)
  return p,r.max()
if __name__=='__main__':
  img=load(sys.argv[1]);p,m=find_knobs(img)
  vals=sorted([v for *_,v in p],reverse=True);print(len(p),[round(v/m,2) for v in vals[:60]])
