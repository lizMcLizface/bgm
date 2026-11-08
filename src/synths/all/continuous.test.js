import {describe,it,expect} from 'vitest';
import {createContinuous,appendProgression,trimProgressions} from './continuous';

function planner(){
 return {settings:{meter:'4/4',bpm:120},meter:{units:4},plan:new Map(),planBar(bar){
  this.plan.set(bar,{bar,music:{tonic:0,mode:'Major-1',cycleStart:bar},nextMusic:{cycleStart:bar+1},chord:{name:'C',pitchClasses:[0,4,7]},events:[{role:'lead',midi:60+bar%2,beat:0,length:1,velocity:.8}]});
 }};
}
describe('continuous progression buffer',()=>{
 it('replays setting and rule edits, including coalesced and pending changes, using whitelisted flags',()=>{
  const host={g:{planner:()=>{
   const p=planner(),plan=p.planBar;p.noteResolution=true;
   p.planBar=function(bar){plan.call(this,bar);this.plan.get(bar).events[0].midi=this.noteResolution?60:67;this.plan.get(bar).events[0].velocity=this.settings.level??.8;};return p;
  }}};
  const stream=createContinuous(host,42),first=stream.next();
  stream.update({meter:'4/4',bpm:120,level:.4},{noteResolution:false,planBar:false});
  stream.update({meter:'4/4',bpm:130,level:.6});
  stream.next(first.key);
  stream.update({meter:'4/4',bpm:140,level:.3},{noteResolution:true});
  const saved=JSON.parse(JSON.stringify(stream.snapshot()));
  expect(saved.flags).toMatchObject({noteResolution:true});
  expect(saved.changes).toHaveLength(2);expect(saved.changes[0].flags).toMatchObject({noteResolution:false});
  expect(saved.changes[0].flags).not.toHaveProperty('planBar');
  const restored=createContinuous(host,saved.seed,saved.settings,saved.grooveVoices,saved.flags);
  for(let i=0;i<saved.count;i++){
   const change=saved.changes.find(c=>c.at===i);if(change)restored.update(change.settings,change.flags);
   restored.next(first.key);
  }
  const pending=saved.changes.find(c=>c.at===saved.count);restored.update(pending.settings,pending.flags);
  expect(restored.next(first.key)).toEqual(stream.next(first.key));
  expect(()=>stream.update({meter:'6/8'})).toThrow('meter change');
 });
 it('restores unset rule defaults instead of inheriting a later host override',()=>{
  const host=flag=>({g:{planner:()=>{
   const p=planner(),plan=p.planBar;p.noteResolution=flag;
   p.planBar=function(bar){plan.call(this,bar);this.plan.get(bar).events[0].midi=this.noteResolution===false?70:60;};return p;
  }}});
  const original=createContinuous(host(undefined),17);original.next();
  const saved=JSON.parse(JSON.stringify(original.snapshot()));expect(saved.flags.noteResolution).toBeNull();
  const restored=createContinuous(host(false),saved.seed,saved.settings,saved.grooveVoices,saved.flags);
  for(let i=0;i<saved.count;i++)restored.next();
  expect(restored.next()).toEqual(original.next());
 });
 it('plans sequential cycles, appends edits, and trims old history',()=>{
  const plan=planner(),stream=createContinuous({g:{planner:()=>plan}},1);
  let project=stream.next();
  project.patterns.lead.steps[0].vel=.37;
  for(let i=0;i<5;i++)project=appendProgression(project,stream.next(project.key));
  expect(project.progressions).toHaveLength(6);
  expect(project.patterns.lead.steps[0].vel).toBe(.37);
  expect(project.patterns.lead.steps).toHaveLength(96);
  project.patterns.lead.chords=[{id:'one',start:31,len:4}];
  const trimmed=trimProgressions(project,2);
  expect(trimmed.progressions).toHaveLength(4);
  expect(trimmed.progressions[0].startBar).toBe(0);
  expect(trimmed.patterns.lead.steps).toHaveLength(64);
  expect(trimmed.patterns.lead.chords).toEqual([{id:'one',start:0,len:3}]);
 });
 it('keeps bounded planning history even over long sessions',()=>{
  const plan=planner(),stream=createContinuous({g:{planner:()=>plan}},1);
  for(let i=0;i<600;i++)stream.next();
  expect(plan.plan.size).toBe(512);
  expect(plan.plan.has(599)).toBe(true);
 });
 it('retains notes crossing the progression boundary',()=>{
  const plan=planner(),original=plan.planBar;
  plan.planBar=function(bar){original.call(this,bar);this.plan.get(bar).events[0].beat=3.75;this.plan.get(bar).events[0].length=2;};
  const stream=createContinuous({g:{planner:()=>plan}},1);
  const first=stream.next(),next=stream.next(first.key);
  expect(first.patterns.lead.steps[15].len).toBe(8);
  expect(appendProgression(first,next).patterns.lead.steps[15].len).toBe(8);
 });
 it('replays the planner with its original settings and voice context, independently of edits to the buffer',()=>{
  const host={g:{planner:()=>{const p=planner();p.grooveVoices={lead:{name:'original'}};const planBar=p.planBar;p.planBar=function(bar){planBar.call(this,bar);this.plan.get(bar).events[0].midi=this.grooveVoices.lead.name==='original'?60:70;};return p;}}};
  const original=createContinuous(host,42);
  let project=original.next();
  for(let i=0;i<5;i++)project=appendProgression(project,original.next(project.key));
  project.patterns.lead.steps[0].vel=.37;
  project=trimProgressions(project,2);
  const saved=original.snapshot(),expected=original.next(project.key);
  const otherHost={g:{planner:()=>{const p=host.g.planner();p.grooveVoices.lead.name='changed';return p;}}};
  const restored=createContinuous(otherHost,saved.seed,saved.settings,saved.grooveVoices);
  for(let i=0;i<saved.count;i++)restored.next(project.key);
  expect(restored.next(project.key)).toEqual(expected);
  expect(project.progressions).toHaveLength(4);
 });
});
