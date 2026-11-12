// @vitest-environment node
import{it,expect}from'vitest';import fs from'node:fs';import crypto from'node:crypto';
import{OwnedInstrumentDelayLive}from'./ownedInstrumentDelayLive.js';import{planOriginalDelayTiming}from'./originalDelayTiming.js';
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n'),sha=b=>crypto.createHash('sha256').update(b).digest('hex'),instantiate=file=>new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(file)),{}).exports;
it('keeps the accepted171 source intact and mechanically reverses every timing-only fork edit',()=>{
 const root='synth-engine/instrument-delay-timing',fork=JSON.parse(read(root+'/FORK_EDITS.json'));let restored=read(root+'/src/lib.rs');
 for(const[old,next]of[...fork.edits].reverse()){expect(restored.split(next)).toHaveLength(2);restored=restored.replace(next,old);}
 expect(sha(restored)).toBe(fork.baseline);expect(restored).toBe(read('synth-engine/instrument-delay/src/lib.rs'));
});
it('pins the new kernel and unchanged880 actor/Source/route sources without replacing either accepted artifact',()=>{
 const dir='public/instrument-delay-timing-live',host=JSON.parse(read(dir+'/build.json')),kernel=JSON.parse(read(dir+'/kernel-build.json'));
 expect(host.profile).toBe('original-instrument-delay-timing-live-host-v1');expect(kernel.profile).toBe('original-instrument-delay-per-channel-timing-v1');expect(host.kernelVersion).toBe(kernel.version);
 expect(host.source).toBe(sha(host.files.map(p=>p+'\n'+read(p)).join('\n')));expect(host.wasm).toBe(sha(fs.readFileSync(dir+'/delay.wasm')));expect(host.processor).toBe(sha(read(dir+'/processor.js')));
 expect(host.files).toContain('src/nodes/instrumentDelayRust.js');expect(host.files).toContain('src/modular-audio/instrumentDelayLiveProcessor.js');expect(host.files).toContain('src/app/engine/tempoEffects.js');
 expect(host.clockVersion).toBe('7a0838a735108706');expect(host.metadataDescriptors).toBe(580);
 expect(JSON.parse(read('public/instrument-delay-live/build.json')).version).toBe('88049859d690236b');expect(JSON.parse(read('public/instrument-delay-host/kernel-build.json')).version).toBe('171ea28c2195d17b');
});
it('retains step/hold PCM for both original families, layouts and six rates while giving running stereo targets per-channel history',()=>{
 let stepWords=0,targetStereoWords=0;
 for(const rate of[8000,24000,44100,48000,96000,192000])for(const mode of['delay','ping-pong'])for(const channels of[1,2])for(const ramps of[false,true]){
  const old=new OwnedInstrumentDelayLive(instantiate('public/instrument-delay-host/delay.wasm'),rate,{mode,channels}),next=new OwnedInstrumentDelayLive(instantiate('public/instrument-delay-timing-kernel/delay.wasm'),rate,{mode,channels});
  try{for(const core of[old,next]){core.command(3,0,.5,0,0,0);core.command(4,0,1,0,0,0);core.command(5,0,.35,0,0,0);if(mode==='ping-pong')core.command(6,0,.35,0,0,0);for(const lane of mode==='delay'?[0]:[0,1,2])core.command(lane,0,.01001,0,0,0);}
   let words=0;
   for(let frame=0;frame<4096;frame+=128){for(const core of[old,next]){
     if(ramps&&[512,1280,2304].includes(frame)){const [v,t]=frame===512?[.0375,2048]:frame===1280?[.075,4096]:[.01001,3072];for(const row of planOriginalDelayTiming(mode,v,t/rate,rate))core.command(row.lane,row.op,row.value,row.tau,frame,row.seconds);}
     if(!ramps&&frame===1280)for(const lane of mode==='delay'?[0]:[0,1,2])core.command(lane,0,.0051,0,frame,frame/rate);
     for(let c=0;c<channels;c++)for(let i=0;i<128;i++)core.input[c][i]=Math.fround(Math.sin((frame+i)*(.071+c*.031))*.08);core.render();
    }
    for(let c=0;c<next.outputChannels;c++){const a=new Uint32Array(old.output[c].buffer,old.output[c].byteOffset,128),b=new Uint32Array(next.output[c].buffer,next.output[c].byteOffset,128);for(let i=0;i<128;i++)words+=a[i]!==b[i];}
   }
   if(!ramps){expect(words).toBe(0);stepWords+=4096*next.outputChannels;}else if(channels===1)expect(words).toBe(0);else targetStereoWords+=words;
   expect(next.stats()).toMatchObject({late:0,rejected:0,renderedFrames:4096});
  }finally{old.dispose();next.dispose();}
 }
 expect(stepWords).toBeGreaterThan(100000);expect(targetStereoWords).toBeGreaterThan(0);
});
