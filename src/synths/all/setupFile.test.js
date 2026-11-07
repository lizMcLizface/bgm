import {describe,it,expect} from 'vitest';
vi.mock('./host',()=>({
 SEQUENCERS:['lead','counter','rhythm','pad','bass','perc'].map(role=>({role})),
 synthChoices:()=>[{id:'calmbgm'}],drumChoices:()=>[{id:'scene'}],
}));
import {BROWSABLE_SCENES} from '../../app/scenes';
import {makeKey} from '../../seq/harmony';
import {cleanRack} from '../effects/params';
import {SEQUENCERS} from './host';
import {encodeSetup,decodeSetup,MAX_BYTES,setupFileName} from './setupFile';

function fixture(continuous=false){
 const roles=SEQUENCERS.map(s=>s.role),scene=BROWSABLE_SCENES[0].name;
 const strip={gain:.33,hpOn:false,hp:.2,lpOn:false,lp:.9,hi:.5,mid:.5,lo:.5,pan:.5,vol:.75,mute:false,solo:false,rev:.2,revSize:.5,dly:0,dlyTime:.4,dlyFb:.3};
 const source={level:.5,distance:.5,pan:.5,width:.5};
 return {
  scene,settings:{seed:1,meter:'4/4'},project:{bars:1,stepsPerBar:4,key:makeKey(),chords:[{bar:0,name:'C'}],progressions:[{startBar:0,bars:1}],
   patterns:{lead:{mode:'note',length:4,steps:[{n:[{d:0,o:0,a:0}],vel:.8},null,null,null]},perc:{mode:'drums',length:4,steps:[{hits:[{drum:0,velocity:.8,duration:1}]},null,null,null]}}},
  sounds:Object.fromEntries(roles.map(role=>[role,{selection:{synth:role==='perc'?'scene':'calmbgm',name:scene},rack:cleanRack(),...(role==='perc'?{kit:{},mix:{muted:[],solo:[]}}:{})}])),
  stream:continuous?{seed:1,count:1,settings:{meter:'4/4'},grooveVoices:{}}:null,
  ui:{selected:0,progression:0,bpm:90,progressionCount:4,mutes:{},solos:{},chordOverlap:'replace',loop:continuous?'song':'pattern',continuous,buffer:{ahead:4,history:3},panels:{generator:true,ambience:true},arrangement:false,view:'scale',offScale:false,insertOctave:4,pitch:null,resolution:'1/16',drumOffset:0},
  desk:{strips:Object.fromEntries([...roles,'ambience','headroom'].map(id=>[id,{...strip}])),selected:roles[0],property:0,master:{vol:.75,width:.5,bal:.5,ceil:.85,limit:true,mono:false,dim:false}},
  ambience:{run:false,selected:0,overall:.5,sources:Object.fromEntries(['rain','thunder','wind','waves','fire','vinyl'].map(id=>[id,{...source}]))},
  tuning:{cents:Array(12).fill(0),tonic:0,octave:2,a4:440,shift:0,auto:0},
 };
}
describe('all-page setup files',()=>{
 it.each([false,true])('round-trips an edited project in continuous mode %s',continuous=>{
  const state=fixture(continuous),decoded=decodeSetup(encodeSetup(state));
  expect(decoded).toMatchObject(state);
  expect(setupFileName('Morning coffee')).toBe('morning-coffee.calmbgm-setup.json');
 });
 it('rejects invalid formats, versions, JSON and excessive files',()=>{
  expect(()=>decodeSetup('{')).toThrow('not valid JSON');
  expect(()=>decodeSetup('{}')).toThrow('not an all-page');
  expect(()=>decodeSetup(JSON.stringify({...fixture(),format:'calmbgm-all-setup',version:99}))).toThrow('version');
  expect(()=>decodeSetup(' '.repeat(MAX_BYTES+1))).toThrow('too large');
 });
 it.each([
  ['note',s=>{s.project.patterns.lead.steps[0].n={};}],
  ['drum hit',s=>{s.project.patterns.perc.steps[0].hits=[null];}],
  ['chord',s=>{s.project.chords=[null];}],
  ['sound',s=>{s.sounds.lead.selection.synth='unknown';}],
  ['mixer',s=>{s.desk.selected='unknown';}],
  ['ambience',s=>{s.ambience.sources.rain.level=3;}],
  ['tuning',s=>{s.tuning.cents=[];}],
  ['continuous planner',s=>{s.stream.count=-1;}],
 ])('rejects damaged %s before loading',(_label,damage)=>{
  const state=fixture(true);damage(state);
  expect(()=>decodeSetup(encodeSetup(state))).toThrow('damaged');
 });
});
