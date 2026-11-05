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

test('the front page sounds appear translated: subtractive ones in Poly, FM ones in FM, none duplicated or left half-translated',()=>{
 for(const [schema,kind,count] of [[POLY,'subtractive',108],[FM,'fm',14]]){
  const translated=schema.presets.filter(p=>p.styles?.includes('front page'));
  expect(translated.length).toBe(count);
  expect(new Set(schema.presets.map(p=>p.name)).size).toBe(schema.presets.length);
  const ids=new Set(schema.categories.map(c=>c.id));
  for(const p of translated){expect(ids.has(p.category)).toBe(true);expect(schema.params.sanitize(p.values)).toEqual(p.values);}
 }
 // the measured set and the native Wasm voices are in too (the plucked-string cello stays on the string page)
 const names=new Set([...POLY.presets,...FM.presets].map(p=>p.name));
 for(const name of ['Measured Celesta','Measured Choir Ah','Measured Epic Strings','Wasm Rosin Silk','Wasm Air Choir','Wasm Drawbars','Wasm Round FM Bass'])expect(names.has(name),name).toBe(true);
 expect(names.has('Measured Cello Pizzicato')).toBe(false);expect(names.has('Measured Violin')).toBe(false);expect(names.has('Measured Cello')).toBe(false);
 expect(POLY.presets.slice(0,11).map(p=>p.name)).toContain('Layered noir');
});

it('puts a front page bit crusher in the effects chain as a rack unit, only on the sounds that have one',()=>{
 const crushed=POLY.presets.find(p=>p.name==='Bit Haze');
 expect(crushed.rack).toMatchObject({'switch.crusher':1,'crusher.divide':4,'crusher.mix':.3});
 expect((crushed.rack['master.chain']>>9)&1).toBe(1);
 expect(POLY.presets.find(p=>p.name==='Warm Strings').rack).toBeUndefined();
});

describe('the DIY FM sound library',()=>{
 const bytes=fs.readFileSync('public/synth-lab/fm.wasm'),wasm=new WebAssembly.Module(bytes);
 const library=FM.presets.filter(p=>!p.styles?.includes('front page')&&!FM_RECIPES.some(r=>r.name===p.name));
 const play=(patch,midi,velocity)=>{
  const e=new WebAssembly.Instance(wasm,{}).exports;e.fm_init(48000);const k=fmPacket(patch);
  for(const a of k.globals)e.fm_param(...a);for(const a of k.operators)e.fm_op(...a);for(const a of k.routes)e.fm_route(...a);for(const a of k.carriers)e.fm_carrier(...a);
  e.fm_event(0,1,0,midi,velocity);e.fm_event(1,1,48000,0,0);
  const out=new Float32Array(48000*2);for(let at=0;at<out.length;at+=128){e.fm_render(128);out.set(new Float32Array(e.memory.buffer,e.fm_output(0),128),at);}
  return out;
 };
 it('has a bank the size of the other synths, spread across two to eight operators',()=>{
  expect(library.length).toBeGreaterThanOrEqual(64);
  for(let n=2;n<=8;n++)expect(library.filter(p=>p.values['global.operators']===n).length,`${n} operators`).toBeGreaterThanOrEqual(6);
  expect(new Set(FM.presets.map(p=>p.name)).size).toBe(FM.presets.length);
  const ids=new Set(FM.categories.map(c=>c.id));
  for(const p of library){expect(ids.has(p.category),p.name).toBe(true);expect(FM.params.sanitize(p.values),p.name).toEqual(p.values);}
 });
 it('gives every sound its own space instead of the synth default, and uses the rack beyond reverb and delay',()=>{
  const defaults=FM.params.defaultValues();
  for(const p of library)expect(p.values['effects.reverb']!==defaults['effects.reverb']||p.values['effects.delay']!==defaults['effects.delay']||p.values['effects.decay']!==defaults['effects.decay'],p.name).toBe(true);
  expect(library.filter(p=>p.rack).length).toBeGreaterThan(library.length*.7);
  const units=new Set(library.flatMap(p=>Object.keys(p.rack??{}).filter(k=>k.startsWith('switch.')&&p.rack[k]===1).map(k=>k.slice(7))));
  for(const u of ['tremolo','tape','shimmer','pitch','filter','width','ring','crusher'])expect(units.has(u),u).toBe(true);
 });
 it('plays every sound audibly, finite and below clipping, at a low, a middle and a high note',()=>{
  for(const p of library){
   const patch=FM.inflate(p.values);
   for(const midi of [36,60,84]){
    const data=play(patch,midi,.9);
    expect(data.every(Number.isFinite),p.name+' '+midi).toBe(true);
    const peak=data.reduce((m,v)=>Math.max(m,Math.abs(v)),0),rms=Math.sqrt(data.slice(0,24000).reduce((s,v)=>s+v*v,0)/24000);
    expect(peak,p.name+' '+midi).toBeLessThan(.95);expect(rms,p.name+' '+midi).toBeGreaterThan(.004);
   }
  }
 });
});

it('colours every DIY sound by its category, so the sound grid is colour-coded',()=>{
 for(const schema of [POLY,FM]){
  const byCategory=new Map();
  for(const p of schema.presets){expect(p.colour,p.name).toMatch(/^#[0-9a-f]{6}$/i);byCategory.set(p.category,new Set([...(byCategory.get(p.category)??[]),p.colour]));}
  for(const [category,colours] of byCategory)expect(colours.size,category).toBe(1);
 }
 expect(new Set(FM.presets.map(p=>p.colour)).size).toBeGreaterThan(8);
});
