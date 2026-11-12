import fs from'node:fs';import assert from'node:assert/strict';import crypto from'node:crypto';
import{OwnedRoomReservedControl}from'../src/modular-audio/ownedRoomReservedControl.js';import{OwnedRoomControlLive}from'../src/modular-audio/ownedRoomControlLive.js';
const published=process.argv.includes('--published'),dir=published?'public/room-control-reserved':'.tmp/room-control-reserved',manifest=JSON.parse(fs.readFileSync(dir+'/build.json')),module=new WebAssembly.Module(fs.readFileSync(dir+'/control.wasm')),baseline=new WebAssembly.Module(fs.readFileSync('public/room-control-live/control.wasm')),cases=[];
for(const sampleRate of[8000,24000,44100,48000,96000,192000])for(const[sourceChannels,wetChannels]of[[1,1],[1,2],[2,1],[2,2]]){
 const config={sampleRate,sourceChannels,wetChannels},a=new OwnedRoomReservedControl(module,config),b=new OwnedRoomControlLive(baseline,config);
 try{
  a.sync(0);b.sync(0);a.admitPair(0,0,0);b.admitPair(0,0,0);
  let id=0,pending=null,compared=0,cancels=0;
  for(let q=0;q<384;q++){
   const frame=q*128;a.sync(frame);b.sync(frame);
   if(q%3===0){const value=(q%100)/100,pair=++id;a.reserveReady(pair,value);pending={pair,value};if(q%6===0){a.cancelReady(pair);pending=null;cancels++;}}
   if(pending&&q%3===1){const{pair,value}=pending;a.leaf(pair,0,value,frame/sampleRate,frame);b.reservePair(pair,value,frame);b.leaf(pair,0,value,frame/sampleRate,frame);}
   if(pending&&q%3===2){const{pair,value}=pending;a.leaf(pair,1,value,frame/sampleRate,frame);b.leaf(pair,1,value,frame/sampleRate,frame);pending=null;}
   for(let c=0;c<sourceChannels;c++)for(let i=0;i<128;i++)a.inputDry[c][i]=b.inputDry[c][i]=Math.fround(.1*Math.sin((frame+i)*.019+c*.4));
   for(let c=0;c<wetChannels;c++)for(let i=0;i<128;i++)a.inputWet[c][i]=b.inputWet[c][i]=Math.fround(.07*Math.cos((frame+i)*.027+c*.2));
   const mode=q%17===0?0:q%17===1?1:2;a.render({dryMode:mode,wetMode:mode});b.render({dryMode:mode,wetMode:mode});for(let c=0;c<a.output.length;c++){assert.deepEqual(new Uint32Array(a.output[c].buffer,a.output[c].byteOffset,128),new Uint32Array(b.output[c].buffer,b.output[c].byteOffset,128));compared+=128;}assert.equal(a.stats().commands,b.stats().commands);
  }
  assert.equal(a.stats().pendingPairs,0);assert.equal(a.stats().prepared.ready,0);assert.equal(a.stats().prepared.started,0);cases.push({...config,callbacks:384,comparedWords:compared,cancelled:cancels,differingWords:0,checksPassed:true});
 }finally{a.dispose();b.dispose();}
}
const e=new OwnedRoomReservedControl(module,{sampleRate:48000,sourceChannels:1,wetChannels:1});let checks=0;
try{
 e.sync(0);e.admitPair(0,0,0);const before=e.stats();for(let i=1;i<=16;i++)e.reserveReady(i,.7);assert.throws(()=>e.reserveReady(17,.7));assert.equal(e.stats().commands,before.commands);assert.equal(e.stats().pendingPairs,16);for(let i=1;i<=16;i++)e.cancelReady(i);assert.equal(e.stats().pendingPairs,0);assert.equal(e.stats().reservedDry,0);checks++;
 e.reserveReady(20,.7);let future=0;for(let n=0;n<256;n++){try{e.admitPair(.5,10+n/48000,10+n/48000);future++;}catch{break;}}assert.equal(future,254);e.leaf(20,0,.7,0,0);const dry=e.stats();assert.throws(()=>e.cancelReady(20));assert.equal(e.stats().commands,dry.commands);assert.equal(e.stats().reservedWet,1);e.leaf(20,1,.7,128/48000,128);assert.equal(e.stats().pendingPairs,0);checks++;
 const f=new OwnedRoomReservedControl(module,{sampleRate:48000});try{f.sync(0);const t=f.stats();for(const fn of[()=>f.reserveReady(0,.5),()=>f.reserveReady(1,NaN),()=>f.cancelReady(99)])assert.throws(fn);assert.equal(f.stats().commands,t.commands);f.reserveReady(1,-0);assert.throws(()=>f.leaf(1,0,+0,0,0));assert.equal(f.stats().commands,0);checks++;}finally{f.dispose();}
}finally{e.dispose();}
const old=fs.readFileSync('synth-engine/room-control-live/src/lib.rs','utf8').replaceAll('\r\n','\n'),next=fs.readFileSync('synth-engine/room-control-reserved/src/lib.rs','utf8').replaceAll('\r\n','\n'),body=s=>s.slice(s.indexOf(' pub fn render('),s.indexOf('\n}\n#[no_mangle]',s.indexOf(' pub fn render(')));assert.equal(body(old),body(next));
const report={kind:'room-reserved-control-private-verification',version:1,manifest,cases,boundaryChecks:checks,totalComparedWords:cases.reduce((n,c)=>n+c.comparedWords,0),renderSourceIdentical:true,renderSourceSha256:crypto.createHash('sha256').update(body(next)).digest('hex'),checksPassed:cases.every(c=>c.checksPassed)&&checks===3,scope:'Actual NEW private Rust prepared lane reservations/cancellation versus unchanged accepted gain renderer at6rates×4layouts. No browser/native/host adoption claim.'};

