import {iowaFixture} from './iowaFixture';
import {sixSourceDag} from './pitchedFixture';
import {modulatedPianoFixture} from './pianoFixture';
export function iowaMixedFixture(fixture,flute,marimba){
 const p=sixSourceDag(fixture,48000),one=iowaFixture(flute,'flute'),two=iowaFixture(marimba,'marimba-roll',{notes:[{midi:60,time:.125,duration:.8,velocity:.65}]}),piano=modulatedPianoFixture('measuredRavel','linear');
 for(const [id,f]of [[1,one.patch],[3,two.patch],[4,piano]]){p.modules=p.modules.map(n=>n.id===id?{...f.modules[0],id}:n);p.events=p.events.filter(e=>e.target!==id).concat(f.events.map(e=>({...e,target:id,owner:id})));}
 return p;
}
