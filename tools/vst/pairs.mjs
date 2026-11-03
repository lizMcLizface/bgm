// Which VST stands in for which of our models, and how a VST patch becomes ours.
// A pair with `fromVst` can twin a patch exactly (Dexed is a DX7, so its voice IS an FM7 voice).
// Every other pair is compared through hand-written case files (tools/vst/cases/*.json).

const OPERATOR_MAP=[['eg_rate1','r1'],['eg_rate2','r2'],['eg_rate3','r3'],['eg_rate4','r4'],['eg_level1','l1'],['eg_level2','l2'],['eg_level3','l3'],['eg_level4','l4'],
 ['frequency_coarse','coarse'],['frequency_fine','fine'],['l_scale_depth','leftDepth'],['r_scale_depth','rightDepth'],['rate_scaling','rateScale'],
 ['amp_mode_sens','ams'],['key_velocity','velocity'],['output_level','level']];
const GLOBAL_MAP=[['feedback','feedback'],['lfo_rate','lfoSpeed'],['lfo_delay','lfoDelay'],['lfo_pm_depth','pitchModDepth'],['lfo_amp_depth','ampModDepth'],['pitch_mod_sens','pitchModSens'],
 ...[1,2,3,4].map(i=>[`pitch_eg_rate${i}`,`pitchR${i}`])];

/** Dexed readback (native units; enums as {text,norm}) → FM7 voice values. */
export function dexedToFm7(v){
 const num=x=>typeof x==='object'?x.norm:Number(x),out={};
 for(let op=1;op<=6;op++){
  for(const [a,b] of OPERATOR_MAP)out[`op${op}.${b}`]=Math.round(num(v[`op${op}_${a}`]));
  out[`op${op}.mode`]=v[`op${op}_mode`]?1:0;
  out[`op${op}.detune`]=Math.round(num(v[`op${op}_detune`]))+7;
  out[`op${op}.breakPoint`]=Math.round(v[`op${op}_breakpoint`].norm*99);
  out[`op${op}.leftCurve`]=Math.round(v[`op${op}_l_key_scale`].norm*3);
  out[`op${op}.rightCurve`]=Math.round(v[`op${op}_r_key_scale`].norm*3);
  out[`op${op}.on`]=v[`op${op}_switch`]?1:0;
 }
 for(const [a,b] of GLOBAL_MAP)out[b]=Math.round(num(v[a]));
 // Dexed shows these relative to the DX7's centre: pitch EG level 50 reads 0, transpose 24 reads 0.
 for(let i=1;i<=4;i++)out[`pitchL${i}`]=Math.round(num(v[`pitch_eg_level${i}`]))+50;
 out.algorithm=Math.round(num(v.algorithm))-1;
 out.transpose=Math.round(num(v.transpose))+24;
 out.lfoWave=Math.round(v.lfo_waveform.norm*5);
 out.lfoSync=v.lfo_key_sync?1:0;
 out.oscKeySync=v.osc_key_sync?1:0;
 out.mono=0;out.portamento=0;out.tune=0;
 return out;
}

/** The inverse: a complete FM7 voice (all keys present) → Dexed parameters in its native units. */
export function fm7ToDexed(v){
 const out={};
 for(let op=1;op<=6;op++){
  for(const [a,b] of OPERATOR_MAP)out[`op${op}_${a}`]=v[`op${op}.${b}`];
  out[`op${op}_mode`]=!!v[`op${op}.mode`];
  out[`op${op}_detune`]=v[`op${op}.detune`]-7;
  out[`op${op}_breakpoint`]={norm:v[`op${op}.breakPoint`]/99};
  out[`op${op}_l_key_scale`]={norm:v[`op${op}.leftCurve`]/3};
  out[`op${op}_r_key_scale`]={norm:v[`op${op}.rightCurve`]/3};
  out[`op${op}_switch`]=!!v[`op${op}.on`];
 }
 for(const [a,b] of GLOBAL_MAP)out[a]=v[b];
 for(let i=1;i<=4;i++)out[`pitch_eg_level${i}`]=v[`pitchL${i}`]-50;
 out.algorithm=v.algorithm+1;out.transpose=v.transpose-24;
 out.lfo_waveform={norm:v.lfoWave/5};out.lfo_key_sync=!!v.lfoSync;out.osc_key_sync=!!v.oscKeySync;
 out.mono_mode=false;out.output=1;out.cutoff=1;out.resonance=0;
 return out;
}

export const PAIRS={
 // Free-running LFO / oscillator phase would differ between any two renders, so the twin locks both to the note start.
 dx7:{plugin:'dexed',model:'dx7',fromVst:dexedToFm7,toVst:fm7ToDexed,lockPhase:{lfo_key_sync:true,osc_key_sync:true},lockOurs:{lfoSync:1,oscKeySync:1}},
 cs80:{plugin:'unstable',model:'cs80'},
 jupiter8:{plugin:'eightyeight',model:'jupiter8',alsoPlugins:['deepjupiter']},
 obxa:{plugin:'obxd',model:'obxa'},
};
