// @vitest-environment node
import fs from 'node:fs';
import vm from 'node:vm';
function limiter(rate){let Processor;vm.runInNewContext(fs.readFileSync('public/desk-limiter-processor.js','utf8'),{sampleRate:rate,Float32Array,AudioWorkletProcessor:class{constructor(){this.port={};}},registerProcessor:(_,p)=>{Processor=p;}});return new Processor();}
it.each([44100,48000,96000])('links stereo peaks, bounds impulses, and bypasses at fixed latency at %s Hz',rate=>{
 const p=limiter(rate),n=5000,l=new Float32Array(n),r=new Float32Array(n);l.fill(.1);r.fill(.05);l[100]=4;r[300]=-3;
 p.port.onmessage({data:{ceiling:.5,enabled:true}});
 const render=(source)=>{const out=[new Float32Array(n),new Float32Array(n)];p.process([source],[out]);return out;};
 const out=render([l,r]);expect(out.every(ch=>ch.every(Number.isFinite))).toBe(true);expect(Math.max(...out.flatMap(ch=>Array.from(ch,Math.abs)))).toBeLessThanOrEqual(.5);
 expect(out[0].slice(0,p.length).every(x=>x===0)).toBe(true);expect(out[0][p.length+100]).toBe(.5);
 expect(out[0][p.length+300]/out[1][p.length+300]).toBeCloseTo(-.1/3,5);
 p.port.onmessage({data:{enabled:false}});for(let i=0;i<20;i++)render([l,r]);const bypass=render([l,r]);expect(bypass[0][p.length+100]).toBeCloseTo(4,3);
 p.port.onmessage({data:{dispose:true}});expect(p.process([[]],[[new Float32Array(128),new Float32Array(128)]])).toBe(false);
});
