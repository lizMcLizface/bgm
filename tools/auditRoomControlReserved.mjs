import fs from'node:fs';import{OwnedRoomReservedControl}from'../src/modular-audio/ownedRoomReservedControl.js';
const dir='.tmp/room-control-reserved-audit',manifest=JSON.parse(fs.readFileSync(dir+'/build.json')),module=new WebAssembly.Module(fs.readFileSync(dir+'/control.wasm')),cases=[];
if(manifest.audited!==true)throw Error('Reserved audit module required');
for(const sampleRate of[8000,24000,44100,48000,96000,192000])for(const[sourceChannels,wetChannels]of[[1,1],[1,2],[2,1],[2,2]]){
 const p=new OwnedRoomReservedControl(module,{sampleRate,sourceChannels,wetChannels}),memory=p.e.memory.buffer,before=memory.byteLength;let id=0,pending=null,refused=0;
 try{
  p.sync(0);p.admitPair(0,0,0);for(const c of p.inputDry)c.fill(.01);for(const c of p.inputWet)c.fill(.02);p.e.room_control_alloc_watch(1);
  for(let q=0;q<8192;q++){
   const frame=q*128;p.sync(frame,{isolated:true});
   if(pending){p.leaf(pending.id,1,pending.value,frame/sampleRate,frame);pending=null;}
   if(q%3===0){const ticket=++id,value=(q%100)/100;p.reserveReady(ticket,value);if(q%6===0)p.cancelReady(ticket);else{p.leaf(ticket,0,value,frame/sampleRate,frame);pending={id:ticket,value};}}
   if(q%64===63)p.credits();const mode=q%13===0?0:q%13===1?1:2;p.render({dryMode:mode,wetMode:mode});
  }
  for(let i=0;i<4096;i++)if(!p.e.room_control_reserve_ready(p.handle,0,NaN))refused++;
  const counts={allocations:p.e.room_control_alloc_count(0),reallocations:p.e.room_control_alloc_count(1),frees:p.e.room_control_alloc_count(2)},stats=p.stats(),after=p.e.memory.buffer.byteLength;p.e.room_control_alloc_watch(0);
  if(Object.values(counts).some(n=>n!==0)||p.e.memory.buffer!==memory||before!==after||refused!==4096||pending||stats.pendingPairs)throw Error('Prepared reservation/render allocated, grew or lost a ticket');
  cases.push({sampleRate,sourceChannels,wetChannels,callbacks:8192,frames:1048576,refused,...counts,memoryBytesBefore:before,memoryBytesAfter:after,memoryGrowth:false,stats,checksPassed:true});
 }finally{p.e.room_control_alloc_watch(0);p.dispose();}
}
const report={kind:'room-reserved-control-allocation',version:1,manifest,cases,totalCallbacks:196608,totalFrames:25165824,checksPassed:cases.length===24&&cases.every(p=>p.checksPassed),scope:'Actual NEW private audited Wasm after prep: READY reserve/cancel, sequential cross-quantum leaves, read-only credits, audio/parameter/unpulled renders and98304invalid reservation refusals. Excludes JS/Native AP/worker allocation and physical deadlines.'};fs.mkdirSync('reports/modular_audio',{recursive:true});fs.writeFileSync('reports/modular_audio/room-reserved-control-allocation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({cases:cases.length,callbacks:report.totalCallbacks,frames:report.totalFrames,checksPassed:report.checksPassed}));
