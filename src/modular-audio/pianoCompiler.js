import {gainEnvelopePoints,filterEnvelopeEvents} from '../app/engine/envelope';
import {PIANO_TYPES,validatePianoConfig} from './pianoConfig.js';
export {PIANO_TYPES,validatePianoConfig} from './pianoConfig.js';
const fail=()=>{throw Error('Invalid prepared piano source');};
export function compilePianoNotes(source,notes,rate=48000){
 const p=source.patch;if(rate!==48000||p?.version!==1||!PIANO_TYPES.includes(p.type)||!Array.isArray(p.frequencies)||p.frequencies.length!==128)fail();
 const banks=[],prepared=[],keys=new Map(),busy=Array(p.voices).fill(0);let next=0;
 for(const [i,n]of notes.entries()){
  if(!Number.isInteger(n.midi))throw Error('Piano source requires integer keys; its captured temperament supplies the pitch.');
  const frequency=p.frequencies[n.midi],b={...p.settings,type:p.type,frequency,velocity:Math.round(n.velocity*7)/7};let bank=keys.get(JSON.stringify(b));if(bank===undefined){bank=banks.length;keys.set(JSON.stringify(b),bank);banks.push(b);}
  const {points,releaseEnd}=gainEnvelopePoints(p.gainEnv,n.velocity,n.duration),start=Math.round(n.time*rate),end=start+releaseEnd*rate;
  let slot=-1;for(let k=0;k<busy.length;k++){const j=(next+k)%busy.length;if(busy[j]<=start){slot=j;break;}}
  if(slot<0)throw Error('Piano preview exceeds captured polyphony; native voice-steal fades are not ported yet.');busy[slot]=end;next=(slot+1)%busy.length;
  const offset=p.filterKeyTrack*(n.midi-60)*100+p.filterVelocity*(n.velocity-.6);
  prepared.push({id:i+1,bank,midi:n.midi,velocity:n.velocity,gain:points.map(([t,v])=>[0,t*rate,v,0]),filter:filterEnvelopeEvents(p.filterEnv,n.duration).map(e=>[e.type==='set'?1:2,e.time*rate,e.value+offset,(e.timeConstant??0)*rate])});
 }
 const config=validatePianoConfig({version:1,voices:p.voices,cutoff:p.cutoff,q:p.q,pitch:p.pitch,pitchDecay:p.pitchDecay,banks,notes:prepared});
 return {config,tail:Math.max(1,p.gainEnv.release+1)};
}
