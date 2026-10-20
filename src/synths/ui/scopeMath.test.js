// @vitest-environment node
import {findTrigger,levels,pitchOf,noteName,fft,spectrumDb,spectralPeak,wavBytes} from './scopeMath';

const sine=(hz,n,sr=48000,amp=1)=>Float32Array.from({length:n},(_,i)=>amp*Math.sin(2*Math.PI*hz*i/sr+.01));

test('triggers find the right crossing, rising or falling, earliest or latest',()=>{
 const x=sine(100,4800); // period 480
 const up=findTrigger(x,0,1,1,x.length,false),down=findTrigger(x,0,-1,1,x.length,false);
 expect(Math.abs(up-480)).toBeLessThanOrEqual(1);expect(Math.abs(down-240)).toBeLessThanOrEqual(1);
 expect(Math.abs(findTrigger(x,0,1,1,x.length,true)-4320)).toBeLessThanOrEqual(1);
 expect(findTrigger(x,2,1,1,x.length)).toBe(-1);                              // never reaches 2
 expect(findTrigger(x,.5,1,1,30)).toBe(-1);                                  // outside the allowed range
});

test('levels',()=>{
 const l=levels(sine(100,4800,48000,.5));
 expect(l.peak).toBeCloseTo(.5,2);expect(l.pp).toBeCloseTo(1,2);expect(l.rms).toBeCloseTo(.5/Math.SQRT2,3);expect(Math.abs(l.mean)).toBeLessThan(1e-3);
 expect(levels(new Float32Array(0)).peak).toBe(0);
});

test('pitch by autocorrelation, with a harmonic-rich wave and at several rates',()=>{
 for(const [hz,sr] of [[110,48000],[220,44100],[440,48000],[82.4,96000],[1000,48000]])expect(Math.abs(1200*Math.log2(pitchOf(sine(hz,4096,sr),sr)/hz))).toBeLessThan(6);
 const saw=Float32Array.from({length:4096},(_,i)=>2*((i*196/48000)%1)-1);
 expect(Math.abs(1200*Math.log2(pitchOf(saw,48000)/196))).toBeLessThan(5);
 const noise=Float32Array.from({length:4096},()=>Math.random()*2-1);expect(pitchOf(noise,48000)).toBe(0);
 expect(pitchOf(new Float32Array(4096),48000)).toBe(0);
 expect(noteName(440)).toBe('A4');expect(noteName(261.63)).toBe('C4');expect(noteName(0)).toBe('');
});

test('FFT matches a direct DFT and the spectrum reads a full-scale sine at 0 dB',()=>{
 const n=64,re=Float64Array.from({length:n},(_,i)=>Math.sin(i*.7)+.3*Math.cos(i*2.1)),im=new Float64Array(n),ref=[...re];
 fft(re,im);
 for(const k of [0,1,5,17,31]){let a=0,b=0;for(let i=0;i<n;i++){a+=ref[i]*Math.cos(2*Math.PI*k*i/n);b-=ref[i]*Math.sin(2*Math.PI*k*i/n);}expect(re[k]).toBeCloseTo(a,6);expect(im[k]).toBeCloseTo(b,6);}
 const sr=48000,db=spectrumDb(sine(1000,8192,sr),8192),p=spectralPeak(db,sr,8192);
 expect(Math.abs(p.hz-1000)).toBeLessThan(2);expect(p.db).toBeGreaterThan(-1.2);expect(p.db).toBeLessThan(.5);
 const half=spectralPeak(spectrumDb(sine(3000,8192,sr,.5),8192),sr,8192);expect(half.db).toBeGreaterThan(-7.2);expect(half.db).toBeLessThan(-5);
 // a short block is zero-padded and still locates the tone
 expect(Math.abs(spectralPeak(spectrumDb(sine(440,1500,sr),8192),sr,8192).hz-440)).toBeLessThan(15);
});

test('WAV bytes have a valid header and the samples',()=>{
 const b=wavBytes(Float32Array.from([0,.5,-.5,1,-1,2]),44100),v=new DataView(b.buffer);
 expect(String.fromCharCode(...b.slice(0,4))).toBe('RIFF');expect(v.getUint32(24,true)).toBe(44100);expect(v.getUint32(40,true)).toBe(12);
 expect(v.getInt16(46,true)).toBe(16384);expect(v.getInt16(54,true)).toBe(32767); // 2 is clipped to full scale
});
