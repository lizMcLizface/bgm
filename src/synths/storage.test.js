import {it,expect,afterEach} from 'vitest';import {load,save} from './storage';
afterEach(()=>{localStorage.clear();sessionStorage.clear();window.history.replaceState({},'','/');});
it('isolates all nested workbench conveniences during comparison and restores normal saves afterwards',()=>{
 localStorage.setItem('synths:all:state','{"original":1}');
 window.history.replaceState({},'','/synths/all/?allCompare=12345678-1234-1234-1234-123456789abc');
 expect(load('synths:all:state',null)).toEqual({original:1});expect(save('synths:all:state',{trial:2})).toBe(true);
 expect(load('synths:all:state',null)).toEqual({trial:2});expect(localStorage.getItem('synths:all:state')).toBe('{"original":1}');
 save('synths:all:objects',{x:9});expect(localStorage.getItem('synths:all:objects')).toBe(null);
 window.history.replaceState({},'','/synths/all/');expect(load('synths:all:state',null)).toEqual({original:1});
 save('synths:all:state',{normal:3});expect(JSON.parse(localStorage.getItem('synths:all:state'))).toEqual({normal:3});
});
