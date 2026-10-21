// @vitest-environment node
import fs from 'node:fs';
import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
import {createOfflineSynth} from './offline';
import {SYNTHS} from '../models';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
function host(polyphony=8){
 let Processor;
 const messages=[],sandbox={WebAssembly,Float32Array,sampleRate:48000,currentFrame:0,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m),close(){}};}},registerProcessor:(_name,klass)=>{Processor=klass;}};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync('public/synths/classics-processor.js','utf8'),sandbox);
 const synth=SYNTHS.prophet5,params=synth.params.toPairs({...synth.presets[0].values,reverbMix:0});
 const processor=new Processor({processorOptions:{module,model:synth.model,params,polyphony}});
 function render(frames){const result=new Float32Array(frames);for(let at=0;at<frames;at+=128){const n=Math.min(128,frames-at),out=[new Float32Array(n),new Float32Array(n)];processor.process([], [out]);result.set(out[0],at);sandbox.currentFrame+=n;}return result;}
 return {processor,render,messages,params,sandbox};
}
describe('classics scheduled worklet',()=>{
 it('lands note on/off at exact samples inside render blocks, even for unsorted messages',()=>{
  const h=host();h.processor.message({type:'events',values:[[1,1,0,0,211/48000],[0,1,60,.8,33/48000]]});
  const actual=h.render(2048),expected=createOfflineSynth(module,{model:2,params:h.params});
  const pieces=[expected.render(33)[0]];expected.k.syn_note_on(1,60,.8);pieces.push(expected.render(178)[0]);expected.k.syn_note_off(1);pieces.push(expected.render(2048-211)[0]);
  expect([...actual]).toEqual(pieces.flatMap(p=>[...p]));expect(actual.slice(0,33).every(x=>x===0)).toBe(true);expect(h.processor.held.size).toBe(0);
 });
 it('caps held voices, ignores a stolen note’s later off, and panic cancels future notes',()=>{
  const h=host(2);h.processor.message({type:'events',values:[[0,1,60,.7,0],[0,2,64,.7,0],[0,3,67,.7,1/48000],[1,1,0,0,2/48000],[0,4,72,.7,1]]});h.render(128);
  expect([...h.processor.held]).toEqual([2,3]);h.processor.message({type:'panic'});h.render(48000);expect(h.processor.pending).toHaveLength(0);expect(h.processor.held.size).toBe(0);
 });
 it('keeps immediate playing and handles events arriving late on the current clock',()=>{
  const h=host();h.render(256);h.processor.message({type:'events',values:[[0,1,60,.8,0],[0,2,64,.8]]});h.render(128);expect([...h.processor.held]).toEqual([2,1]);expect(h.messages.some(m=>m.type==='error')).toBe(false);
 });
});
