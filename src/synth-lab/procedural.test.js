// @vitest-environment node
import {vi} from 'vitest';
vi.mock('../audio/context',()=>({audioContext:{}}));
vi.mock('../nodes',()=>({Reverb:vi.fn(()=>{throw Error('Internal convolution must not be created.');})}));
import {ProceduralBackend} from './proceduralBackend';
import {proceduralPatch,sanitizeProcedural,PROCEDURAL_RECIPES,proceduralTail} from './proceduralPatch';
import {renderDescriptor,bufferDescriptors} from './proceduralBuffers';
import {pianoBuffer} from '../app/engine/piano';
import {clearNoteCache,noteCacheStats} from '../app/engine/noteBufferCache';
import {sourcePlan,sourceConfig,SOURCE_SOUNDS} from './sourcePlan';
import {effectsLayout} from './ensemblePlan';

class Param{constructor(value=1){this.value=value;this.calls=[];}setValueAtTime(...v){this.calls.push(['set',...v]);}linearRampToValueAtTime(...v){this.calls.push(['linear',...v]);}exponentialRampToValueAtTime(...v){this.calls.push(['exp',...v]);}setTargetAtTime(...v){this.calls.push(['target',...v]);}setValueCurveAtTime(...v){this.calls.push(['curve',...v]);}cancelScheduledValues(t){this.calls.push(['cancel',t]);}}
class Node{constructor(){this.gain=new Param();this.pan=new Param(0);this.detune=new Param(0);this.frequency=new Param(440);this.playbackRate=new Param(1);this.Q=new Param(1);this.connections=[];this.stops=[];}connect(n){this.connections.push(n);return n;}disconnect(){this.connections=[];}start(...args){this.started=args;}stop(t){this.stops.push(t);}finish(){this.onended?.();}}
class Context{constructor(){this.sampleRate=8000;this.currentTime=0;this.nodes=[];}node(){const n=new Node();this.nodes.push(n);return n;}createGain(){return this.node();}createStereoPanner(){return this.node();}createOscillator(){return this.node();}createBiquadFilter(){return this.node();}createBufferSource(){return this.node();}createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return {length,sampleRate:rate,duration:length/rate,getChannelData:ch=>data[ch]};}}
const setup=(patch=proceduralPatch('piano'))=>{clearNoteCache();const context=new Context(),source=new ProceduralBackend(context,patch,{offline:true,build:async d=>renderDescriptor(d)});return {context,source};};

