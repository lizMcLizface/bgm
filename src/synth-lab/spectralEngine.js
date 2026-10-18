import {parameterTriples} from './patch';
import {fmPacket} from './fmPatch';
import {powerSpectrum,spectralMetrics,decimateReference} from './spectral';

// Render the same bundled DSP exports used by the worklets. The browser runs
// this offline audit in a Worker; timing is not an AudioWorklet/live CPU budget.
export function renderSpectralKernel(module,fixture,rate,quality=0,{legacyEdges=false,legacyFilters=false,legacyChorus=false}={}){
 const e=new WebAssembly.Instance(module,{}).exports,fm=fixture.kind==='fm',p=fixture.patch,names=fm?['fm_init','fm_event','fm_render']:['engine_init','engine_event','engine_render'];
 e[names[0]](rate);
 if(!fm&&legacyEdges){if(!e.engine_edge_mode)throw Error('Comparison kernel lacks the previous-edge path.');e.engine_edge_mode(0);}
 if(!fm&&(legacyFilters||legacyChorus)){if(!e.engine_tone_mode)throw Error('Comparison kernel lacks the previous tone paths.');e.engine_tone_mode(legacyFilters?0:1,legacyChorus?0:1);}
 if(fm){const packet=fmPacket({...p,global:{...p.global,quality}});for(const t of packet.globals)e.fm_param(...t);for(const t of packet.operators)e.fm_op(...t);for(const t of packet.routes)e.fm_route(...t);for(const t of packet.carriers)e.fm_carrier(...t);}
 else for(const t of parameterTriples(p))e.engine_param(...t);
 fixture.notes.forEach((note,i)=>{e[names[1]](0,i+1,Math.round(note.time*rate),note.midi,note.velocity);e[names[1]](1,i+1,Math.round((note.time+note.duration)*rate),0,0);});
 for(const event of fixture.events??[])e[names[1]](...event);
 const frames=Math.ceil(fixture.seconds*rate),channels=[new Float32Array(frames),new Float32Array(frames)];
 for(let at=0;at<frames;at+=2048){const count=Math.min(2048,frames-at);e[names[2]](count);for(let ch=0;ch<2;ch++){const pointer=fm?e.fm_output(ch):ch?e.engine_right():e.engine_left();channels[ch].set(new Float32Array(e.memory.buffer,pointer,count),at);}}
 return channels;
}
export function analyseSpectralChannels(channels,fixture,reference=null){
 const spectrum=powerSpectrum(channels[0],fixture.config.rate,{offset:Math.round(fixture.analysisStart*fixture.config.rate)});let peak=0,energy=0,nonFinite=0;
 for(const data of channels)for(const x of data){if(!Number.isFinite(x)){nonFinite++;continue;}peak=Math.max(peak,Math.abs(x));energy+=x*x;}
 if(nonFinite||energy<1e-16)throw Error('Spectral fixture is nonfinite or silent.');
 return {spectrum,metrics:{...spectralMetrics(spectrum,fixture.fundamental,reference),peak,rms:Math.sqrt(energy/(channels.length*channels[0].length)),nonFinite}};
}
export function referenceChannels(module,fixture){return renderSpectralKernel(module,fixture,fixture.config.rate*fixture.referenceFactor,fixture.kind==='fm'?2:0).map(data=>decimateReference(data,fixture.referenceFactor));}
