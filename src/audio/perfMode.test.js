import {perfFromSearch,readPerfChoice,perfEnabled,optionalSpeedup,setPerfChoice,withPerf} from './perfMode';
import {PERFORMANCE,readPerformance} from './performance';
beforeEach(()=>{history.replaceState(null,'','/?preset=glass-conservatory#notes');localStorage.clear();setPerfChoice(null);});
afterEach(()=>setPerfChoice(null));
it('requires an explicit trial and gives an explicit off priority over older flags',()=>{
 expect(perfFromSearch('?perf=1')).toBe(true);expect(perfFromSearch('?perf=0')).toBe(false);expect(perfFromSearch('?perf=x')).toBeNull();expect(perfEnabled()).toBe(false);expect(optionalSpeedup(true)).toBe(true);setPerfChoice(false);expect(optionalSpeedup(true)).toBe(false);setPerfChoice(true);expect(optionalSpeedup(false)).toBe(true);
});
it('updates and shares the current visit without overwriting saved preferences',()=>{
 localStorage.setItem('bgm-performance','{"sharedReverb":false,"reverb":"full"}');const saved=localStorage.getItem('bgm-performance'),listener=vi.fn();window.addEventListener('bgm-perf-mode-change',listener);
 setPerfChoice(true);expect(location.search).toContain('perf=1');expect(location.hash).toBe('#notes');expect(readPerfChoice()).toBe(true);expect(localStorage.getItem('bgm-performance')).toBe(saved);expect(localStorage.getItem('bgm-audio-engine')).toBeNull();expect(listener).toHaveBeenCalledOnce();setPerfChoice(false);expect(location.search).toContain('perf=0');expect(localStorage.getItem('bgm-performance')).toBe(saved);window.removeEventListener('bgm-perf-mode-change',listener);
});
it('preserves queries and fragments without storing the bundle in a patch',()=>{
 expect(withPerf('/?preset=x&bank=1#notes',true)).toBe('/?preset=x&bank=1&perf=1#notes');expect(withPerf('/?perf=1',false)).toBe('/?perf=0');expect(withPerf('/labs/all/',null)).toBe('/labs/all/');
});
it('temporarily shares matching rooms while retaining the base room quality and preference',()=>{
 const previous={...PERFORMANCE};localStorage.setItem('bgm-performance',JSON.stringify({reverb:'full',sharedReverb:false}));setPerfChoice(true);expect(PERFORMANCE.sharedReverb).toBe(true);expect(PERFORMANCE.reverb).toBe(previous.reverb);expect(readPerformance().sharedReverb).toBe(false);setPerfChoice(false);expect({...PERFORMANCE}).toEqual(previous);
});
