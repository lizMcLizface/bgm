// @vitest-environment node
import {it,expect} from 'vitest';
import {AlignedSourcePool} from './poolProtocol';
const groups=[[1,5],[2,3],[4,6]],inputs=()=>Array.from({length:7},()=>new Float32Array(2048));
function block(slot,frame){const buffer=new ArrayBuffer(256*16*4);new Float32Array(buffer).fill(frame+1);return {slot,frame,n:256,generation:1,buffer};}
it('never mixes an absent group with fresh program/key samples and recovers at the current frame',()=>{
  const recycled=[],p=new AlignedSourcePool({blockFrames:256,poolBlocks:2},1024,groups,(group,b)=>recycled.push([group,b.frame])),in0=inputs();p.accept(0,block(0,0));p.accept(2,block(0,0));p.fill(in0,256);expect(in0.every(b=>b.slice(0,512).every(v=>v===0))).toBe(true);expect(p.counters.underrunFrames).toBe(256);expect(p.accept(1,block(0,0))).toBe(false);
  for(let i=0;i<3;i++)p.accept(i,block(1,256));p.fill(in0,256);expect(in0.every(b=>b.slice(0,512).every(v=>v===257))).toBe(true);expect(p.counters).toMatchObject({deliveredFrames:256,underrunFrames:256,recoveries:1});expect(p.queues.every(q=>q.frame===512)).toBe(true);expect(recycled).toHaveLength(6);p.dispose();
});
it('rejects stale publication without replacing a current group slot',()=>{const p=new AlignedSourcePool({blockFrames:256,poolBlocks:2},1024,groups,()=>{});expect(p.accept(0,{...block(0,0),generation:2})).toBe(false);expect(p.accept(0,block(0,0))).toBe(true);expect(p.queues[0].count).toBe(1);expect(p.queues[0].counters.staleGeneration).toBe(1);p.dispose();});
