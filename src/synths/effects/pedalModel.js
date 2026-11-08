import {RACK_PARAMS} from './params';

// Beat/period controls only: decay/release lengths aren't periodic clocks.
export const TAP_TARGETS={delay:'effects.delayMs',phaser:'inserts.phaserRate',flanger:'inserts.flangerRate',chorus:'inserts.chorusRate',tremolo:'tremolo.rate',tape:'tape.wowRate',vibrato:'vibrato.rate'};
export const HIDDEN_BLENDS={phaser:'inserts.phaser',flanger:'inserts.flanger',chorus:'inserts.chorus',tremolo:'tremolo.mix',crusher:'crusher.mix',ring:'ring.mix'};
export const MAIN_KNOBS={
 vibrato:['vibrato.rate','vibrato.depth'],
 saturation:['inserts.drive'],eq:['inserts.lowGain','inserts.midGain','inserts.highGain'],
 phaser:['inserts.phaserDepth','inserts.phaserRate'],flanger:['inserts.flangerRate','inserts.flangerDepth'],chorus:['inserts.chorusRate','inserts.chorusDepth'],
 tremolo:['tremolo.depth','tremolo.rate'],ring:['ring.freq'],crusher:['crusher.bits','crusher.divide'],pitch:['pitch.semi'],
 width:['width.amount'],limiter:['limiter.ceiling'],tape:['tape.drive','tape.wow'],shimmer:['shimmer.decay','shimmer.mix'],freeze:['freeze.mix','freeze.length'],filter:['filter.low','filter.high','filter.cutoff','filter.q'],
 compressor:['compressor.threshold','compressor.ratio','compressor.makeup'],delay:['effects.delayMs','effects.feedback','effects.delay'],reverb:['effects.decay','effects.reverb','effects.damping'],
};
export const PANEL_LABELS={'inserts.phaserDepth':'Intensity','inserts.phaserRate':'Speed','inserts.lowGain':'Low','inserts.midGain':'Mid','inserts.highGain':'High','inserts.lowFreq':'Low Hz','inserts.midFreq':'Mid Hz','inserts.highFreq':'High Hz','inserts.midQ':'Mid Q','effects.delay':'Echo','effects.reverb':'Reverb','effects.damping':'Tone','compressor.makeup':'Output','inserts.saturation':'Blend','pitch.mix':'Balance','shimmer.mix':'Level','freeze.mix':'Level'};
export function createTapTracker(){
 let previous=null,intervals=[];
 return now=>{
  if(!Number.isFinite(now))return null;
  if(previous===null||now<=previous||now-previous>4000){previous=now;intervals=[];return null;}
  const interval=now-previous;if(interval<80)return null; // ignore bounce without moving the last beat
  previous=now;intervals.push(interval);intervals=intervals.slice(-4);
  const sorted=[...intervals].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
 };
}
export function tapPatch(id,interval){
 const key=TAP_TARGETS[id];if(!key||!Number.isFinite(interval)||interval<=0)return null;
 const value=RACK_PARAMS.clampValue(key,id==='delay'?Math.round(interval):1000/interval);
 return {...(id==='delay'?{'master.sync':0}:{}),[key]:value};
}
export function engagePatch(block,values){
 const patch={[block.toggle]:1},blend=HIDDEN_BLENDS[block.id];
 // Preserve real saved voicings. A zero-blend legacy patch becomes audible only
 // when the user explicitly engages it; loading never changes its sound.
 if(blend&&values[blend]===0)patch[blend]=RACK_PARAMS.BY_KEY[blend].max;
 return patch;
}
export const pedalEngaged=(block,values)=>block.on&&(!HIDDEN_BLENDS[block.id]||values[HIDDEN_BLENDS[block.id]]!==0);
