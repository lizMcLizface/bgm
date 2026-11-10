import {settleLevels,pitchRange} from '../app/engine/iowaModel/model';
import {compileIowaNotes} from './iowaCompiler';
export function iowaFixture(table,id,{rate=48000,notes,voices=32,vibrato=1,tune=0}={}){
 const captured=settleLevels(structuredClone(table)),range=pitchRange(captured),midi=Math.round((range[0]+range[1])/2);
 notes??=[{midi,time:.125,duration:.6,velocity:.65},{midi:midi+1,time:.45,duration:.4,velocity:.4}];
 const source={kind:'iowa',patch:{version:1,id,table:captured,vibrato,tune}},compiled=compileIowaNotes(source,notes,rate);compiled.config.voices=voices;
 return {source,notes,patch:{version:1,modules:[{id:1,type:'legacy.iowa',version:1,parameters:{gain:1},config:compiled.config},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events:compiled.events}};
}
export function iowaReferenceMessages(f){
 const c=f.patch.modules[0].config;
 const messages=c.banks.map(s=>({store:true,key:String(s.id),spec:{...s,decay:s.kind==='decay',noise:s.noise?.length?s.noise:null,burst:s.burst.length?s.burst:null}}));
 return messages.concat(c.notes.map((n,i)=>({on:true,id:n.id,key:String(n.bank),gain:n.gain,roll:n.roll,ring:n.ring,at:f.notes[i].time,until:f.notes[i].time+f.notes[i].duration,tune:n.tune,slide:n.slide})));
}
