// @vitest-environment node
import fs from 'node:fs';import {it,expect} from 'vitest';
import {OwnedPluckedVoice} from './ownedPluckedVoice';
import {compilePluckedNotes} from './pluckedCompiler';
// Independent measured AudioBufferSource ramp output, not another Rust model.
const measured=JSON.parse(fs.readFileSync('src/modular-audio/fixtures/native-pitch-cursor.json'));
const path=process.env.PLUCKED_VOICE_WASM??'public/plucked-voice/voice.wasm',module=new WebAssembly.Module(fs.readFileSync(path));
it.each(measured.results.map(r=>[r.onsetFrame,r.amount,r.decay,r]))('matches actual native cursor timing for onset%i, amount%i, decay%f', (onset,amount,decay,r)=>{
 const source={patch:{version:1,voices:1,cutoff:11000,q:0,pitch:amount,pitchDecay:decay,frequencies:Array.from({length:128},(_,m)=>440*2**((m-69)/12)),settings:{decay:5,damping:.5,position:.2,body:0,resonance:0,seed:1},gainEnv:{attack:0,decay:0,sustain:1,release:.2,hold:0,holdLevel:1,attackShape:'linear',decayShape:'linear',releaseShape:'linear'},filterEnv:{amount:0},controls:[]}},config=compilePluckedNotes(source,[{midi:69,time:onset/48000,duration:1,velocity:1}]).config,g=new OwnedPluckedVoice(new WebAssembly.Instance(module,{}).exports,config),position=()=>g.engine.plucked_voice_stat(g.handle,9),advance=frame=>{while(g.frame<frame)g.render(Math.min(2048,frame-g.frame));};
 let maxError=0;try{for(const t of r.trace){const frame=onset+t.relativeFrame;advance(frame);maxError=Math.max(maxError,Math.abs(position()-t.startPosition));advance(frame+t.frames-1);maxError=Math.max(maxError,Math.abs(position()-t.endPosition));advance(frame+t.frames);}expect(maxError).toBeLessThan(.02);}finally{g.dispose();}
});
