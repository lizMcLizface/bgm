export const INSTRUMENT_DISTORTION_PROFILE='original-instrument-distortion-captured-v1',INSTRUMENT_DISTORTION_POINTS=44100;
export class OwnedInstrumentDistortion{
 constructor(e,rate,{channels=2}={}){if(e.instrument_distortion_api?.()!==1||!Number.isInteger(rate)||rate<8000||rate>192000||![1,2].includes(channels))throw Error('Original Distortion ABI/rate/layout differs');this.e=e;this.rate=rate;this.channels=channels;this.handle=e.instrument_distortion_new(rate,channels);if(!this.handle)throw Error('Original Distortion allocation refused');this.refresh();}
 alive(){if(!this.handle)throw Error('Original Distortion disposed');}
 refresh(){this.memory=this.e.memory.buffer;this.input=[0,1].map(c=>new Float32Array(this.memory,this.e.instrument_distortion_input(this.handle,c),128));this.output=[0,1].map(c=>new Float32Array(this.memory,this.e.instrument_distortion_output(this.handle,c),128));this.wet=[0,1].map(c=>new Float32Array(this.memory,this.e.instrument_distortion_wet(this.handle,c),128));}
 curvePrepare(gain){this.alive();if(typeof gain!=='number'||!Number.isFinite(gain)||gain<0||gain>30)throw Error('Original Distortion gain must be0..30');const slot=this.e.instrument_distortion_curve_prepare(this.handle,gain);if(slot<0)throw Error('Original Distortion curve preparation/capacity refused');this.refresh();return slot;}
 curve(slot){this.alive();if(!Number.isInteger(slot)||slot<0||slot>=this.stat(7))throw Error('Unknown original Distortion curve');return new Float32Array(this.e.memory.buffer,this.e.instrument_distortion_curve(this.handle,slot),44100).slice();}
 gainEvent(lane,value,seconds){this.alive();if(!Number.isInteger(lane)||lane<0||lane>1||typeof value!=='number'||!Number.isFinite(value)||typeof seconds!=='number'||!Number.isFinite(seconds)||!this.e.instrument_distortion_event(this.handle,0,lane,seconds,value,0))throw Error('Original Distortion gain event refused');}
 curveEvent(slot,seconds){this.alive();if(!Number.isInteger(slot)||slot<0||typeof seconds!=='number'||!Number.isFinite(seconds)||!this.e.instrument_distortion_event(this.handle,1,0,seconds,0,slot))throw Error('Original Distortion curve event refused');}
 prepare(){this.alive();if(!this.e.instrument_distortion_prepare(this.handle))throw Error('Original Distortion prepare refused');this.refresh();}
 render(channels,{pulled=true}={}){this.alive();if(!Number.isInteger(channels)||![0,this.channels].includes(channels)||typeof pulled!=='boolean'||this.e.memory.buffer!==this.memory||!this.e.instrument_distortion_render(this.handle,channels,+pulled))throw Error('Original Distortion render refused');}
 reset(){this.alive();if(!this.e.instrument_distortion_reset(this.handle))throw Error('Original Distortion reset refused');}
 stat(i){this.alive();return this.e.instrument_distortion_stat(this.handle,i);}
 stats(){this.alive();return Object.fromEntries(['frame','peak','calls','renderedFrames','unpulledFrames','applied','rejected','curves','activeCurve','gain','commands','shapeZero','ready'].map((key,i)=>[key,this.stat(i)]));}
 dispose(){if(this.handle){this.e.instrument_distortion_free(this.handle);this.handle=0;this.memory=this.input=this.output=this.wet=null;}}
}
