// Compare preserved legacy Wasm, rebuilt legacy ABI and the owned graph adapter.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {ReferenceGraph} from '../public/modular-audio/runtime.js';
const contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const graphModule=new WebAssembly.Module(fs.readFileSync('public/modular-audio/graph.wasm'));
const legacyModule=new WebAssembly.Module(fs.readFileSync('public/synth-lab/percussion.wasm'));
const baseline=process.argv[2];
const oldModule=baseline?new WebAssembly.Module(fs.readFileSync(baseline)):null;
export const eventsFor=(model,dense=false,reordered=false)=>Array.from({length:dense?90:14},(_,i)=>({frame:37+(reordered?((i*7)%17)*11:dense?0:i*977),target:1,owner:2,kind:'hit',drum:i%14,velocity:.35+(i%5)*.13,duration:.6,vary:(i%3-1)*.25,tone:(i%5-2)*.2,decay:.5+(i%4)*.4,hit:i+11,model}));
export function legacyPcm(module,rate,events,total){const e=new WebAssembly.Instance(module,{}).exports;e.init(rate);for(const h of events)e.hit(h.drum,h.frame,h.duration,h.velocity,h.vary,h.tone,h.decay,h.hit,h.model);const out=[new Float32Array(total),new Float32Array(total)],view=new Float32Array(e.memory.buffer,e.output_ptr(),256);for(let at=0;at<total;){const n=Math.min(127,total-at);e.process(n);out[0].set(view.subarray(0,n),at);out[1].set(view.subarray(128,128+n),at);at+=n;}return out;}
export function ownedPcm(rate,events,total){const p={version:1,modules:[{id:1,type:'legacy.percussion',version:1,parameters:{gain:1}},{id:2,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:2,port:'program.in'}}],events};const g=new ReferenceGraph(new WebAssembly.Instance(graphModule,{}).exports,p,contracts,rate),out=[new Float32Array(total),new Float32Array(total)];try{for(let at=0;at<total;){const n=Math.min(113,total-at);g.render(n);out[0].set(g.left.subarray(0,n),at);out[1].set(g.right.subarray(0,n),at);at+=n;}return out;}finally{g.dispose();}}
const digest=out=>crypto.createHash('sha256').update(Buffer.from(out[0].buffer)).update(Buffer.from(out[1].buffer)).digest('hex');
const fixtures=[];
for(const rate of [44100,48000,96000])for(const model of [0,1,2])for(const [dense,reordered] of [[false,false],[true,false],[true,true]]){
 const events=eventsFor(model,dense,reordered),total=24000,newPcm=legacyPcm(legacyModule,rate,events,total),owned=ownedPcm(rate,events,total),original=oldModule?legacyPcm(oldModule,rate,events,total):null;
 const sha256=digest(newPcm);if(digest(owned)!==sha256||original&&digest(original)!==sha256)throw Error(`PCM mismatch: ${rate}/${model}/${dense}`);
 fixtures.push({rate,model,dense,reordered,total,sha256});
}
if(oldModule){fs.writeFileSync('src/modular-audio/percussionLegacyPcm.json',JSON.stringify({provenance:'Captured from pre-M2 legacy percussion Wasm; exact stereo float SHA-256, L then R',fixtures},null,2)+'\n');}
else{const gold=JSON.parse(fs.readFileSync('src/modular-audio/percussionLegacyPcm.json'));if(JSON.stringify(gold.fixtures)!==JSON.stringify(fixtures))throw Error('Legacy PCM golden mismatch');}
fs.writeFileSync('.tmp/modular-audio-m2-legacy-pcm.json',JSON.stringify({pass:true,comparisons:fixtures.length,baseline:baseline??'committed golden hashes',fixtures},null,2)+'\n');
console.log(`${fixtures.length} exact legacy/owned PCM comparisons passed${oldModule?' against preserved original Wasm':''}.`);
