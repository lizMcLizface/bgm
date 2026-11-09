import fs from 'node:fs';
import {RECIPES,clonePatch,parameterTriples} from '../src/synth-lab/patch.js';
import {coreSpecForPart} from '../src/modular-audio/sixRoleFixture.js';
import {OwnedCore} from '../src/modular-audio/ownedCore.js';
import {hash,pcm} from './fmOwnedVerification.mjs';
export {hash,pcm,OwnedCore};
export function legacyOwnedCoreExports(module){
 const e=new WebAssembly.Instance(module,{}).exports,out={memory:e.memory,core_owned_api:()=>1,core_owned_new:rate=>{e.engine_init(rate);return 1;},core_owned_free:()=>{},core_owned_output:(_h,ch)=>ch===0?e.engine_left():e.engine_right()};
 for(const name of ['init','param','event','panic','render','stat','set_frame'])out['core_owned_'+name]=(_h,...args)=>e['engine_'+name](...args);return out;
}
export function coreCases(){
 const result=[],f=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json'));
 const make=(p,events,edits=[])=>({version:1,patch:parameterTriples(p),performance:{mode:0,portamento:0,glide:'overlap'},events,edits});
 const notes=[[0,11,37,60,.7],[0,12,2003,67,.6],[3,0,3311,.4,0],[2,0,4001,1,0],[1,11,5003,0,0],[5,12,6007,89,.08],[1,12,7001,0,0],[2,0,9001,0,0]];
 for(const rate of [44100,48000,96000]){
  for(const [index,p]of RECIPES.entries())result.push({id:`recipe-${index}`,rate,total:16001,spec:make(p,notes)});
  for(let wave=5;wave<=10;wave++){const p=clonePatch(RECIPES[0]);Object.assign(p.layers[0],{waveA:wave,waveB:wave,mix:.5,cutoff:12000});result.push({id:`additive-${wave}`,rate,total:16001,spec:make(p,notes)});}
  const p=clonePatch(RECIPES[6]);p.global.polyphony=2;p.global.unison=4;
  const dense=Array.from({length:70},(_,i)=>[0,100+i,37+(i*7%19)*53,44+i%36,.35+i%5*.1]);dense.push([2,0,1103,1,0],...dense.map(e=>[1,e[1],3001+e[1],0,0]),[3,0,2501,.6,0],[2,0,7003,0,0]);
  result.push({id:'dense-reordered-stealing',rate,total:16001,spec:make(p,dense)});
  for(const mode of [1,2]){const spec=make(RECIPES[0],notes);spec.performance={mode,portamento:.08,glide:'always'};result.push({id:`mono-${mode}`,rate,total:16001,spec});}
  const edited=clonePatch(RECIPES[6]);edited.layers[0].cutoff=1700;edited.layers[0].waveA=7;
  result.push({id:'structural-transition',rate,total:16001,spec:make(RECIPES[6],notes,[{patch:parameterTriples(edited),performance:{mode:0,portamento:0,glide:'overlap'},frame:4093,seconds:.06}])});
  for(const part of f.parts.filter(p=>p.kind==='core'))result.push({id:`six-role-${part.role}`,rate,total:Math.round(rate*f.totalSeconds),spec:coreSpecForPart(f,part,rate)});
 }
 return result;
}
