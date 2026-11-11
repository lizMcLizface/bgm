import {gainEnvelopePoints,filterEnvelopeEvents} from '../app/engine/envelope';
import {pluckedStringBufferSpec} from './ownedPluckedString';
import {validatePluckedConfig} from './pluckedConfig';
export function compilePluckedNotes(source,notes,rate=48000){
 const p=source.patch;if(rate!==48000||p?.version!==1||!Number.isInteger(p.voices)||p.voices<1||p.voices>32||!p.settings||typeof p.settings!=='object'||!Array.isArray(p.frequencies)||p.frequencies.length!==128||p.frequencies.some(f=>!Number.isFinite(f)||f<=0)||!Array.isArray(notes)||notes.length>2000)throw Error('Missing captured plucked voice');
 const banks=[],prepared=[],keys=new Map(),busy=Array(p.voices).fill(0),previous=Array(p.voices).fill(null);let next=0,last=-1;
 for(const [i,n]of notes.entries()){
  if(!Number.isInteger(n.midi)||n.midi<0||n.midi>127||!Number.isFinite(n.velocity)||n.velocity<0||n.velocity>1||!Number.isFinite(n.time)||n.time<0||!Number.isFinite(n.duration)||n.duration<=0||n.time+n.duration>120||n.expression!=null||n.detune!==undefined&&!Number.isFinite(n.detune)||n.owner!==undefined&&(!Number.isInteger(n.owner)||n.owner<1||n.owner>0xffffffff))throw Error('Unsupported captured plucked note/expression');
  if(n.time<last)throw Error('Plucked notes must retain native onset receive order');last=n.time;
  const frequency=p.frequencies[n.midi]*2**((n.detune??0)/1200),b=pluckedStringBufferSpec(rate,frequency,p.settings),key=JSON.stringify(b);let bank=keys.get(key);if(bank===undefined){bank=banks.length;keys.set(key,bank);banks.push(b);}
  const {points,releaseEnd}=gainEnvelopePoints(p.gainEnv,n.velocity,n.duration),onsetFrame=Math.round(n.time*rate);
  let slot=-1;for(let k=0;k<busy.length;k++){const j=(next+k)%busy.length;if(busy[j]<=n.time){slot=j;break;}}
  if(slot<0){slot=busy.indexOf(Math.min(...busy));const prior=previous[slot],cut=onsetFrame-prior.onsetFrame;if(cut<480)throw Error('Plucked same-slot steals closer than10ms are unsupported');prior.fadeFrame=cut-480;prior.cutFrame=cut;}else next=(slot+1)%busy.length;
  busy[slot]=n.time+releaseEnd;const offset=(p.filterKeyTrack??0)*(n.midi-60)*100+(p.filterVelocity??0)*(n.velocity-.6);
  const note={id:i+1,owner:n.owner??1,bank,midi:n.midi,velocity:n.velocity,voice:slot,onsetFrame,fadeFrame:null,cutFrame:releaseEnd*rate,gain:points.map(([time,value])=>[0,time*rate,value,0]),filter:filterEnvelopeEvents(p.filterEnv,n.duration).map(e=>[e.type==='set'?1:2,e.time*rate,e.value+offset,(e.timeConstant??0)*rate])};prepared.push(note);previous[slot]=note;
 }
 const controls=(p.controls??[]).map(c=>{const m={...c,tauFrames:c.tau*rate,points:c.points.map(([time,value])=>[time*rate,value])};delete m.tau;return m;});
 const config=validatePluckedConfig({version:1,sampleRate:rate,voices:p.voices,cutoff:p.cutoff,q:p.q,pitch:p.pitch??0,pitchDecay:p.pitchDecay??0,banks,notes:prepared,controls});
 return {config,events:prepared.map(n=>({kind:'note',target:1,owner:n.owner,event:0,note:n.id,frame:n.onsetFrame,a:n.midi,b:n.velocity})),tail:Math.max(1,p.gainEnv.release+1)};
}
