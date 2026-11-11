// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {OwnedMixerUnit} from './mixerOwned';
import {compileDeskMixer,validateMixerConfig,saveMixerConfig,loadMixerConfig} from './mixerConfig';
import {stripDefaults,masterDefaults,faderGain} from '../synths/all/mixerAudio';
const path=process.env.MIXER_OWNED_WASM??'public/modular-audio/mixer.wasm',wasm=new WebAssembly.Module(fs.readFileSync(path));
const config=(kind,parameters,sampleRate=48000,events=[])=>({version:1,kind,sampleRate,settled:true,parameters,events});
const identity=rate=>[1,0,rate/2,0,0,0,0,1];
const make=(c,e=new WebAssembly.Instance(wasm,{}).exports)=>new OwnedMixerUnit(e,c,512);
function render(g,total,{cadence=[512],input=(at,c)=>Math.fround(Math.sin(at*.131+c*.7)*.2)}={}){const out=[new Float32Array(total),new Float32Array(total)];for(let at=0,k=0;at<total;k++){const n=Math.min(cadence[k%cadence.length],total-at);for(let c=0;c<2;c++)for(let i=0;i<n;i++)g.input[c][i]=input(at+i,c);g.render(n);for(let c=0;c<2;c++)out[c].set(g.output[c].subarray(0,n),at);at+=n;}return out;}
const max=(a,b)=>a.reduce((m,v,i)=>Math.max(m,Math.abs(v-b[i])),0);

it('compiles the existing desk gain/mute/solo/filter/matrix laws without interpreting external effects as processed audio',()=>{
 const state={strips:Object.fromEntries(['lead','bass','headroom','ambience'].map(id=>[id,stripDefaults()])),master:masterDefaults()};state.strips.lead={...state.strips.lead,solo:true,pan:1,hpOn:true,hp:.5};state.master={...state.master,mono:true,dim:true};const p=compileDeskMixer(state,['lead','bass']);expect(p.strips.lead.parameters[0]).toBe(1);expect(p.strips.lead.parameters[1]).toBeCloseTo(Math.sqrt(20*600));expect(p.strips.lead.parameters[6]).toBe(1);expect(p.strips.lead.parameters[7]).toBe(1);expect(p.strips.bass.parameters[7]).toBe(0);expect(p.strips.headroom.parameters[7]).toBe(1);expect(p.strips.ambience.parameters[7]).toBe(0);expect(p.matrix.parameters).toEqual([0,0]);expect(p.fader.parameters).toEqual([.1]);expect(p.external.limiter).toMatchObject({enabled:true,kind:'host.desk-limiter'});expect(p.external.stripEffects.lead.rev).toBe(.2);expect(state.strips.bass.mute).toBe(false);
 state.strips.lead.solo=false;state.strips.headroom.solo=true;expect(compileDeskMixer(state,['lead','bass']).strips.bass.parameters[7]).toBe(1);state.strips.lead.mute=true;expect(compileDeskMixer(state,['lead','bass']).strips.lead.parameters[7]).toBe(0);
 const dry=compileDeskMixer({strips:{dry:{gain:.5}},master:{}},['dry'],{auxiliary:false,trimRoles:true});expect(dry.ids).toEqual(['dry']);expect(dry.strips.dry.parameters[0]).toBeCloseTo(10**(12/20));
});

it.each([8000,44100,48000,96000,192000])('preserves neutral stereo strips and analytic hard panning at %i Hz',rate=>{
 for(const pan of [-1,0,1]){const p=identity(rate);p[6]=pan;const g=make(config('strip',p,rate));try{const [l,r]=render(g,1024,{input:(i,c)=>c?-.125:.25});const expected=pan===-1?[.125,0]:pan===1?[0,.125]:[.25,-.125];expect(Math.abs(l.at(-1)-expected[0])).toBeLessThan(1e-7);expect(Math.abs(r.at(-1)-expected[1])).toBeLessThan(1e-7);expect(g.stats()).toMatchObject({frame:1024,applied:0,late:0,overflow:0});}finally{g.dispose();}}
});

it.each([44100,48000,96000])('matches width/mono/balance/dim algebra and native 12ms exponential target timing at %i Hz',rate=>{
 for(const width of [0,1,2]){const g=make(config('matrix',[width,0],rate));try{const out=render(g,513,{input:(i,c)=>c?-.2:.6}),d=(1+width)/2,c=(1-width)/2;expect(out[0][500]).toBeCloseTo(Math.fround(.6*d)+Math.fround(-.2*c),7);expect(out[1][500]).toBeCloseTo(Math.fround(.6*c)+Math.fround(-.2*d),7);}finally{g.dispose();}}
 const g=make(config('fader',[1],rate,[{frame:37,owner:1,parameter:0,value:.1}]));try{const [a]=render(g,Math.ceil(rate*.05),{input:()=>1});expect(a[36]).toBe(1);expect(a[37]).toBe(1);for(const at of [38,100,Math.round(rate*.03)])expect(a[at]).toBeCloseTo(.1+.9*Math.exp(-(at-37)/(.012*rate)),6);expect(g.stats().applied).toBe(1);}finally{g.dispose();}
});

