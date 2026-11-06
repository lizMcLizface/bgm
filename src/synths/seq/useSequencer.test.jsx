import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {useSequencer} from './useSequencer';
import {KITS,ARRANGEMENTS,arrangementBank,emptyPattern,validPattern,patternCommands} from '../drums/kits';

let root,element,seq;
const kit=KITS.tr808;
const onEdit=vi.fn(),engine={seq:vi.fn()};
function Harness(){seq=useSequencer({id:'follow-test',empty:emptyPattern(kit),valid:validPattern(kit),copyPattern:p=>p.map(r=>[...r]),patternCommands:(i,p)=>patternCommands(kit,i,p),tempoId:130,onEdit});return null;}
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;localStorage.clear();onEdit.mockClear();engine.seq.mockClear();element=document.createElement('div');document.body.append(element);root=createRoot(element);act(()=>root.render(<Harness/>));act(()=>seq.onEngine(engine));});
afterEach(()=>{act(()=>root.unmount());element.remove();delete globalThis.IS_REACT_ACT_ENVIRONMENT;});

test('playing chains follow the actual pattern without selecting it again in the engine or editing the link',()=>{
 act(()=>seq.loadBank(arrangementBank(kit,ARRANGEMENTS[0])));act(()=>seq.togglePlay());engine.seq.mockClear();onEdit.mockClear();
 for(const pattern of [0,1,2,4,5,6,7,0]){
  act(()=>seq.onStats({running:1,pattern,step:3}));expect(seq.bank.current).toBe(pattern);expect(seq.playingPattern).toBe(pattern);
 }
 expect(engine.seq).not.toHaveBeenCalled();expect(onEdit).not.toHaveBeenCalled();
 act(()=>seq.onStats({running:0,pattern:6,step:3}));expect(seq.bank.current).toBe(0);expect(seq.playing).toBe(false);
});
test('loading a loop preserves transport and never sends a stop, start or rewind command',()=>{
 act(()=>seq.onStats({running:1,pattern:0,step:7}));expect(seq.playing).toBe(true);
 const next={...seq.bank,title:'New loop',chain:[]};engine.seq.mockClear();
 act(()=>seq.loadBank(next,{keepPlaying:true}));expect(seq.playing).toBe(true);
 const commands=engine.seq.mock.calls.flatMap(([cmds])=>cmds);
 expect(commands.some(([cmd])=>cmd===0||cmd===6)).toBe(false);
 act(()=>seq.onStats({running:1,pattern:1,step:8}));expect(seq.bank.current).toBe(0); // single loops retain the page being edited
 act(()=>seq.onStats({running:0,pattern:0,step:0}));
 act(()=>seq.loadBank(next,{keepPlaying:true}));expect(seq.playing).toBe(false);
});
test('loading a full arrangement stops and rewinds, so its first stage starts predictably',()=>{
 act(()=>seq.onStats({running:1,pattern:2,step:8}));engine.seq.mockClear();
 act(()=>seq.loadBank(arrangementBank(kit,ARRANGEMENTS[0])));expect(seq.playing).toBe(false);
 const commands=engine.seq.mock.calls[0][0];expect(commands[0]).toEqual([0,0,0]);expect(commands.at(-1)).toEqual([6,0,0]);
});
test('late playback stats after Stop cannot override a manual page selection',()=>{
 act(()=>seq.loadBank(arrangementBank(kit,ARRANGEMENTS[0])));act(()=>seq.togglePlay());act(()=>seq.onStats({running:1,pattern:2,step:7}));
 act(()=>seq.togglePlay());act(()=>seq.select(7));expect(seq.playing).toBe(false);
 act(()=>seq.onStats({running:1,pattern:2,step:8}));expect(seq.bank.current).toBe(7);expect(seq.playing).toBe(false);
 act(()=>seq.onStats({running:0,pattern:2,step:8}));expect(seq.bank.current).toBe(7);
 act(()=>seq.togglePlay());act(()=>seq.onStats({running:1,pattern:0,step:0}));expect(seq.bank.current).toBe(0);expect(seq.playing).toBe(true);
});
test('MIDI start, stop and continue update transport without blocking subsequent engine stops',()=>{
 act(()=>seq.setSync(true));engine.seq.mockClear();
 act(()=>seq.onMidiRealtime(0xFA));expect(seq.playing).toBe(true);expect(engine.seq.mock.calls.at(-1)[0]).toEqual([[6,0,0],[0,1,0]]);
 act(()=>seq.onStats({running:1,pattern:0,step:0}));act(()=>seq.onMidiRealtime(0xFC));expect(seq.playing).toBe(false);
 act(()=>seq.onStats({running:1,pattern:0,step:1}));expect(seq.playing).toBe(false);
 act(()=>seq.onMidiRealtime(0xFB));expect(engine.seq.mock.calls.at(-1)[0]).toEqual([[0,1,0]]);
 act(()=>seq.onStats({running:0,pattern:0,step:1}));expect(seq.playing).toBe(false); // e.g. Panic immediately after Continue
});
test("copying some tracks leaves the other tracks of the target alone and takes the copied ones' step values, length and play with it",()=>{
 const tracks=kit.tracks.length;
 act(()=>seq.replacePattern(0,Array.from({length:tracks+1},(_,t)=>Array.from({length:16},(_,s)=>(t===0||t===2)&&s%4===0?1:0))));
 act(()=>seq.replacePattern(3,Array.from({length:tracks+1},(_,t)=>Array.from({length:16},(_,s)=>t===1&&s===9?1:0))));
 act(()=>seq.select(0));
 act(()=>seq.setLocks([[0,0]],{velocity:.5}));act(()=>seq.setTrackLength(2,5));act(()=>seq.setTrackPlay(2,{dir:'rev'}));
 act(()=>seq.copyTracks(3,[0,2]));
 const b=seq.bankRef.current;
 expect(b.current).toBe(3);
 expect(b.patterns[3][0][4]).toBe(1);expect(b.patterns[3][2][8]).toBe(1);   // the copied tracks
 expect(b.patterns[3][1][9]).toBe(1);                                         // a track that was not copied keeps what it had
 expect(b.locks[3]['0:0'].velocity).toBe(.5);
 expect(b.trackLengths[3][2]).toBe(5);expect(b.trackPlay[3][2].dir).toBe('rev');
 expect(b.patterns[0][1][9]).toBe(0);                                         // the source is untouched
});
test('the pattern change setting is kept, and only known values',()=>{
 act(()=>seq.setQuantize('bar'));expect(seq.bankRef.current.quantize).toBe('bar');
 act(()=>seq.setQuantize('whenever'));expect(seq.bankRef.current.quantize).toBe('end');
});
