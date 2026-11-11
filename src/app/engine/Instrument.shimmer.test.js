import {it,expect,vi} from 'vitest';
vi.mock('../../audio/context',()=>({audioContext:{}}));
import Instrument from './Instrument.js';
function standIn(){const preset={shimmerMix:.4,shimmerDecay:6},failure=Error('Unsupported live Shimmer preset'),i=Object.create(Instrument.prototype);Object.assign(i,{preset,validateShimmerPreset:vi.fn(p=>{if(p.shimmerDecay>30)throw failure;}),shimmer:{setDecay:vi.fn()},finishMorph:vi.fn(),morph:{},set:vi.fn()});return{i,preset,failure};}
it('rejects a Shimmer edit before preset mutation, pending morph completion or parameter publication',()=>{const{i,preset,failure}=standIn();expect(()=>Instrument.prototype.set.call(i,'shimmerDecay',31)).toThrow(failure);expect(i.preset).toBe(preset);expect(i.finishMorph).not.toHaveBeenCalled();expect(i.shimmer.setDecay).not.toHaveBeenCalled();});
it('preflights a complete preset before earlier unrelated setters can touch the live chain',()=>{const{i,preset,failure}=standIn();expect(()=>i.applyPreset({masterVolume:.2,shimmerDecay:31})).toThrow(failure);expect(i.preset).toBe(preset);expect(i.set).not.toHaveBeenCalled();});

it('rejects an unsupported morph target before finishing the current morph or scheduling a timer',()=>{const{i,preset,failure}=standIn(),morph=i.morph;expect(()=>i.morphTo({shimmerDecay:31},3)).toThrow(failure);expect(i.preset).toBe(preset);expect(i.morph).toBe(morph);expect(i.finishMorph).not.toHaveBeenCalled();});
