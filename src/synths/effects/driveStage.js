import {DRIVE_PEDALS,clippingCurve,toneHz} from './driveModel';

export function createDriveStage(context,kind,{oversample='4x'}={}){
 const nodes=[],make=(method)=>{const n=context[method]();nodes.push(n);return n;},input=make('createGain'),dry=make('createGain'),wet=make('createGain'),output=make('createGain'),drive=make('createGain');
 input.connect(dry);dry.connect(output);wet.connect(output);
 let tone;
 if(kind==='boost'){input.connect(drive);drive.connect(wet);}
 else{
  const hp=make('createBiquadFilter'),shape=make('createWaveShaper'),dc=make('createBiquadFilter');tone=make('createBiquadFilter');
  // Web Audio low/high-pass Q is in dB: 20 log10(1/sqrt(2))
  // gives a flat Butterworth response rather than a resonant output bump.
  const butterworth=-3.01029995664;
  hp.type='highpass';hp.frequency.value=kind==='overdrive'?180:35;hp.Q.value=butterworth;
  shape.curve=clippingCurve(kind);shape.oversample=oversample;
  dc.type='highpass';dc.frequency.value=20;dc.Q.value=butterworth;tone.type='lowpass';tone.Q.value=butterworth;
  input.connect(hp);hp.connect(drive);drive.connect(shape);shape.connect(dc);dc.connect(tone);tone.connect(wet);
 }
 const split=context.createChannelSplitter(2);nodes.push(split);output.connect(split);
 const meters=[0,1].map(ch=>{const meter=make('createAnalyser');meter.fftSize=256;split.connect(meter,ch);return meter;}),samples=new Float32Array(256);let disposed=false;
 return {input,output,patch(instance,initial=false){
  const p=DRIVE_PEDALS[kind].params.sanitize(instance.params),set=(param,v)=>{if(initial)param.setValueAtTime(v,context.currentTime);else param.setTargetAtTime(v,context.currentTime,.02);};
  set(dry.gain,instance.enabled?0:1);set(wet.gain,instance.enabled?10**((p.level??0)/20):0);set(drive.gain,10**((p.gain??p.drive)/20));
  if(tone)set(tone.frequency,Math.min(context.sampleRate*.45,toneHz(kind,p.tone)));
 },get peak(){let peak=0;for(const meter of meters){meter.getFloatTimeDomainData(samples);for(const s of samples)peak=Math.max(peak,Math.abs(s));}return peak;},dispose(){if(disposed)return;disposed=true;nodes.forEach(n=>n.disconnect());}};
}