it.each(['strip','matrix','fader'])('replays %s serialized automation exactly across irregular blocks, pause and reset',kind=>{
 const c=config(kind,kind==='strip'?identity(48000):kind==='matrix'?[1,0]:[1],48000,[{frame:37,owner:1,parameter:0,value:kind==='strip'?2:.4},{frame:113,owner:2,parameter:kind==='strip'?6:0,value:kind==='strip'?-.5:.8},{frame:1025,owner:1,parameter:0,value:.3}]),a=make(c),b=make(loadMixerConfig(saveMixerConfig(c)));
 try{const reference=render(a,4097),partitioned=render(b,4097,{cadence:[1,37,203,127,11]});expect(partitioned).toEqual(reference);a.reset();expect(render(a,4097,{cadence:[113]})).toEqual(reference);a.reset();render(a,37);a.pause(true);expect(render(a,511)[0].every(v=>v===0)).toBe(true);expect(a.stats().frame).toBe(37);a.pause(false);expect(render(a,127,{input:(i,c)=>Math.fround(Math.sin((i+37)*.131+c*.7)*.2)})[0]).toEqual(reference[0].slice(37,164));}finally{a.dispose();b.dispose();}
});

it('owns two units in one memory and cancels only pending updates for the requested owner',()=>{
 const e=new WebAssembly.Instance(wasm,{}).exports,c=config('fader',[1],48000,[{frame:37,owner:1,parameter:0,value:0},{frame:400,owner:2,parameter:0,value:.1}]),a=make(c,e),b=make(c,e);a.refresh();b.refresh();try{a.cancel(1);const x=render(a,800,{input:()=>1}),y=render(b,800,{input:()=>1});expect(x[0][100]).toBe(1);expect(y[0][100]).toBeLessThan(1);expect(a.stats().applied).toBe(1);expect(b.stats().applied).toBe(2);const frame=b.stats().frame;a.reset();expect(b.stats().frame).toBe(frame);a.enqueue({frame:0,owner:2,parameter:0,value:.5});render(a,1);a.enqueue({frame:0,owner:2,parameter:0,value:.5});expect(a.stats().late).toBe(1);}finally{a.dispose();b.dispose();}
});

it('keeps filter histories independent and satisfies steady-state shelf/peak gains and HP DC rejection',()=>{
 for(const [parameter,frequency]of [[3,30],[4,1000],[5,18000]]){const p=identity(48000);p[parameter]=6;const g=make(config('strip',p));try{const out=render(g,48000,{input:(i,c)=>c?0:Math.fround(Math.sin(2*Math.PI*frequency*i/48000)*.01)});expect(out[1].every(v=>v===0)).toBe(true);const expected=10**(6/20),start=24000,inputEnergy=Array.from({length:24000},(_,i)=>Math.sin(2*Math.PI*frequency*(i+start)/48000)**2*.0001).reduce((a,b)=>a+b),outputEnergy=out[0].slice(start).reduce((a,b)=>a+b*b,0);expect(Math.sqrt(outputEnergy/inputEnergy)).toBeCloseTo(expected,parameter===4?4:1);}finally{g.dispose();}}
 const p=identity(48000);p[1]=200;const g=make(config('strip',p));try{const out=render(g,24000,{input:()=>1});expect(Math.abs(out[0].at(-1))).toBeLessThan(1e-10);}finally{g.dispose();}
});

it('bounds raw and serialized inputs, reports overflow, and rejects after disposal',()=>{
 const c=config('fader',[1]);for(const edit of [c=>c.version=2,c=>c.sampleRate=0,c=>c.parameters=[5],c=>c.parameters=[NaN],c=>c.events=[{frame:.5,owner:1,parameter:0,value:0}],c=>c.events=[{frame:0,owner:0,parameter:0,value:0}]]){const bad=structuredClone(c);edit(bad);expect(()=>validateMixerConfig(bad)).toThrow();}
 const e=new WebAssembly.Instance(wasm,{}).exports;expect(e.mixer_new(99,48000,512)).toBe(0);expect(e.mixer_new(0,0,512)).toBe(0);const g=make(c,e);try{expect(e.mixer_event(g.handle,NaN,1,0,0)).not.toBe(0);for(let i=0;i<512;i++)expect(e.mixer_event(g.handle,i+1,1,0,.5)).toBe(0);expect(e.mixer_event(g.handle,1000,1,0,.5)).toBe(2);expect(g.stats().overflow).toBe(1);expect(e.mixer_render(g.handle,513)).not.toBe(0);g.cancel(0);expect(g.stats().queued).toBe(0);g.input[0][0]=NaN;g.input[1][0]=Infinity;g.render(1);expect(g.output[0][0]).toBe(0);expect(g.output[1][0]).toBe(0);}finally{g.dispose();}expect(()=>g.render(1)).toThrow('Disposed');
});
