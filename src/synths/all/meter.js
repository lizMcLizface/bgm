// RMS level over the analyser's time-domain window, mapped from -60 to 0 dBFS.
export function meterLevel(samples) {
 let power=0;
 for(const sample of samples)power+=sample*sample;
 const rms=Math.sqrt(power/samples.length);
 return rms>0?Math.max(0,Math.min(1,(20*Math.log10(rms)+60)/60)):0;
}

export function createMeter(context,source) {
 const analyser=context.createAnalyser();
 analyser.fftSize=1024;
 const samples=new Float32Array(analyser.fftSize);
 source.connect(analyser);
 return {read(){analyser.getFloatTimeDomainData(samples);return meterLevel(samples);},dispose(){source.disconnect(analyser);analyser.disconnect();}};
}
