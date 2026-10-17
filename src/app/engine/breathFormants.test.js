import {voiceColour,formantBands,BreathFormants} from './breathFormants';
import {breathPatch,isBreathPatch} from './breathPatches';
import {sanitizePreset} from '../editor/presetStore';
test('colour parameters and resonances are bounded, preserve the dry fundamental, and serialize',()=>{
 expect(voiceColour({breathAmount:Infinity,formantAmount:2,formantShift:-30,formantVowel:'bogus'})).toEqual({breath:0,formant:1,shift:-12,vowel:'ah'});
 for(const vowel of ['ah','oo','ee'])for(const shift of [-12,0,12]){
  const bands=formantBands(voiceColour({formantVowel:vowel,formantShift:shift}),8000);expect(bands.every(b=>b.frequency>0&&b.frequency<=3200&&b.q<=9)).toBe(true);expect(bands.reduce((sum,b)=>sum+b.weight,0)).toBe(1);
 }
 expect(sanitizePreset({breathAmount:.2,formantAmount:.6,formantVowel:'oo',formantShift:3})).toEqual({breathAmount:.2,formantAmount:.6,formantVowel:'oo',formantShift:3});
});
test('targeted named winds and choirs retain earlier/Original patches and replace old noise deliberately',()=>{
 const original={gainAttack:.1,gainSustain:.7,noiseMix:.05};expect(breathPatch('Pan Flute',original,'legacy')).toBe(original);expect(breathPatch('FM Bell',original)).toBe(original);
 const next=breathPatch('Pan Flute',original);expect(next).toMatchObject({gainAttack:.1,gainSustain:.7,noiseMix:0});expect(next.breathAmount).toBeGreaterThan(0);expect(original.noiseMix).toBe(.05);expect(isBreathPatch('Dark Drone')).toBe(false);
});
test('breath sources share one deterministic buffer per context, stop future sources and disconnect',()=>{
 const sources=[],nodes=[],buffers=[];
 const param=()=>({value:0,cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn()});
 const node=()=>{const n={gain:param(),frequency:param(),Q:param(),connect:vi.fn(),disconnect:vi.fn()};nodes.push(n);return n;};
 const ctx={sampleRate:8000,currentTime:0,createGain:node,createBiquadFilter:node,createBuffer:(_n,length)=>{const data=new Float32Array(length),buffer={getChannelData:()=>data};buffers.push(buffer);return buffer;},createBufferSource:()=>{const s={connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};sources.push(s);return s;}};
 const stage=new BreathFormants(ctx),plan={duration:2,gainPoints:[[0,0],[.1,1],[2.4,0]]};
 stage.schedule({breathAmount:.2,formantAmount:.6},plan,10,440);stage.schedule({breathAmount:.2},plan,14,660);
 expect(buffers).toHaveLength(1);expect(sources[0].buffer).toBe(sources[1].buffer);const data=buffers[0].getChannelData();expect(Math.abs(data.reduce((s,n)=>s+n,0)/data.length)).toBeLessThan(1e-7);
 expect(sources[0].start).toHaveBeenCalledWith(10,expect.any(Number));stage.stop(11);expect(sources[0].stop).toHaveBeenLastCalledWith(11);expect(sources[1].stop).toHaveBeenLastCalledWith(11);
 stage.schedule({formantAmount:1},plan,14.5,440);expect(stage.output.gain.setValueAtTime).toHaveBeenLastCalledWith(2,14.5);
 stage.schedule({},plan,15,440);expect(stage.output.gain.setValueAtTime).toHaveBeenLastCalledWith(1,15);expect(sources).toHaveLength(2);expect(stage.dry.gain.setValueAtTime).toHaveBeenLastCalledWith(1,15);
 stage.destroy();expect(nodes.every(n=>n.disconnect.mock.calls.length)).toBe(true);
});
