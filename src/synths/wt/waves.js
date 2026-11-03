// The wavetable synthesizer's four editable waves. A wave is a small definition, not a sample array, so presets stay
// compact and an edit round-trips: a named shape, a list of harmonics (amplitude and phase), or a drawn outline.
// The kernel takes 4 x 2048 samples (about +-1) through the shared wave buffer, removes the DC, normalises the peak and
// band-limits (synth-engine/classics/src/wt.rs).
export const CYCLE=2048;
export const SLOTS=4;
export const DRAW_POINTS=128;
export const HARMONICS=64;
export const SLOT_NAMES=['A','B','C','D'];

const TAU=Math.PI*2;

export const shape=(kind,pw=.5)=>({t:'shape',k:kind,pw});
export const harmonics=(a,p=null)=>({t:'harm',a:a.slice(0,HARMONICS),p:p?p.slice(0,HARMONICS):null});
export const drawn=y=>({t:'draw',y:Array.from({length:DRAW_POINTS},(_,i)=>y[i]??0)});

/** Sum of harmonics n = 1... with amplitudes a[n-1] and phases p[n-1] (turns). */
export function fromHarmonics(a,p=null){
 const out=new Float32Array(CYCLE);
 for(let h=1;h<=a.length;h++){
  const amp=a[h-1];if(!amp)continue;
  const ph=p?.[h-1]??0;
  for(let n=0;n<CYCLE;n++)out[n]+=amp*Math.sin(TAU*(h*n/CYCLE+ph));
 }
 return out;
}

/** The outline as a periodic cubic (Catmull-Rom) through the drawn points. */
function fromDrawing(y){
 const out=new Float32Array(CYCLE),N=y.length;
 for(let n=0;n<CYCLE;n++){
  const f=n/CYCLE*N,i=Math.floor(f),t=f-i;
  const y0=y[(i-1+N)%N],y1=y[i%N],y2=y[(i+1)%N],y3=y[(i+2)%N];
  out[n]=y1+.5*t*(y2-y0+t*(2*y0-5*y1+4*y2-y3+t*(3*(y1-y2)+y3-y0)));
 }
 return out;
}

function fromShape({k,pw=.5}){
 const out=new Float32Array(CYCLE);
 for(let n=0;n<CYCLE;n++){
  const t=n/CYCLE;
  out[n]=k==='sine'?Math.sin(TAU*t)
   :k==='tri'?1-4*Math.abs(t-.5)
   :k==='saw'?2*t-1
   :k==='ramp'?1-2*t
   :k==='pulse'?(t<pw?1:-1)
   :k==='halfsine'?Math.abs(Math.sin(Math.PI*t))*2-1
   :k==='sinesq'?Math.sin(TAU*t)*Math.abs(Math.sin(TAU*t))
   :(t<.5?1:-1); // square
 }
 return out;
}

/** A definition → 2048 samples. */
export function buildWave(def){
 if(def?.t==='harm')return fromHarmonics(def.a,def.p);
 if(def?.t==='draw')return fromDrawing(def.y);
 return fromShape(def??shape('sine'));
}

/** The four definitions → the kernel's wave buffer. */
export function packWaves(defs){
 const out=new Float32Array(SLOTS*CYCLE);
 for(let s=0;s<SLOTS;s++)out.set(buildWave(defs[s]),s*CYCLE);
 return out;
}

/** Harmonic amplitudes and phases (turns) of a wave, by DFT of the first `count` harmonics. */
export function analyse(def,count=32){
 const w=buildWave(def),a=[],p=[];
 for(let h=1;h<=count;h++){
  let re=0,im=0;
  for(let n=0;n<CYCLE;n++){const x=TAU*h*n/CYCLE;re+=w[n]*Math.cos(x);im+=w[n]*Math.sin(x);}
  a.push(2*Math.hypot(re,im)/CYCLE);
  p.push(Math.atan2(re,im)/TAU); // sin(x + 2πp) = sin·cos(2πp) + cos·sin(2πp): im ↔ cos(2πp), re ↔ sin(2πp)
 }
 const top=Math.max(...a,1e-9);
 return {a:a.map(v=>v/top),p};
}

/** A wave sampled at the drawing resolution (peak 1, DC removed), for the draw editor. */
export function toDrawing(def){
 const w=buildWave(def),mean=w.reduce((s,v)=>s+v,0)/CYCLE;
 let pk=1e-9;for(const v of w)pk=Math.max(pk,Math.abs(v-mean));
 return Array.from({length:DRAW_POINTS},(_,i)=>(w[Math.floor(i/DRAW_POINTS*CYCLE)]-mean)/pk);
}

/** Sine, triangle, saw, square: the starting set (matches the kernel's own defaults). */
export const DEFAULT_WAVES=[shape('sine'),shape('tri'),shape('saw'),shape('square')];

export const SHAPES=[
 ['Sine',shape('sine')],['Triangle',shape('tri')],['Saw',shape('saw')],['Ramp',shape('ramp')],['Square',shape('square')],
 ['Pulse 25 %',shape('pulse',.25)],['Pulse 12 %',shape('pulse',.125)],['Half sine',shape('halfsine')],['Sine²',shape('sinesq')],
];

const KEY='calmbgm.wt.waves';
export function readStoredWaves(){
 try{
  const raw=JSON.parse(localStorage.getItem(KEY)??'null');
  if(Array.isArray(raw)&&raw.length===SLOTS&&raw.every(d=>d&&typeof d.t==='string'))return raw;
 }catch{/* private window or cleared site data */}
 return null;
}
export function storeWaves(defs){
 try{localStorage.setItem(KEY,JSON.stringify(defs));}catch{/* storage unavailable: the waves just do not persist */}
}
