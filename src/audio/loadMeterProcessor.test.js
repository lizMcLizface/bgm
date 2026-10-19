// @vitest-environment node
import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/load-meter-processor.js','utf8');
function processor(rate=48000){const messages=[];let Type;const scope={sampleRate:rate,currentTime:0,stamp:0,Date:{now:()=>scope.stamp},AudioWorkletProcessor:class{constructor(){this.port={postMessage:d=>messages.push(d),close:()=>{}};}},registerProcessor:(_,c)=>Type=c};vm.runInNewContext(source,scope);const p=new Type();return {p,scope,messages};}
function run(clock,{rate=48000,silent=false}={}){const a=processor(rate),input=[[new Float32Array(128).fill(silent?0:.1)]];for(let i=0;i<Math.ceil(rate/128)*3;i++){a.scope.currentTime=i*128/rate;a.scope.stamp=clock(i,rate);a.p.process(input);}return a;}
it('does not call evenly paced callbacks 100% utilization',()=>{for(const rate of [44100,48000,96000]){const {messages}=run((i,r)=>Math.floor(i*128/r*1000),{rate});expect(messages.filter(m=>'load'in m).every(m=>m.load===null)).toBe(true);}});
it('rejects coarse timestamps even if rounding creates fake zero gaps',()=>{const {messages}=run((i,r)=>Math.floor(i*128/r*1000/2)*2,{rate:96000});expect(messages.filter(m=>'load'in m).every(m=>m.load===null)).toBe(true);});
it('estimates observable bursts with short rendering and long device waits',()=>{const {messages}=run(i=>Math.floor(i/4)*11+Math.floor(i%4*.4));const loads=messages.filter(m=>'load'in m);expect(loads.length).toBeGreaterThan(0);expect(loads.every(m=>m.load!==null&&m.load<.4)).toBe(true);});
it('offers idle only after exact zero, keeping quiet audible tails awake',()=>{expect(run(i=>i*3,{silent:true}).messages.some(m=>m.idle)).toBe(true);const a=processor();for(let i=0;i<800;i++){a.scope.currentTime=i*128/48000;a.scope.stamp=i*3;a.p.process([[new Float32Array(128).fill(1e-12)]]);}expect(a.messages.some(m=>m.idle)).toBe(false);});
it('resets timing after suspend/resume and stops the processor on disposal',()=>{const {p,scope}=processor();scope.currentTime=3;p.port.onmessage({data:{type:'reset'}});expect(p.windowStart).toBe(3);expect(p.last).toBeNull();p.port.onmessage({data:{type:'dispose'}});expect(p.process([])).toBe(false);});

it('reports finite master-output levels independently of a usable load estimate',()=>{
 const {messages}=run((i,r)=>Math.floor(i*128/r*1000));const levels=messages.filter(m=>m.output);
 expect(levels.length).toBeGreaterThan(0);expect(levels[0].load).toBeNull();expect(levels[0].output.peak).toBeCloseTo(.1,6);expect(levels[0].output.rms).toBeCloseTo(.1,6);expect(levels[0].output.nonFinite).toBe(0);expect(levels[1].output.renderedFrames).toBeGreaterThan(levels[0].output.renderedFrames);
});
it('exposes nonfinite input without classifying it as idle or poisoning JSON levels',()=>{
 const a=processor(),data=new Float32Array(128).fill(.1);data[0]=NaN;
 for(let i=0;i<800;i++){a.scope.currentTime=i*128/48000;a.scope.stamp=i*3;a.p.process([[data]]);}
 const m=a.messages.find(m=>m.output);expect(m.output.nonFinite).toBeGreaterThan(0);expect(Number.isFinite(m.output.rms)).toBe(true);expect(m.idle).toBe(false);
});

it('reports a long callback pause separately from rendered silence and ignores explicit suspension',()=>{
 const a=processor(),input=[[new Float32Array(128).fill(.1)]];
 a.p.process(input);a.scope.stamp=400;a.scope.currentTime=128/48000;a.p.process(input);
 expect(a.messages.find(m=>m.callbackGap)?.callbackGap).toMatchObject({wallTime:400,ms:400,renderedFrames:256,previousAudioTime:0});
 expect(a.messages.some(m=>m.silence!==undefined)).toBe(false);
 a.p.port.onmessage({data:{type:'reset'}});a.scope.stamp=4000;a.scope.currentTime=1;a.p.process(input);
 expect(a.messages.filter(m=>m.callbackGap)).toHaveLength(1);
 a.scope.stamp=4003;a.scope.currentTime=2;a.p.process(input);
 const output=a.messages.find(m=>m.output).output;
 expect(output.wallTime).toBe(4003);expect(output.maxCallbackGapMs).toBe(3);
});
