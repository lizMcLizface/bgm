import fs from 'node:fs';
import assert from 'node:assert/strict';
const module=new WebAssembly.Module(fs.readFileSync('.tmp/graph-allocation-target/wasm32-unknown-unknown/release/calmbgm_graph.wasm'));
const results=[];
for(const rate of [44100,48000,96000]){
 const e=new WebAssembly.Instance(module,{}).exports;
 function probe(values={}){const h=e.graph_probe_new(rate),p=new Float32Array(e.memory.buffer,e.graph_probe_params(h),10);for(const [i,v]of Object.entries(values))p[Number(i)]=v;return {h,p};}
 const a=probe({0:-20,1:4,2:0,3:.005,4:.1,8:1}),frames=Math.round(rate*.005);
 let output;
 for(let i=0;i<frames;i++)output=e.graph_probe_tick(a.h,.2,-.1,1,-1,1);
 const desired=15,expectedAttack=desired*(1-Math.exp(-frames/(rate*.005))),actualAttack=e.graph_probe_meter(a.h,2);
 assert.ok(Math.abs(actualAttack-expectedAttack)<.003,`attack ${rate}: ${actualAttack} / ${expectedAttack}`);
 assert.ok(Math.abs(e.graph_probe_output(a.h,1)/output+.5)<1e-6,'stereo gain linked');
 const releaseFrames=Math.round(rate*.1);
 for(let i=0;i<releaseFrames;i++)e.graph_probe_tick(a.h,.2,-.1,0,0,0);
 const release=e.graph_probe_meter(a.h,2);assert.ok(Math.abs(release-actualAttack*Math.exp(-releaseFrames/(rate*.1)))<.003,'missing key release');assert.equal(e.graph_probe_meter(a.h,4),1);e.graph_probe_free(a.h);
 const anti=probe({0:-20,1:4,2:0,3:.0001,8:1});for(let i=0;i<Math.round(rate*.03);i++)e.graph_probe_tick(anti.h,.2,-.1,1,-1,1);const antiReduction=e.graph_probe_meter(anti.h,2);assert.ok(Math.abs(antiReduction-15)<.003,'anti-phase key magnitude');e.graph_probe_free(anti.h);
 const knee=probe({0:-20,1:4,2:12,3:.0001,8:1});for(let i=0;i<Math.round(rate*.03);i++)e.graph_probe_tick(knee.h,.2,.1,.1,-.1,1);assert.ok(Math.abs(e.graph_probe_meter(knee.h,2)-1.125)<.003,'soft knee at threshold');e.graph_probe_free(knee.h);
 const dry=probe({6:0,8:1}),bypass=probe({9:1,8:1});for(let i=0;i<500;i++){assert.ok(Math.abs(e.graph_probe_tick(dry.h,.2,-.1,1,-1,1)-.2)<1e-8);assert.ok(Math.abs(e.graph_probe_tick(bypass.h,.2,-.1,1,-1,1)-.2)<1e-8);}e.graph_probe_free(dry.h);e.graph_probe_free(bypass.h);
 const hp=probe({0:-40,7:200,8:1,3:.0001,4:.005});for(let i=0;i<Math.round(rate*.5);i++)e.graph_probe_tick(hp.h,.2,.1,1,-1,1);assert.ok(e.graph_probe_meter(hp.h,2)<.01,'detector HP rejects settled DC');e.graph_probe_free(hp.h);
 results.push({rate,antiPhaseReductionDb:antiReduction,attackFrames:frames,attackDb:actualAttack,attackEquationDb:expectedAttack,releaseFrames,releaseDb:release,releaseEquationDb:actualAttack/Math.E,kneeDb:1.125,dryAndBypassAligned:true,latencyFrames:0,dcKeyRejected:true});
}
fs.writeFileSync('.tmp/modular-audio-m2-compressor.json',JSON.stringify({pass:true,results},null,2)+'\n');console.log('Three-rate compressor audits passed: anti-phase, knee, attack/release, missing key, zero-latency dry/bypass and detector HP.');
