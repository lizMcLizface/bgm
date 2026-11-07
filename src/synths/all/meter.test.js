import {describe,it,expect,vi} from 'vitest';
import {meterLevel,createMeter} from './meter';

describe('audio meters',()=>{
 it('maps RMS amplitude to a -60 to 0 dBFS display',()=>{
  expect(meterLevel([0,0])).toBe(0);
  expect(meterLevel([-.001])).toBeCloseTo(0);
  expect(meterLevel([.1,-.1])).toBeCloseTo(2/3);
  expect(meterLevel([1.2])).toBe(1);
 });
 it('taps and disconnects only its own analyser',()=>{
  const analyser={fftSize:0,getFloatTimeDomainData:vi.fn(data=>data.fill(.1)),disconnect:vi.fn()};
  const source={connect:vi.fn(),disconnect:vi.fn()};
  const meter=createMeter({createAnalyser:()=>analyser},source);
  expect(source.connect).toHaveBeenCalledWith(analyser);
  expect(meter.read()).toBeCloseTo(2/3);
  meter.dispose();
  expect(source.disconnect).toHaveBeenCalledWith(analyser);
  expect(analyser.disconnect).toHaveBeenCalledOnce();
 });
});
