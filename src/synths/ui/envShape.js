// Per-patch envelope shapes for the models with ADSRs (EnvShape in
// synth-engine/classics/src/dsp.rs). Ids 180–187 shape the amplitude envelope,
// 188–195 the filter envelope. "Model" keeps the instrument's own envelope; "Custom"
// draws each stage with a bend (0 linear, + fast start like an RC circuit, − slow
// start), a tanh smoothing into an S, and optional steps.

export const SHAPE_BASE={amp:180,filter:188};
// Bends that reproduce the native envelopes: the analog attack (an RC charging
// towards 1.3, stopped at 1) and the -43 dB decay and release.
export const NATIVE_BEND={attack:1.466/10,fall:5/10};
export const STAGES=[['A','Attack'],['D','Decay'],['R','Release']];

const shapeKeys=env=>({mode:env+'Shape',bend:STAGES.map(([s])=>env+'Curve'+s),smooth:STAGES.map(([s])=>env+'Smooth'+s),steps:env+'Steps'});
export const SHAPE_KEYS={amp:shapeKeys('amp'),filter:shapeKeys('filter')};

/** Parameter rows for one envelope's shape. linearAttack: the model's attack is a straight ramp. */
export function shapeRows(env,{linearAttack=false}={}){
 const id=SHAPE_BASE[env],k=SHAPE_KEYS[env];
 const bends=[linearAttack?0:NATIVE_BEND.attack,NATIVE_BEND.fall,NATIVE_BEND.fall];
 return [
  [k.mode,id,'Shape',0,1,0,'','step',['Model','Custom']],
  ...STAGES.map(([,name],i)=>[k.bend[i],id+1+i,name+' bend',-1,1,+bends[i].toFixed(4),'bi','lin']),
  ...STAGES.map(([,name],i)=>[k.smooth[i],id+4+i,name+' smooth',0,1,0,'%','lin']),
  [k.steps,id+7,'Steps',0,16,0,'n','step'],
 ];
}

const sCurve=(x,k)=>k<1e-3?x:.5+.5*Math.tanh(k*(2*x-1))/Math.tanh(k);
/** One stage's progress curve (0..1 → 0..1); mirrors stage_curve in dsp.rs. */
export function stageCurve(x,bend,smooth,steps){
 const k=bend*10;
 const bent=x=>Math.abs(k)<1e-3?x:(1-Math.exp(-k*x))/(1-Math.exp(-k));
 if(steps>=2){
  const g=bent(x)*steps,i=Math.min(Math.floor(g),steps-1),u=g-i;
  const ramp=smooth>=1?u:sCurve(u,1+24*(1-smooth)**2);
  return Math.min(1,Math.max(0,(i+ramp)/steps));
 }
 return bent(sCurve(x,4*smooth));
}

/** The curves a patch plays: its own when Custom, otherwise the model's defaults. */
export function activeShape(values,env,BY_KEY){
 const k=SHAPE_KEYS[env],custom=values[k.mode]>=.5;
 const pick=key=>custom?values[key]:BY_KEY[key].default;
 return {custom,bend:k.bend.map(pick),smooth:k.smooth.map(pick),steps:custom?Math.round(values[k.steps]):0};
}

/**
 * Envelope outline in a 0..1 box: attack, decay, a held sustain, release. Each stage
 * gets an equal slot so the shapes stay readable whatever the times are.
 */
export function envelopePoints(shape,sustain,n=48){
 const pts=[],slot=.25,hold=.25;
 const stage=(i,x0,from,to)=>{for(let j=0;j<=n;j++){const x=j/n;pts.push([x0+x*slot,from+(to-from)*stageCurve(x,shape.bend[i],shape.smooth[i],shape.steps)]);}};
 stage(0,0,0,1);
 stage(1,slot,1,sustain);
 pts.push([2*slot+hold,sustain]);
 stage(2,2*slot+hold,sustain,0);
 return pts;
}
