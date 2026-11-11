// @vitest-environment node
import fs from'node:fs';import crypto from'node:crypto';import{it,expect}from'vitest';import{AmbienceSpatialResourceProducer as Producer}from'./ambienceSpatialResourceProducer.js';
const module=new WebAssembly.Module(fs.readFileSync('public/ambience-control-preparation/preparation.wasm'));
const sha256=async b=>crypto.createHash('sha256').update(b).digest('hex');
const create=()=>{const messages=[];const p=new Producer(module,{sha256,post:(m,transfer=[])=>messages.push(structuredClone(m,{transfer}))});return{p,messages};};
async function finish(p,messages,mutate){let seen=0;for(let turns=0;turns<100;turns++){let moved=false;for(let i=seen;i<messages.length;i++){const m=messages[i];seen=i+1;if(m.type==='chunk'&&!m.echoed){m.echoed=true;mutate?.(m);p.echo(m);expect(p.stats().inflight).toBeLessThanOrEqual(2);moved=true;}}await new Promise(r=>setTimeout(r,0));if(p.stats().inflight===0&&!moved)break;}}
const request=(id,generation=1,slot=0,wave=2)=>({id,generation,slot,wave,type:'first',periodAfter:101});
it('uses exactly two transferable credits, verifies full receiver SHA before acknowledging atomic installation',async()=>{const{p,messages}=create();try{
 p.open({slot:0,wave:2,sampleRate:192000,period:73,offset:17.3});const old=p.streamStats({slot:0,wave:2});p.prepare(request(1));expect(p.stats().inflight).toBe(2);expect(messages.filter(m=>m.type==='chunk')).toHaveLength(2);expect(()=>p.commit({id:1,generation:1,count:45,birth:0})).toThrow('Unverified');expect(p.streamStats({slot:0,wave:2})).toEqual(old);
 await finish(p,messages);const ready=messages.find(m=>m.type==='resource-ready');expect(ready.identities.map(x=>x.bytes)).toEqual([16384*4,46*2*8]);const r=messages.find(m=>m.type==='resource');let count=0;while(r.walk.firstIndex+count<=1e6&&(130176/48000+(r.walk.firstIndex+count)*2-17.3<=130176/48000+90))count++;
 p.commit({id:1,generation:1,count,birth:130176/48000});expect(p.stats()).toEqual({streams:1,pending:0,inflight:0,credits:2,queued:0});expect(p.streamStats({slot:0,wave:2}).committedPlans).toBe(1);
 }finally{p.dispose();}});
it('keeps committed RNG intact on corrupted receiver bytes and returns both credits for a retry',async()=>{const{p,messages}=create();try{
 p.open({slot:0,wave:2,sampleRate:48000,period:73});const before=p.streamStats({slot:0,wave:2});p.prepare(request(1));let corrupt=true;await finish(p,messages,m=>{if(corrupt){new Uint8Array(m.buffer)[0]^=1;corrupt=false;}});
 expect(messages.some(m=>m.type==='resource-error'&&m.error.includes('readback SHA'))).toBe(true);expect(messages.some(m=>m.type==='resource-ready')).toBe(false);expect(p.streamStats({slot:0,wave:2})).toEqual(before);expect(p.stats().credits).toBe(2);expect(p.stats().pending).toBe(0);
 p.prepare(request(2));await finish(p,messages);expect(messages.some(m=>m.type==='resource-ready'&&m.id===2)).toBe(true);
 }finally{p.dispose();}});
it('cancels a partial upload without replacing another stream and fences stale generation/credit identities',async()=>{const{p,messages}=create();try{
 for(let slot=0;slot<2;slot++)p.open({slot,wave:2,sampleRate:192000,period:73,offset:17.3});p.prepare(request(1));p.prepare(request(2,1,1));const before=p.streamStats({slot:1,wave:2}),chunk=messages.find(m=>m.type==='chunk');expect(()=>p.echo({...chunk,generation:2})).toThrow('identity');expect(p.stats().inflight).toBe(2);
 p.cancel({id:1,generation:1});await finish(p,messages);expect(messages.some(m=>m.type==='resource-ready'&&m.id===1)).toBe(false);expect(messages.some(m=>m.type==='resource-ready'&&m.id===2)).toBe(true);expect(p.streamStats({slot:1,wave:2})).toEqual(before);expect(p.stats().credits).toBe(2);p.closeStream({slot:0,wave:2});expect(p.stats().streams).toBe(1);
 }finally{p.dispose();}});
it('bounds requests before preparation and requires each prior resource acknowledgement before edits',()=>{const{p}=create();try{
 expect(()=>p.open({slot:16,wave:0,sampleRate:48000,period:73})).toThrow('bounded');p.open({slot:0,wave:0,sampleRate:48000,period:73});p.prepare({...request(1),wave:0});const state=p.streamStats({slot:0,wave:0});expect(()=>p.prepare({...request(2),wave:0})).toThrow('busy');expect(()=>p.period({slot:0,wave:0,value:80})).toThrow('acknowledgement');expect(()=>p.closeStream({slot:0,wave:0})).toThrow('Cancel');expect(p.streamStats({slot:0,wave:0})).toEqual(state);
 }finally{p.dispose();}});


it('prepares a sine constructor without drawing Brownian state, then prepares the first walk only when actually requested',async()=>{const{p,messages}=create();try{
 p.open({slot:0,wave:2,sampleRate:48000,period:73});p.prepare({...request(1),type:'phase'});await finish(p,messages);expect(messages.find(m=>m.type==='resource').walk).toBe(null);p.commit({id:1,generation:1,count:0,birth:0});expect(p.streamStats({slot:0,wave:2}).randomDraws).toBe(0);p.period({slot:0,wave:2,value:101});p.prepare(request(2));await finish(p,messages);const r=messages.find(m=>m.type==='resource'&&m.id===2);expect(r.phase).toBe(null);expect(r.recipe.periodBefore).toBe(101);expect(r.walk.kind).toBe('first');
 }finally{p.dispose();}});
