import {describe,it,expect} from 'vitest';
import {makeKey} from '../../seq/harmony';
import {capturePattern} from '../../seq/capture';
import {chordStrikes,generatedChords,omitOptions,placedChordEvents,placedChordTones,stackNames} from './placedChords';
import {fitVoicing,parseChordGroup,parsePattern} from './chordParse';

const key=makeKey('Major-1',0);
const note=(start,midi,len=16)=>({start,midi,len,vel:.7});
const parse=(notes,{rootPc=0,barStart=0,stepsPerBar=16}={})=>parseChordGroup({notes,key,rootPc,barStart,stepsPerBar});
const chordOf=r=>({id:1,...r.chord});
const replay=(r)=>chordStrikes(key,chordOf(r)).map(s=>`${s.at}:${s.note}`).sort();

describe('chord menu settings',()=>{
 it('omits tones before inverting, and adds a tone an octave away',()=>{
  const c={root:{d:0,o:0,a:0},complexity:'seven',omit:[0],inversion:0,add:[]};
  expect(placedChordTones(key,c)).toEqual([64,67,71]);
  expect(placedChordTones(key,{...c,inversion:1})).toEqual([67,71,76]);
  expect(placedChordTones(key,{...c,omit:[],add:[{tone:0,oct:-1}]})).toEqual([48,60,64,67,71]);
  expect(placedChordTones(key,{...c,omit:[1,2],add:[]})).toEqual([60,71]);
  expect(placedChordTones(key,{...c,omit:[0],add:[{tone:1,oct:1}]})).toEqual([64,67,71,76]);
 });
 it('has add6, flat nine, and a borrowed quality',()=>{
  const c={root:{d:0,o:0,a:0}};
  expect(placedChordTones(key,{...c,colour:'add6'})).toEqual([60,64,67,69]);
  expect(placedChordTones(key,{...c,colour:'flat2'})).toEqual([60,64,67,73]);
  expect(placedChordTones(key,{root:{d:5,o:0,a:0},quality:'major'})).toEqual([69,73,76]);
  expect(placedChordTones(key,{root:{d:0,o:0,a:0},quality:'minor'})).toEqual([60,63,67]);
 });
 it('scrolls omissions singly, then in pairs, then in threes, in order',()=>{
  expect(omitOptions(4)).toEqual([[],[0],[1],[2],[3],[0,1],[0,2],[0,3],[1,2],[1,3],[2,3],[0,1,2],[0,1,3],[0,2,3],[1,2,3]]);
  expect(omitOptions(3)).toEqual([[],[0],[1],[2],[0,1],[0,2],[1,2]]);
  expect(stackNames(key,{root:{d:0,o:0,a:0},complexity:'seven'})).toEqual(['root','third','fifth','seventh']);
  expect(stackNames(key,{root:{d:0,o:0,a:0},colour:'sus4'})).toEqual(['root','sus4','fifth']);
 });
 it('strikes by style, rate, mask, note length and end as one',()=>{
  const base={start:0,len:16,root:{d:0,o:0,a:0},playMode:'arp',rate:2,direction:'up'};
  expect(chordStrikes(key,base).map(s=>[s.at,s.note])).toEqual([[0,60],[2,64],[4,67],[6,60],[8,64],[10,67],[12,60],[14,64]]);
  expect(chordStrikes(key,{...base,mask:'x..x'}).map(s=>s.at)).toEqual([0,6,8,14]);
  expect(chordStrikes(key,{...base,noteLen:3}).every(s=>s.len===3)).toBe(true);
  expect(chordStrikes(key,{...base,noteLen:1,endAsOne:true}).map(s=>s.len)).toEqual([1,1,1,1,1,1,1,2]);
  expect(chordStrikes(key,{...base,playMode:'roll',rate:1,direction:'down'}).map(s=>[s.at,s.note,s.len])).toEqual([[0,67,16],[1,64,15],[2,60,14]]);
  expect(chordStrikes(key,{...base,playMode:'pulse',rate:4,mask:'x.xx'}).map(s=>[s.at,s.note,s.len]).slice(0,6)).toEqual([[0,60,8],[0,64,8],[0,67,8],[8,60,4],[8,64,4],[8,67,4]]);
  expect(chordStrikes(key,{...base,strikes:[{at:1,tone:2,len:3}]})).toEqual([{at:1,note:67,len:3,vel:undefined,spill:false}]);
  // an arpeggio can ring past the chord end when asked to
  const events=placedChordEvents({chords:[{id:1,...base,len:4,rate:4,noteLen:8,spill:true}]},0,{key,time:0,stepSec:.1});
  expect(events[0].duration).toBeCloseTo(.8);
 });
});

