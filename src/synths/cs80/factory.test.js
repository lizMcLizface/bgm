// @vitest-environment node
import fs from 'node:fs';
import {ROW_I,ROW_II,neutralPanel,withChannel,matchChannel} from './factory';
import {CHANNEL_KEYS,sanitize,toPairs,defaultValues} from './params';
import {PRESETS} from './presets';
import {createOfflineSynth,rms,peak} from '../engine/offline';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));

test('the two rows keep the original names and order',()=>{
 expect(ROW_I.map(p=>p.name)).toEqual(['Strings 1','Strings 3','Brass 1','Flute 1','Electric Piano','Clavichord 1','Harpsichord 1','Organ 1','Guitar 1','Funky 1','Funky 3']);
 expect(ROW_II.map(p=>p.name)).toEqual(['Strings 2','Strings 4','Brass 2','Brass 3','Bass 1','Clavichord 2','Harpsichord 2','Organ 2','Guitar 2','Funky 2','Funky 4']);
});

test('each preset sets every key of its channel to an in-range value and is recognised afterwards',()=>{
 const base=PRESETS[0].values;
 for(const [channel,row] of [['i',ROW_I],['ii',ROW_II]])row.forEach((p,n)=>{
  expect(Object.keys(p.values).sort()).toEqual([...CHANNEL_KEYS].sort());
  const values=withChannel(base,channel,p);expect(sanitize(values)).toEqual(values);
  expect(matchChannel(values,channel,row)).toBe(n);
  // the other channel is untouched
  const other=channel==='i'?'ii':'i';for(const k of CHANNEL_KEYS)expect(values[other+'.'+k]).toBe(base[other+'.'+k]);
 });
});

test('the neutral panel resets globals but keeps channels, volume and space',()=>{
 const busy={...PRESETS[3].values,ringDepth:.8,subVco:1,volume:.4,reverbMix:.6};
 const calm=neutralPanel(busy);
 expect([calm.ringDepth,calm.subVco,calm.brilliance]).toEqual([0,0,defaultValues().brilliance]);
 expect([calm.volume,calm.reverbMix,calm['i.lpf']]).toEqual([.4,.6,busy['i.lpf']]);
});

test('every row I + row II pairing renders finite, bounded and audible',()=>{
 for(let n=0;n<11;n++){
  const values=neutralPanel(withChannel(withChannel(PRESETS[11].values,'i',ROW_I[n]),'ii',ROW_II[n]));
  const s=createOfflineSynth(module,{params:toPairs(values)});[48,55,60,64].forEach((note,i)=>s.k.syn_note_on(i+1,note,.8));
  const [l,r]=s.seconds(1);for(const a of [l,r]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});
