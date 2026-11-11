// @vitest-environment node
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {planSourcePool,preparePoolMaster} from './poolPlan';
import {sixSourceDag} from './pitchedFixture';
import {ownedInsertsSpec} from './ownedInserts';
import {ownedEffectsSpec} from './ownedEffects';
import {ownedRackFxSpec} from './ownedRackFx';
import {ownedVoiceFxSpec} from './ownedVoiceFx';
const contracts=JSON.parse(fs.readFileSync('public/modular-audio/contracts.json'));
const fixture=JSON.parse(fs.readFileSync('public/modular-audio/six-role-fixture.json'));
const patch=()=>({...sixSourceDag(fixture,48000),latencyCompensation:true});
const messages=map=>[[1,5],[2,3],[4,6]].map(ids=>({sourceLatencies:Object.fromEntries(ids.map(id=>[id,map[id]]))}));
const actual={1:0,2:7.5,3:7.75,4:0,5:0,6:0};
it('carries explicit compensation policy across every stage and uses actual prepared fractional metadata',()=>{
  const p=patch(),plan=planSourcePool(p,contracts),prepared=preparePoolMaster(plan,messages(actual),contracts);
  expect(plan.sources.every(p=>p.latencyCompensation===true)).toBe(true);expect(plan.master.latencyCompensation).toBe(true);
  expect(prepared.sourceLatencies).toEqual(actual);
  expect(prepared.patch.modules.filter(n=>n.type==='host.audio').map(n=>[n.id,n.config.latencyFrames])).toEqual([[1,0],[2,7.5],[3,7.75],[4,0],[5,0],[6,0],[7,0]]);
  expect(plan.master.modules.find(n=>n.id===2).config).toBeUndefined();
  expect(contracts.modules.find(n=>n.type==='legacy.fm').latencyFrames).toBeNull();
});
it.each([null,[],{},[{sourceLatencies:{1:0}}],messages({...actual,2:-1}),messages({...actual,2:Infinity}),messages({...actual,2:262145}),messages({...actual,2:'7.5'}),messages({...actual,2:NaN})])('requires complete bounded actual metadata rather than guessing descriptor latency: %j',bad=>{
  expect(()=>preparePoolMaster(planSourcePool(patch(),contracts),bad,contracts)).toThrow(/source latenc/);
});
it('rejects extra source identities and preserves the uncompensated master without requiring metadata',()=>{
  const plan=planSourcePool(patch(),contracts),ready=messages(actual);ready[0].sourceLatencies[99]=0;expect(()=>preparePoolMaster(plan,ready,contracts)).toThrow('actual prepared');
  const p=patch();p.latencyCompensation=false;const off=planSourcePool(p,contracts),prepared=preparePoolMaster(off,null,contracts);expect(prepared.patch).toBe(off.master);expect(prepared.sourceLatencies).toBeNull();expect(off.sources.every(p=>p.latencyCompensation===false)).toBe(true);
  delete p.latencyCompensation;expect(planSourcePool(p,contracts).master).not.toHaveProperty('latencyCompensation');
});
it('prebooks master automation and keeps its owner domain separate from source controls',()=>{
  const p=patch(),event={kind:'parameter',target:15,owner:77,parameter:'gain',value:.08,frame:256};p.events.push(event);
  const plan=planSourcePool(p,contracts);expect(plan.master.events).toEqual([event]);expect(plan.sources.every(p=>!p.events.some(e=>e.owner===77))).toBe(true);expect(plan.owners.get(77)).toBe('MASTER');
  p.events.at(-1).owner=1;expect(()=>planSourcePool(p,contracts)).toThrow('source/master');
});
it.each(['legacy.inserts','legacy.effects','graph.delay','rack.pitch','voice.shimmer'])('retains dependent %s in the master and rejects its worker-only contract',type=>{
  const p=patch(),config=type==='legacy.inserts'?ownedInsertsSpec({}):type==='legacy.effects'?ownedEffectsSpec({}):type==='rack.pitch'?ownedRackFxSpec('pitch'):type==='voice.shimmer'?ownedVoiceFxSpec('shimmer'):{version:1,frames:128};
  p.modules.push({id:61,type,version:1,parameters:{},config});p.connections.find(e=>e.to.module===18).from.module=61;p.connections.push({id:101,kind:'audio',from:{module:17,port:'audio.out'},to:{module:61,port:'program.in'}});
  const plan=planSourcePool(p,contracts);expect(plan.master.modules.find(n=>n.id===61)?.type).toBe(type);expect(plan.sources.every(p=>!p.modules.some(n=>n.id===61))).toBe(true);
  const guarded=structuredClone(contracts);guarded.modules.find(d=>d.type===type).execution='worker-only';expect(()=>planSourcePool(p,guarded)).toThrow('Worker executor required');
});
it('rejects the actual Freeze descriptor from the dependent realtime pool master',()=>{
  const p=patch();p.modules.push({id:61,type:'voice.freeze',version:1,parameters:{},config:ownedVoiceFxSpec('freeze')});p.connections.find(e=>e.to.module===18).from.module=61;p.connections.push({id:101,kind:'audio',from:{module:17,port:'audio.out'},to:{module:61,port:'program.in'}});expect(()=>planSourcePool(p,contracts)).toThrow('Worker executor required');
});
