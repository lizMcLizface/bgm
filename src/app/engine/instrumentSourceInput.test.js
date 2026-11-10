import {it,expect,vi} from 'vitest';
vi.mock('../../audio/context',()=>({audioContext:{}}));
import Instrument from './Instrument';
it('keeps external source owners awake independently, then allows native effects tails to sleep',()=>{
 vi.useFakeTimers();try{
 const i=Object.create(Instrument.prototype),voice={volume:{getNode:()=>({disconnect:vi.fn()})}};
 Object.assign(i,{AC:{currentTime:10},reverb:{hear:vi.fn(),setAwake:vi.fn()},destinations:[{}],output:{connect:vi.fn(),disconnect:vi.fn()},chainAwake:false,externalSourceInputs:0,awake:[false],voices:[voice],busyUntil:[0],soundUntil:0,quietAt:Infinity,tailSeconds:()=>2});
 const a=i.holdSourceInput(),b=i.holdSourceInput();expect(i.output.connect).toHaveBeenCalledOnce();expect(i.awake).toEqual([false]);i.sleepIdle();expect(i.output.disconnect).not.toHaveBeenCalled();a();a();expect(i.externalSourceInputs).toBe(1);i.sleepIdle();expect(i.output.disconnect).not.toHaveBeenCalled();b();expect(i.soundUntil).toBe(10);i.AC.currentTime=11;i.sleepIdle();expect(i.chainAwake).toBe(true);i.AC.currentTime=13;i.sleepIdle();expect(i.chainAwake).toBe(false);expect(i.output.disconnect).toHaveBeenCalledOnce();
 }finally{vi.clearAllTimers();vi.useRealTimers();}
});
it('does not revive a disposed effects chain when a remaining external hold releases',()=>{
 const i=Object.create(Instrument.prototype);Object.assign(i,{externalSourceInputs:0,AC:{currentTime:0},wakeEffects:vi.fn(),scheduleSleep:vi.fn()});
 const release=i.holdSourceInput();i.disposed=true;release();expect(i.externalSourceInputs).toBe(0);expect(i.scheduleSleep).not.toHaveBeenCalled();expect(()=>i.holdSourceInput()).toThrow('Disposed');
});
