import {VOICE_COLOUR} from './voiceColour';
export function colourProbe(module,input,rate,raw={},options={}){
 const {seed=42,noiseGain=[0,0],pressure=0,chunk=2048,edits=[]}=options,e=new WebAssembly.Instance(module,{}).exports;e.engine_colour_probe_init(rate,seed);
 const set=p=>VOICE_COLOUR.forEach(([id,,,,,fallback],i)=>e.engine_colour_probe_param(i,typeof p[id]==='number'?p[id]:fallback));set(raw);e.engine_colour_probe_settle();
 const out=[new Float32Array(input[0].length),new Float32Array(input[0].length)];let at=0,next=0,currentPressure=pressure;
 while(at<input[0].length){while(next<edits.length&&edits[next].frame===at){const edit=edits[next++];if(edit.settings)set(edit.settings);if(Number.isFinite(edit.pressure))currentPressure=edit.pressure;}const count=Math.min(2048,chunk,input[0].length-at,(edits[next]?.frame??input[0].length)-at);if(count<=0)throw Error('Colour edits must be ordered and in range.');for(let ch=0;ch<2;ch++)new Float32Array(e.memory.buffer,e.engine_probe_input(ch),count).set(input[ch].subarray(at,at+count));e.engine_colour_probe_process(count,noiseGain[0],noiseGain[1],currentPressure);for(let ch=0;ch<2;ch++)out[ch].set(new Float32Array(e.memory.buffer,ch?e.engine_right():e.engine_left(),count),at);at+=count;}return out;
}
