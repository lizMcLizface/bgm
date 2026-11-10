// @vitest-environment node
import {it,expect,vi} from 'vitest';
import Filter from './filter';
it('captures accepted base settings while a sleeping AudioParam still reports its platform default',()=>{
 const param=value=>({value,setValueAtTime:vi.fn(),setTargetAtTime:vi.fn()}),node={frequency:param(350),Q:param(1)},f=new Filter({currentTime:0,createBiquadFilter:()=>node});
 expect(f.getFreq()).toBe(350);expect(f.getConfiguredFreq()).toBe(11000);expect(f.setFreq(15000)).toBe(false);expect(f.getConfiguredFreq()).toBe(11000);f.setFreq(1400);f.setQ(0);expect(f.getConfiguredFreq()).toBe(1400);expect(f.getConfiguredQ()).toBe(0);expect(f.getQ()).toBe(1);
});
