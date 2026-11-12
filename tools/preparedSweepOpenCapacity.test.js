// @vitest-environment node
import fs from'node:fs';import{it,expect}from'vitest';
import{OwnedSweepLive}from'../src/modular-audio/ownedSweepLive.js';
const module=new WebAssembly.Module(fs.readFileSync('public/sweep-live-host/sweep.wasm'));
it.each([8000,24000,44100,48000,96000,192000])('keeps real four-lane capacity for32 current-time calls, repeated epochs and offroute callbacks at %i',rate=>{
 const core=new OwnedSweepLive(new WebAssembly.Instance(module,{}).exports,rate,{initial:false}),memory=core.memory;let lastAuthor=0,calls=0;
 try{
  core.set({lowpass:22000,highpass:10,resonance:Math.SQRT1_2},0,0,0);
  for(let callback=0;callback<512;callback++){
   // Explicit observed Native callback frames: offroute callbacks are absent,
   // then Source7a may reanchor. No filter/source age is synthesized for gaps.
   let frame=core.stat(0);if(callback&&callback%19===0){frame+=1024;core.sync(frame);}
   // A prior callback ACK may arrive before the main context time advances.
   // Two consecutive callbacks may therefore publish the SAME authored epoch.
   const author=Math.max(lastAuthor,callback%3===1?frame-128:frame);lastAuthor=author;
   expect(core.capacity(32,author)).toBe(true);
   for(let j=0;j<32;j++){core.set({lowpass:500+(callback+j)%1500,highpass:10+j,resonance:.5+j/10},j%2?.03125:0,author,author/rate);calls++;}
   const pulled=callback%7<3;if(pulled)for(let ch=0;ch<2;ch++)for(let i=0;i<128;i++)core.input[ch][i]=Math.fround(.1*Math.sin((frame+i)*(.017+ch*.003)));
   core.render(pulled?2:0,pulled);
  }
  expect(core.stats()).toMatchObject({commands:calls+1,rejected:0});expect(core.e.memory.buffer).toBe(memory);expect(core.stats().late).toBeGreaterThan(0);expect(core.stats().renderedFrames).toBeGreaterThan(0);expect(core.stats().unpulledFrames).toBeGreaterThan(0);
 }finally{core.dispose();}
});
