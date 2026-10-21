// Level matching for generated /synths sounds: finds the volume at which a held chord sits at a
// target RMS, without clipping, within a bounded change from the starting volume. The volume law
// differs per model (linear, squared…), so each step uses the measured dB-per-decade slope.
import fs from 'node:fs';
import {createOfflineSynth,rms,peak} from '../src/synths/engine/offline.js';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));

/** A held four-note chord (1.2 s), then the release: RMS of the hold in dB and the overall peak. */
export function measure(model,pairs,notes=[48,55,60,64],waves=null){
 const s=createOfflineSynth(module,{model,params:pairs,...(waves?{waves}:{})});
 notes.forEach((n,k)=>s.k.syn_note_on(k+1,n,.8));const [l,r]=s.seconds(1.2);notes.forEach((_,k)=>s.k.syn_note_off(k+1));const [t]=s.seconds(.6);
 return {db:20*Math.log10(Math.max(rms(l),1e-9)),peak:Math.max(peak(l),peak(r),peak(t))};
}

/**
 * pairs(volume) → engine [id, value] pairs. Returns the volume (3 decimals) that brings the chord to
 * targetDb, kept within start/4…start·4 (and ≤ max, the control's top) and with the peak under 0.9.
 * waves: the wave buffer for models that need one (the vector synth).
 */
export function levelVolume(model,pairs,start,targetDb=-23,max=1,waves=null){
 const lo=start/4,hi=Math.min(max,start*4),clamp=v=>Math.min(hi,Math.max(lo,v));
 let v=start,m=measure(model,pairs(v),undefined,waves),slope=20; // dB per decade of volume; refined from the measurements
 for(let i=0;i<8&&Math.abs(m.db-targetDb)>.3;i++){
  let next=clamp(v*10**((targetDb-m.db)/slope));
  const n=measure(model,pairs(next),undefined,waves);
  if(n.peak>.9){next=clamp(next*10**(20*Math.log10(.9/n.peak)/slope));}
  const moved=Math.log10(next/v);
  if(Math.abs(moved)>1e-4){const s=(measure(model,pairs(next),undefined,waves).db-m.db)/moved;if(s>5&&s<100)slope=s;}
  if(next===v)break;
  v=next;m=measure(model,pairs(v),undefined,waves);
 }
 return +v.toFixed(3);
}
