// Append-only effects ABI, separate from the synthesizer's parameter layout.
export const EFFECTS = [
 ['dry','Dry level',0,1,.01,1],
 ['reverb','Reverb send',0,.8,.01,.22],
 ['delay','Delay send',0,.8,.01,.12],
 ['decay','Reverb decay · RT60 seconds',.3,30,.1,8],
 ['size','Room size',.2,1,.01,.7],
 ['damping','Reverb darkening above · Hz',500,16000,10,6000],
 ['predelay','Pre-delay · ms',0,150,1,25],
 ['width','Reverb stereo width',0,1,.01,1],
 ['modulation','Reverb modulation',0,1,.01,.3],
 ['delayMs','Echo spacing · ms',40,2000,1,375],
 ['feedback','Echo feedback',0,.85,.01,.4],
 ['tone','Echo damping · Hz',300,14000,10,4500],
 ['pingPong','Ping-pong',0,1,1,1],
 ['delayToReverb','Echo → reverb',0,1,.01,.2],
 ['quality','Reverb network · 8 / 16 lines',0,1,1,1],
 ['bypass','Bypass effects',0,1,1,0],
 ['reverbReturn','Reverb return · dB',-24,18,.5,0],
 ['reflections','Early reflections',0,8,.01,0],
];
export const defaultEffects=()=>Object.fromEntries(EFFECTS.map(([key,,,,,value])=>[key,value]));
export function sanitizeEffects(raw={}) {
 return Object.fromEntries(EFFECTS.map(([key,,min,max,step,fallback])=>{
  const n=raw?.[key];return [key,typeof n==='number'&&Number.isFinite(n)?Math.max(min,Math.min(max,step===1?Math.round(n):n)):fallback];
 }));
}
export const effectTriples=raw=>EFFECTS.map(([key],index)=>[index,sanitizeEffects(raw)[key]]);
export function delayAtTempo(bpm,division=1) {
 const ms=60000/Math.max(40,Math.min(200,Number(bpm)||110))*Number(division);
 return Math.max(40,Math.min(2000,Number.isFinite(ms)?ms:375));
}
export function effectTail(raw) {
 const p=sanitizeEffects(raw);
 if(p.bypass)return 0;
 const echoes=p.delay>0&&p.feedback>0?(p.delayMs/1000)*(1+Math.log(1e-5)/Math.log(p.feedback)):p.delay>0?p.delayMs/1000:0;
 const reverb=p.reverb>0||p.delay>0&&p.delayToReverb>0?p.decay*(1.5+Math.max(0,p.reverbReturn)/60)+p.predelay/1000+.3:0;
 return echoes+reverb;
}
