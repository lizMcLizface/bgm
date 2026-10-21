import glob,json,os,sys
import numpy as np
from common import ink,offset,REF
from sliders import SLIDERS,cap_y,value
from knobs import fit_centres,read,CONTINUOUS
from levers import LEVERS,lever_y

# Usage: python pipeline.py <pages dir> <out.json>
# Reads every page's panel drawing into the named panel values of src/synths/jupiter/patch.js
# (decodePatch's shape), approximated to what a drawing shows: sliders and continuous knobs on a
# 0.05 grid, VCO-2 pitch to the nearest semitone, switches from the drawn lever or LED.
pages,out=sys.argv[1],sys.argv[2]
files=sorted(glob.glob(os.path.join(pages,'p*.png')))
ref=ink(os.path.join(pages,REF+'.png'))
regs=[]
mean=None
for f in files:
  a=ink(f);dx,dy=offset(a,ref);regs.append((f,dx,dy))
  crop=a[230+dy:630+dy,350+dx:3050+dx].astype(float)
  mean=crop if mean is None else mean+crop
mean/=len(files)
centres=fit_centres(mean)

grid=lambda v:round(round(v*20)/20,2)
def position(y,top,mid,bottom):
  """Lever row → 0 (top), 1 (middle) or 2 (bottom); an undrawn lever counts as up."""
  if y is None:return 0
  return 0 if y<(top+mid)/2 else 1 if y<(mid+bottom)/2 else 2
TOP,MID,BOTTOM=425,442,459

# Knob angle (clockwise from 12 o'clock) → setting. The VCO-2 RANGE dial is marked 16', 8', 4' and 2';
# the switch knobs snap to the printed positions.
RANGE_MARKS=[(-128,-12),(-48,0),(38,12),(135,24)]
def semitones(deg):
  xs,ys=zip(*RANGE_MARKS);return int(round(float(np.interp(deg,xs,ys))))
def snap(deg,edges,names):return names[int(np.searchsorted(edges,deg))]
SWITCH_KNOBS={'lfoWave':([-32,0,32],['sine','saw','square','random']),
 'vco1Range':([-27,5,36],["16'","8'","4'","2'"]),
 'vco1Wave':([-36,4,30],['triangle','saw','pulse','square']),
 'vco2Wave':([-44,0,34],['sine','saw','pulse','noise'])}
LEDS={'solo':826,'unison':876,'poly1':921,'poly2':966}

from scipy.ndimage import uniform_filter
patches=[]
for i,(f,dx,dy) in enumerate(regs):
  a=ink(f);code=f'{i//8+1}{i%8+1}';notes=[]
  v={k:grid(value(k,cap_y(a,x,dx,dy)) or 0) for k,x in SLIDERS.items()}
  knobs=read(a,mean,centres,dx,dy)
  for k,(deg,strength,opposite) in knobs.items():
    # a bar drawn right through the knob points both ways: the longer side is taken, and noted
    if k in CONTINUOUS and opposite>.6*strength:notes.append(f'{k}: bar drawn through the knob, read as {deg}°')
  v['vco2Semitones']=semitones(knobs['vco2Range'][0])
  v['vco2Fine']=grid(np.clip((knobs['vco2Fine'][0]+150)/300,0,1))
  v['sourceMix']=grid(np.clip((knobs['sourceMix'][0]+150)/300,0,1))
  for k,(edges,names) in SWITCH_KNOBS.items():v[k]=snap(knobs[k][0],edges,names)
  L={k:lever_y(a,x,dx,dy) for k,x in LEVERS.items()}
  dest=position(L['freqModDest'],TOP,MID,BOTTOM)          # VCO-2 / both / VCO-1
  v['vcoModVco1']=dest>=1;v['vcoModVco2']=dest<=1
  v['pwmSource']=['lfo','manual','env1'][position(L['pwmSource'],TOP,MID,BOTTOM)]
  down=lambda k:position(L[k],TOP,MID,BOTTOM)==2
  v['sync']=down('sync');v['vco2Low']=down('vco2Low')
  v['vcfSlopeUp']=not down('vcfSlope');v['vcfEnvUp']=not down('vcfEnvSource')
  v['env1KeyFollow']=down('env1KeyFollow');v['env1Inverted']=down('env1Polarity');v['env2KeyFollow']=down('env2KeyFollow')
  y=L['vcaLfo'];v['vcaLfo']=0 if y is None else int(np.clip(round((459-y)/12),0,3))
  lit=[k for k,x in LEDS.items() if uniform_filter(a[612+dy:640+dy,x+dx-14:x+dx+14].astype(float),9).max()>.75]
  v['assign']='unison' if 'unison' in lit else 'solo' if 'solo' in lit else 'poly2' if 'poly2' in lit else 'poly1'
  patches.append({'code':code,'page':i+1,'values':v,**({'notes':notes} if notes else {})})
  print(code,flush=True)
json.dump({'schema':1,'source':'Jupiter-8 factory patch sheets, measured from the drawings (tools/jp8-patch-sheets)',
 'accuracy':'sliders and continuous knobs ±0.05 on a 0–1 scale; VCO-2 pitch to the nearest semitone',
 'patches':patches},open(out,'w'),indent=1)
