import {GROUPS,groupOf} from './groups';
it('splits keys from bells and the two kinds of pad, and leaves every other family whole',()=>{
 expect(groupOf('keys','Glass bells')).toBe('bells');expect(groupOf('keys','Celesta')).toBe('bells');expect(groupOf('keys','Chimes')).toBe('bells');
 expect(groupOf('keys','Felt Keys')).toBe('keys');expect(groupOf('keys','FM Rhodes')).toBe('keys');
 expect(groupOf('pads','Studio Grand')).toBe('pads-acoustic');expect(groupOf('pads','Measured Horn')).toBe('pads-acoustic');
 expect(groupOf('pads','Soft Pad')).toBe('pads');expect(groupOf('pads','Galaxy Arp')).toBe('pads');expect(groupOf('bass','Warm Bass')).toBe('bass');
 for(const id of ['keys','bells','pads','pads-acoustic'])expect(GROUPS.some(g=>g[0]===id)).toBe(true);
});
