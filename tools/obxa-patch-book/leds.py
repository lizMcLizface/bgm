import numpy as np
from detect import conv,peaks
def led_kernel():
  y,x=np.mgrid[-11:12,-11:12];d=np.hypot(x,y);k=np.zeros_like(d)
  k[(d>=4)&(d<=6.2)]=1;k[(d>=7.5)&(d<=10)]=-0.8
  return k-k.mean()
def find_leds(img):
  r=conv(img,led_kernel());return peaks(r,r.max()*0.35,14),r.max()
