// @vitest-environment node
import {Performer} from './performer';
import {CONTROLS} from './liveSynth';

test('switching to an effects tab releases local gestures while held MIDI notes and pedals continue',()=>{
 const target={noteOn:vi.fn(),noteOff:vi.fn(),control:vi.fn()},p=new Performer(target);
 p.down('key:KeyA',60,.8);p.down('touch:12',64,.8);p.down('midi:piano:0:67',67,.8);
 p.source('ribbon',5);p.source('wheel',1);p.source('pad',.8);p.source('aftertouch',.2);p.control('sustain',1);
 target.control.mockClear();p.releaseLocal();
 expect(target.noteOff.mock.calls).toEqual([[1],[2]]);expect(p.notes()).toEqual([67]);
 expect(target.control).toHaveBeenCalledWith(CONTROLS.bend,1);expect(target.control).toHaveBeenCalledWith(CONTROLS.pressure,.2);
 expect(target.control.mock.calls.some(([which])=>which===CONTROLS.sustain)).toBe(false);
 p.up('midi:piano:0:67');expect(target.noteOff).toHaveBeenLastCalledWith(3);expect(p.notes()).toEqual([]);
});
