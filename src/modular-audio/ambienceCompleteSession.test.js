// @vitest-environment node
import {it,expect} from 'vitest';
import {ambienceCompleteHostFixture} from './ambienceCompleteHost.fixture.js';
import {prepareAmbienceSpatialTopologyPool} from './ambienceSpatialTopologyHost.js';
import {createAmbienceCompleteSession} from './ambienceCompleteSession.js';
it('uses the actual generated live producer and actual prepared topology kernel across a rolling4096receipt boundary',async()=>{
 const f=ambienceCompleteHostFixture(),pool=await prepareAmbienceSpatialTopologyPool(f.ctx,f.options);let session;
 try{session=await createAmbienceCompleteSession(pool,{offset:17.3,wander:{mode:'brownian',period:73,total:.1,layers:.2}});await session.ensureLayer(2,{shape:[.4,.2,.8,-.1,0]});await session.connect(f.ctx.createGain());for(let i=0;i<4200;i++)await session.enqueue('live-receipt',()=>{});expect(session.describe().liveQueue).toMatchObject({total:4202,retained:256,pending:0});
  const resource=await pool.prepare(session.bed,6,'refill',{at:15});await resource.refill();expect(session.bed.births.get(6)).toBe(0);expect((await pool.stats()).upload.resources).toBe(0);expect(session.describe().error).toBeNull();
 }finally{expect((await session?.dispose()).clean).toBe(true);expect((await pool.dispose()).clean).toBe(true);}
});

it('publishes repeated real worker refills at distinct canonical epochs with fixed kernel memory and independent unused beds',async()=>{const f=ambienceCompleteHostFixture();f.ctx.sampleRate=8000;f.scope.sampleRate=8000;const pool=await prepareAmbienceSpatialTopologyPool(f.ctx,f.options);let a,b;try{a=await createAmbienceCompleteSession(pool,{wander:{mode:'brownian',period:73}});b=await createAmbienceCompleteSession(pool,{wander:{mode:'brownian',period:73}});const core=f.registry().slots[a.bed.slot].core,other=f.registry().slots[b.bed.slot].core,memory=core.memory,before=other.stats();for(let i=1;i<=48;i++){const frame=Math.ceil(i*15*8000/128)*128;f.ctx.currentTime=frame/8000;core.sync(frame);core.render({bed:1});const stage=await pool.prepare(a.bed,6,'refill',{at:f.ctx.currentTime});await stage.refill();expect(core.memory).toBe(memory);expect((await pool.stats()).upload.resources).toBe(0);}expect(other.stats()).toEqual(before);expect(a.describe().error).toBeNull();}finally{await a?.dispose();await b?.dispose();expect((await pool.dispose()).clean).toBe(true);}});
