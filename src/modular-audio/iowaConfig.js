// Immutable prepared data contract. Tables/FFT preparation stays outside render.
export const IOWA_TYPES=Object.freeze(['held','decay']);
const range=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const fail=()=>{throw Error('Invalid prepared Iowa configuration');};
const vector=(a,max=262144)=>Array.isArray(a)&&a.length<=max&&a.every(v=>typeof v==='number'&&Number.isFinite(v));
const increasing=a=>vector(a,128)&&a.length&&a[0]>=0&&a.at(-1)<=30&&a.every((v,i)=>!i||v>a[i-1]);
export function iowaFields(s){return s.kind==='held'?[[0,s.times],[1,s.tables.flat()],[2,s.envTimes],[3,s.envDb],[4,s.relTimes],[5,s.relDb],[6,s.noise],[7,s.burst]]:[[7,s.burst],[8,s.frequency.flatMap((f,i)=>[f,s.amplitude[i],s.phase[i],s.rise[i],s.early[i],s.late[i]])]];}
export function validateIowaConfig(c){
 if(c?.version!==1||!Number.isInteger(c.sampleRate)||!range(c.sampleRate,8000,192000)||c.quantumFrames!==128||!Number.isInteger(c.voices)||!range(c.voices,1,32)||!Array.isArray(c.banks)||c.banks.length>96||!Array.isArray(c.notes)||c.notes.length>2000)fail();
 let bytes=0;const bankIds=new Set();
 for(const s of c.banks){if(!Number.isInteger(s.id)||!range(s.id,1,0xffffffff)||bankIds.has(s.id)||!IOWA_TYPES.includes(s.kind))fail();bankIds.add(s.id);
  if(!vector(s.burst)||s.burst.length&&(s.burst.length&(s.burst.length-1))||s.burst.some(v=>Math.abs(v)>64))fail();
  if(s.kind==='held'){
   if(!range(s.f0,1,20000)||!range(s.rate,0,30)||!range(s.depth,0,2400)||!range(s.tremolo,0,60)||!range(s.pitchWander,0,100)||!range(s.levelWander,0,60)||!increasing(s.times)||s.times.length>32||!Array.isArray(s.tables)||s.tables.length!==s.times.length||s.tables.some(a=>!vector(a,2048)||a.length!==2048||a.some(v=>Math.abs(v)>64))||!increasing(s.envTimes)||!vector(s.envDb,128)||s.envTimes.length!==s.envDb.length||!increasing(s.relTimes)||!vector(s.relDb,128)||s.relTimes.length!==s.relDb.length||[...s.envDb,...s.relDb].some(v=>Math.abs(v)>240)||!vector(s.noise)||s.noise.length&&(s.noise.length&(s.noise.length-1))||s.noise.some(v=>Math.abs(v)>64))fail();
  }else{
   if(!range(s.seconds,.3,8)||!vector(s.frequency,128)||['amplitude','phase','rise','early','late'].some(k=>!vector(s[k],128)||s[k].length!==s.frequency.length)||s.frequency.some(v=>!range(v,0,90240))||s.amplitude.some(v=>!range(v,0,64))||s.rise.some(v=>!range(v,0,.004))||[...s.early,...s.late].some(v=>!range(v,-100000,0)))fail();
  }
  for(const [,a]of iowaFields(s)){bytes+=a.length*8;if(bytes>67108864)fail();}
 }
 const ids=new Set();for(const n of c.notes){if(!Number.isInteger(n.id)||!range(n.id,1,0xffffffff)||ids.has(n.id)||!bankIds.has(n.bank)||!Number.isInteger(n.midi)||!range(n.midi,0,127)||!range(n.velocity,0,1)||!range(n.gain,0,1024)||!range(n.tune,.0625,16)||typeof n.ring!=='boolean'||n.roll!==null&&(!range(n.roll?.rate,0.000001,100)||!range(n.roll?.level,0,60)||!range(n.roll?.timing,0,4)||c.banks.find(s=>s.id===n.bank).kind!=='decay')||n.slide!==null&&(!range(n.slide?.cents,-2400,2400)||!range(n.slide?.seconds,0.005,30)))fail();ids.add(n.id);}
 return c;
}
