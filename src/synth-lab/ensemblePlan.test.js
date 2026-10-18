import {voiceEffectsOverrides,ensembleConfig,ensemblePlan,ensembleEvents,effectsLayout,ENSEMBLE_PATHS} from './ensemblePlan';

test('ensemble fixtures bound workload and retain deterministic role-specific notes, releases and held glides',()=>{
 for(const count of [2,4,8])for(const bars of [4,8])for(const quality of [0,1,2]){
  const plan=ensemblePlan({count,bars,quality,rooms:4});expect(plan).toEqual(ensemblePlan({count,bars,quality,rooms:4}));
  expect(plan.parts).toHaveLength(count);expect(plan.config.rooms).toBeLessThanOrEqual(count);expect(plan.seconds).toBeGreaterThan(plan.sourceSeconds);
  for(const part of plan.parts){expect(part.notes.length).toBeGreaterThan(0);for(const n of part.notes){expect(n.time).toBeGreaterThanOrEqual(0);expect(n.time+n.duration).toBeLessThan(plan.cycleSeconds+.051);expect(n.midi).toBeGreaterThanOrEqual(24);expect(n.midi).toBeLessThan(100);}
   const peak=plan.voices[part.id];expect(peak.peak).toBeLessThanOrEqual(peak.capacity);
  }
  expect(plan.parts[0].notes).toHaveLength(4);expect(plan.parts[0].retunes).toHaveLength((bars-1)*4);
 }
 const bad=ensembleConfig({count:999,rooms:999,bars:999,bpm:Infinity,quality:99,sampleRate:1,decay:-1,master:Infinity});
 expect(bad.count).toBe(4);expect(bad.bars).toBe(4);expect(bad.decay).toBe(.3);expect(bad.bpm).toBe(88);expect(bad.master).toBe(.7);
});

test('the same score has independent note IDs and sample-exact offsets across live cycles',()=>{
 const plan=ensemblePlan({bars:4});for(const part of plan.parts){
  const first=ensembleEvents(part,48000),next=ensembleEvents(part,48000,{cycle:1,offset:10});
  expect(next).toEqual(first.map(([kind,id,frame,a,b])=>[kind,id+10000,frame+480000,a,b]));
  const ids=new Set(first.filter(e=>e[0]===0).map(e=>e[1]));expect(ids.size).toBe(part.notes.length);
  for(const event of first.filter(e=>e[0]===1||e[0]===5))expect(ids.has(event[1])).toBe(true);
  expect(first.every(e=>e.every(Number.isFinite))).toBe(true);
 }
});

test('shared rooms preserve channel assignment and independent effects retain the matching room settings',()=>{
 const plan=ensemblePlan({count:8,rooms:2}),separate=effectsLayout(plan,'separate'),shared=effectsLayout(plan,'shared'),hybrid=effectsLayout(plan,'hybrid');
 expect(separate.count).toBe(8);expect(shared.count).toBe(2);expect(hybrid.kind).toBe('hybrid');expect(effectsLayout(plan,'dry').kind).toBe('dry');
 for(const part of plan.parts){expect(shared.assign(part)).toBe(part.room);expect(separate.assign(part)).toBe(part.id);expect(separate.settings(part.id)).toEqual(shared.settings(part.room));}
 expect(ENSEMBLE_PATHS).toHaveLength(5);expect(()=>effectsLayout(plan,'untrusted')).toThrow();
});


test('voice delays remain independent and preset-requested rooms do not lengthen other voices',()=>{
 const plan=ensemblePlan({rooms:1,voices:{0:{room:'private',roomDecay:20},1:{delayMs:333,feedback:.7,pingPong:1},3:{delayMs:700,pingPong:0}}});
 const layout=effectsLayout(plan,'local');expect(layout.count).toBe(2);expect(layout.kind).toBe('local');
 expect(layout.assign(plan.parts[0])).not.toBe(layout.assign(plan.parts[1]));
 expect(layout.settings(layout.assign(plan.parts[0])).decay).toBe(20);
 for(const part of plan.parts.slice(1))expect(layout.settings(layout.assign(part)).decay).toBe(8);
 expect(plan.parts[1].voiceEffects).toMatchObject({delayMs:333,feedback:.7,pingPong:1});
 expect(plan.parts[3].voiceEffects).toMatchObject({delayMs:700,pingPong:0});
 expect(ensemblePlan().parts[1].voiceEffects.feedback).not.toBe(.7);
 expect(plan.seconds-plan.sourceSeconds).toBeGreaterThan(30);
 expect(effectsLayout(plan,'shared').count).toBe(1);
 expect(effectsLayout(ensemblePlan(),'local').count).toBe(1);
});

test('voice URL overrides round-trip, reject malformed data and bound private tails and feedback',()=>{
 const voices={0:{room:'private',roomDecay:30},1:{delayMs:2000,feedback:.85,send:.8,roomSend:1,tone:300,pingPong:1}};
 expect(ensembleConfig({voices:JSON.stringify(voices)}).voices).toEqual(voices);
 expect(voiceEffectsOverrides('{bad')).toEqual({});
 expect(voiceEffectsOverrides({0:{room:'unknown',roomDecay:100,feedback:2,pingPong:99,send:NaN,delayMs:Infinity},99:{room:'private'}})).toEqual({0:{roomDecay:30,feedback:.85}});
 const worst=ensemblePlan({voices});expect(worst.seconds).toBeGreaterThan(worst.sourceSeconds+60);
});

test('private room requests allocate only occupied rooms and zero echo sends retain room routing',()=>{
 const plan=ensemblePlan({count:2,rooms:2,voices:{0:{room:'private',send:0},1:{room:'private',roomDecay:1.2}}}),layout=effectsLayout(plan,'local');
 expect(layout.count).toBe(2);expect(layout.assign(plan.parts[0])).not.toBe(layout.assign(plan.parts[1]));
 expect(plan.parts[0].voiceEffects.send).toBe(0);expect(layout.settings(layout.assign(plan.parts[1])).decay).toBe(1.2);
});
