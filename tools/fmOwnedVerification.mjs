import fs from 'node:fs';import crypto from 'node:crypto';
import {FM_RECIPES,cloneFM,fmPacket} from '../src/synth-lab/fmPatch.js';
import {fmSpecForPart} from '../src/modular-audio/sixRoleFixture.js';
import {OwnedFm} from '../src/modular-audio/ownedFm.js';
export const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function legacyOwnedExports(module){
 const e=new WebAssembly.Instance(module,{}).exports,out={memory:e.memory,fm_owned_api:()=>1,fm_owned_new:rate=>{e.fm_init(rate);return 1;},fm_owned_free:()=>{}};
 for(const name of ['init','param','op','route','carrier','event','panic','render','output','stat','set_frame'])out['fm_owned_'+name]=(_handle,...args)=>e['fm_'+name](...args);
 return out;
}
export function fmCases(){
 const cases=[],fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json'));
 const make=(p,events,edits=[])=>({version:1,patch:fmPacket(p),performance:{mode:0,portamento:0,glide:'overlap'},events,edits});
 const notes=[[0,11,37,60,.7],[0,12,2003,67,.6],[3,0,3311,.4,0],[2,0,4001,1,0],[1,11,5003,0,0],[5,12,6007,69,.08],[1,12,7001,0,0],[2,0,9001,0,0]];
 for(const rate of [44100,48000,96000]){
  for(const [index,p]of FM_RECIPES.entries())cases.push({id:`recipe-${index}`,rate,total:12017,spec:make(p,notes)});
  for(const quality of [0,2]){const p=cloneFM(FM_RECIPES[0]);p.global.quality=quality;cases.push({id:`quality-${quality}`,rate,total:12017,spec:make(p,notes)});}
  const p=cloneFM(FM_RECIPES[0]);p.global.polyphony=2;
  const dense=Array.from({length:70},(_,i)=>[0,100+i,37+(i*7%19)*53,44+i%36,.35+i%5*.1]);dense.push([2,0,1103,1,0],...dense.map(e=>[1,e[1],3001+e[1],0,0]),[3,0,2501,.6,0],[2,0,7003,0,0]);
  cases.push({id:'dense-reordered-stealing',rate,total:16001,spec:make(p,dense)});
  for(const mode of [1,2]){const spec=make(FM_RECIPES[7],notes);spec.performance={mode,portamento:.08,glide:'always'};cases.push({id:`mono-${mode}`,rate,total:12017,spec});}
  const edit=cloneFM(FM_RECIPES[0]);edit.global.quality=2;edit.global.index=.73;edit.operators[0].level=.4;
  cases.push({id:'structural-transition',rate,total:16001,spec:make(FM_RECIPES[0],notes,[{patch:fmPacket(edit),performance:{mode:0,portamento:0,glide:'overlap'},frame:4093,seconds:.06}])});
  for(const part of fixture.parts.filter(p=>p.kind==='fm'))cases.push({id:`six-role-${part.role}`,rate,total:Math.round(rate*fixture.totalSeconds),spec:fmSpecForPart(fixture,part,rate)});
 }
 return cases;
}
export function pcm(dsp,total,blocks=[128,37,203,1,127]){
 const out=[new Float32Array(total),new Float32Array(total)];let peak=0;
 for(let at=0,i=0;at<total;i++){const n=Math.min(blocks[i%blocks.length],total-at);dsp.render(n);for(let ch=0;ch<2;ch++){const src=ch===0?dsp.left:dsp.right;out[ch].set(src.subarray(0,n),at);for(let j=0;j<n;j++){if(!Number.isFinite(src[j]))throw Error('Nonfinite FM PCM');peak=Math.max(peak,Math.abs(src[j]));}}at+=n;}
 return {sha256:hash(Buffer.concat(out.map(x=>Buffer.from(x.buffer)))),peak,stats:dsp.stats(),out};
}
export {OwnedFm};
