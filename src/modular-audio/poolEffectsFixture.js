import {sixSourceDag} from './pitchedFixture.js';
import {ownedInsertsSpec} from './ownedInserts.js';
import {ownedEffectsSpec} from './ownedEffects.js';
import {ownedRackFxSpec} from './ownedRackFx.js';
import {ownedVoiceFxSpec} from './ownedVoiceFx.js';

// Fixed integration material, separate from the persisted song/native route.
// Core substitutes let the first integer-delay PDC policy exercise unequal
// master branches without concealing FM's genuinely fractional filter delay.
export function poolEffectsFixture(fixture,rate,{latencyCompensation=true,equalFractionalFm=false,extendedMaster=false}={}){
  const patch=sixSourceDag(fixture,rate),source=patch.modules.find(n=>n.type===(equalFractionalFm?'legacy.fm':'legacy.core'));
  for(const n of patch.modules)if(n.id<=5&&n.type!==source.type){n.type=source.type;n.config=structuredClone(source.config);}
  patch.latencyCompensation=latencyCompensation;
  patch.modules.push(
    {id:61,type:'legacy.inserts',version:1,parameters:{},config:ownedInsertsSpec({saturation:.25,drive:2,chorus:.15})},
    {id:62,type:'graph.delay',version:1,parameters:{},config:{version:1,frames:17}},
    {id:63,type:'legacy.effects',version:1,parameters:{},config:ownedEffectsSpec({dry:.85,reverb:.2,delay:.15,delayMs:53,decay:.25})},
  );
  patch.connections.find(e=>e.from.module===1&&e.to.module===11).from.module=61;
  patch.connections.find(e=>e.from.module===5&&e.to.module===13).from.module=62;
  patch.connections.find(e=>e.from.module===15&&e.to.module===17).from.module=63;
  let next=100;
  const edge=(from,to,input='program.in')=>patch.connections.push({id:next++,kind:'audio',from:{module:from,port:'audio.out'},to:{module:to,port:input}});
  edge(1,61);edge(5,62);edge(15,63);edge(5,63,'reverb.in');edge(6,63,'delay.in');
  // Equal FM branches may retain their exact common fractional absolute delay.
  // The zero-latency percussion source still renders but is not joined here;
  // joining it requires a future fractional compensation policy.
  if(equalFractionalFm)patch.connections=patch.connections.filter(e=>e.from.module!==6);
  if(extendedMaster){
    patch.modules.push({id:64,type:'rack.pitch',version:1,parameters:{},config:ownedRackFxSpec('pitch',{semitones:7.123456789,cents:-13.123456789,mix:.4123456789})},{id:65,type:'voice.shimmer',version:1,parameters:{},config:ownedVoiceFxSpec('shimmer',{mix:.23123456789,decay:2.123456789,climb:.27123456789,tone:6100.123456789},109)});
    patch.connections.find(e=>e.from.module===63&&e.to.module===17).from.module=65;edge(63,64);edge(64,65);
    patch.events.push({kind:'parameter',target:64,owner:80,parameter:'cents',value:17.123456789,frame:512},{kind:'parameter',target:65,owner:81,parameter:'climb',value:.3123456789,frame:1024});
  }
  patch.events.push(
    {kind:'parameter',target:15,owner:77,parameter:'gain',value:.11,frame:256},
    {kind:'parameter',target:61,owner:78,parameter:'drive',value:4,frame:384},
    {kind:'parameter',target:63,owner:79,parameter:'feedback',value:.25,frame:1024},
  );
  return patch;
}
