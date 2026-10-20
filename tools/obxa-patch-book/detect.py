import numpy as np,sys
from PIL import Image
def load(p):return np.asarray(Image.open(p).convert('L'),dtype=np.float32)/255
def ring_kernel(r_in,r_out,size):
  y,x=np.mgrid[-size:size+1,-size:size+1];d=np.hypot(x,y)
  k=np.where((d>=r_in)&(d<=r_out),1.0,0.0);k-=k.mean();return k
def conv(img,k):
  H,W=img.shape;kh,kw=k.shape
  F=np.fft.rfft2(img,(H+kh,W+kw))*np.fft.rfft2(k[::-1,::-1],(H+kh,W+kw))
  r=np.fft.irfft2(F,(H+kh,W+kw));return r[kh//2:kh//2+H,kw//2:kw//2+W]
def peaks(resp,thr,mind):
  out=[];r=resp.copy()
  while True:
    i=np.argmax(r);v=r.flat[i]
    if v<thr:break
    y,x=divmod(i,r.shape[1]);out.append((x,y,float(v)));r[max(0,y-mind):y+mind,max(0,x-mind):x+mind]=-1e9
  return out
if __name__=='__main__':
  img=1-load(sys.argv[1])          # dark = 1
  for R in (22,24,26):
    k=ring_kernel(R-2,R+2,R+4);resp=conv(img,k)
    p=peaks(resp,resp.max()*0.6,30);print(R,len(p),[(x,y,round(v)) for x,y,v in p[:8]])
