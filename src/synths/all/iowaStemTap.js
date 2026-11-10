import {pitchRange} from '../../app/engine/iowaModel/model';
import {PATCHES} from '../../app/engine/iowaModel/patches';
export function iowaStemTap(instrument,assertHost=()=>{}){
 const player=instrument?.player,id=instrument?.preset?.iowa,table=player?.tableOf(id);
 const signature=()=>JSON.stringify({id:instrument?.preset?.iowa,tune:instrument?.preset?.tune??0,vibrato:player?.vibrato});
 const captured=signature();
 const assertCurrent=()=>{assertHost();if(!player||instrument.disposed||instrument.loading||instrument.player!==player||player.tableOf(id)!==table||signature()!==captured||!table||!PATCHES.some(p=>p.id===id)||!player.bus)throw Error('Select a ready unchanged Iowa source.');};
 assertCurrent();const range=pitchRange(table);
 return {kind:'iowa',input:player.bus,patch:{version:1,id,table:structuredClone(table),vibrato:player.vibrato,tune:instrument.preset.tune??0},auditionMidi:midi=>Math.max(range[0],Math.min(range[1],Math.round(midi))),assertCurrent,activate(){assertCurrent();return instrument.holdSourceInput();}};
}
