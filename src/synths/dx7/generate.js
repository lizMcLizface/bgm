// FM7 voice generator: samples a new voice for a sound family from aggregate statistics of
// classic FM cartridges (suiteModel.json: how often each algorithm, ratio, level and feedback occurs
// per operator role, and envelope archetypes averaged over several voices). Nothing in the model is
// a stored voice; every result is drawn fresh. Seeded, so a seed always gives the same voice.
import MODEL from './suiteModel.json';
import {algorithmGraph} from './algorithms';

/** Small fast seeded generator (mulberry32). */
export function rng(seed){
 let a=seed>>>0;
 return ()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(v)));
const gauss=r=>{const u=Math.max(1e-9,r()),v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};

/** Draw an index (or key) from counts, blending a family's counts with the shared ones. */
function draw(r,own,all,weight){
 const keys=Array.isArray(all)?all.map((_,i)=>i):Object.keys(all);
 const w=keys.map(k=>(own?.[k]??0)*weight+(all[k]??0)+.02);
 let x=r()*w.reduce((a,b)=>a+b,0);
 for(let i=0;i<keys.length;i++){x-=w[i];if(x<=0)return keys[i];}
 return keys.at(-1);
}
const binned=(r,i,width)=>Math.min(99,i*width+r()*width);

export const FAMILIES=Object.keys(MODEL.families);

/** A new voice for a family: engine values (the DX7 voice keys) and the seed that made it. */
export function generateVoice(familyId,seed){
 const r=rng(seed),fam=MODEL.families[familyId]??MODEL.all,all=MODEL.all;
 const w=Math.min(4,40/Math.max(1,fam.voices));  // small families lean more on the shared statistics
 const pick=(key,own=fam,shared=all)=>draw(r,own[key],shared[key],w);
 const v={};
 const alg=+pick('algorithm');v.algorithm=alg;v.feedback=+pick('feedback');
 v.lfoSpeed=Math.round(binned(r,+pick('lfoSpeed'),10));v.lfoDelay=Math.round(binned(r,+pick('lfoDelay'),10));
 v.pitchModDepth=Math.round(binned(r,+pick('pitchModDepth'),10)*(r()<.5?1:0));v.ampModDepth=Math.round(binned(r,+pick('ampModDepth'),10)*(r()<.7?0:1));
 v.lfoWave=+pick('lfoWave');v.lfoSync=+pick('lfoSync');v.pitchModSens=+pick('pitchModSens');v.oscKeySync=+pick('oscKeySync');
 v.transpose=+pick('transpose');
 // pitch envelope: usually flat; an archetype (averaged) for families that sweep
 const pe=(fam.pitchEg?.length?fam.pitchEg:all.pitchEg)[Math.floor(r()*Math.max(1,(fam.pitchEg?.length||all.pitchEg.length)))];
 const flat=familyId!=='fx'||r()<.5;
 ['pitchR1','pitchR2','pitchR3','pitchR4','pitchL1','pitchL2','pitchL3','pitchL4'].forEach((k,i)=>{v[k]=flat?(i<4?99:50):clamp(pe.mean[i]+gauss(r)*pe.sd[i]*.6,0,99);});

 const {depth}=algorithmGraph(alg);
 const role=n=>depth[n]===0?'carrier':depth[n]===1?'mod':'deep';
 // one envelope archetype for all carriers (they move together), one per modulator
 const arche=roleId=>{const a=fam.roles[roleId]?.eg?.length?fam.roles[roleId].eg:all.roles[roleId].eg;return a[Math.floor(r()*a.length)];};
 const carrierEg=arche('carrier');
 let firstCarrierRatio=null,loudest=0;
 for(let n=1;n<=6;n++){
  const roleId=role(n),own=fam.roles[roleId],shared=all.roles[roleId],k=f=>`op${n}.${f}`;
  const a=roleId==='carrier'?carrierEg:arche(roleId),spread=roleId==='carrier'?.35:.6;
  ['r1','r2','r3','r4','l1','l2','l3','l4'].forEach((f,i)=>{v[k(f)]=clamp(a.mean[i]+gauss(r)*a.sd[i]*spread,0,99);});
  let [mode,coarse,fine]=draw(r,own?.ratio,shared.ratio,w).split(':').map(Number);
  if(roleId==='carrier'&&firstCarrierRatio&&r()<.45)[mode,coarse,fine]=firstCarrierRatio;  // layered carriers often share a ratio
  if(roleId==='carrier'&&!firstCarrierRatio)firstCarrierRatio=[mode,coarse,fine];
  v[k('mode')]=mode;v[k('coarse')]=coarse;v[k('fine')]=fine;
  v[k('level')]=clamp(binned(r,+draw(r,own?.level,shared.level,w),3),0,99);
  if(roleId==='carrier')loudest=Math.max(loudest,v[k('level')]);
  v[k('detune')]=+draw(r,own?.detune,shared.detune,w);v[k('velocity')]=+draw(r,own?.velocity,shared.velocity,w);
  v[k('rateScale')]=+draw(r,own?.rateScale,shared.rateScale,w);v[k('ams')]=v.ampModDepth?+draw(r,own?.ams,shared.ams,w):0;
  v[k('breakPoint')]=Math.round(binned(r,+draw(r,own?.breakPoint,shared.breakPoint,w),10));
  v[k('leftDepth')]=Math.round(binned(r,+draw(r,own?.leftDepth,shared.leftDepth,w),10)*(r()<.6?0:1));
  v[k('rightDepth')]=Math.round(binned(r,+draw(r,own?.rightDepth,shared.rightDepth,w),10)*(r()<.4?0:1));
  v[k('leftCurve')]=+draw(r,own?.leftCurve,shared.leftCurve,w);v[k('rightCurve')]=+draw(r,own?.rightCurve,shared.rightCurve,w);
 }
 // a voice needs one carrier near full level
 if(loudest<88)for(let n=1;n<=6;n++)if(role(n)==='carrier'){v[`op${n}.level`]=clamp(92+r()*7,0,99);break;}
 return v;
}
