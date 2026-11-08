import {makeKey,degreeToMidi} from '../../seq/harmony';
import {createContinuous,appendProgression} from './continuous';
import {prepareGeneratorChange,publishGeneratorChange} from './generatorChange';

function host(){
 const g={settings:{meter:'4/4',bpm:120,tonic:0,mode:'Major-1',seed:1},planner(){return {settings:{...g.settings},plan:new Map(),get meter(){return {units:this.settings.meter==='3/4'?3:4};},planBar(bar){const tonic=this.settings.tonic??0;this.plan.set(bar,{bar,music:{tonic,mode:this.settings.mode??'Major-1',cycleStart:bar},nextMusic:{cycleStart:bar+1},chord:{name:'root',pitchClasses:[tonic]},events:[{role:'lead',midi:60+tonic,beat:0,length:1,velocity:this.noteResolution===false?.4:.8}]});}};}};
 return {g,settings:{seed:1}};
}
it('rebuilds continuous lookahead at its original boundary, keeping played edits and replay state',()=>{
 const h=host(),generator=createContinuous(h,1);let project=null;
 for(let i=0;i<5;i++)project=appendProgression(project,generator.next(project?.key));
 project.patterns.lead.steps[0].vel=.23;h.g.settings={...h.g.settings,tonic:5};h.g.noteResolution=false;
 const prepared=prepareGeneratorChange(h,project,{generator},1,4);
 expect(project.patterns.lead.steps[16].vel).toBe(.8);
 // A user edit made while the prepared tail is waiting survives publication.
 project.patterns.lead.steps[0].vel=.31;
 const next=publishGeneratorChange(project,prepared);
 expect(next.patterns.lead.steps[0].vel).toBe(.31);expect(next.patterns.lead.steps[16].vel).toBe(.4);
 expect(degreeToMidi(next.key,next.patterns.lead.steps[16].n[0])).toBe(65);
 expect(prepared.generator.snapshot()).toMatchObject({count:6,changes:[{at:1,settings:{tonic:5},flags:{noteResolution:false}}]});
 const saved=prepared.generator.snapshot(),replay=createContinuous(h,saved.seed,saved.settings,saved.grooveVoices,saved.flags);
 for(let i=0;i<saved.count;i++){const change=saved.changes.find(c=>c.at===i);if(change)replay.update(change.settings,change.flags);replay.next(project.key);}
 expect(replay.next(project.key)).toEqual(prepared.generator.next(project.key));
});
it('prepares finite tails without changing the current pattern and handles a new meter atomically',()=>{
 const h=host(),g=createContinuous(h,1);let project=appendProgression(g.next(),g.next(makeKey()));
 h.g.settings={...h.g.settings,tonic:7};const change=prepareGeneratorChange(h,project,null,1);
 expect(publishGeneratorChange(project,change).patterns.lead.steps[0]).toEqual(project.patterns.lead.steps[0]);
 h.g.settings={...h.g.settings,meter:'3/4'};const meter=prepareGeneratorChange(h,project,null,1),next=publishGeneratorChange(project,meter);
 expect(next.stepsPerBar).toBe(12);expect(next.progressions).toHaveLength(2);expect(next.patterns.lead.steps).toHaveLength(24);
});
