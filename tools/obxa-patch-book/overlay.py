import sys,math,numpy as np
from PIL import Image,ImageDraw
import pipeline as P
ref=P.load('pages/p05.png');refK={n:P.refine(ref,x*P.S,y*P.S,8) for n,(x,y) in P.KNOBS.items()};refL={n:(x*P.S,y*P.S) for n,(x,y) in P.LEDS.items()}
for page,half in [(int(a[:-1]),a[-1]) for a in sys.argv[1:]]:
  img=P.load(f'pages/p{page:02d}.png');H=img.shape[0];c=P.candidates(img)
  cs=sorted([p for p in c if (p[1]<H/2)==(half=='a')],key=lambda p:-p[2])[:24]
  M,match,res=P.register(cs,refK)
  rgb=Image.open(f'pages/p{page:02d}.png').convert('RGB');d=ImageDraw.Draw(rgb)
  for n,(x,y) in match.items():
    x,y=P.refine(img,x,y,3);v,a,con=P.knob_value(img,x,y);t=math.radians(a)
    col=(255,0,0) if con>=0.25 else (0,160,255)
    d.line([(x,y),(x+34*math.sin(t),y-34*math.cos(t))],fill=col,width=3);d.text((x-12,y+28),f'{v}',fill=col)
  for n,p in refL.items():
    x,y=P.apply(M,p);on=P.led_state(img,x,y)>0.5;d.rectangle([x-9,y-9,x+9,y+9],outline=(0,170,0) if on else (200,200,200),width=2)
  ys=[y for _,y in match.values()];top=int(min(ys))-120;bot=int(max(ys))+120
  rgb.crop((180,top,2250,bot)).save(f'ov{page:02d}{half}.png')
