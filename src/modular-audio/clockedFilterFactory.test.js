// @vitest-environment node
import{it,expect,vi,afterEach}from'vitest';import crypto from'node:crypto';
const state=vi.hoisted(()=>({clocks:[],owners:[]}));
vi.mock('./nativeContextClock.js',()=>({prepareNativeContextClock:vi.fn(async context=>{
 const clock={context,retired:false,links:0,releases:0,releaseError:null,bindError:null,check(){if(this.retired)throw Error('retired generation');},snapshot(){return{version:'3333333333333333',retired:this.retired,consumers:this.links};},connect(node,{onError}){this.check();if(this.bindError)throw this.bindError;this.links++;let closed=false;return{context,spec:{generation:1},ready:Promise.resolve(),release:async()=>{if(closed)return;closed=true;this.links--;this.releases++;if(this.releaseError)throw this.releaseError;},onError};}};state.clocks.push(clock);return clock;
})}));
vi.mock('./clockedFilterExtra.js',()=>({ClockedFilterExtraStage:class{
 constructor(context,assets,options){Object.assign(this,{context,assets,options,inner:{node:{}},disposed:false,error:null,closeCalls:0,values:null,ready:Promise.resolve()});state.owners.push(this);}
 patch(value){if(value.invalid)throw Error('invalid whole patch');this.values=value;}
 prepareInitial(){return Promise.resolve(this);}arm(){return Promise.resolve(this);}requestStats(){return Promise.resolve({calls:1});}setHostAwake(){}
 fail(error){this.error=String(error);this.dispose().catch(()=>{});}
 dispose(){this.disposed=true;this.closeCalls++;return this.closeBarrier??Promise.resolve();}
}}));
import{prepareClockedFilter}from'./clockedFilterFactory.js';
const wasm=Uint8Array.from([0,97,115,109,1,0,0,0]),processor=new TextEncoder().encode('// immutable test transport'),sha=data=>crypto.createHash('sha256').update(data).digest('hex');
function setup(){
 const context={sampleRate:48000,currentTime:0,state:'suspended',audioWorklet:{addModule:vi.fn(async()=>{})}},manifest={api:1,profile:'native-filter-explicit-pulls-v1',audited:false,version:'1111111111111111',bytes:wasm.length,wasm:sha(wasm)},host={api:1,profile:'native-context-clocked-filter-v1',version:'2222222222222222',kernelVersion:manifest.version,nativeClockVersion:'3333333333333333',wasm:manifest.wasm,processor:sha(processor),processorName:'native-filter-clocked-2222222222222222'};
 vi.stubGlobal('crypto',crypto.webcrypto);vi.stubGlobal('fetch',vi.fn(async url=>({ok:true,json:async()=>url.includes('filter-clocked')?host:manifest,arrayBuffer:async()=>url.includes('processor.js')?processor.slice().buffer:wasm.slice().buffer})));
 return{context,manifest,host};
}
afterEach(()=>{vi.unstubAllGlobals();state.clocks.length=state.owners.length=0;});
it('keeps context-bound independent links and idempotent owner cleanup without retiring a survivor',async()=>{
 const{context}=setup(),factory=await prepareClockedFilter(context,{activityAuthority:'continuous-program'}),clock=state.clocks[0],a=factory(context,{kind:'filter'}),b=factory(context,{kind:'filter'});await Promise.all([a.ready,b.ready]);expect(clock.links).toBe(2);const first=a.dispose();expect(a.dispose()).toBe(first);await first;expect(a.closeCalls).toBe(1);expect(clock.links).toBe(1);expect(clock.retired).toBe(false);b.patch({amount:1});await b.dispose();expect(clock.links).toBe(0);expect(clock.releases).toBe(2);expect(()=>factory({},{kind:'filter'})).toThrow(/another context/);
});
it('invalid preflight preserves a healthy owner while clock retirement fails it before mutation',async()=>{
 const{context}=setup(),factory=await prepareClockedFilter(context,{activityAuthority:'continuous-program'}),a=factory(context,{kind:'filter'}),clock=state.clocks[0];a.patch({amount:1});expect(()=>a.patch({invalid:true})).toThrow(/invalid whole/);expect(a.disposed).toBe(false);expect(a.values).toEqual({amount:1});clock.retired=true;expect(()=>a.patch({amount:2})).toThrow(/retired/);await a.dispose();expect(a.values).toEqual({amount:1});expect(a.disposed).toBe(true);expect(clock.links).toBe(0);
});
it('reprepares a retired generation offroute without registering its processor twice',async()=>{
 const{context}=setup(),old=await prepareClockedFilter(context,{activityAuthority:'continuous-program'});state.clocks[0].retired=true;const fresh=await prepareClockedFilter(context,{activityAuthority:'continuous-program'});expect(fresh).not.toBe(old);expect(state.clocks).toHaveLength(2);expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1);const a=fresh(context,{kind:'filter'});await a.dispose();
});
it('binding failure still closes the newly created owner and release failures remain visible',async()=>{
 const{context}=setup(),factory=await prepareClockedFilter(context,{activityAuthority:'continuous-program'}),clock=state.clocks[0];clock.bindError=Error('binding failure');expect(()=>factory(context,{kind:'filter'})).toThrow(/binding failure/);await Promise.resolve();expect(state.owners[0].disposed).toBe(true);clock.bindError=null;const a=factory(context,{kind:'filter'});clock.releaseError=Error('clock edge failure');await expect(a.dispose()).rejects.toThrow(/cleanup failed/);expect(a.closeCalls).toBe(1);expect(clock.links).toBe(0);
});
it('refuses a wrong kernel profile before constructing any clock or audio owner',async()=>{
 const{context,manifest}=setup();manifest.profile='unrelated';await expect(prepareClockedFilter(context,{activityAuthority:'continuous-program'})).rejects.toThrow(/dependency identity/);expect(state.clocks).toHaveLength(0);expect(state.owners).toHaveLength(0);
});

it('keeps metadata links alive until the processor disposal fence settles',async()=>{
 const{context}=setup(),factory=await prepareClockedFilter(context,{activityAuthority:'continuous-program'}),a=factory(context,{kind:'filter'}),clock=state.clocks[0];let acknowledge;a.closeBarrier=new Promise(resolve=>acknowledge=resolve);const closing=a.dispose();expect(a.disposed).toBe(true);expect(clock.links).toBe(1);expect(clock.releases).toBe(0);acknowledge();await closing;expect(clock.links).toBe(0);expect(clock.releases).toBe(1);
});

it('requires a supported explicit activity authority before any fetch or owner creation',()=>{const{context}=setup();expect(()=>prepareClockedFilter(context)).toThrow(/authority/);expect(()=>prepareClockedFilter({...context,sampleRate:8000},{activityAuthority:'continuous-program'})).toThrow(/44100/);expect(()=>prepareClockedFilter(context,{activityAuthority:'explicit-activity'})).toThrow();expect(fetch).not.toHaveBeenCalled();expect(state.owners).toHaveLength(0);});
it('rejects changing the immutable authority before a stage is created',async()=>{const{context}=setup(),factory=await prepareClockedFilter(context,{activityAuthority:'continuous-program'});expect(()=>factory(context,{activityAuthority:'explicit-activity'})).toThrow(/certified/);expect(()=>factory(context,{initialActivity:{}})).toThrow(/certified/);expect(()=>factory(context,{activityEvents:[{}]})).toThrow(/certified/);expect(state.owners).toHaveLength(0);});