const {RoomReservedCore}=await import('../src/modular-audio/roomReservedCore.js'),{RoomPreparedAmountWriter}=await import('../src/modular-audio/roomPreparedAmount.js'),{roomAmountDescriptors}=await import('../src/modular-audio/roomAmountWords.js');
function coreFixture(){
 const parameters={},map=new Map(roomAmountDescriptors().map(d=>{parameters[d.name]=Float32Array.of(0);return[d.name,{setValueAtTime:v=>parameters[d.name]=Float32Array.of(v)}];}));let times=[],reads=0;
 const context={sampleRate:48000,get currentTime(){reads++;return times.shift()??0;}},events=[],writer=new RoomPreparedAmountWriter(map,context),core=new RoomReservedCore(module,{sampleRate:48000,sourceChannels:1,wetChannels:1},{emit:e=>events.push(e)});
 return{writer,core,parameters,events,reads:()=>reads,setTimes:t=>times=[...t],prepare(v){const p=writer.prepare(v);core.reserveReady(p.request.id,p.request.value);writer.ready(p.handle,{...p.request,reserved:true});return p;}};
}
let coreChecks=0;
{
 const t=coreFixture();try{
  t.core.sync(0);let p=t.prepare(0);t.writer.commit(p.handle);t.core.receive(t.parameters);t.writer.acknowledge(t.core.appliedSequence);assert.equal(t.core.unit.stats().commands,2);
  p=t.prepare(.75);const before=t.core.unit.stats();assert.equal(before.commands,2);assert.equal(before.prepared.ready,1);t.setTimes([128/48000,256/48000]);const row=t.writer.commit(p.handle);assert.equal(row.drySeconds,128/48000);
  t.core.sync(128,{isolated:true});t.core.receive(t.parameters);assert.equal(t.core.appliedSequence,2);assert.equal(t.core.pendingPrepared,true);assert.equal(t.core.unit.stats().reservedWet,1);t.core.render([new Float32Array(128).fill(1)],[new Float32Array(128).fill(1)]);assert(t.core.unit.output[0].every(v=>v===.5));
  t.core.sync(256);t.core.receive(t.parameters);assert.equal(t.core.appliedSequence,4);assert.equal(t.core.unit.stats().pendingPairs,0);t.core.render([new Float32Array(128).fill(1)],[new Float32Array(128).fill(1)]);assert(t.core.unit.output[0].every(v=>v===1.5));coreChecks++;
 }finally{t.writer.close();t.core.dispose();}
}
{
 const t=coreFixture();try{t.core.sync(0);const p=t.prepare(.7),before=t.core.unit.stats(),cancel=t.writer.beginCancel(p.handle);t.core.cancelReady(cancel.id);t.writer.finishCancel(p.handle,{...cancel,cancelled:true});assert.equal(t.core.unit.stats().commands,before.commands);assert.equal(t.core.unit.stats().pendingPairs,0);assert.equal(t.reads(),0);assert.equal(t.writer.transport.reserved,0);assert.throws(()=>t.writer.commit(p.handle));coreChecks++;}finally{t.writer.close();t.core.dispose();}
}
{
 const t=coreFixture();try{t.core.sync(0);const p=t.prepare(.8);t.writer.commit(p.handle);const key='roomAmount1_word0',packed=t.parameters[key][0],stamp=Math.floor(packed/65536)*65536;t.parameters[key]=Float32Array.of(stamp+1);assert.throws(()=>t.core.receive(t.parameters),/operation differs/);assert.equal(t.core.unit.stats().commands,1);assert.equal(t.core.unit.stats().reservedWet,1);assert(t.core.failure);coreChecks++;}finally{t.writer.close();t.core.dispose();}
}

