// Shared parameter-table machinery for every /synths model.
// Row: [key, id, label, min, max, default, unit, curve, options?]
// curve: lin | log (positive ranges) | sq (fine control near the bottom) | step
// options: labels for a switch-like step parameter (drawn as buttons).

// Shared space effects (synth-engine/classics/src/fx.rs, ids from 200). Every
// model's table includes all of them so nothing falls back to engine defaults.
export const SPACE=[
 ['chorusMix',200,'Chorus',0,1,0,'%','lin'],
 ['chorusRate',201,'Rate',.05,6,.6,'Hz','log'],
 ['chorusDepth',202,'Depth',0,1,.5,'%','lin'],
 ['reverbMix',203,'Reverb',0,1,.25,'%','lin'],
 ['reverbDecay',204,'Decay',.3,20,4,'s','log'],
 ['reverbTone',205,'Tone',800,16000,6000,'Hz','log'],
 ['reverbSize',206,'Size',0,1,.6,'%','lin'],
 ['reverbPredelay',207,'Pre-delay',0,.12,.02,'s','lin'],
];

export function defineParams(rows){
 const PARAMS=rows.map(([key,id,label,min,max,value,unit,curve,options])=>({key,id,label,min,max,default:value,unit:options?'choice':unit,curve:options?'step':curve,options}));
 const BY_KEY=Object.fromEntries(PARAMS.map(p=>[p.key,p]));
 const defaultValues=()=>Object.fromEntries(PARAMS.map(p=>[p.key,p.default]));
 function clampValue(key,value){
  const p=BY_KEY[key];if(!p)return undefined;
  const v=Number(value);if(!Number.isFinite(v))return p.default;
  const c=Math.min(p.max,Math.max(p.min,v));return p.curve==='step'?Math.round(c):c;
 }
 /** Fills missing keys with defaults and drops unknown or invalid ones. */
 function sanitize(values={}){
  const out=defaultValues();
  for(const [key,value] of Object.entries(values??{}))if(BY_KEY[key])out[key]=clampValue(key,value);
  return out;
 }
 const toPairs=values=>PARAMS.map(p=>[p.id,values[p.key]??p.default]);
 return {PARAMS,BY_KEY,defaultValues,clampValue,sanitize,toPairs};
}

// Fader position (0..1) <-> value.
export function toPosition(p,value){
 const v=Math.min(p.max,Math.max(p.min,value));
 if(p.curve==='log')return Math.log(v/p.min)/Math.log(p.max/p.min);
 if(p.curve==='sq')return Math.sqrt((v-p.min)/(p.max-p.min));
 return (v-p.min)/(p.max-p.min);
}
export function fromPosition(p,position){
 const x=Math.min(1,Math.max(0,position));
 if(p.curve==='log')return p.min*(p.max/p.min)**x;
 if(p.curve==='sq')return p.min+(p.max-p.min)*x*x;
 const v=p.min+(p.max-p.min)*x;return p.curve==='step'?Math.round(v):v;
}
export function formatValue(p,value){
 switch(p.unit){
  case 'choice':return p.options[value]??'';
  case 'Hz':return value>=1000?(value/1000).toFixed(value>=10000?0:1)+'k':value>=100?Math.round(value)+'':value.toFixed(value<10?2:1);
  case 's':return value<1?Math.round(value*1000)+'ms':value.toFixed(value<10?2:1)+'s';
  case 'st':return (value>0&&p.min<0?'+':'')+value.toFixed(2);
  case 'oct':return value.toFixed(2);
  case 'ct':return (value>0?'+':'')+Math.round(value)+'¢';
  case 'bi':return (value>0?'+':'')+Math.round(value*100);
  case 'bal':return value<.5?'I '+Math.round((1-value)*100):value>.5?'II '+Math.round(value*100):'I = II';
  case 'bal-ul':return value<.5?'Up '+Math.round((1-value)*100):value>.5?'Lo '+Math.round(value*100):'Even';
  case 'note':return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][value%12]+(Math.floor(value/12)-1);
  case 'bp':return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][(value+21)%12]+(Math.floor((value+21)/12)-2);
  case 'alg':return String(value+1);
  case 'tr':return (value-24>0?'+':'')+(value-24);
  case 'n':return String(value);
  case 'decimal':return Number(value.toFixed(2)).toString();
  case 'dB':return (value>0?'+':'')+Number(value.toFixed(1))+' dB';
  case 'ms':return Number(value.toFixed(2))+'ms';
  case 'bpm':return String(Math.round(value));
  case 'swing':return Math.round(value*100)+'%';
  default:return Math.round(value*100)+'';
 }
}
