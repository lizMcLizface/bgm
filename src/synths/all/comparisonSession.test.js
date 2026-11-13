// @vitest-environment node
import {afterEach,it,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {createComparison,readComparison,saveComparisonRun,comparisonUrl,fingerprint,comparisonScope,initializeComparisonStorage,scopedStorageKey} from './comparisonSession';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))};};
afterEach(()=>vi.unstubAllGlobals());
it('freezes a detached recipe, restores it for every fresh document and preserves query quality settings',async()=>{
 vi.stubGlobal('crypto',webcrypto);const store=storage(),recipe={scene:'Rain',project:{bars:2},settings:{seed:4}},data=await createComparison({recipe,conditions:{sampleRate:48000},returnUrl:'http://local/synths/all/?perf=1',conveniences:{'synths:layout':'{"x":2}'}},store);
 recipe.project.bars=99;expect(data.recipe.project.bars).toBe(2);expect(await fingerprint(data.recipe)).toBe(data.recipeHash);
 expect(readComparison(store,data.id)).toEqual(data);expect(store.getItem(scopedStorageKey(data.id,'synths:all:state'))).toContain('"bars":2');
 let next=saveComparisonRun(data,{backend:'current',index:0},store);
 const url=comparisonUrl(next,'http://local/synths/all/?perf=1&allAudio=current');expect(url.searchParams.get('allAudio')).toBe('rust');expect(url.searchParams.get('perf')).toBe('1');
 store.setItem(scopedStorageKey(data.id,'synths:layout'),'modified');initializeComparisonStorage(data,store);expect(store.getItem(scopedStorageKey(data.id,'synths:layout'))).toBe('{"x":2}');
 expect(()=>saveComparisonRun(data,{backend:'current',index:0},store)).toThrow(/already changed/);expect(()=>saveComparisonRun(next,{backend:'current',index:1},store)).toThrow(/already changed/);
});
it('limits storage scoping to an explicit All comparison and refuses missing snapshots',()=>{
 const id='12345678-1234-1234-1234-123456789abc';expect(comparisonScope({pathname:'/synths/all/',search:'?allCompare='+id})).toBe(id);
 expect(comparisonScope({pathname:'/ambient/',search:'?allCompare='+id})).toBe(null);expect(comparisonScope({pathname:'/synths/all/',search:'?allCompare=oops'})).toBe(null);
 expect(()=>readComparison(storage(),id)).toThrow(/unavailable/);
});
it('canonical fingerprints ignore object insertion order while retaining array order',async()=>{
 vi.stubGlobal('crypto',webcrypto);expect(await fingerprint({a:1,b:[2,3]})).toBe(await fingerprint({b:[2,3],a:1}));expect(await fingerprint([2,3])).not.toBe(await fingerprint([3,2]));
});
