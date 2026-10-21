// @vitest-environment node
import {soundList,nextSound} from './SoundPicker';
import {LabMidi} from '../../labs/input';

const synth={categories:[{id:'keys',label:'Keys'},{id:'pads',label:'Pads'},{id:'fx',label:'Effects'}]};
const presets=[{name:'K1',category:'keys'},{name:'P1',category:'pads'},{name:'K2',category:'keys'},{name:'F1',category:'fx'},{name:'P2',category:'pads'}];
const mine=[{name:'Mine A'}];
const list=soundList(synth,presets,mine);
const step=(current,cat,dir,jump=false)=>nextSound(list,current,cat,dir,jump)?.name;

test('sounds are ordered by category, then your own',()=>{
 expect(list.sounds.map(p=>p.name)).toEqual(['K1','K2','P1','P2','F1','Mine A']);
});

test('left and right step through the sounds and wrap around',()=>{
 expect(step('K1','keys',1)).toBe('K2');
 expect(step('K2','keys',1)).toBe('P1');
 expect(step('K1','keys',-1)).toBe('Mine A');
 expect(step('Mine A','mine',1)).toBe('K1');
});

test('up and down jump to the first sound of the neighbouring category',()=>{
 expect(step('K2','keys',1,true)).toBe('P1');
 expect(step('P2','pads',-1,true)).toBe('K1');
 expect(step('F1','fx',1,true)).toBe('Mine A');
 expect(step('Mine A','mine',1,true)).toBe('K1');
});

test('a generated sound (not in the list) steps from its category',()=>{
 expect(step('Pads ✦12','pads',1)).toBe('P1');
 expect(step('Pads ✦12','pads',1,true)).toBe('F1');
});

test('MIDI Program Change reaches the page',()=>{
 const got=[];const m=new LabMidi({on(){},off(){},sustain(){},control(){},panic(){},program:n=>got.push(n)});
 m.message([0xc0,5]);m.message([0xc3,12]);
 expect(got).toEqual([5,12]);
});
