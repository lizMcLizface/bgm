import {categoryExport,categoryCsv} from './exportData';
import {NOTES} from './measure';
const levels=()=>({attack:NOTES.map(()=>-20),hold:NOTES.map(()=>-24),average:NOTES.map(()=>-22),a:{attack:NOTES.map(()=>-21),hold:NOTES.map(()=>-25),average:NOTES.map(()=>-23)}});
const data=categoryExport('Bass',[{id:'a',name:'Warm "Bass"'},{id:'b',name:'Unmeasured'}],{low:{},mid:{a:{engine:'wasm',single:levels(),chord:levels()}}});
it('exports only measured instruments, under the velocities that have them',()=>{
 expect(Object.keys(data.velocities)).toEqual(['mid']);expect(Object.keys(data.velocities.mid)).toEqual(['Warm "Bass"']);expect(data.notes[0]).toEqual({midi:21,hz:27.5});expect(data.category).toBe('Bass');
});
it('writes one csv row per note and note set, quoting names',()=>{
 const lines=categoryCsv(data).split('\n');expect(lines[0]).toBe('velocity,instrument,engine,notes,midi,hz,attack,hold,average,attack_dBA,hold_dBA,average_dBA');
 expect(lines).toHaveLength(1+2*NOTES.length);expect(lines[1]).toBe('mid,"Warm ""Bass""",wasm,single,21,27.5,-20,-24,-22,-21,-25,-23');
});
