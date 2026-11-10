// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {iowaStemTap} from './iowaStemTap';
import {settleLevels} from '../../app/engine/iowaModel/model';
import table from '../../library/iowaTables/flute.json';
const instrument=()=>{const t=settleLevels(structuredClone(table));return {preset:{iowa:'flute',tune:0},player:{vibrato:1,bus:{},tableOf:()=>t},holdSourceInput:vi.fn(()=>vi.fn())};};
it('captures a detached settled table at the pre-room seam and holds its effects route',()=>{const i=instrument(),guard=vi.fn(),tap=iowaStemTap(i,guard);expect(tap.input).toBe(i.player.bus);expect(tap.patch.table).toEqual(i.player.tableOf());expect(tap.patch.table).not.toBe(i.player.tableOf());expect(tap.auditionMidi(0)).toBeGreaterThan(0);const release=tap.activate();expect(i.holdSourceInput).toHaveBeenCalledOnce();expect(release).toBeTypeOf('function');expect(guard).toHaveBeenCalledTimes(2);});
it('fails closed on replacement, loading, table change, tuning and vibrato changes',()=>{for(const change of [i=>i.player={...i.player},i=>i.loading=true,i=>i.disposed=true,i=>i.player.tableOf=()=>({}),i=>i.preset.tune=1,i=>i.player.vibrato=0,i=>i.preset.iowa='oboe']){const i=instrument(),tap=iowaStemTap(i);change(i);expect(()=>tap.assertCurrent()).toThrow();}});
