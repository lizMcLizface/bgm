import {makeKey,midiToDegree,degreeToMidi} from '../../seq/harmony';
import {stepPitches} from '../../seq/notes';
import {captureProject} from '../../seq/capture';
import {chordStrikes,placedChordTones} from './placedChords';
import {transposeProjectScale,keyAt,keyId} from './scaleTransform';

const dorian=makeKey('Major-2',2),ionian=makeKey('Major-1',4),dorianPcs=[2,4,5,7,9,11,0];
function fixture(second={name:'B♭',pitchClasses:[10,2,5]}){
 const steps=Array(32).fill(null);
 for(const [i,midi] of [[0,62],[1,65],[2,71],[3,72],[4,66],[16,58],[17,62],[18,65]])steps[i]={n:[midiToDegree(dorian,midi)],vel:.63,len:2,prob:.7,cond:'2:2',nudge:.1};
 return {key:dorian,bars:2,stepsPerBar:16,meter:'4/4',progressions:[{startBar:0,bars:1,key:dorian},{startBar:1,bars:1,key:dorian}],chords:[{bar:0,name:'Dm',pitchClasses:[2,5,9],scalePcs:dorianPcs},{bar:1,...second,scalePcs:dorianPcs}],patterns:{lead:{mode:'note',follow:'scale',length:32,steps},perc:{mode:'drums',length:32,steps:Array(32).fill(null)}}};
}
const note=(project,i)=>degreeToMidi(project.key,project.patterns.lead.steps[i].n[0]);
it('maps D Dorian to E Ionian by degree and preserves borrowed chord shapes and expression',()=>{
 const project=fixture(),next=transposeProjectScale(project,ionian);
 expect([0,1,2,3,4].map(i=>note(next,i))).toEqual([64,68,73,75,69]);
 expect([16,17,18].map(i=>note(next,i))).toEqual([60,64,67]); // the borrowed B-flat major becomes C major
 expect(next.chords[0].name).toBe('E');expect(next.chords[1].name).toBe('C');
 expect(next.chords[1].transposeShape).toBe('borrowed');
 expect(next.patterns.lead.steps[1]).toMatchObject({vel:.63,len:2,prob:.7,cond:'2:2',nudge:.1});
 expect(next.patterns.perc).toBe(project.patterns.perc);expect(project.key).toBe(dorian);
});
it('keeps suspended intervals as the root moves, including a mode with a raised fourth',()=>{
 const project=fixture({name:'Dsus4',pitchClasses:[2,7,9]});
 project.patterns.lead.steps[16]={n:[midiToDegree(dorian,62),midiToDegree(dorian,67),midiToDegree(dorian,69)]};
 const next=transposeProjectScale(project,makeKey('Major-4',4));
 expect(next.patterns.lead.steps[16].n.map(n=>degreeToMidi(next.key,n))).toEqual([64,69,71]);
 expect(next.chords[1].name).toBe('Esus4');
});
it('changes only the current continuous progression and preserves raised-degree meaning on repeated edits',()=>{
 const project=fixture({name:'Dm',pitchClasses:[2,5,9]});project.patterns.lead.steps[16]={n:[midiToDegree(dorian,66)]};
 const prefix=structuredClone(project.patterns.lead.steps.slice(0,16)),past=project.chords[0];
 const changed=transposeProjectScale(project,ionian,{startBar:1,endBar:2,whole:false});
 expect(changed.key).toBe(project.key);expect(changed.chords[0]).toBe(past);expect(changed.patterns.lead.steps.slice(0,16)).toEqual(prefix);
 expect(note(changed,16)).toBe(69);expect(keyAt(changed,1)).toEqual(ionian);
 const again=transposeProjectScale(changed,makeKey('Major-2',7),{startBar:1,endBar:2,whole:false});
 expect(note(again,16)).toBe(71); // raised third, rather than the fourth inferred from the pitch A
 expect(again.patterns.lead.steps.slice(0,16)).toEqual(prefix);
});
it('uses captured modulation context instead of the project storage key',()=>{
 const records=[
  {music:{tonic:2,mode:'Major-2',cycleStart:0},events:[{role:'lead',midi:65,beat:0,length:1}],chord:{name:'Dm'}},
  {music:{tonic:9,mode:'Major-6',cycleStart:1},events:[{role:'lead',midi:72,beat:0,length:1}],chord:{name:'Am'}},
 ];
 const project=captureProject(records),next=transposeProjectScale(project,ionian,{startBar:1,endBar:2,whole:false});
 expect(keyAt(project,1)).toEqual(makeKey('Major-6',9));expect(note(next,16)).toBe(68);expect(note(next,0)).toBe(65);
 expect(project.patterns.lead.steps[16].n[0].transposeDegree.key).toBe(keyId(makeKey('Major-6',9)));
});
it('transposes exact voicings and custom strikes without changing rhythm or note expression',()=>{
 const project=fixture();project.patterns.lead.chords=[{id:1,start:0,len:8,root:midiToDegree(dorian,62),voicing:[0,3,7],strikes:[{at:0,tone:2,len:3,vel:.8},{at:4,tone:0,len:2,vel:.5}]}];
 const next=transposeProjectScale(project,ionian),c=next.patterns.lead.chords[0];
 expect(placedChordTones(next.key,c)).toEqual([64,68,71]);
 expect(chordStrikes(next.key,c)).toMatchObject([{at:0,note:71,len:3,vel:.8},{at:4,note:64,len:2,vel:.5}]);
 const current=transposeProjectScale(project,ionian,{startBar:0,endBar:1,whole:false});
 expect(placedChordTones(current.key,current.patterns.lead.chords[0])).toEqual([64,68,71]);
});
it('maps scale sizes within the same octave and transposes explicit MIDI tracks and their ranges',()=>{
 const project=fixture(),pentatonic=makeKey('Pentatonic-1',2);
 const next=transposeProjectScale(project,pentatonic);expect(note(next,3)).toBeLessThan(74);
 project.patterns.lead={...project.patterns.lead,follow:'off',range:[60,84],steps:Array(32).fill(null)};
 project.patterns.lead.steps[0]={n:[{midi:65}],vel:.6};
 const mapped=transposeProjectScale(project,ionian);expect(stepPitches(mapped.patterns.lead,0,{key:mapped.key})).toEqual([68]);
 expect(mapped.patterns.lead.range).toEqual([63,87]);
});
it('rejects an out-of-range result before mutating the source project',()=>{
 const project=fixture();project.patterns.lead.steps[0]={n:[midiToDegree(dorian,127)]};
 const before=structuredClone(project);expect(()=>transposeProjectScale(project,makeKey('Major-2',11))).toThrow('MIDI note range');expect(project).toEqual(before);
});

