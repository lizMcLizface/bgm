import{describe,it,expect}from'vitest';
import{planFilterRackActivity as plan,preflightFilterRackTransition as preflight,assertFilterSourceLeaseAllowed as lease,FilterRackAdmissionError}from'./filterRackAdmission.js';
const source=()=>({version:1,authority:'active-program',identity:'owned-source-caller-declaration',revision:1,rate:48000,channels:1,gate:1,lease:'none',layout:'fixed'});
const stage=(id,kind=id)=>({id,kind});
const proposal=()=>({rate:48000,source:source(),stages:[stage('filter')]});
const contract=(id,kind=id,layout='preserve')=>({version:1,id,kind,identity:'explicit-owned-contract/'+id,input:'active-program',output:'active-program',layout});
function code(fn,c){expect(fn).toThrow(FilterRackAdmissionError);try{fn();}catch(e){expect(e.code).toBe(c);}}
describe('explicit Filter rack admission, without native flag inference',()=>{
 it('admits first Filter and freezes a detached declaration',()=>{const p=proposal(),r=plan(p);p.source.identity='changed';p.stages[0].kind='space';expect(r.source.identity).toBe('owned-source-caller-declaration');expect(r.filters).toEqual([{id:'filter',activityAuthority:'continuous-program',channels:1,sourceRevision:1}]);expect(Object.isFrozen(r)).toBe(true);expect(Object.isFrozen(r.stages[0])).toBe(true);});
 it.each([44100,48000,96000,192000])('admits declared rate%d',rate=>{const p=proposal();p.rate=p.source.rate=rate;expect(plan(p).rate).toBe(rate);});
 it.each([8000,24000,32000,48001])('refuses unsupported rate%d',rate=>code(()=>plan({...proposal(),rate}),'RATE'));
 it.each([{authority:'rust'},{authority:undefined},{gate:0},{gate:.5},{lease:'active'},{lease:'unknown'},{layout:'dynamic'},{revision:-1},{channels:0},{rate:44100}])('refuses incomplete/unknown activity%j',patch=>{const p=proposal();Object.assign(p.source,patch);code(()=>plan(p),'SOURCE_ACTIVITY');});
 it('never treats Rust identity as activity authority',()=>{const p=proposal();delete p.source.authority;p.source.identity='rust';code(()=>plan(p),'SOURCE_ACTIVITY');});
 it('requires a contract for each prefix, including bypassed stages',()=>{const p=proposal();p.stages.unshift({...stage('compressor'),bypassed:true});code(()=>plan(p),'PREFIX_ACTIVITY');});
 it('admits explicit owned prefix contracts and propagates declared layout',()=>{const p=proposal();p.stages=[stage('width'),stage('ring'),stage('filter'),stage('later','filter')];p.stageContracts=[contract('width','width','stereo'),contract('ring')];const r=plan(p);expect(r.filters.map(s=>s.channels)).toEqual([2,2]);expect(r.contracts.length).toBe(2);});
 it('does not require activity contracts for suffixes after the last Filter',()=>{const p=proposal();p.stages.push(stage('space'));expect(plan(p).contracts).toEqual([]);});
 it.each(['space','compressor','drive','tape','native-filter'])('refuses unknown prefix%s',kind=>{const p=proposal();p.stages.unshift(stage(kind));code(()=>plan(p),'PREFIX_ACTIVITY');});
 it('binds contracts to concrete kind/ID rather than a processor-family label',()=>{const p=proposal();p.stages.unshift(stage('first','space'));p.stageContracts=[contract('first','ring')];code(()=>plan(p),'PREFIX_ACTIVITY');});
 it('refuses duplicate IDs and bounded resource excess',()=>{code(()=>plan({...proposal(),stages:[stage('filter'),stage('filter')]}),'TOPOLOGY');code(()=>plan({...proposal(),stages:Array.from({length:65},(_,i)=>stage(String(i)))}),'TOPOLOGY');});
 it('refuses stale source revisions before a transition is returned',()=>{const p=proposal(),old=plan(p);p.source.revision=0;code(()=>preflight(old,p),'STALE_SOURCE');});
 it('validates the whole proposed reorder before caller mutation',()=>{const p=proposal(),old=plan(p),calls=[];const apply=next=>{const admitted=preflight(old,next);calls.push(admitted);};p.stages.unshift(stage('space'));code(()=>apply(p),'PREFIX_ACTIVITY');expect(calls).toEqual([]);expect(old.stages).toEqual([stage('filter')]);});
 it('refuses a lease before caller gate mutation',()=>{let gate=1;const r=plan(proposal());code(()=>{lease(r);gate=0;},'SOURCE_LEASE');expect(gate).toBe(1);});
 it('allows removal to a native/unselected rack without claiming its activity',()=>{const p=proposal(),old=plan(p);p.stages=[];p.source={lease:'active'};const r=preflight(old,p);expect(r.filters).toEqual([]);expect(r.source).toBe(null);expect(()=>lease(r)).not.toThrow();});
});
