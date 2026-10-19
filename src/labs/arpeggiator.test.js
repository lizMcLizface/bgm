import {arpNotes,arpStep,LabArpeggiator} from './arpeggiator';
it('transposes captured intervals by a root and octaves, deduplicating and bounding the piano range',()=>{
 expect(arpNotes([60,64,67,60],{octaves:2,transpose:2,root:62,reference:60})).toEqual([64,68,71,76,80,83]);expect(arpNotes([108],{octaves:3})).toEqual([108]);
});
it('bounces without doubling endpoints and handles single keys and empty chords',()=>{
 expect(Array.from({length:8},(_,i)=>arpStep([60,64,67],i,'upDown')[0])).toEqual([60,64,67,64,60,64,67,64]);expect(arpStep([60],9,'downUp')).toEqual([60]);expect(arpStep([],0,'random')).toEqual([]);expect(arpStep([60,64],2,'chord')).toEqual([60,64]);expect(arpStep([60,64,67],3,'random',9)).toEqual(arpStep([60,64,67],3,'random',9));
});
it('uses bounded audio-clock scheduling and rebases after a delayed timer instead of replaying a backlog',()=>{
 vi.useFakeTimers();const context={currentTime:0},schedule=vi.fn(),arp=new LabArpeggiator(context,{read:()=>({notes:[60],bpm:120,rate:.25,swing:0,gate:.8,velocity:.7}),schedule});arp.start();expect(schedule).toHaveBeenCalledOnce();context.currentTime=40;arp.tick();expect(schedule).toHaveBeenCalledTimes(2);expect(schedule.mock.calls[1][1]).toBeCloseTo(40.03);arp.stop();vi.advanceTimersByTime(1000);expect(schedule).toHaveBeenCalledTimes(2);vi.useRealTimers();
});
it('fills a bounded hidden window and keeps the captured pattern continuous through throttled ticks',()=>{
 vi.useFakeTimers();const context={currentTime:0},schedule=vi.fn(),arp=new LabArpeggiator(context,{read:()=>({notes:[60,64,67],bpm:120,rate:.5,swing:0,gate:.8,velocity:.7}),schedule});
 try{arp.start();Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'));expect(schedule.mock.calls.at(-1)[1]).toBeGreaterThan(3.5);context.currentTime=1;arp.tick();const times=schedule.mock.calls.map(c=>c[1]);expect(times.at(-1)).toBeGreaterThan(4.5);for(let i=1;i<times.length;i++)expect(times[i]-times[i-1]).toBeCloseTo(.25);arp.stop();const count=schedule.mock.calls.length;document.dispatchEvent(new Event('visibilitychange'));vi.advanceTimersByTime(2000);expect(schedule).toHaveBeenCalledTimes(count);}finally{arp.stop();Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});vi.useRealTimers();}
});
it('caps future chord events instead of overflowing a worklet queue when hidden',()=>{
 vi.useFakeTimers();Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});const schedule=vi.fn(),arp=new LabArpeggiator({currentTime:0},{read:()=>({notes:Array.from({length:88},(_,i)=>i+21),mode:'chord',bpm:180,rate:.25,swing:.45,gate:1,velocity:.7}),schedule});
 try{arp.start();expect(schedule.mock.calls.length).toBeGreaterThan(0);expect(schedule.mock.calls.length).toBeLessThan(768);}finally{arp.stop();Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});vi.useRealTimers();}
});
