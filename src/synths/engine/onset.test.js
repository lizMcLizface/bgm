// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,peak} from './offline';
import {SYNTHS} from '../models';
import {composeWaves} from '../vs/waves';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const POLY=Object.entries(SYNTHS).filter(([id])=>!/^tr|^tb/.test(id));

// A key press must rise from silence: no preset may start with a step (heard as a pop).
test.each(POLY)('%s: every preset fades in from zero on a key press',(id,synth)=>{
 const bad=[];
 for(const preset of synth.presets){
  for(const note of [36,60,84]){
   const v=createOfflineSynth(module,{model:synth.model,params:synth.params.toPairs({...preset.values,reverbMix:0,chorusMix:0}),waves:id==='vs'?composeWaves():null});
   v.seconds(.05);v.k.syn_note_on(1,note,.8);
   const [l]=v.seconds(.3),pk=peak(l);
   if(pk<1e-3)continue;
   const first=Math.max(...Array.from(l.subarray(0,24),Math.abs));
   if(first/pk>.08)bad.push(`${preset.name} @${note}: ${(first/pk).toFixed(2)}`);
  }
 }
 expect(bad).toEqual([]);
});
