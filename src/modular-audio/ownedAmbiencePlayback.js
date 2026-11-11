// Same-rate original stereo loop playback only; no synthesis, trim or host FX.
const maximum=Number.MAX_SAFE_INTEGER,validFrame=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=maximum;
export function validateAmbiencePlaybackResource(rate,channels){if(!Number.isInteger(rate)||rate<8000||rate>192000||!Array.isArray(channels)||channels.length!==2||channels.some(c=>!(c instanceof Float32Array))||!channels[0].length||channels[0].length!==channels[1].length||channels[0].length>rate*31||channels[0].byteLength*2>64*1024*1024||channels.some(c=>!c.every(Number.isFinite)))throw Error('Ambience loop resource bounds');return channels[0].length;}
export class OwnedAmbiencePlayback{
 constructor(moduleOrEngine,rate,channels){const frames=validateAmbiencePlaybackResource(rate,channels);this.e=moduleOrEngine instanceof WebAssembly.Module?new WebAssembly.Instance(moduleOrEngine,{}).exports:moduleOrEngine;if(this.e.ambience_play_api()!==1)throw Error('Ambience playback ABI mismatch');this.rate=rate;this.length=frames;this.handle=this.e.ambience_play_new(rate,frames);if(!this.handle)throw Error('Ambience loop resource refused');try{for(let ch=0;ch<2;ch++)new Float32Array(this.e.memory.buffer,this.e.ambience_play_upload(this.handle,ch),frames).set(channels[ch]);this.accept(this.e.ambience_play_prepare(this.handle));this.refresh();}catch(error){this.dispose();throw error;}}
 accept(ok){if(!ok)throw Error('Ambience loop operation refused');}
 alive(){if(!this.handle)throw Error('Disposed ambience loop reader');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.output=[0,1].map(ch=>new Float32Array(this.memory,this.e.ambience_play_output(this.handle,ch),128));}
 start({onset=0,offset=0,callFrame=0}={}){this.alive();if(!validFrame(onset)||!validFrame(offset)||!Number.isSafeInteger(callFrame)||callFrame<0||callFrame%128)throw Error('Invalid loop start clock');this.accept(this.e.ambience_play_start(this.handle,onset,offset,BigInt(callFrame)));}
 stop(at){this.alive();if(!validFrame(at))throw Error('Invalid loop stop clock');this.accept(this.e.ambience_play_stop(this.handle,at));}
 render(frame){this.alive();if(!Number.isSafeInteger(frame)||frame<0||frame>maximum-128||frame%128)throw Error('Loop rendering requires canonical128');if(this.memory!==this.e.memory.buffer)throw Error('Loop memory changed; refresh outside render');this.accept(this.e.ambience_play_render(this.handle,BigInt(frame)));}
 get ended(){this.alive();return this.e.ambience_play_stat(this.handle,5)!==0;}
 reset(){this.alive();this.e.ambience_play_reset(this.handle);}
 stats(){this.alive();return Object.fromEntries(['sampleRate','loopFrames','prepared','scheduled','started','ended','frame','position','renderedFrames','skippedFrames','starts','stops','onset','offset','stop'].map((key,i)=>[key,this.e.ambience_play_stat(this.handle,i)]));}
 dispose(){if(this.handle){this.e.ambience_play_free(this.handle);this.handle=0;this.output=this.memory=null;this.e=null;}}
}
