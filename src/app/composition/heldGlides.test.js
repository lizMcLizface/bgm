import {joinHeldNotes,sustainingVoice} from './heldGlides';
const voices={pad:{preset:{gainSustain:.7}},bass:{preset:{gainSustain:.8}}};
const note=(midi,time,role='bass',duration=3.95,bar=Math.floor(time/4))=>({role,midi,time,duration,bar,velocity:.7,section:0});
test('held drone keeps one attack through nearby roots with bounded anticipatory trajectories',()=>{
 const notes=[0,5,2,0,5,2].map((step,i)=>note(36+step,i*4)),before=structuredClone(notes);
 const result=joinHeldNotes(notes,{bass:true,voices});expect(result).toHaveLength(2);
 expect(result[0].heldMembers).toHaveLength(4);expect(result[0].duration).toBe(15.95);
 expect(result[0].expression.pitchTargets).toContainEqual({time:3.2,midi:36});expect(result[0].expression.pitchTargets).toContainEqual({time:4.8,midi:41});
 expect(result.every(n=>n.duration<=24)).toBe(true);expect(notes).toEqual(before);
 expect(joinHeldNotes(notes,{voices})).toBe(notes);expect(joinHeldNotes(notes,{bass:true,voices,legacy:true})).toBe(notes);
});
test('chord connections keep common tones and assign each changing tone once',()=>{
 const notes=[[60,64,67],[60,65,69],[62,65,69]].flatMap((chord,i)=>chord.map(m=>note(m,i*4,'pad')));
 const result=joinHeldNotes(notes,{pad:true,voices});expect(result).toHaveLength(3);
 const members=result.flatMap(n=>n.heldMembers);expect(members).toHaveLength(notes.length);expect(new Set(members).size).toBe(notes.length);
 const common=result.find(n=>n.midi===60);expect(common.expression.pitchTargets).toContainEqual({time:4.8,midi:60});
});
test('rests, rhythmic attacks, leaps, section changes and explicit trajectories keep their own attacks',()=>{
 for(const second of [note(41,5),note(50,4),{...note(41,4),section:1},{...note(41,4),ending:true},{...note(41,4),expression:{pitchTargets:[{time:1,midi:42}]}}])expect(joinHeldNotes([note(36,0),second],{bass:true,voices})).toHaveLength(2);
 const short=[0,1,2,3].map(t=>note(36,t,'bass',.95));expect(joinHeldNotes(short,{bass:true,voices})).toEqual(short);
 expect(joinHeldNotes([note(36,0),note(41,4)],{bass:true,voices:{bass:{preset:{gainSustain:.8,stringModel:'piano'}}}})).toHaveLength(2);
 expect(sustainingVoice({preset:{gainSustain:.1}})).toBe(false);
});
test('partial chord changes retain independent unmatched attacks and roles are independently enabled',()=>{
 const notes=[note(36,0),note(41,4),note(60,0,'pad'),note(64,0,'pad'),note(65,4,'pad')];
 const result=joinHeldNotes(notes,{bass:true,voices});expect(result.filter(n=>n.role==='pad')).toHaveLength(3);expect(result.filter(n=>n.role==='bass')).toHaveLength(1);
 const chord=joinHeldNotes(notes.filter(n=>n.role==='pad'),{pad:true,voices});expect(chord).toHaveLength(2);
});

test('sustained pad gate trim connects across chords while a larger breathing space stays open',()=>{
 const a=note(60,0,'pad',7.6,0),b=note(62,8,'pad',7.6,2);
 expect(joinHeldNotes([a,b],{pad:true,voices})).toHaveLength(1);
 expect(joinHeldNotes([a,{...b,time:9}],{pad:true,voices})).toHaveLength(2);
});
