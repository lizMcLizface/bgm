// @vitest-environment node
import fs from 'node:fs';
import vm from 'node:vm';
import {POLY,FM,applyTopology} from './patches';
import {RECIPES,sanitizePatch,parameterTriples} from '../../synth-lab/patch';
import {FM_RECIPES,sanitizeFM,fmPacket,topology} from '../../synth-lab/fmPatch';

test('every existing poly and FM recipe survives panel storage without changing its native parameters or effects',()=>{
 for(const [schema,recipes,clean,packet]of [[POLY,RECIPES,sanitizePatch,parameterTriples],[FM,FM_RECIPES,sanitizeFM,fmPacket]]){
  for(const recipe of recipes){
   const expected=clean(recipe),actual=schema.inflate(schema.params.sanitize(schema.flatten(expected)));
   expect({...actual,name:expected.name}).toEqual(expected);
   expect(packet(actual)).toEqual(packet(expected));
  }
 }
});

test('layer and operator edits stay independent, including custom routing and sends',()=>{
 const values={...POLY.presets[2].values,'layers.1.cutoff':1234,'effects.reverb':.31,'inserts.chorus':.23};
 const poly=POLY.inflate(values);
 expect(poly.layers[1].cutoff).toBe(1234);expect(poly.layers[0].cutoff).toBe(700);
 expect(poly.effects.reverb).toBe(.31);expect(poly.inserts.chorus).toBe(.23);
 const fm=FM.inflate({...FM.presets[0].values,'operators.4.ratio':7.25,'routes.0.5':.7,'carriers.2':.4});
 expect(fm.operators[4].ratio).toBe(7.25);expect(fm.operators[0].ratio).toBe(1);
 expect(fm.routes[0][5]).toBe(.7);expect(fm.carriers[2]).toBe(.4);
});

test('switching FM topology clears stale six-operator routing and clamps feedback operator',()=>{
 const values={...FM.presets[0].values,'global.feedbackOp':5,'routes.0.5':1.5};
 const next=FM.inflate(applyTopology(values,4,1));
 expect(next.global.operators).toBe(4);expect(next.global.feedbackOp).toBe(3);
 expect(next.routes).toEqual(topology(4,1).routes);expect(next.carriers).toEqual(topology(4,1).carriers);
 expect(next.operators).toEqual(FM.inflate(values).operators);
});

test('new engine output tap preserves stereo audio exactly and wraps mono scope history correctly',()=>{
 let Processor;
 const messages=[];
 const sandbox={sampleRate:48000,Float32Array,Math,AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>messages.push(data)};}},registerProcessor:(_,p)=>{Processor=p;}};
 vm.runInNewContext(fs.readFileSync('public/synths/output-scope.js','utf8'),sandbox);
 const tap=new Processor();
 for(let block=0;block<520;block++){
  const left=Float32Array.from({length:128},(_,i)=>Math.sin((block*128+i)*.02)*.2),right=left.map(v=>-v*.5),out=[new Float32Array(128),new Float32Array(128)];
  tap.process([[left,right]],[out]);expect(out[0]).toEqual(left);expect(out[1]).toEqual(right);
 }
 tap.port.onmessage({data:{type:'scope',n:999999}});
 const scope=messages.at(-1);expect(scope.end).toBe(66560);expect(scope.samples.length).toBe(65536);
 expect(scope.samples[0]).toBeCloseTo(Math.sin(1024*.02)*.05,7);
 expect(scope.samples.at(-1)).toBeCloseTo(Math.sin(66559*.02)*.05,7);
 expect(messages.some(m=>m.type==='level'&&m.peak>0)).toBe(true);
});
