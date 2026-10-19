// @vitest-environment node
import fs from 'node:fs';
import {DSP_CASES,dspFixture,prepareDsp} from './profileDsp';
import {fmPacket} from './fmPatch';
import {wasmCodeHash} from '../../tools/wasmCodeHash.mjs';
const available=fs.existsSync('.tmp/fm-bank/bank.wasm'),matrix=available?describe:describe.skip;
const mod=name=>new WebAssembly.Module(fs.readFileSync('.tmp/fm-bank/'+name+'.wasm'));
const old=()=>new WebAssembly.Module(fs.readFileSync('.tmp/bank-baseline/fm.wasm'));
function exact(a,b,label,subnormalTail=false){if(a.length!==b.length)throw Error('Length mismatch '+label);for(let i=0;i<a.length;i++){if(typeof a[i]!=='number')exact(a[i],b[i],label+':channel'+i,subnormalTail);else if(a[i]!==b[i]&&!(subnormalTail&&Math.abs(a[i])<2**-126&&Math.abs(b[i])<2**-126))throw Error(`${label}: sample ${i}: ${a[i]} != ${b[i]}`);}}
function instance(module,patches,rate=48000){
 const e=new WebAssembly.Instance(module,{}).exports,bank=!!e.bank_init;
 if(bank)e.bank_init();else e.fm_init(rate);
 const config=(p,s)=>{if(bank)e.bank_slot_init(s,rate,0);const q=fmPacket(p);q.globals.forEach(v=>(bank?e.bank_param(s,...v):e.fm_param(...v)));q.operators.forEach(v=>(bank?e.bank_op(s,...v):e.fm_op(...v)));q.routes.forEach(v=>(bank?e.bank_route(s,...v):e.fm_route(...v)));q.carriers.forEach(v=>(bank?e.bank_carrier(s,...v):e.fm_carrier(...v)));};patches.forEach(config);
 return {e,event:(s,...args)=>bank?e.bank_event(s,...args):e.fm_event(...args),render:n=>bank?e.bank_render(n):e.fm_render(n),view:(s,c,n)=>new Float32Array(e.memory.buffer,bank?e.bank_output(s,c):e.fm_output(c),n)};
}
const fixtures=['fm-tines-solo','fm-choir-solo','fm-1','fm-4op'].map(id=>{const f=DSP_CASES.find(c=>c.id===id);if(!f)throw Error('Missing bank fixture '+id);return f;});
matrix('multitimbral FM bank prototype',()=>{
 test('the public trial matches the measured bank code',()=>{expect(wasmCodeHash(fs.readFileSync('public/synth-lab/fm-bank.wasm'))).toBe(wasmCodeHash(fs.readFileSync('.tmp/fm-bank/bank.wasm')));});
 test.each([44100,48000,96000])('owning source state preserves all previous FM fixtures at %i Hz',rate=>{
  for(const spec of DSP_CASES.filter(c=>c.kernel==='fm')){const f=dspFixture(spec,{rate,seconds:.35}),reference=prepareDsp(old(),f).run({capture:true});
   for(const name of ['scalar','simd']){const r=prepareDsp(mod(name),f).run({capture:true});exact(r.pcm,reference.pcm,spec.id+':'+name);expect(r.stats).toEqual(reference.stats);}
  }
 },30000);
 test.each([44100,48000,96000])('heterogeneous instruments retain exact independent PCM and lifecycle at %i Hz',rate=>{
  for(const block of [1,65,128,2048])for(const mixedQuality of [false,true]){
   const patches=Array.from({length:4},(_,i)=>{const p=dspFixture(fixtures[i%fixtures.length],{rate}).patch;p.global.quality=mixedQuality?(i===3?2:i===2?0:1):1;p.global.polyphony=4;return p;});
   const refs=patches.map(p=>instance(old(),[p],rate)),bank=instance(mod('bank'),patches,rate);
   const commands=[...patches.flatMap((_,s)=>[[s,0,1,0,48+s*4,.6],[s,0,2,Math.round(.012*rate),55+s*3,.4],[s,3,1,Math.round(.05*rate),.4,0],[s,5,1,Math.round(.08*rate),62+s,.04],[s,2,0,Math.round(.12*rate),1,0],[s,1,1,Math.round(.13*rate),0,0],[s,2,0,Math.round(.18*rate),0,0],[s,1,2,Math.round(.2*rate),0,0]])];
   commands.forEach(([s,...e])=>{refs[s].event(s,...e);bank.event(s,...e);});
   const bytes=bank.e.memory.buffer.byteLength;
   for(let at=0;at<rate*.45;){const n=Math.min(block,Math.ceil(rate*.45)-at);bank.render(n);for(let s=0;s<4;s++){refs[s].render(n);for(let c=0;c<2;c++)exact(bank.view(s,c,n),refs[s].view(s,c,n),s+':'+block+':'+mixedQuality+':'+at);}at+=n;}
   expect(bank.e.memory.buffer.byteLength).toBe(bytes);if(!mixedQuality)expect(bank.e.bank_stat(0,7)).toBeGreaterThan(0);
  }
 },60000);
 test('panic, release, note IDs and slot reuse do not affect neighbours',()=>{
  const patch=dspFixture(fixtures[0]).patch,bank=instance(mod('bank'),[patch,patch]),ref=instance(old(),[patch]);
  bank.event(0,0,1,0,60,.7);bank.event(1,0,1,0,64,.7);ref.event(0,0,1,0,64,.7);
  for(let i=0;i<12;i++){if(i===3)bank.e.bank_panic(0);if(i===5)bank.e.bank_release(0);if(i===8){bank.e.bank_slot_init(0,48000,i*128);bank.event(0,0,1,i*128,72,.4);}bank.render(128);ref.render(128);expect(bank.view(1,0,128)).toEqual(ref.view(0,0,128));}
  expect(bank.e.bank_slot_init(4,48000,0)).toBe(0);expect(bank.e.bank_event(8,0,1,0,60,.5)).toBe(0);
 });
 test('live quality, operator count, fractional curves and mono handoff remain instrument-local',()=>{
  const rate=48000,patches=Array.from({length:4},(_,i)=>dspFixture(fixtures[i%fixtures.length]).patch),refs=patches.map(p=>instance(old(),[p],rate)),bank=instance(mod('bank'),patches,rate);
  const send=(s,...ev)=>{refs[s].event(s,...ev);bank.event(s,...ev);};
  for(let s=0;s<4;s++)for(let j=0;j<6;j++)send(s,0,j+1,j*64,48+s*3+j,.6);
  for(let b=0;b<100;b++){
   if(b===12){bank.e.bank_param(1,4,0);refs[1].e.fm_param(4,0);bank.e.bank_op(2,0,19,.7);refs[2].e.fm_op(0,19,.7);}
   if(b===24){bank.e.bank_param(1,4,2);refs[1].e.fm_param(4,2);bank.e.bank_param(0,0,4);refs[0].e.fm_param(0,4);}
   if(b===36){bank.e.bank_op(2,0,19,1);refs[2].e.fm_op(0,19,1);send(3,6,2,b*128,.08,1);send(3,0,90,b*128,76,.3);send(3,0,91,b*128+64,71,.8);}
   if(b===48)for(let s=0;s<4;s++)for(let j=0;j<6;j++)send(s,1,j+1,b*128,0,0);
   bank.render(128);for(let s=0;s<4;s++){refs[s].render(128);for(let c=0;c<2;c++)exact(bank.view(s,c,128),refs[s].view(s,c,128),'live:'+b+':'+s);}
  }
 });
 test('normal release/acoustic tails stay exact; subnormal DC residue is discarded',()=>{
  const patches=[dspFixture(fixtures[0]).patch,dspFixture(fixtures[1]).patch],refs=patches.map(p=>instance(old(),[p])),bank=instance(mod('bank'),patches);
  for(let s=0;s<2;s++)for(const ev of [[0,1,0,48+s*12,.6],[1,1,9600,0,0]]){refs[s].event(s,...ev);bank.event(s,...ev);}
  for(let at=0;at<48000*6;at+=128){const n=Math.min(128,48000*6-at);bank.render(n);for(let s=0;s<2;s++){refs[s].render(n);for(let c=0;c<2;c++)exact(bank.view(s,c,n),refs[s].view(s,c,n),'tail:'+s+':'+at,true);}}
 });
});
