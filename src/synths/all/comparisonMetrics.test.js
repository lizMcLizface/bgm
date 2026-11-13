// @vitest-environment node
import {it,expect,vi,afterEach} from 'vitest';import {webcrypto} from 'node:crypto';
import {createEventLedger,summarizeComparison,processMetrics,distribution,browserMemory} from './comparisonMetrics';
import {seeded} from '../../app/random';
import {drumStepEvents} from './drumSteps';
import {noteStepEvents} from '../../seq/notes';
afterEach(()=>vi.unstubAllGlobals());
it('hashes the same note/hit payload at relative sample positions across independent context epochs',async()=>{
 vi.stubGlobal('crypto',webcrypto);const a=createEventLedger(48000,10),b=createEventLedger(48000,10);
 for(const [ledger,epoch]of[[a,4],[b,25]]){ledger.step({time:epoch});ledger.events([{time:epoch+.5,track:1,note:60,duration:.2,velocity:.8},{time:epoch+11,track:2,note:61}],epoch);}
 expect((await a.snapshot()).hash).toBe((await b.snapshot()).hash);expect((await a.snapshot()).count).toBe(1);
 const c=createEventLedger(48000,10);c.step({time:0});c.events([{time:.5,track:1,note:60,duration:.2,velocity:.7}],1);expect((await c.snapshot()).hash).not.toBe((await a.snapshot()).hash);expect((await c.snapshot()).lateEvents).toBe(1);
});
const fixture=()=>({plan:{order:['current','rust','rust','current']},runs:['current','rust','rust','current'].map((backend,index)=>({index,backend,actualHash:'same',conditions:{sampleRate:48000},events:{hash:'notes',lateEvents:0},issues:[],sequence:{observed:true,underrunEvents:0,underrunSeconds:0,meterMax:{master:.8}}}))});
it('separates a fair workload with poor deadlines from an invalid or incomplete comparison',()=>{
 const data=fixture();expect(summarizeComparison(data).comparable).toBe(true);data.runs[1].sequence.underrunEvents=5;expect(summarizeComparison(data).comparable).toBe(true);expect(summarizeComparison(data).backends.rust.underrunEvents).toBe(5);
 for(const modify of [d=>d.runs.pop(),d=>d.runs[1].actualHash='changed',d=>d.runs[1].events.hash='changed',d=>d.runs[1].conditions.sampleRate=96000,d=>d.runs[1].issues.push('hidden'),d=>d.runs[1].sequence.observed=false,d=>d.runs[1].events.lateEvents++,d=>d.runs[1].backend='current']){const d=fixture();modify(d);expect(summarizeComparison(d).comparable).toBe(false);}
});
it('joins only complete process intervals inside a phase and refuses insufficient or overlapping coverage',()=>{
 const phase={startedUtc:'2026-11-13T10:00:00Z',endedUtc:'2026-11-13T10:00:10Z'},row=(start,end)=>({startUtc:`2026-11-13T10:00:${start}Z`,endUtc:`2026-11-13T10:00:${end}Z`,cpuCorePercent:25,privateBytes:1000,missing:[]});
 const report={scope:'All renderer',scopeConfirmed:true,processIds:[123],samples:[row('00','05'),row('05','10'),row('10','15')]};
 expect(processMetrics([report],phase)).toMatchObject({samples:2,valid:true,coverage:1,coreEquivalentPercent:{p50:25}});
 expect(processMetrics([{...report,samples:[row('00','05')]}],phase).valid).toBe(false);
 expect(processMetrics([report,report],phase).valid).toBe(false);expect(processMetrics([],phase)).toBe(null);
 expect(processMetrics([{...report,scopeConfirmed:false}],phase).valid).toBe(false);
});
it('labels JS-only heap and uses nearest-rank distribution without inventing unavailable values',()=>{
 expect(browserMemory({})).toBe(null);expect(browserMemory({memory:{usedJSHeapSize:20}}).scope).toContain('excludes Native audio');
 expect(distribution([4,1,2,3])).toMatchObject({p50:2,p95:4,max:4});expect(distribution([NaN])).toBe(null);
});
it('replays probability expression through real note and drum factories with a fresh fixed random stream',()=>{
 const execute=seed=>{const random=seeded(seed),out=[];for(let count=0;count<64;count++){
  const ctx={time:count*.1,stepSec:.1,count,cycle:count,random,key:{tonic:0,scale:[0,2,4,5,7,9,11]}};
  out.push(...drumStepEvents({steps:[{hits:[{drum:0,velocity:.8,duration:1,lock:{prob:.5}}]}]},0,ctx));
  out.push(...noteStepEvents({steps:[{prob:.5,n:[{d:0,o:4,a:0,len:1}],vel:.8}],length:1},0,ctx));
 }return out;};
 expect(execute(123)).toEqual(execute(123));expect(execute(123)).not.toEqual(execute(124));
});
