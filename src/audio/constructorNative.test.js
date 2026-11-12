// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {constructorContext} from './constructorNative.fixture.js';

import Oscillator from '../nodes/oscillator.js';
import LFO from '../nodes/lfo.js';
import Flanger from '../nodes/flanger.js';
import Chorus from '../nodes/chorus.js';
import Phaser from '../nodes/phaser.js';
import Motion from '../nodes/motion.js';
import MonoSynth from '../components/MonoSynth/MonoSynth.js';
const subjects={Oscillator,LFO,Flanger,Chorus,Phaser,Motion,MonoSynth};
const pins={"Oscillator":[25,"e3464b1944286529e45ccd5efa4c5f59c90d014cd94dad976b49e4f4bb0e408b"],"LFO":[14,"b22d19c2ee99aee83a3ce9d38f8d09cc49320bc15805a7f2843459753c1eaf89"],"Flanger":[29,"9b01a6436ceb67380e49e425e80fcd6ee0bc0c38a15548f200bcfc372dbbfeb1"],"Chorus":[86,"1dbad9a1f94d59c092bc4b8fd974a77d59d3c5214e265f55bb306afdc4e3c650"],"Phaser":[83,"4509eda05d4a632a81b248d940caf00bf3fb0683d57f4e1cbdab6dd80e072cba"],"Motion":[42,"e59b1bbad9ee3e47d592e8f71ad7ed02a21b35f2be554eeeaa2cd5d90dd8d1b1"],"MonoSynth":[239,"e9c3f4e962d6d2c8bd1432f9a2a904f9eef93372db637999a4254cd3708efe8a"]};
let oldGain,log,warn,error;
beforeEach(()=>{oldGain=globalThis.GainNode;log=vi.spyOn(console,'log').mockImplementation(()=>{});warn=vi.spyOn(console,'warn').mockImplementation(()=>{});error=vi.spyOn(console,'error').mockImplementation(()=>{});vi.useFakeTimers();});
afterEach(()=>{globalThis.GainNode=oldGain;vi.useRealTimers();log.mockRestore();warn.mockRestore();error.mockRestore();});
function scenario(name,s,c){const node=new subjects[name](s.context);if(name==='Oscillator'){node.setType('square_dc');node.setDutyCycle(.31);node.setType('organ');node.setFreq(523.25,.03,.1);node.start(.1);}if(name==='LFO'){node.setRate(3.7);node.setDepth(14);node.start();}if(name==='Flanger'){node.setAmount(.3);node.setFeedback(.2);node.setDelay(.007);node.setRate(.8);node.setDepth(.003);}if(name==='Chorus'){node.setAmount(.4);node.setRate(.9);node.setDepth(.004);node.setFeedback(.2);}if(name==='Phaser'){node.setAmount(.4);node.setFrequency(1100);node.setDepth(750);node.setFeedback(.2);node.setRate(.7);}if(name==='Motion'){node.setTremoloDepth(.7);node.setTremoloRate(3.1);node.setAutoPanDepth(.4);node.setAutoPanRate(.31);}if(name==='MonoSynth'){node.init(.01);node.setAutoResyncEnabled(false);node.setActiveVoiceCount(3);}return node;}
it.each(Object.keys(subjects))('pins healthy %s Native API creation/control order before failure-only cleanup',name=>{const s=constructorContext();globalThis.GainNode=s.GainNode;scenario(name,s);expect([s.trace.length,s.digest()]).toEqual(pins[name]);});
it.each(Object.keys(subjects))('retires every started private %s source across each Native constructor allocation/connect/start fault',async name=>{
    const baseline=constructorContext();globalThis.GainNode=baseline.GainNode;new subjects[name](baseline.context);
    for(const kind of ['create','connect','start'])for(let at=1;at<=baseline.counts[kind];at++){
        const s=constructorContext({failAt:at,failKind:kind});globalThis.GainNode=s.GainNode;let failure;
        try{new subjects[name](s.context);}catch(error){failure=error;}
        if(!failure){expect(s.active(),name+' swallowed '+kind+at).toHaveLength(0);continue;}
        expect(failure.injected,name+' '+kind+at).toBe(true);expect(failure.cleanupReady?.then,name+' cleanup '+kind+at).toBeTypeOf('function');
        await failure.cleanupReady;expect(s.active(),name+' leaked '+kind+at).toHaveLength(0);
    }
});
it('cleans all ten started MonoSynth oscillators if init model-gate allocation fails, preserving its primary error',async()=>{
    const s=constructorContext();globalThis.GainNode=s.GainNode;const voice=new MonoSynth(s.context);s.context.createGain=()=>{throw Object.assign(Error('model gate refused'),{injected:true});};let failure;try{voice.init(.01);}catch(error){failure=error;}
    expect(failure.message).toBe('model gate refused');expect(s.nodes.filter(n=>n.started)).toHaveLength(10);await failure.cleanupReady;expect(s.active()).toHaveLength(0);expect(voice.cleanupStatus().state).toBe('retired');
});
it.each(Object.keys(subjects))('has idempotent terminal %s cleanup with no source left active',async name=>{
    const s=constructorContext();globalThis.GainNode=s.GainNode;const owner=scenario(name,s),dispose=name==='MonoSynth'?()=>owner.destroy():()=>owner.dispose();const result=dispose();expect(dispose()).toBe(result);await result;expect(s.active()).toHaveLength(0);expect(owner.cleanupStatus().state).toBe('retired');
});
it('restores actual MonoSynth terminal cleanup instead of the duplicate destroy override and never rebooks a hold timer',async()=>{
    const s=constructorContext();globalThis.GainNode=s.GainNode;const voice=scenario('MonoSynth',s);voice.setAutoResyncEnabled(true);voice.isInHoldPhase=true;voice.holdPhaseEndTime=Date.now()+10000;voice.voiceId=3;voice.currentNote=60;
    voice.timeoutIds.push(setTimeout(()=>{throw Error('stale note timer');},8000));const before=vi.getTimerCount();expect(before).toBeGreaterThan(0);await voice.destroy();expect(vi.getTimerCount()).toBe(0);expect(voice.currentNote).toBeNull();expect(voice.autoResyncEnabled).toBe(false);expect(s.active()).toHaveLength(0);await vi.advanceTimersByTimeAsync(20000);expect(vi.getTimerCount()).toBe(0);
});
it.each(['Chorus','Phaser','Motion','MonoSynth'])('attempts all %s sibling owners when every disconnect throws',async name=>{
    const s=constructorContext({cleanupFailure:true});globalThis.GainNode=s.GainNode;const owner=scenario(name,s);await expect(name==='MonoSynth'?owner.destroy():owner.dispose()).rejects.toThrow('cleanup failed');expect(s.active()).toHaveLength(0);expect(owner.cleanupStatus().state).toBe('cleanup-failed');expect(owner.cleanupStatus().records.every(record=>record.attempted)).toBe(true);
});
it.each(Object.keys(subjects))('cleans explicit private %s actors after Native constructor property/automation failures',async name=>{
 const baseline=constructorContext();globalThis.GainNode=baseline.GainNode;new subjects[name](baseline.context);
 for(const kind of ['param','property'])for(let at=1;at<=baseline.counts[kind];at++){
  const s=constructorContext({failAt:at,failKind:kind});globalThis.GainNode=s.GainNode;let owner,failure;try{owner=new subjects[name](s.context);}catch(error){failure=error;}
  if(failure){expect(failure.injected).toBe(true);expect(failure.cleanupReady?.then).toBeTypeOf('function');await failure.cleanupReady;}else await(name==='MonoSynth'?owner.destroy():owner.dispose());expect(s.active(),name+' '+kind+at).toHaveLength(0);
 }
});
it('destroys300 prebooked Native strings plus the ten constructor oscillators without a new cleanup cap',async()=>{const s=constructorContext();globalThis.GainNode=s.GainNode;const voice=scenario('MonoSynth',s);let stopped=0,detached=0;for(let i=0;i<300;i++)voice.stringSources.add({source:{stop(){stopped++;},disconnect(){detached++;}}});await voice.destroy();expect(stopped).toBe(300);expect(detached).toBe(300);expect(voice.stringSources.size).toBe(0);expect(s.active()).toHaveLength(0);expect(voice.cleanupStatus().error).toBeNull();});
it('retains uncertain Native strings while still retiring all constructor actors and propagating bounded failures',async()=>{const s=constructorContext();globalThis.GainNode=s.GainNode;const voice=scenario('MonoSynth',s);let stopped=0,detached=0;for(let i=0;i<300;i++)voice.stringSources.add({source:{stop(){stopped++;throw Error('uncertain source');},disconnect(){detached++;}}});let failure;try{await voice.destroy();}catch(error){failure=error;}expect(failure.message).toContain('terminal cleanup failed');expect(stopped).toBe(300);expect(detached).toBe(300);expect(voice.stringSources.size).toBe(300);expect(s.active()).toHaveLength(0);const sources=failure.errors.find(e=>e.failureCount===300);expect(sources.errors).toHaveLength(16);expect(sources.omittedErrors).toBe(284);expect(voice.cleanupStatus().error).toContain('terminal cleanup failed');});