describe('reading a chord part',()=>{
 it('reads a held triad and its inversion',()=>{
  const r=parse([note(0,60),note(0,64),note(0,67)]);
  expect(r).toMatchObject({kind:'chord',exact:true,chord:{playMode:'chord',complexity:'triad',colour:'plain',inversion:0,len:16}});
  expect(parse([note(0,64),note(0,67),note(0,72)]).chord).toMatchObject({inversion:1});
 });
 it('reads a root-less seventh and a doubled third as omissions and additions',()=>{
  expect(parse([note(0,64),note(0,67),note(0,71)]).chord).toMatchObject({complexity:'seven',omit:[0]});
  expect(parse([note(0,64),note(0,67),note(0,76)]).chord).toMatchObject({omit:[0],add:[{tone:1,oct:1}]});
 });
 it('reads a borrowed chord as a quality, and keeps a voicing it cannot read exactly',()=>{
  expect(parse([note(0,69),note(0,73),note(0,76)],{rootPc:9}).chord).toMatchObject({quality:'major'});
  const odd=parse([60,61,62,63].map(m=>note(0,m)));
  expect(odd.kind).toBe('chord');
  expect(odd.chord.voicing).toEqual([0,1,2,3]);
  expect(replay(odd)).toEqual(['0:60','0:61','0:62','0:63']);
 });
 it('reads a roll, an arpeggio with a rhythm, and a pulse',()=>{
  const roll=parse([note(0,60,16),note(1,64,15),note(2,67,14)]);
  expect(roll.chord).toMatchObject({playMode:'roll',rate:1,direction:'up'});
  const arp=parse([[0,60],[6,64],[8,67],[14,60]].map(([at,m])=>note(at,m,4)));
  expect(arp.chord).toMatchObject({playMode:'arp',rate:2,mask:'x..xx..x',direction:'up'});
  const pulse=parse([0,4,8,12].flatMap(at=>[60,64,67].map(m=>note(at,m,4))));
  expect(pulse.chord).toMatchObject({playMode:'pulse',rate:4});
  expect(pulse.chord.mask).toBeUndefined();
  const syncopated=parse([0,6,8,14].flatMap(at=>[60,64,67].map(m=>note(at,m,at===14?2:6))));
  expect(syncopated.chord).toMatchObject({playMode:'pulse',rate:2,mask:'x..xx..x'});
 });
 it('reads a rotated arpeggio and a last note that rings out',()=>{
  const rotated=parse([64,67,60,64].map((m,i)=>note(i,m,1)));
  expect(rotated.chord).toMatchObject({playMode:'arp',direction:'up'});
  expect(rotated.chord.phase).toBe(1);
  const ringing=parse([[0,60,1],[1,64,1],[2,67,1],[3,72,13]].map(([at,m,len])=>note(at,m,len)));
  expect(ringing.chord).toMatchObject({playMode:'arp',noteLen:'tie'});
  expect(replay(ringing)).toEqual(['0:60','1:64','2:67','3:72']);
 });
 it('leaves a composed figure as a note line',()=>{
  expect(parse([[0,67],[3,60],[6,60],[10,64]].map(([at,m])=>note(at,m,3)))).toMatchObject({kind:'line'});
  expect(parse([note(0,60)])).toMatchObject({kind:'line'});
 });
 it('every chord it reads replays exactly the notes it came from',()=>{
  const groups=[
   [note(0,60),note(0,64),note(0,67)],
   [0,6,8,14].flatMap(at=>[60,64,67].map(m=>note(at,m,5))),
   [[0,60,2],[2,64,2],[4,67,2],[6,72,2]].map(([at,m,len])=>note(at,m,len)),
   [note(0,60,10),note(0,64,10),note(0,67,10),note(10,55,6)],
  ];
  for(const g of groups){
   const r=parse(g);
   expect(r.kind).toBe('chord');
   expect(replay(r)).toEqual(g.map(n=>`${n.start}:${n.midi}`).sort());
  }
 });
 it('fits exactly the pitches and up to a note either side of an octave',()=>{
  const fit=fitVoicing(key,0,[48,64,67]);
  expect(placedChordTones(key,{root:fit.root,...fit.params})).toEqual([48,64,67]);
  expect(fitVoicing(key,0,[60,61,62,63])).toBeNull();
 });
});

describe('generated chords in a captured pattern',()=>{
 const records=(bars)=>bars.map(events=>({events,chord:{numeral:'I',name:'C',pitchClasses:[0,4,7]},music:{tonic:0,mode:'Major-1'}}));
 const source={root:0,style:'sustain',pattern:null,step:1};
 const ev=(role,beat,midi,length=4,extra={})=>({role,beat,midi,length,velocity:.6,chordSource:{...source,...extra}});
 it('keeps chords as generated chords and strips the chord tag from figures',()=>{
  const sustain=[60,64,67].map(m=>ev('pad',0,m));
  const figure=[[0,67],[.75,60],[1.5,60],[2.5,64]].map(([beat,m])=>ev('pad',beat,m,.7,{style:'arpeggio'}));
  const pattern=capturePattern(records([sustain,figure]),'pad',{key,stepsPerBar:16});
  const tagged=g=>pattern.steps.flatMap(s=>s?.n??[]).filter(n=>n.chordSource?.group===g).length;
  expect(tagged('pad:0')).toBe(3);
  expect(tagged('pad:1')).toBe(0);
  const chords=generatedChords(pattern,key,16);
  expect(chords).toHaveLength(1);
  expect(chords[0]).toMatchObject({sourceGroup:'pad:0',start:0,len:16,complexity:'triad'});
  expect(parsePattern(pattern,key,16)).toBe(parsePattern(pattern,key,16));
 });
});
