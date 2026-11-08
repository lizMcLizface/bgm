import {createExtraStage} from './extras';
import {vibratoDelayDepth,VIBRATO_LATENCY} from './vibrato';

it('keeps the delay positive over the complete depth/rate range and uses rate-compensated pitch depth',()=>{
 for(const rate of [.5,1,4.5,10])for(const cents of [0,12,50]){
  const depth=vibratoDelayDepth(rate,cents);expect(depth).toBeLessThan(VIBRATO_LATENCY);expect(VIBRATO_LATENCY+depth).toBeLessThan(.03);
  expect(1200*Math.log2(1+2*Math.PI*rate*depth)).toBeCloseTo(cents,8);
 }
 expect(vibratoDelayDepth(2,12)).toBeCloseTo(2*vibratoDelayDepth(4,12));
});
it('uses one fully wet stereo delay, smooths edits, bypasses cleanly and stops/disconnects its LFO on disposal',async()=>{
 const param=()=>({value:0,setValueAtTime:vi.fn(),setTargetAtTime:vi.fn()}),nodes=[];
 const node=kind=>{const n={kind,connect:vi.fn(),disconnect:vi.fn(),gain:param(),frequency:param(),delayTime:param(),start:vi.fn(),stop:vi.fn()};nodes.push(n);return n;};
 const context={currentTime:3,createGain:()=>node('gain'),createDelay:()=>node('delay'),createOscillator:()=>node('lfo')};
 const stage=await createExtraStage(context,'vibrato'),delay=nodes.find(n=>n.kind==='delay'),lfo=nodes.find(n=>n.kind==='lfo');
 stage.patch({on:true,rate:4.5,depth:12},true);expect(delay.channelCount).toBe(2);expect(delay.delayTime.value).toBe(VIBRATO_LATENCY);expect(nodes.filter(n=>n.kind==='lfo')).toHaveLength(1);expect(lfo.start).toHaveBeenCalledOnce();
 const depth=nodes.find(n=>n.connect.mock.calls.some(([to])=>to===delay.delayTime));expect(depth.gain.setValueAtTime).toHaveBeenLastCalledWith(vibratoDelayDepth(4.5,12),3);
 stage.patch({on:true,rate:6,depth:20});expect(lfo.frequency.setTargetAtTime).toHaveBeenLastCalledWith(6,3,.02);
 stage.patch({on:false,rate:6,depth:20},true);expect(nodes.at(-2).gain.setValueAtTime).toHaveBeenLastCalledWith(1,3);expect(nodes.at(-1).gain.setValueAtTime).toHaveBeenLastCalledWith(0,3);
 stage.dispose();expect(lfo.stop).toHaveBeenCalledOnce();expect(nodes.every(n=>n.disconnect.mock.calls.length>0)).toBe(true);
});
