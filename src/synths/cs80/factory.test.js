// @vitest-environment node
import fs from 'node:fs';
import {ROW_I,ROW_II,neutralPanel,neutralChannel,withChannel,matchChannel} from './factory';
import {CHANNEL_KEYS,sanitize,toPairs,defaultValues} from './params';
import {PRESETS} from './presets';
import {createOfflineSynth,rms,peak} from '../engine/offline';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));

test('the two tone rows hold eleven tones each, with names of their own',()=>{
 expect(ROW_I.map(p=>p.name)).toEqual(['Wide Bow','Shimmer','Swell Horn','Breath','Stop Organ','Tine','Pluck Clav','Quill','Twang','Quack','Rubber']);
 expect(ROW_II.map(p=>p.name)).toEqual(['Soft Bow','High Bow','Warm Horn','Low Horn','Flute Stop','Bright Clav','Quill Two','Nylon','Wah','Snap','Thump']);
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

test("a row's neutral puts its own channel and the panel at rest, and leaves the other channel alone",()=>{
 const busy={...withChannel(withChannel(PRESETS[3].values,'i',ROW_I[2]),'ii',ROW_II[2]),ringDepth:.8,volume:.4};
 const calm=neutralChannel(busy,'ii'),d=defaultValues();
 expect([calm['ii.lpf'],calm['ii.saw'],calm.ringDepth,calm.volume]).toEqual([d['ii.lpf'],d['ii.saw'],0,.4]);
 expect(calm['i.lpf']).toBe(busy['i.lpf']);
});

test('every row I + row II pairing renders finite, bounded and audible',()=>{
 for(let n=0;n<11;n++){
  const values=neutralPanel(withChannel(withChannel(PRESETS[11].values,'i',ROW_I[n]),'ii',ROW_II[n]));
  const s=createOfflineSynth(module,{params:toPairs(values)});[48,55,60,64].forEach((note,i)=>s.k.syn_note_on(i+1,note,.8));
  const [l,r]=s.seconds(1);for(const a of [l,r]){expect(a.every(Number.isFinite)).toBe(true);expect(peak(a)).toBeLessThanOrEqual(1);}
  expect(rms(l)).toBeGreaterThan(1e-3);
 }
});
