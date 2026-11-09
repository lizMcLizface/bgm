// @vitest-environment node
import {it,expect} from 'vitest';
import {profileOptions,profileDetails,headroomSchedule,saveWorkerSession,loadWorkerSession} from './bufferProfiles';
import {summarizeProfiles,summarizeHeadroom} from './profileMetrics';
it('retains original profiles and adds explicit capacity, latency and memory without changing producer cadence',()=>{
  expect(profileOptions('short')).toEqual({blockFrames:256,poolBlocks:4});for(const extra of [0,2,4])expect(profileDetails('short',96000,extra)).toMatchObject({blockFrames:256,poolBlocks:4+extra,extraBlocks:extra,delayFrames:(4+extra)*256,delayMs:(4+extra)*256/96,poolPcmBytes:(4+extra)*256*16*4*3});expect(profileDetails('default',48000)).toMatchObject({delayFrames:4096});for(const n of [-1,1,8,'2'])expect(()=>profileOptions('short',n)).toThrow();
});
it('rotates equal warmups and measured positions for all capacities',()=>{const jobs=headroomSchedule();expect(jobs).toHaveLength(12);for(const n of [0,2,4]){expect(jobs.filter(j=>j.extraBlocks===n&&j.phase==='warmup')).toHaveLength(1);expect(jobs.slice(3).map((j,i)=>({...j,position:i%3})).filter(j=>j.extraBlocks===n).map(j=>j.position).sort()).toEqual([0,1,2]);}expect(()=>headroomSchedule(0)).toThrow();});
it('roundtrips opt-in headroom, defaults old sessions to zero and rejects invalid persisted capacity',()=>{const s=saveWorkerSession({id:'pinned'},'short',96000,'message',4);expect(loadWorkerSession(s,x=>x)).toMatchObject({extraBlocks:4,scheduling:'message'});const old=JSON.parse(s);delete old.extraBlocks;expect(loadWorkerSession(JSON.stringify(old),x=>x).extraBlocks).toBe(0);expect(()=>loadWorkerSession(s.replace('"extraBlocks": 4','"extraBlocks": 3'),x=>x)).toThrow();});
it('never mixes lead histograms or passes across headroom capacities, rates or modes',()=>{
 const row={profile:'short',phase:'measured',extraBlocks:2,rate:96000,pass:true,delivery:{complete:true},executor:{actual:'pool',scheduling:'timer',poolBlocks:6}};
 const rows=[row,{...row,extraBlocks:0,executor:{...row.executor,poolBlocks:4}},{...row,rate:48000},{...row,executor:{...row.executor,poolBlocks:8}},{...row,executor:{...row.executor,scheduling:'message'}}];
 const s=summarizeHeadroom(rows,'short',96000);expect(s.map(s=>s.passedRuns)).toEqual([1,1,0]);expect(s[1].delayFrames).toBe(1536);expect(summarizeProfiles(rows,96000).find(s=>s.profile==='short').measuredRuns).toBe(1);
});
