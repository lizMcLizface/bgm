// @vitest-environment node
import fs from 'node:fs';import crypto from 'node:crypto';
import {renderInserts} from './inserts';
import {defaultInserts,insertsPacket,sanitizeInserts,insertsTail,insertsActive} from './insertsConfig';
import {cloneFM,FM_RECIPES} from './fmPatch';import {clonePatch,RECIPES} from './patch';
const bytes=fs.readFileSync('public/synth-lab/inserts.wasm'),module=new WebAssembly.Module(bytes);
const rms=x=>Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length),signal=(rate,hz,seconds=1)=>{const data=Float32Array.from({length:Math.ceil(rate*seconds)},(_,i)=>.05*Math.sin(2*Math.PI*hz*i/rate));return [data,data.slice()];};
test('instrument insert artifact matches its source and patches retain optional insert settings',()=>{
 const m=JSON.parse(fs.readFileSync('public/synth-lab/inserts-build.json')),source=crypto.createHash('sha256').update(['synth-engine/inserts/Cargo.toml','synth-engine/inserts/src/lib.rs','synth-engine/common/denormal.rs'].map(f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n')).join('\n')).digest('hex');expect(m.source).toBe(source);expect(m.wasm).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
 for(const [p,copy]of [[RECIPES[0],clonePatch],[FM_RECIPES[0],cloneFM]]){const q=copy(p);q.inserts.chorus=.4;q.inserts.phaserFeedback=-.5;expect(copy(q).inserts).toEqual(q.inserts);expect(copy({...q,inserts:undefined}).inserts).toEqual(defaultInserts());}
 expect(sanitizeInserts({gain:Infinity,phaserFeedback:99,unknown:1})).toMatchObject({gain:0,phaserFeedback:.75});expect(insertsTail(defaultInserts())).toBe(0);expect(insertsActive(defaultInserts())).toBe(false);
});
test('disabled inserts and settled master bypass are exact transparent copies at every rate and chunk',()=>{
 for(const rate of [44100,48000,96000]){const input=signal(rate,997,.2);for(const settings of [{},{bypass:1,chorus:.8,flanger:1,lowGain:12}])for(const chunk of [128,257]){const out=renderInserts(module,input,rate,settings,{chunk});for(let ch=0;ch<2;ch++)expect(Buffer.from(input[ch].buffer).equals(Buffer.from(out[ch].buffer))).toBe(true);}}
});
test('EQ centre and shelf gains follow requested dB without changing the other channel',()=>{
 for(const rate of [44100,48000,96000])for(const [settings,hz]of [[{midGain:6,midFreq:1000},1000],[{lowGain:6,lowFreq:300},30],[{highGain:-6,highFreq:3000},rate*.4]]){const input=signal(rate,hz),out=renderInserts(module,input,rate,settings),db=20*Math.log10(rms(out[0].slice(rate/2))/rms(input[0].slice(rate/2)));expect(db).toBeCloseTo(Object.values(settings)[0],0);expect(out[0]).toEqual(out[1]);}
});
test('chorus, flanger, phaser and saturation alter the source with finite bounded output',()=>{
 for(const rate of [44100,48000,96000])for(const settings of [{chorus:.7},{phaser:.8,phaserFeedback:.7},{flanger:.8,flangerFeedback:-.8},{saturation:.8,drive:20}]){const input=signal(rate,997,.3),out=renderInserts(module,input,rate,settings);expect(out[0]).not.toEqual(input[0]);expect(out.every(ch=>ch.every(Number.isFinite))).toBe(true);expect(Math.max(...out[0].map(Math.abs))).toBeLessThan(1);}
});
test('modulated inserts remain chunk deterministic and their conservative export window retains the tail',()=>{
 const rate=48000,p={chorus:.6,phaser:.6,flanger:.7,flangerFeedback:.8,saturation:.3,drive:12,lowGain:3,midGain:-2,highGain:1},input=signal(rate,440,.4),a=renderInserts(module,input,rate,p,{chunk:128}),b=renderInserts(module,input,rate,p,{chunk:257});expect(a[0]).toEqual(b[0]);
 const frames=Math.ceil((.1+insertsTail(p))*rate),impulse=new Float32Array(frames);impulse[0]=.1;const tail=renderInserts(module,[impulse,impulse],rate,p);expect(rms(tail[0].slice(-2000))).toBeLessThan(1e-6);
});
test('bypass ramps to transparent input, clears history and parameter changes do not leave nonfinite tails',()=>{
 const rate=48000,input=signal(rate,440),settings={chorus:.6,phaser:.7,flanger:.7,flangerFeedback:.8,saturation:.3,lowGain:3},out=renderInserts(module,input,rate,settings,{edits:[{frame:12000,settings:{...settings,bypass:1}}]});expect(rms(out[0].slice(12000,12128).map((x,i)=>x-input[0][12000+i]))).toBeGreaterThan(1e-5);expect(out[0].slice(36000)).toEqual(input[0].slice(36000));expect(out[0].every(Number.isFinite)).toBe(true);
 const e=new WebAssembly.Instance(module,{}).exports;e.inserts_init(rate);insertsPacket(settings).forEach(t=>e.inserts_param(...t));e.inserts_settle();new Float32Array(e.memory.buffer,e.inserts_input(0),128).fill(.1);e.inserts_render(128);e.inserts_clear();for(let ch=0;ch<2;ch++)new Float32Array(e.memory.buffer,e.inserts_input(ch),2048).fill(0);e.inserts_render(2048);expect(rms(new Float32Array(e.memory.buffer,e.inserts_output(0),2048))).toBe(0);
});

test('extreme feedback tails decay within the export bound without cross-channel leakage',()=>{
 for(const rate of [44100,96000])for(const p of [{phaser:1,phaserFreq:100,phaserDepth:3,phaserFeedback:.75,phaserRate:.02},{flanger:1,flangerDelay:8,flangerDepth:4,flangerFeedback:-.85,flangerRate:5}]){
  const impulse=new Float32Array(Math.ceil((insertsTail(p)+.2)*rate));impulse[0]=.1;const zero=new Float32Array(impulse.length),out=renderInserts(module,[impulse,zero],rate,p);
  expect(out[0].every(Number.isFinite)).toBe(true);expect(rms(out[0].slice(-Math.round(rate*.05)))).toBeLessThan(1e-6);expect(rms(out[1])).toBe(0);
 }
});
