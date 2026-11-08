// @vitest-environment node
import {SYNTHS} from '../models';
import {POLY,FM} from '../diy/patches';
import {cleanRack,rackForPatch,rackPackets,splitRackEdits,spaceUnitsUsed,rackPlayedKeys,instrumentSpecKeys} from './params';

test('moving the DIY effects to a common rack preserves all 22 native recipe packets',()=>{
 for(const [id,schema]of [['poly',POLY],['fm',FM]])for(const preset of schema.presets){
  const original=schema.inflate(preset.values),rack=rackForPatch(SYNTHS[id],preset.values,cleanRack()),packet=rackPackets(rack);
  expect(packet.effects).toEqual(original.effects);expect(packet.inserts).toEqual(original.inserts);
  expect(packet.compressor.enabled).toBe(0);expect(packet.master).toEqual({enabled:1,input:0,output:0,order:0,chain:127,sync:0,mix:1,reverbFirst:0,routing:0,boxOrder:0,boxChain:0});
  if(id==='poly')expect(rack['instrument.global.chorus']).toBe(original.global.chorus);
 }
});

test('vintage and drum presets gain neutral outboard without overwriting their own space effects',()=>{
 for(const synth of Object.values(SYNTHS).filter(s=>Number.isInteger(s.model))){
  const preset=synth.presets[0],rack=rackForPatch(synth,preset.values,cleanRack());
  expect(rack['effects.reverb']).toBe(0);expect(rack['effects.delay']).toBe(0);expect(rack['compressor.enabled']).toBe(0);
  expect(rack['instrument.reverbMix']).toBe(preset.values.reverbMix);
  expect(preset.values).toEqual(synth.params.sanitize(preset.values));
 }
});

test('block switches bypass processing without losing custom settings',()=>{
 const settings={...cleanRack(),'inserts.phaser':.42,'inserts.lowGain':3,'inserts.highGain':-2,'effects.reverb':.4,'effects.delayToReverb':.3,'switch.phaser':0,'switch.eq':0,'switch.reverb':0};
 const off=rackPackets(settings);expect(off.inserts.phaser).toBe(0);expect(off.inserts.lowGain).toBe(0);expect(off.effects.reverb).toBe(0);expect(off.effects.delayToReverb).toBe(0);
 const on=rackPackets({...settings,'switch.phaser':1,'switch.eq':1,'switch.reverb':1});expect(on.inserts.phaser).toBe(.42);expect(on.inserts.lowGain).toBe(3);expect(on.inserts.highGain).toBe(-2);expect(on.effects.reverb).toBe(.4);expect(on.effects.delayToReverb).toBe(.3);
});

test('controller edits reach the proper native schema and reject unknown, non-finite and out-of-range values',()=>{
 const changes={'effects.reverb':.35,'instrument.reverbMix':.4,'compressor.threshold':-900,'instrument.cutoff':700,'bogus':1,'master.output':Infinity};
 expect(splitRackEdits(SYNTHS.juno,changes)).toEqual({native:{reverbMix:.4},extra:{'effects.reverb':.35,'compressor.threshold':-100}});
 expect(splitRackEdits(SYNTHS.poly,{...changes,'instrument.global.chorus':.6})).toEqual({native:{'effects.reverb':.35,'global.chorus':.6},extra:{'compressor.threshold':-100}});
});

test('the wavetable synthesizer has no space of its own: its reverb and chorus are the rack\'s, and an unused chorus brings no unit',()=>{
 const synth=SYNTHS.wt,moved={moved:true};
 const values=synth.params.sanitize({reverbMix:.3,reverbDecay:6,reverbTone:5000,reverbSize:.7,reverbPredelay:.03,chorusMix:.5,chorusRate:.4,chorusDepth:.5});
 const rack=rackForPatch(synth,values,cleanRack(),moved);
 expect(rack['effects.reverb']).toBeCloseTo(.3);expect(rack['effects.decay']).toBeCloseTo(6);expect(rack['effects.predelay']).toBeCloseTo(30);
 expect(rack['inserts.chorus']).toBeCloseTo(.4);expect(rack['inserts.chorusRate']).toBeCloseTo(.4);expect(rack['inserts.chorusDepth']).toBeCloseTo(4);
 expect(Object.keys(rack).some(k=>k.startsWith('instrument.'))).toBe(false);
 expect(spaceUnitsUsed(synth,values).sort()).toEqual(['chorus','space']);
 expect(spaceUnitsUsed(synth,{...values,chorusMix:0})).toEqual(['space']);
 expect(rackPlayedKeys(synth)).toEqual(['reverbMix','chorusMix']);
 // an edit of the rack's chorus or reverb goes back to the sound's own values
 const back=splitRackEdits(synth,{'inserts.chorus':.8,'inserts.chorusDepth':8,'effects.reverb':.5},moved);
 expect(back.native.chorusMix).toBeCloseTo(1);expect(back.native.chorusDepth).toBeCloseTo(1);expect(back.native.reverbMix).toBeCloseTo(.5);
 // and the engine plays neither
 const pairs=Object.fromEntries(synth.params.toEnginePairs(values));
 expect(pairs[synth.params.BY_KEY.reverbMix.id]).toBe(0);expect(pairs[synth.params.BY_KEY.chorusMix.id]).toBe(0);
 expect(synth.instrumentSpecs?.length??0).toBe(0);
 expect(instrumentSpecKeys(synth)).toEqual([]);
});
