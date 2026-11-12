import fs from'node:fs';import{OwnedRoomControlLive}from'../src/modular-audio/ownedRoomControlLive.js';
const root='.tmp/room-control-live-audit',manifest=JSON.parse(fs.readFileSync(root+'/build.json')),module=new WebAssembly.Module(fs.readFileSync(root+'/control.wasm')),cases=[];if(!manifest.audited)throw Error('Room control allocation audit requires private instrumented module');
for(const rate of[8000,24000,44100,48000,96000,192000])for(const[sourceChannels,wetChannels]of[[1,1],[1,2],[2,1],[2,2]]){
 const p=new OwnedRoomControlLive(module,{sampleRate:rate,sourceChannels,wetChannels}),memory=p.e.memory.buffer,before=memory.byteLength;let nextPair=0,pending=0,refused=0;
 try{
  p.sync(0);p.admitPair(0,0,0);for(const c of p.inputDry)c.fill(.01);for(const c of p.inputWet)c.fill(.02);p.e.room_control_alloc_watch(1);
  for(let q=0;q<8192;q++){
   const frame=q*128;p.sync(frame,{isolated:true});
   if(q%32===0){const id=++nextPair,v=(q%128)/128;p.reservePair(id,v,frame);p.leaf(id,0,v,frame/rate,frame);pending=id;}
   else if(q%32===1){const v=((q-1)%128)/128;p.leaf(pending,1,v,frame/rate,frame);pending=0;}
   if(q%64===31)p.admitPair(.7500000149011612,0,0,{dryCallFrame:frame,wetCallFrame:frame});
   const mode=q%13===0?0:q%13===1?1:2;p.render({dryMode:mode,wetMode:mode});
  }
  for(let i=0;i<4096;i++)if(!p.e.room_control_pair(p.handle,NaN,0,0,0,0))refused++;
  const counts={allocations:p.e.room_control_alloc_count(0),reallocations:p.e.room_control_alloc_count(1),frees:p.e.room_control_alloc_count(2)},stats=p.stats(),after=p.e.memory.buffer.byteLength;p.e.room_control_alloc_watch(0);
  if(Object.values(counts).some(n=>n!==0)||p.e.memory.buffer!==memory||before!==after||refused!==4096||pending||stats.pendingPairs)throw Error('Room control render/admission allocated or lost pair state');
  cases.push({rate,sourceChannels,wetChannels,callbacks:8192,frames:1048576,acceptedCommands:stats.commands,refused,...counts,memoryBytesBefore:before,memoryBytesAfter:after,memoryGrowth:false,stats,checksPassed:true});
 }finally{p.e.room_control_alloc_watch(0);p.dispose();}
}
const report={kind:'room-control-live-rust-allocation',version:1,manifest,cases,totalCallbacks:cases.reduce((n,c)=>n+c.callbacks,0),totalFrames:cases.reduce((n,c)=>n+c.frames,0),checksPassed:cases.length===24&&cases.every(c=>c.checksPassed),scope:'Actual private Wasm global allocator after preparation. Includes reserve/live dry+wet leaves, atomic complete past pairs, audio/params-only/unpulled pulls and4096invalid pair refusals per case. Excludes JS/Native AudioParam/worker/transport allocation and deadlines.'};fs.mkdirSync('reports/modular_audio',{recursive:true});fs.writeFileSync('reports/modular_audio/room-control-live-allocation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({cases:cases.length,callbacks:report.totalCallbacks,frames:report.totalFrames,checksPassed:report.checksPassed}));
