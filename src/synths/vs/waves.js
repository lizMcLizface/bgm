// The VS's 128 single-cycle waves (128 samples each) as one buffer for the engine. A built-in
// set of original additive waves fills any slot nothing else covers; your own files replace them:
// the ROM waves 32–127 from the two wave-set WAVs (Groove Synthesis 3rd Wave, 64 cycles each) and
// the user waves 0–31 from a program set's user-wave dump. Nothing from Sequential ships with the
// site. Wave 32 is a pure sine, as the manual says.
import {readWav} from '../wav';
import {wavesFromSamples,parseVsWaveDump,WAVE_LENGTH} from './sysex';

export const WAVE_COUNT=128,CYCLE=WAVE_LENGTH;
const TAU=Math.PI*2;

/** A cycle from harmonic amplitudes (index = harmonic number), normalised to ±1. */
function additive(amps,phase=0){
 const out=new Float32Array(CYCLE);
 for(let h=1;h<amps.length&&h<64;h++){
  const a=amps[h];if(!a)continue;
  for(let n=0;n<CYCLE;n++)out[n]+=a*Math.sin(TAU*h*n/CYCLE+phase*h);
 }
 let peak=0;for(const v of out)peak=Math.max(peak,Math.abs(v));
 return peak?out.map(v=>v/peak):out;
}

/** Original waves in 8 families of 16, bright to dark or narrow to wide: not Sequential's waves. */
function recipe(n){
 const family=n>>4,v=n&15,amps=new Float32Array(64);
 const lcg=seed=>()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 switch(family){
  case 0:for(let h=1;h<=v+1;h++)amps[h]=1/h;break;                                             // saw-like, more harmonics
  case 1:for(let h=1;h<=2*v+1;h+=2)amps[h]=1/h;break;                                          // square-like
  case 2:for(let h=1;h<64;h++)amps[h]=Math.exp(-((h-(1.5+v*1.3))**2)/2.5)/Math.sqrt(h);break;   // one formant, moving up
  case 3:for(let h=1;h<=20;h++)amps[h]=(h%2?1:v/15)/h;break;                                   // odd to full spectrum
  case 4:for(let h=1;h<64;h++)amps[h]=(Math.exp(-((h-3)**2)/2)+Math.exp(-((h-(4+v*1.6))**2)/3))/Math.sqrt(h);break;   // two formants
  case 5:{const w=(v+1)/17;for(let h=1;h<=40;h++)amps[h]=Math.abs(Math.sin(Math.PI*h*w))/h;break;}   // pulse widths
  case 6:for(let h=1;h<=30;h++)amps[h]=(h%2?1/(h*h):0)*(1-v/15)+(1/h)*(v/15);break;             // triangle to saw
  default:{const r=lcg(n*7919);for(let h=1;h<=24;h++)amps[h]=r()/Math.sqrt(h);}                 // seeded spectra
 }
 return additive(amps,family===7?0.4:0);
}

/** The built-in set: all 128 waves. */
export function builtinWaves(){
 const all=new Float32Array(WAVE_COUNT*CYCLE);
 for(let n=0;n<WAVE_COUNT;n++)all.set(n===32?additive(Float32Array.of(0,1)):recipe(n),n*CYCLE);
 return all;
}

/** Overlays {number, samples} waves (cycles of 128, ±1) onto a wave buffer. */
export function overlay(all,waves){
 for(const w of waves)if(w.number>=0&&w.number<WAVE_COUNT&&w.samples.length===CYCLE)all.set(w.samples,w.number*CYCLE);
 return all;
}

/** Waves from a wave-set WAV: consecutive cycles starting at wave `first`. */
export function wavesFromWav(bytes,first){
 return wavesFromSamples(readWav(bytes).samples,{first});
}

/** Waves 0–31 from a user-wave dump (.syx), or [] when the file holds none. */
export const userWavesFromSyx=bytes=>parseVsWaveDump(bytes)??[];

/**
 * Builds the engine's wave buffer: the built-in set, then the WAVs (given with their first wave
 * number) and the user-wave dump.
 */
export function composeWaves({wavs=[],userDump=null}={}){
 const all=builtinWaves();
 for(const {bytes,first} of wavs)overlay(all,wavesFromWav(bytes,first));
 if(userDump)overlay(all,userWavesFromSyx(userDump));
 return all;
}

/** The wave buffer as base64 of 16-bit samples (about 44 KB), to keep it in this browser. */
export function packWaves(all){
 const bytes=new Uint8Array(all.length*2),view=new DataView(bytes.buffer);
 all.forEach((v,i)=>view.setInt16(i*2,Math.round(Math.max(-1,Math.min(1,v))*32767),true));
 let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(text);
}
/** The reverse of `packWaves`; null if the text is not a wave buffer. */
export function unpackWaves(text){
 try{
  const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));
  if(bytes.length!==WAVE_COUNT*CYCLE*2)return null;
  const view=new DataView(bytes.buffer),all=new Float32Array(WAVE_COUNT*CYCLE);
  for(let i=0;i<all.length;i++)all[i]=view.getInt16(i*2,true)/32767;
  return all;
 }catch{return null;}
}
