// @vitest-environment node
import fs from 'node:fs';
import crypto from 'node:crypto';
import targets from './drumReferenceTargets.json';
import {createOfflineSynth,MODELS,rms} from './offline';
import {profileReference} from './referenceMetrics';
import {KITS,drumParams} from '../drums/kits';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const render=(model,track,sr=48000)=>{
 const s=createOfflineSynth(module,{model:MODELS[model],sampleRate:sr,params:[[200,0],[203,0],[133,0]]});
 s.k.syn_note_on(1,36+track,1);return s.seconds(1.5);
};
const powerRms=(channels,n)=>Math.sqrt(channels.reduce((p,c)=>p+rms(c.subarray(0,n))**2,0)/channels.length);
const t20=(channels,sr)=>{
 const hop=Math.round(sr*.005),bins=[];
 for(let i=0;i+hop<=channels[0].length;i+=hop)bins.push(Math.sqrt(channels.reduce((p,c)=>p+rms(c.subarray(i,i+hop))**2,0)/channels.length));
 const threshold=Math.max(...bins)*.1;return (bins.findLastIndex(v=>v>=threshold)+.5)*hop/sr;
};

test.each([44100,48000,96000])('kit articulation, brightness and balance stay near the measured demo targets at %i Hz',sr=>{
 const kickRms={};
 for(const target of targets.voices){
  const channels=render(target.model,target.track,sr),label=`${target.model}/${target.key} at ${sr}`;
  expect(Math.abs(t20(channels,sr)-target.t20Seconds),`${label}: decay`).toBeLessThan(Math.max(.015,target.t20Seconds*.2));
  const profile=profileReference(channels.map(c=>c.subarray(0,Math.round(sr*.35))),sr);
  const bands=profile.bands.map(b=>({hz:b.hz,power:10**(b.db/10)}));
  const centroid=bands.reduce((s,b)=>s+b.hz*b.power,0)/bands.reduce((s,b)=>s+b.power,0);
  expect(Math.abs(Math.log2(centroid/target.centroidHz)),`${label}: brightness`).toBeLessThan(Math.log2(1.3));
  const attack=powerRms(channels,Math.round(sr*.1));
  if(target.key==='bd')kickRms[target.model]=attack;
  expect(Math.abs(20*Math.log10(attack/kickRms[target.model])-target.attackToKickDb),`${label}: kit balance`).toBeLessThan(3);
 }
});

test('Deep still renders the original dry kick PCM after revoicing the rest of the kits',()=>{
 const expected={tr808:'2f9d6fda0f1055d7147e154f385e61a77365ed9952a3738105c41a2eea60011c',tr909:'db077e559b6b6cfd4e5705426c9036f27e8b89719964607e631c5fc7f5333cc2',tr606:'1753b4ea364680f1e45bdc0508ee134582a5c839267f91a3a201381754fad775'};
 for(const kit of Object.values(KITS)){
  const params=drumParams(kit),s=createOfflineSynth(module,{model:kit.model,params:params.toPairs(params.sanitize({kickBody:1,reverbMix:0,chorusMix:0}))});
  s.k.syn_note_on(1,36,1);const channels=s.seconds(3),pcm=new Float32Array(channels[0].length*2);
  for(let i=0;i<channels[0].length;i++){pcm[2*i]=channels[0][i];pcm[2*i+1]=channels[1][i];}
  expect(crypto.createHash('sha256').update(Buffer.from(pcm.buffer)).digest('hex')).toBe(expected[kit.id]);
 }
});
