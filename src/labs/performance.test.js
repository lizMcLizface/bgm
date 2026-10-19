import {roomPerformance} from './performance';
import {readPerformance,PERFORMANCE_KEY} from '../audio/performance';
import {defaultEffects} from '../synth-lab/effectsConfig';

afterEach(()=>localStorage.removeItem(PERFORMANCE_KEY));
it('applies the saved light room to Wasm while preserving the instrument and its tail',()=>{
 const patch={...defaultEffects(),decay:20,delay:.3,pingPong:1},before=structuredClone(patch);
 localStorage.setItem(PERFORMANCE_KEY,JSON.stringify({reverb:'light'}));
 expect(roomPerformance(patch)).toEqual({...patch,quality:0});expect(patch).toEqual(before);
 expect(readPerformance().reverb).toBe('light');
});
it('full quality respects an intentionally smaller patch network',()=>{
 expect(roomPerformance({...defaultEffects(),quality:0},{reverb:'full'}).quality).toBe(0);
 expect(roomPerformance(defaultEffects(),{reverb:'full'}).quality).toBe(1);
});
