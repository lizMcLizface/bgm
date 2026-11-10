// @vitest-environment node
import {it,expect} from 'vitest';
import fs from 'node:fs';
import {ReferenceGraph,savePatch,loadPatch,validatePatch} from '../../public/modular-audio/runtime.js';
import {kit,hits,voices,contracts,newEngine,patch,renderGraph,renderHandle,renderLegacy,digest,graphModule} from '../../tools/percussionKitCases.mjs';
import {BrowserThreadWorker,MessageChannel} from '../../tools/workerNodeAdapter.mjs';

it.each([44100,48000,96000])('matches configured legacy Wasm for all palettes, slots, levels and receive orders at %i Hz',rate=>{
 const cases=[];
 for(const voice of voices)for(const edited of [false,true])for(const reordered of [false,true]){
  const config=kit(voice,edited),events=hits(rate,reordered),total=Math.ceil(rate*9.25),r=renderGraph(patch(config,events),rate,total),legacy=renderLegacy(config,events,rate,total);
  const graphHash=digest(r.pcm),legacyHash=digest(legacy);expect(graphHash,`${voice}/${edited}/${reordered}`).toBe(legacyHash);expect(r.pcm.every(ch=>ch.every(Number.isFinite))).toBe(true);expect(r.pcm.some(ch=>ch.some(v=>v!==0))).toBe(true);
  expect(r.stats).toEqual({frame:total,late:0,overflow:0,applied:events.length});expect(r.percussion).toMatchObject({active:0,queued:0,dropped:0,late:0,frame:total});
  cases.push({voice,edited,reordered,rate,total,events:events.length,graphHash,legacyHash,stats:r.stats,percussion:r.percussion});
 }
 fs.writeFileSync(`.tmp/m4c-kit-pcm-${rate}.json`,JSON.stringify({rate,cases},null,2)+'\n');
},60000);
it('covers edited audible settings on every slot and fully disabled kits without leaking startup gain',()=>{
 const cases=[],rate=48000,events=hits(rate,true),total=444000;
 for(const voice of voices)for(const disabled of [false,true]){
  const c=kit(voice);c.drums.forEach((d,i)=>{d.on=!disabled;d.level=.2+i%6*.3;});
  const r=renderGraph(patch(c,events),rate,total),graphHash=digest(r.pcm),legacyHash=digest(renderLegacy(c,events,rate,total));expect(graphHash).toBe(legacyHash);expect(r.stats.applied).toBe(events.length);expect(r.percussion.active).toBe(0);
  expect(r.pcm.every(ch=>ch.every(v=>v===0))).toBe(disabled);cases.push({voice,disabled,allSlotsEdited:true,rate,total,events:events.length,graphHash,legacyHash,stats:r.stats,percussion:r.percussion});
 }
 fs.writeFileSync('.tmp/m4c-kit-pcm-all-slots.json',JSON.stringify({cases},null,2)+'\n');
},30000);
it('replays save/reload and reset exactly, with immutable config and initial level smoothing',()=>{
 const config=kit('crisp'),events=hits(48000,true),p=patch(config,events),saved=savePatch(p,contracts),loaded=loadPatch(saved,contracts),total=444000,e=newEngine(),g=new ReferenceGraph(e,p,contracts,48000,512);
 try{
  config.drums[0].level=2;expect(g.patch.modules[0].config).toEqual(loaded.modules[0].config);
  const first=digest(renderHandle(g,total));expect(first).toBe(digest(renderGraph(loaded,48000,total,127).pcm));
  g.reset();for(const event of loaded.events)g.enqueue(event);expect(digest(renderHandle(g,total,113))).toBe(first);expect(g.stats()).toEqual({frame:total,late:0,overflow:0,applied:events.length});
  g.reset();expect(e.graph_percussion_config(g.handle,6,1,4)).not.toBe(0);expect(e.graph_percussion_drum(g.handle,6,0,1,1,0,1)).not.toBe(0);
  for(const event of loaded.events)g.enqueue(event);expect(digest(renderHandle(g,total))).toBe(first);
 }finally{g.dispose();}
 // No preroll: this must match the legacy target ramp, not an instant level.
 const c=kit('felt',false);c.drums[0].level=.25;const event={...hits(48000)[0],frame:0};expect(digest(renderGraph(patch(c,[event]),48000,24000).pcm)).toBe(digest(renderLegacy(c,[event],48000,24000)));
});
it('keeps differently configured handles independent in one Wasm and releases only the requested owner',()=>{
 const e=newEngine(),events=hits(48000),a=new ReferenceGraph(e,patch(kit('hand'),events),contracts,48000,512),b=new ReferenceGraph(e,patch(kit('tr808'),[]),contracts,48000,512);a.refresh();
 try{
  const expected=digest(renderGraph(patch(kit('hand'),events),48000,24000).pcm);expect(digest(renderHandle(a,24000))).toBe(expected);expect(b.stats().frame).toBe(0);b.render(512);expect(b.left.every(v=>v===0)).toBe(true);
  b.enqueue({...events[0],frame:512});b.render(512);expect(b.left.some(v=>v!==0)).toBe(true);const before=digest(renderHandle(b,2048));expect(before).not.toBe(digest([new Float32Array(2048),new Float32Array(2048)]));
  a.cancel(6);renderHandle(a,5000);expect(a.percussionStats(6)).toMatchObject({active:0,queued:0});expect(b.percussionStats(6).active).toBeGreaterThan(0);
  a.reset();expect(b.stats().frame).toBe(3072);const referenceB=renderGraph(patch(kit('tr808'),[{...events[0],frame:512}]),48000,3584).pcm;expect(digest(renderHandle(b,512))).toBe(digest(referenceB.map(ch=>ch.slice(3072))));
 }finally{a.dispose();b.dispose();}
});
it('validates version, full schema, bounds and target on both JS and owned ABI without altering valid state',()=>{
 const mutations=[c=>c.version=2,c=>c.voice='unknown',c=>c.drums.pop(),c=>c.drums.push(c.drums[0]),c=>c.room=.2,c=>c.drums[0].on=1,c=>delete c.drums[0].tone,c=>c.drums[0].level=2.01,c=>c.drums[0].level=-.1,c=>c.drums[0].tone=NaN,c=>c.drums[0].decay=Infinity,c=>c.drums[0].decay=.49,c=>c.drums[0].extra=1,c=>c.drums[0]=null];
 for(const change of mutations){const c=kit();change(c);expect(()=>savePatch(patch(c,[]),contracts)).toThrow('percussion');}
 for(const config of [null,[],{},true,{version:1,voicePreset:1,levels:Array(14).fill(1)}])expect(()=>validatePatch({...patch(null,[]),modules:[{id:6,type:'legacy.percussion',version:1,parameters:{},config},{id:18,type:'ref.output',version:1,parameters:{}}]},contracts)).toThrow('percussion');
 const e=newEngine(),h=e.graph_new(48000,512);try{
  expect(e.graph_node(h,6,5,2)).toBe(0);expect(e.graph_node(h,18,4,1)).toBe(0);
  expect(e.graph_percussion_drum(h,6,0,1,1,0,1)).not.toBe(0);
  for(const args of [[6,2,1],[6,1,0],[6,1,5],[18,1,1],[999,1,1]])expect(e.graph_percussion_config(h,...args)).not.toBe(0);
  expect(e.graph_percussion_config(h,6,1,1)).toBe(0);
  for(const row of [[14,1,1,0,1],[0,2,1,0,1],[0,1,NaN,0,1],[0,1,3,0,1],[0,1,1,-2,1],[0,1,1,0,.4]])expect(e.graph_percussion_drum(h,6,...row)).not.toBe(0);
  expect(e.graph_audio(h,1,6,18,0)).toBe(0);expect(e.graph_prepare(h)).toBe(0);
  const event={...hits(48000)[0],frame:0};expect(e.graph_hit(h,0,6,6,event.drum,event.velocity,event.duration,event.vary,event.tone,event.decay,event.hit,event.model)).toBe(0);expect(e.graph_render(h,512)).toBe(0);
  const actual=[new Float32Array(e.memory.buffer,e.graph_left(h),512).slice(),new Float32Array(e.memory.buffer,e.graph_right(h),512).slice()];expect(digest(actual)).toBe(digest(renderGraph(patch(kit('felt',false),[event]),48000,512).pcm));
 }finally{e.graph_free(h);}
 const p=patch(undefined,hits(48000));expect(loadPatch(savePatch(p,contracts),contracts).modules[0]).not.toHaveProperty('config');expect(digest(renderGraph(p,48000,24000).pcm)).toBe(digest(renderLegacy(null,p.events,48000,24000)));
});
it('fails closed on unsupported configured module versions instead of silently rendering a raw kit',()=>{
 const p=patch(kit('hand'),hits(48000)),oldContracts={...contracts,modules:contracts.modules.filter(m=>!(m.type==='legacy.percussion'&&m.version===2))};
 expect(()=>validatePatch(p,oldContracts)).toThrow('contract');const v1=structuredClone(p);v1.modules[0].version=1;expect(()=>validatePatch(v1,contracts)).toThrow('version 2');const missing=structuredClone(p);delete missing.modules[0].config;expect(()=>validatePatch(missing,contracts)).toThrow('version 2');
 const e=newEngine(),h=e.graph_new(48000,512);try{expect(e.graph_node(h,6,5,2)).toBe(0);expect(e.graph_node(h,18,4,1)).toBe(0);expect(e.graph_audio(h,1,6,18,0)).toBe(0);expect(e.graph_prepare(h)).not.toBe(0);expect(e.graph_percussion_config(h,6,1,4)).toBe(0);expect(e.graph_prepare(h)).toBe(0);}finally{e.graph_free(h);}
 const raw=e.graph_new(48000,512);try{expect(e.graph_node(raw,6,5,1)).toBe(0);expect(e.graph_percussion_config(raw,6,1,1)).not.toBe(0);expect(e.graph_node(raw,7,5,3)).not.toBe(0);}finally{e.graph_free(raw);}
});
it('publishes configured drum and kick buses exactly through the real worker with bounded recycling',async()=>{
 const p=patch(kit('tr808'),hits(48000,true)),g=new ReferenceGraph(newEngine(),p,contracts,48000,512),worker=new BrowserThreadWorker(),link=new MessageChannel(),total=80037;let frame=0,timer,peak=0,kickPeak=0,maxAbs=0;
 try{const stats=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Configured percussion worker timeout')),30000);worker.onerror=reject;worker.onmessage=({data:d})=>{if(d.type==='error')reject(Error(d.message));if(d.type==='stats')resolve(d);};link.port2.onmessage=({data:b})=>{try{if(b.type!=='block')return;expect(b.frame).toBe(frame);g.render(b.n);const pcm=new Float32Array(b.buffer),audio=g.outputs.get(6),kick=g.kicks.get(6);for(let bus=0;bus<8;bus++)for(let i=0;i<b.n;i++)for(let ch=0;ch<2;ch++){const actual=pcm[(bus*b.n+i)*2+ch],expected=bus===5?audio[i*2+ch]:bus===6?kick[i*2+ch]:0;maxAbs=Math.max(maxAbs,Math.abs(actual-expected));if(bus===5)peak=Math.max(peak,Math.abs(actual));if(bus===6)kickPeak=Math.max(kickPeak,Math.abs(actual));}frame+=b.n;link.port2.postMessage({type:'recycle',generation:109,slot:b.slot,buffer:b.buffer},[b.buffer]);if(frame===total)worker.postMessage({type:'stats',generation:109,request:1});}catch(e){reject(e);}};worker.postMessage({type:'init',module:graphModule,contracts,patch:p,sourceIds:[6],rate:48000,endFrame:total,options:{generation:109,blockFrames:512,poolBlocks:12,scheduling:'message'},port:link.port1},[link.port1]);});
  expect(frame).toBe(total);expect(maxAbs).toBe(0);expect(peak).toBeGreaterThan(0);expect(kickPeak).toBeGreaterThan(0);expect(stats).toMatchObject({badRecycles:0,rejectedEvents:0,graph:{frame:total,late:0,overflow:0,applied:p.events.length}});expect(stats.roles[5].dropped).toBe(0);
 }finally{clearTimeout(timer);link.port2.close();worker.terminate();g.dispose();}
},35000);
