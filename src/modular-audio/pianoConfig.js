export const PIANO_TYPES=Object.freeze(['felt','electric','grand','felted','upright']);
const range=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const fail=()=>{throw Error('Invalid prepared piano configuration');};
// Serialized finite material, never host pointers, PCM, timers or singleton state.
export function validatePianoConfig(c){
 if(![1,2].includes(c?.version)||!Number.isInteger(c.voices)||!range(c.voices,1,32)||!range(c.cutoff,0,24000)||!range(c.q,0,100)||!range(c.pitch, -2400,2400)||!range(c.pitchDecay,0,30)||!Array.isArray(c.banks)||c.banks.length>128||!Array.isArray(c.notes)||c.notes.length>2000)fail();
 if(c.version===1&&c.controls!==undefined||c.version===2&&(!Array.isArray(c.controls)||c.controls.length>4))fail();
 for(const m of c.controls??[]){if(!['pitch','filter'].includes(m.axis)||!['sine','linear'].includes(m.kind)||(!range(m.phase,0,1)||m.phase===1)||!range(m.frequency,0,44100)||!range(m.initialDepth,-24000,24000)||!range(m.targetDepth,-24000,24000)||!range(m.tauFrames,0,1440000)||!Array.isArray(m.points)||m.points.length>128||m.kind==='linear'&&(m.points.length<2||m.points[0][0]!==0||m.points.at(-1)[0]<5760000))fail();let last=-1;for(const p of m.points){if(!Array.isArray(p)||p.length!==2||!range(p[0],0,5952000)||p[0]<=last||!range(p[1],m.kind==='sine'?0:-(1.2+Number.EPSILON),m.kind==='sine'?44100:1.2+Number.EPSILON))fail();last=p[0];}}
 for(const b of c.banks){if(!range(b.frequency,10,8000)||!PIANO_TYPES.includes(b.type)||!range(b.decay,.3,5)||['brightness','hammer','unison','velocity','resonance','softness','sustain','wear'].some(k=>!range(b[k],0,1))||!Number.isInteger(b.seed)||!range(b.seed,0,0xffffffff)||PIANO_TYPES.indexOf(b.type)>=2&&b.sustain!==0)fail();}
 const ids=new Set();let points=0;
 for(const n of c.notes){if(!Number.isInteger(n.id)||!range(n.id,1,0xffffffff)||ids.has(n.id)||!Number.isInteger(n.bank)||!range(n.bank,0,c.banks.length-1)||!Number.isInteger(n.midi)||!range(n.midi,0,127)||!range(n.velocity,0,1)||!Array.isArray(n.gain)||n.gain.length<2||!Array.isArray(n.filter)||!n.filter.length)fail();ids.add(n.id);
  for(const [list,gain]of [[n.gain,true],[n.filter,false]]){let last=-1;for(const p of list){if(!Array.isArray(p)||p.length!==4||!range(p[0],gain?0:1,gain?0:2)||!Number.isInteger(p[0])||!range(p[1],0,2880000)||p[1]<last||gain&&p[1]===last||!range(p[2],gain?0:-24000,gain?1:24000)||!range(p[3],0,1440000)||p[0]===2&&p[3]<.48)fail();last=p[1];points++;}}
  if(n.gain[0][1]!==0||n.gain.at(-1)[2]!==0||n.filter[0][0]!==1||n.filter[0][1]!==0)fail();
 }if(points>65536)fail();return c;
}
