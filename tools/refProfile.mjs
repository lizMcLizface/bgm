// Profiles a reference WAV (local, git-ignored): rate, length, level envelope, pitch and harmonic levels.
// Usage: npx vite-node tools/refProfile.mjs <file.wav> [--from s --to s]
import fs from 'node:fs';
import {readWav} from '../src/synths/wav.js';
import {levels,pitchOf,spectrumDb,spectralPeak,noteName} from '../src/synths/ui/scopeMath.js';
const args=process.argv.slice(2),file=args[0];
const opt=n=>{const i=args.indexOf('--'+n);return i>=0?Number(args[i+1]):null;};
const w=readWav(fs.readFileSync(file));
const mono=w.samples;
const sr=w.sampleRate,from=Math.round((opt('from')??0)*sr),to=Math.round((opt('to')??mono.length/sr)*sr);
const x=mono.subarray(from,to);
const peak=levels(x).peak;
console.log(`${file.split(/[\/]/).pop()}: ${sr} Hz, ${w.channels.length} ch, ${(mono.length/sr).toFixed(2)} s, peak ${(20*Math.log10(peak)).toFixed(1)} dB`);
const bins=Math.min(16,Math.ceil(x.length/(0.25*sr)));
console.log('rms per 250 ms (dB):',Array.from({length:bins},(_,i)=>{const s=x.subarray(Math.round(i*.25*sr),Math.round((i+1)*.25*sr));return (20*Math.log10(levels(s).rms+1e-9)).toFixed(0);}).join(' '));
// steady part: the loudest 0.5 s window
let best=0,bestAt=0;for(let a=0;a+0.5*sr<=x.length;a+=Math.round(.05*sr)){const r=levels(x.subarray(a,a+Math.round(.5*sr))).rms;if(r>best){best=r;bestAt=a;}}
const seg=x.subarray(bestAt,bestAt+Math.round(.5*sr));
const f0=pitchOf(seg,sr,30,2000);
console.log(`loudest 0.5 s at ${(bestAt/sr).toFixed(2)} s: pitch ${f0.toFixed(2)} Hz ${noteName(f0)}`);
if(f0>0){
 const size=16384,db=spectrumDb(seg,size),hz=sr/size;
 const level=h=>{const k=Math.round(h*f0/hz);let m=-200;for(let i=k-2;i<=k+2;i++)m=Math.max(m,db[i]);return m;};
 const ref=level(1);
 console.log('harmonics rel. fundamental (dB):',Array.from({length:16},(_,i)=>(level(i+1)-ref).toFixed(0)).join(' '));
 const sub=(()=>{const k=Math.round(f0/2/hz);return db[k]-ref;})();console.log('half the fundamental (sub-octave) rel.:',sub.toFixed(0),'dB');
}
