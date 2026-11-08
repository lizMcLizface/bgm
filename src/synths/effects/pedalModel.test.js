import {createTapTracker,tapPatch,engagePatch,TAP_TARGETS,HIDDEN_BLENDS} from './pedalModel';
import {cleanRack,RACK_PARAMS} from './params';
it('measures repeated taps, rejects bounce, smooths outliers and resets after a pause',()=>{
 const tap=createTapTracker();expect(tap(1000)).toBeNull();expect(tap(1500)).toBe(500);expect(tap(1510)).toBeNull();expect(tap(2010)).toBe(505);expect(tap(3000)).toBe(510);expect(tap(3500)).toBe(505);
 expect(tap(9000)).toBeNull();expect(tap(9500)).toBe(500);expect(tap(NaN)).toBeNull();expect(tap(9000)).toBeNull();
});
it('taps the local delay/rate without changing the shared clock and respects real DSP limits',()=>{
 expect(tapPatch('delay',500)).toEqual({'effects.delayMs':500,'master.sync':0});
 for(const [id,key]of Object.entries(TAP_TARGETS)){const p=tapPatch(id,500);expect(p[key]).toBe(id==='delay'?500:Math.min(2,RACK_PARAMS.BY_KEY[key].max));expect(p['master.tempo']).toBeUndefined();}
 expect(tapPatch('delay',3500)['effects.delayMs']).toBe(2000);expect(tapPatch('tape',90)['tape.wowRate']).toBe(3);expect(tapPatch('reverb',500)).toBeNull();expect(tapPatch('delay',0)).toBeNull();
});
it('gives explicitly engaged zero-blend pedals a voice while preserving nonzero stored blends',()=>{
 const v=cleanRack();for(const [id,key]of Object.entries(HIDDEN_BLENDS)){const block={id,toggle:'switch.'+id};expect(engagePatch(block,{...v,[key]:0})[key]).toBeGreaterThan(0);expect(engagePatch(block,{...v,[key]:.23})).toEqual({['switch.'+id]:1});}
 expect(engagePatch({id:'saturation',toggle:'switch.saturation'},v)).toEqual({'switch.saturation':1});
});
