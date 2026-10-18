import {cloneFM,FM_RECIPES} from './fmPatch';
import {clonePatch,RECIPES} from './patch';
import {patchColourTail} from './voiceColour';
export const ACOUSTIC_SOUNDS=[['reed','FM · airy reed'],['choir-ah','FM · ah choir'],['choir-oo','FM · oo choir'],['choir-ee','FM · ee choir'],['rosin','Subtractive · rosin silk'],['wood','Subtractive · wooden pulse'],['low-strings','Subtractive · low strings']];
export function acousticConfig(raw={}){return {sound:ACOUSTIC_SOUNDS.some(([id])=>id===raw.sound)?raw.sound:'rosin',rate:[44100,48000,96000].includes(Number(raw.rate))?Number(raw.rate):48000};}
export function acousticFixture(raw={}){
 const config=acousticConfig(raw),kind=config.sound==='reed'||config.sound.startsWith('choir')?'fm':'subtractive',copy=kind==='fm'?cloneFM:clonePatch;
 const patch=copy(kind==='fm'?FM_RECIPES.find(p=>p.name===(config.sound==='reed'?'Air reed':'Air choir')):RECIPES.find(p=>p.name===(config.sound==='wood'?'Wooden pulse':'Rosin silk')));
 patch.inserts.chorus=0;patch.inserts.phaser=0;if(kind!=='fm')patch.global.chorus=0;
 const colour=kind==='fm'?patch.global:patch.layers[0];
 if(config.sound.startsWith('choir'))Object.assign(colour,{vowel:{'choir-ah':0,'choir-oo':1,'choir-ee':2}[config.sound],formantShift:0});
 if(config.sound==='low-strings')Object.assign(colour,{bodyType:1,body:.85,bodyDecay:1.5,bodyTune:0,cutoff:1800});
 const bpm=88,beat=60/bpm,bars=4,scoreSeconds=.05+bars*4*beat,notes=[],events=[];
 for(let bar=0;bar<bars;bar++){
  const chord=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]][bar],base=.05+bar*4*beat;
  if(config.sound==='reed'||config.sound==='wood'){
   [0,.75,1.75,2.5,3.25].forEach((at,i)=>notes.push({midi:chord[(bar+i)%4]+(config.sound==='reed'?12:0),time:base+at*beat,duration:(config.sound==='wood'?.23:.58)*beat,velocity:i===0?.7:.5}));
  }else (config.sound==='low-strings'?chord.slice(0,2).map(n=>n-12):chord).forEach(midi=>notes.push({midi,time:base,duration:3.65*beat,velocity:.58}));
 }
 // Isolate the texture controls: no hidden performance changes halfway through
 // a held note. Pressure can be auditioned explicitly in the live instruments.
 const release=kind==='fm'?Math.max(...patch.operators.slice(0,patch.global.operators).map(o=>o.release)):patch.layers[0].release;
 return {config,kind,patch,notes,events,bpm,bars,scoreSeconds,seconds:scoreSeconds+release+patchColourTail(patch)+.2};
}
export function acousticVariants(f){
 const copy=f.kind==='fm'?cloneFM:clonePatch,plain=copy(f.patch),air=copy(f.patch),controls=p=>f.kind==='fm'?[p.global]:p.layers;
 for(const c of controls(plain))Object.assign(c,{breath:0,bow:0,formant:0,body:0});for(const c of controls(air))Object.assign(c,{formant:0,body:0});
 const excitation=f.kind==='fm'?'With breath / air':f.config.sound==='wood'?'With friction texture':'With bow texture';
 return [{id:'plain',name:'Oscillators / operators',patch:plain},{id:'air',name:excitation,patch:air},{id:'body',name:'With vowels / body',patch:copy(f.patch)}];
}