{
 const t=coreFixture();try{
  t.core.sync(0);const p=t.prepare(.8);t.writer.commit(p.handle);const codec=new (await import('../src/modular-audio/stampedWordTransport.js')).StampedFloat64Words(),words=new Uint16Array(4);codec.encode(128/48000,words);
  for(let j=0;j<4;j++)t.parameters['roomAmount0_word'+(5+j)]=Float32Array.of(65536+words[j]);
  assert.throws(()=>t.core.receive(t.parameters),/authored call frame/);assert.equal(t.core.unit.stats().commands,0);assert.equal(t.core.unit.stats().reservedDry,1);assert.equal(t.core.unit.stats().reservedWet,1);coreChecks++;
 }finally{t.writer.close();t.core.dispose();}
}

{
 const t=coreFixture();try{t.core.sync(0);const a=t.prepare(.7),b=t.prepare(.7);t.writer.commit(a.handle);t.writer.commit(b.handle);t.core.receive(t.parameters);assert.equal(t.core.unit.stats().commands,4);assert.equal(t.core.unit.stats().pairs,2);assert.equal(t.core.appliedSequence,4);assert.equal(t.reads(),4);assert.equal(t.core.unit.stats().pendingPairs,0);coreChecks++;}finally{t.writer.close();t.core.dispose();}
}
report.artifact=published?'published':'private';report.coreChecks=coreChecks;report.checksPassed=cases.every(c=>c.checksPassed)&&checks===3&&coreChecks===5;report.scope='Actual selected reserved Rust module:6rates×4layouts exact against accepted renderer, capacity/cancel boundaries and real Rust/core+opaque main helper. No Native/browser acceptance claim.';fs.mkdirSync('reports/modular_audio',{recursive:true});fs.writeFileSync('reports/modular_audio/room-reserved-control-private-verification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({version:manifest.version,artifact:report.artifact,cases:cases.length,boundaryChecks:checks,coreChecks,totalComparedWords:report.totalComparedWords,renderSourceIdentical:true,checksPassed:report.checksPassed}));