it('keeps a wide MIDI range usable and scopes range changes to the current progression',()=>{
 const project=fixture({name:'Dm',pitchClasses:[2,5,9]});project.patterns.lead.range=[0,127];
 const next=transposeProjectScale(project,ionian,{startBar:1,endBar:2,whole:false});
 expect(next.patterns.lead.range).toEqual([0,127]);expect(next.patterns.lead.steps[0]).toBe(project.patterns.lead.steps[0]);
 expect(next.patterns.lead.steps[16].range.every(n=>n>=0&&n<=127)).toBe(true);
});
it('preserves unrelated voices and expression while transposing every pitched pattern',()=>{
 const project=fixture();project.patterns.bass=structuredClone(project.patterns.lead);project.patterns.bass.octave=-1;
 const next=transposeProjectScale(project,ionian,{startBar:0,endBar:1,whole:false});
 expect(stepPitches(next.patterns.bass,1,{key:next.key})).toEqual([56]);
 expect(stepPitches(next.patterns.lead,1,{key:next.key})).toEqual([68]);
 expect(next.patterns.bass.steps[16]).toBe(project.patterns.bass.steps[16]);
});
it('retains a borrowed exact voicing through repeated continuous changes',()=>{
 const project=fixture();project.patterns.lead.chords=[{id:1,start:0,len:8,root:midiToDegree(dorian,62),quality:'diatonic',voicing:[0,4,7]}];
 const first=transposeProjectScale(project,ionian,{startBar:0,endBar:1,whole:false});
 const next=transposeProjectScale(first,makeKey('Major-2',7),{startBar:0,endBar:1,whole:false});
 expect(placedChordTones(next.key,next.patterns.lead.chords[0])).toEqual([67,71,74]);
});
it('rejects a legacy chord beyond MIDI range without changing the project',()=>{
 const project=fixture();project.patterns.lead.steps[0]={chord:{d:34,size:3}};
 const before=structuredClone(project);expect(()=>transposeProjectScale(project,ionian)).toThrow('MIDI note range');expect(project).toEqual(before);
});
it('retains an explicitly placed suspension even when the destination scale raises that degree',()=>{
 const project=fixture();project.patterns.lead.chords=[{id:1,start:0,len:8,root:midiToDegree(dorian,62),colour:'sus4',complexity:'triad'}];
 const next=transposeProjectScale(project,makeKey('Major-4',4));
 expect(placedChordTones(next.key,next.patterns.lead.chords[0])).toEqual([64,69,71]);
});