test('procedural patches round-trip with bounded settings and no internal percussion room',()=>{
 for(const p of PROCEDURAL_RECIPES)expect(sanitizeProcedural(p)).toEqual(p);
 const p=proceduralPatch('pluck',{global:{gain:Infinity,polyphony:999},piano:{brightness:99},string:{bodyType:'invalid',decay:-1},kit:{room:.8,kick:{tone:50,decay:100}},routing:{room:'private',roomDecay:80}});
 expect(p.global).toEqual({gain:.5,polyphony:32});expect(p.piano.brightness).toBe(1);expect(p.string).toMatchObject({bodyType:'guitar',decay:.15});expect(p.kit.room).toBe(0);expect(p.kit.kick.tone).toBe(1);expect(p.routing).toEqual({room:'private',roomDecay:30});expect(()=>sanitizeProcedural({version:1,kind:'procedural',family:'unknown'})).toThrow();
});
test('source plans cover all families with separate local echoes and private pad ownership',()=>{
 for(const [sound]of SOURCE_SOUNDS){const p=sourcePlan({sound});expect(p.parts.length).toBeGreaterThan(0);expect(p.parts.every(part=>part.notes.length&&Number.isFinite(part.release)&&part.release>0)).toBe(true);expect(p.seconds).toBeGreaterThan(p.sourceSeconds);expect(p.parts.every(part=>part.retunes.length===0)).toBe(true);}
 const p=sourcePlan({sound:'mixed',room:'private'}),layout=effectsLayout(p,'local');expect(p.parts.map(p=>p.kind)).toEqual(['procedural','procedural','fm','procedural']);expect(layout.count).toBe(2);const pad=p.parts.find(p=>p.role==='pad'),drums=p.parts.find(p=>p.role==='percussion');expect(layout.settings(layout.assign(pad)).decay).toBe(10);expect(layout.settings(layout.assign(drums)).decay).toBe(3);expect(proceduralTail(drums.patch)).toBe(8.1);
 expect(sourceConfig({rate:1,hold:999,tone:-50,length:0})).toMatchObject({rate:48000,hold:1,tone:-1,length:.5});
});
test('background buffer descriptors preserve existing piano DSP and cache reuse',async()=>{
 const p=proceduralPatch('piano',{piano:{decay:.3}}),note={midi:57,velocity:.7},d=bufferDescriptors(p,note,8000)[0];
 const {source,context}=setup(p),build=vi.fn(source.build);source.build=build;await source.prepare([note,note]);const count=build.mock.calls.length;expect(count).toBe(2);await source.prepare([note]);expect(build).toHaveBeenCalledTimes(count);expect(source.buffers.get(JSON.stringify(d.key))).toBe(pianoBuffer(context,220,{...p.piano,velocity:.7}));expect(noteCacheStats().bytes).toBeLessThanOrEqual(noteCacheStats().maxBytes);source.dispose();
});
test('piano strike and looping body share one gate, then retire on audio-clock release',async()=>{
 const {source}=setup();await source.prepare([{midi:60,velocity:.7}]);source.events([[1,1,8000,0,0],[0,1,0,60,.7]]);const r=source.ids.get(1);expect(r.sources).toHaveLength(2);expect(r.sources[0].source.loop).toBeUndefined();expect(r.sources[1].source.loop).toBe(true);expect(r.sources[1].source.playbackRate.value).toBeCloseTo(261.625565*2048/8000,5);expect(r.releaseAt).toBe(1);expect(r.end).toBeCloseTo(1.35);for(const s of [...r.sources])s.source.finish();expect(source.records.size).toBe(0);expect(source.ids.size).toBe(0);source.dispose();
});
test('short release truncates the attack ramp without an amplitude step',async()=>{
 const {source}=setup(proceduralPatch('piano',{envelope:{attack:1}}));await source.prepare([{midi:60,velocity:.8}]);source.events([[0,1,0,60,.8],[1,1,800,0,0]]);const r=source.ids.get(1);expect(r.releaseLevel).toBeCloseTo(.08);expect(r.amp.gain.calls).toContainEqual(['linear',.08000000000000002,.1]);source.dispose();
});
test('sustain, voice stealing and stale IDs keep independently scheduled notes intact',async()=>{
 const {source}=setup(proceduralPatch('piano',{global:{polyphony:1}}));await source.prepare([{midi:60,velocity:.7},{midi:67,velocity:.7}]);source.events([[0,1,0,60,.7],[0,2,800,67,.7],[1,1,1600,0,0],[2,0,1700,1,0],[1,2,1800,0,0]]);expect(source.steals).toBe(1);expect(source.ids.has(1)).toBe(false);const r=source.ids.get(2);expect(r.releaseAt).toBe(null);expect(r.pending).toBe(true);source.events([[2,0,2400,0,0]]);expect(r.releaseAt).toBe(.3);source.panic();expect(source.ids.size).toBe(0);expect(source.stats().active).toBe(0);source.dispose();
});
test('held retuning changes both buffer pitches without another source attack',async()=>{
 const {source}=setup();await source.prepare([{midi:60,velocity:.7}]);source.events([[0,1,0,60,.7],[5,1,4000,72,.5]]);const r=source.ids.get(1);expect(r.sources).toHaveLength(2);for(const s of r.sources){expect(s.source.started[0]).toBe(0);expect(s.source.detune.calls).toContainEqual(['linear',1200,1]);}source.dispose();
});
test('preparation cancellation/disposal cannot publish late buffers or leave sources connected',async()=>{
 const {source}=setup();let resolve;source.build=()=>new Promise(r=>{resolve=r;});const controller=new AbortController(),promise=source.prepare([{midi:60,velocity:.7}],{signal:controller.signal});controller.abort();source.dispose();resolve(new Float32Array(20));await expect(promise).rejects.toThrow('cancelled');expect(source.buffers.size).toBe(0);expect(source.node.connections).toEqual([]);source.dispose();
});
test('native percussion schedules one-shots with no convolution allocation and cleans up',async()=>{
 const {source}=setup(proceduralPatch('drums'));await source.prepare([{midi:0,velocity:.7}]);source.events([[0,1,0,0,.7],[1,1,800,0,0]]);expect(source.kit.reverb).toBe(null);expect(source.kit.sources.size).toBeGreaterThan(0);expect(source.buffers.size).toBe(0);expect(()=>source.events([[5,1,0,60,.3]])).toThrow('Unsupported');source.dispose();expect(source.kit.sources.size).toBe(0);expect(source.node.connections).toEqual([]);
});
test('unsupported controls and unsafe event batches fail before booking any partial notes',async()=>{
 const {source}=setup();await source.prepare([{midi:60,velocity:.7}]);expect(()=>source.events([[0,1,0,60,.7],[3,1,800,.5,0]])).toThrow();expect(source.records.size).toBe(0);expect(()=>source.events([[0,1,NaN,60,.7]])).toThrow();expect(()=>source.events(Array.from({length:4097},()=>[0,1,0,60,.7]))).toThrow();expect(source.dropped).toBe(4097);expect(()=>source.on(77,.7)).toThrow('Prepare');source.dispose();
});
test('oversized distinct-buffer preparations fail before dispatching DSP work',async()=>{
 const {source}=setup(),build=vi.fn(source.build);source.build=build;await expect(source.prepare(Array.from({length:129},(_,i)=>({midi:40+i*.1,velocity:.7})))).rejects.toThrow('shorter passages');expect(build).not.toHaveBeenCalled();expect(source.buffers.size).toBe(0);source.dispose();
});
