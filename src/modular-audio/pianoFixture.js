// Small portable fixture, independent of browser/AudioContext construction.
import {compilePianoNotes} from './pianoCompiler';
export function pianoFixture(type='felted',pitch=0,voices=4,notes=[{midi:60,time:37/48000,duration:.35,velocity:.45},{midi:67,time:.15,duration:.5,velocity:.7},{midi:72,time:.4,duration:.4,velocity:.5}]){
 const source={kind:'piano',patch:{version:1,type,voices:4,cutoff:11000,q:0,pitch,pitchDecay:.07,filterKeyTrack:.4,filterVelocity:1000,frequencies:Array.from({length:128},(_,m)=>440*2**((m-69)/12)),gainEnv:{attack:.003,hold:0,holdLevel:1,decay:.1,sustain:.8,release:.3,attackShape:'exponential',decayShape:'linear',releaseShape:'exponential',attackExponent:2,decayExponent:2,releaseExponent:2},filterEnv:{attack:.01,decay:.2,release:.1,amount:1200},settings:{decay:.6,brightness:.35,hammer:.2,unison:.3,seed:109,resonance:.3,softness:0,sustain:['felt','electric'].includes(type)?.2:0,wear:0}}};
 source.patch.voices=voices;
 const {config}=compilePianoNotes(source,notes);
 return {version:1,modules:[{id:1,type:'legacy.piano',version:config.version,parameters:{gain:1},config},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events:notes.map((n,i)=>({kind:'note',target:1,owner:i===1?2:1,event:0,note:i+1,frame:Math.round(n.time*48000),a:n.midi,b:n.velocity}))};
}
export function modulatedPianoFixture(type='felted',kind='sine'){
 const p=pianoFixture(type,2);p.modules[0].version=p.modules[0].config.version=2;
 p.modules[0].config.controls=['pitch','filter'].map((axis,i)=>({axis,kind,phase:.17,frequency:.5,initialDepth:0,targetDepth:i?600:8,tauFrames:14400,points:kind==='linear'?[[0,-.3],[48000,.7],[5760000,-.4]]:[]}));return p;
}
