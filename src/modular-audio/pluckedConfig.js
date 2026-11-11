import {validatePluckedStringSpec} from './ownedPluckedString.js';
const range=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const uint=v=>Number.isInteger(v)&&v>0&&v<=0xffffffff;
const fail=()=>{throw Error('Invalid prepared plucked voice configuration');};
export function validatePluckedConfig(c){
 if(c?.version!==1||c.sampleRate!==48000||!Number.isInteger(c.voices)||!range(c.voices,1,32)||!range(c.cutoff,0,24000)||!range(c.q,0,100)||!range(c.pitch,-2400,2400)||!range(c.pitchDecay,0,30)||!Array.isArray(c.banks)||c.banks.length>128||!Array.isArray(c.notes)||c.notes.length>2000||!Array.isArray(c.controls)||c.controls.length>4)fail();
 let bytes=0;for(const b of c.banks){validatePluckedStringSpec(b);if(b.sampleRate!==48000)fail();bytes+=Math.ceil(48000*Math.min(6,Math.max(.35,b.decay*1.25)))*4;}if(bytes>67108864)fail();
 for(const m of c.controls){if(!['pitch','filter'].includes(m.axis)||!['sine','linear'].includes(m.kind)||!range(m.phase,0,1)||m.phase===1||!range(m.frequency,0,44100)||!range(m.initialDepth,-24000,24000)||!range(m.targetDepth,-24000,24000)||!range(m.tauFrames,0,1440000)||!Array.isArray(m.points)||m.points.length>128||m.kind==='linear'&&(m.points.length<2||m.points[0][0]!==0||m.points.at(-1)[0]<5760000))fail();let prior=-1;for(const p of m.points){if(!Array.isArray(p)||p.length!==2||!range(p[0],0,5952000)||p[0]<=prior||!range(p[1],m.kind==='sine'?0:-1.2-Number.EPSILON,m.kind==='sine'?44100:1.2+Number.EPSILON))fail();prior=p[0];}}
 const ids=new Set(),slots=[];let points=0;
 for(const n of c.notes){if(!uint(n.id)||ids.has(n.id)||!uint(n.owner)||!Number.isInteger(n.bank)||!range(n.bank,0,c.banks.length-1)||!Number.isInteger(n.midi)||!range(n.midi,0,127)||!range(n.velocity,0,1)||!Number.isInteger(n.voice)||!range(n.voice,0,c.voices-1)||!Number.isInteger(n.onsetFrame)||!range(n.onsetFrame,0,5760000)||!Array.isArray(n.gain)||n.gain.length<2||!Array.isArray(n.filter)||!n.filter.length)fail();ids.add(n.id);
  for(const [list,gain]of [[n.gain,true],[n.filter,false]]){let prior=-1;for(const p of list){if(!Array.isArray(p)||p.length!==4||!Number.isInteger(p[0])||!range(p[0],gain?0:1,gain?0:2)||!range(p[1],0,2880000)||p[1]<prior||gain&&p[1]===prior||!range(p[2],gain?0:-24000,gain?1:24000)||!range(p[3],0,1440000)||p[0]===2&&p[3]<.48)fail();prior=p[1];points++;}}
  if(n.gain[0][1]!==0||n.gain.at(-1)[2]!==0||n.filter[0][0]!==1||n.filter[0][1]!==0||!range(n.cutFrame,0,n.gain.at(-1)[1])||n.fadeFrame===null&&n.cutFrame!==n.gain.at(-1)[1]||n.fadeFrame!==null&&(!range(n.fadeFrame,0,n.cutFrame-480)||n.cutFrame-n.fadeFrame!==480))fail();
 }if(points>65536)fail();
 for(const n of [...c.notes].sort((a,b)=>a.onsetFrame-b.onsetFrame)){const prior=slots[n.voice];if(prior&&prior.onsetFrame+prior.cutFrame>n.onsetFrame)fail();slots[n.voice]=n;}
 return c;
}
export const savePluckedConfig=c=>JSON.stringify(validatePluckedConfig(c),null,2)+'\n';
export const loadPluckedConfig=text=>validatePluckedConfig(JSON.parse(text));
