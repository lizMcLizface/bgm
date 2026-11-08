import {MONITOR_DEFAULTS,channelsOf,stereoLevels,scopeFrame,spectrumFrame,validMonitorConfig,stereoWavBytes} from './monitorModel';

function signal({length=16384,phase=-1,rightHz=440}={}){const rate=48000,left=Float32Array.from({length},(_,i)=>.5*Math.sin(2*Math.PI*440*i/rate)),right=Float32Array.from({length},(_,i)=>phase*.5*Math.sin(2*Math.PI*rightHz*i/rate));return {rate,left,right,end:length};}
it('preserves anti-phase and one-sided signals while making Mid and Side explicit views',()=>{
 const frame=signal();expect(channelsOf(frame,0).map(c=>c.samples)).toEqual([frame.left,frame.right]);expect(Math.max(...channelsOf(frame,3)[0].samples)).toBe(0);expect(channelsOf(frame,4)[0].samples).toEqual(frame.left);expect(stereoLevels(frame).correlation).toBeCloseTo(-1,7);
 frame.right.fill(0);expect(stereoLevels(frame).right.peak).toBe(0);expect(stereoLevels(frame).correlation).toBeNull();expect(channelsOf(frame,1)[0].samples).toBe(frame.left);expect(channelsOf(frame,2)[0].samples).toBe(frame.right);
});
it('aligns both scope traces to one trigger and arms single capture only after the chosen frame boundary',()=>{
 const frame=signal(),cfg=MONITOR_DEFAULTS.scope,next=scopeFrame(frame,cfg);expect(next.channels).toHaveLength(2);expect(next.channels[0].samples.length).toBe(960);expect(next.channels[1].samples).toEqual(Float32Array.from(next.channels[0].samples,v=>-v));
 expect(scopeFrame(frame,{...cfg,mode:2},{after:frame.end,single:true})).toBeNull();const future={...frame,end:frame.end+2048};expect(scopeFrame(future,{...cfg,mode:2},{after:frame.end,single:true})).toBeTruthy();
 expect(scopeFrame(frame,{...cfg,mode:1,level:1,gain:1})).toBeNull();
});
it('finds independent stereo spectral peaks and resets held bins when their channel or FFT changes',()=>{
 const frame=signal({phase:1,rightHz:880}),cfg={...MONITOR_DEFAULTS.spectrum,smoothing:0,peakHold:true},first=spectrumFrame(frame,cfg);expect(first.channels[0].peak.hz).toBeCloseTo(440,0);expect(first.channels[1].peak.hz).toBeCloseTo(880,0);
 const silent={...frame,left:new Float32Array(frame.left.length),right:new Float32Array(frame.right.length)},held=spectrumFrame(silent,cfg,first);expect(Math.max(...held.channels[0].hold)).toBeGreaterThan(-10);expect(Math.max(...held.channels[0].bins)).toBeLessThan(-100);
 const resized=spectrumFrame(silent,{...cfg,size:1},first);expect(Math.max(...resized.channels[0].hold)).toBeLessThan(-100);const unheld=spectrumFrame(silent,{...cfg,peakHold:false},first);expect(unheld.channels[0].hold).toBeNull();
 for(const [kind,d]of Object.entries(MONITOR_DEFAULTS)){expect(validMonitorConfig(kind,d)).toBe(true);expect(validMonitorConfig(kind,{...d,view:99})).toBe(false);expect(validMonitorConfig(kind,{...d,paused:'false'})).toBe(false);}
});
it('exports the captured stereo window without cancelling anti-phase or exporting the selected Mid view',()=>{
 const data=scopeFrame(signal(),{...MONITOR_DEFAULTS.scope,view:3}),wav=new DataView(stereoWavBytes(data));expect(wav.getUint16(22,true)).toBe(2);expect(wav.getUint32(24,true)).toBe(48000);expect(wav.getUint32(40,true)).toBe(960*4);let peak=0;for(let i=44;i<wav.byteLength;i+=4){const l=wav.getInt16(i,true),r=wav.getInt16(i+2,true);expect(Math.abs(l+r)).toBeLessThanOrEqual(1);peak=Math.max(peak,Math.abs(l));}expect(peak).toBeGreaterThan(10000);
});
