import {parallelPreset,validParallel,busInstances,busRack} from './parallelModel';
import {parallelBusModel} from './parallelBusModel';
import {instanceStages} from './instances';
import {rackPackets,RACK_PARAMS} from './params';
import {cleanEffectsState,createEffectsObjects,encodeEffectsSetup,decodeEffectsSetup} from './deskState';
import {ZPLANE_SHAPE_NAMES} from './zplaneShapes';

it('keeps explicit Z-plane-first routing audible and separates branch/master delay state',()=>{
 const p=parallelPreset();for(const bus of Object.values(p.buses))expect(bus.rack).toEqual(RACK_PARAMS.sanitize(bus.rack));expect(validParallel(p)).toBe(true);
 expect(instanceStages(busInstances(p.buses.wet),busRack(p.buses.wet)).map(s=>s.kind)).toEqual(['zplane','inserts','vibrato','delay']);
 const wet=rackPackets(busRack(p.buses.wet));expect(wet.extras.zplane.on).toBe(true);expect(wet.inserts.chorus).toBe(.8);expect(wet.effects.delay).toBe(.28);
 expect(ZPLANE_SHAPE_NAMES[p.buses.wet.rack['zplane.a']]).toBe('Dark');expect(wet.extras.vibrato).toMatchObject({on:true,rate:4.5,depth:12});
 p.buses.wet.rack['effects.delayMs']=900;expect(p.buses.master.rack['effects.delayMs']).toBe(125);
 const apply=vi.fn(),model=parallelBusModel(p.buses.wet,'wet',()=>{},apply,100);model.moveBy('zplane',1);
 expect(apply.mock.lastCall[0].order).toEqual(['chorus','zplane','vibrato','delay']);
});
it('loads pre-vibrato desk files without replacing existing processors or routing',()=>{
 const state=cleanEffectsState({parallel:parallelPreset()}),store=createEffectsObjects(state),data=JSON.parse(encodeEffectsSetup(state,store.snapshot()));
 data.instances.instances=data.instances.instances.filter(i=>i.kind!=='vibrato');data.parallel.buses.wet.order=data.parallel.buses.wet.order.filter(id=>id!=='vibrato');delete data.parallel.views['wet:vibrato'];
 for(const values of [data.rack,...Object.values(data.parallel.buses).map(b=>b.rack)])for(const key of ['switch.vibrato','vibrato.rate','vibrato.depth'])delete values[key];
 const restored=decodeEffectsSetup(JSON.stringify(data));expect(restored.instances.instances.some(i=>i.kind==='vibrato')).toBe(true);expect(restored.instances.chain).toEqual(data.instances.chain);expect(restored.parallel.buses.wet.order).toEqual(data.parallel.buses.wet.order);expect(restored.parallel.buses.wet.rack['vibrato.depth']).toBe(12);store.dispose();
});
it('round-trips the complete parallel setup and rejects malformed buses and mixer state atomically',()=>{
 const state=cleanEffectsState({parallel:parallelPreset(),panels:{rack:false}}),store=createEffectsObjects(state),data=JSON.parse(encodeEffectsSetup(state,store.snapshot()));
 expect(data.version).toBe(4);expect(decodeEffectsSetup(JSON.stringify(data))).toEqual({...state,workbench:data.workbench});
 for(const damage of [d=>delete d.parallel,d=>d.parallel.buses.wet.order.push('delay'),d=>d.parallel.buses.master.order.push('missing'),d=>d.parallel.buses.drive.drives.overdrive.params.drive=Infinity,d=>d.parallel.mixer.strips.dry.vol=2,d=>d.parallel.views['unknown:delay']=true,d=>d.panels.rack='yes']){
  const bad=structuredClone(data);damage(bad);expect(()=>decodeEffectsSetup(JSON.stringify(bad))).toThrow('parallel routing');
 }
 const old={...data,version:3};delete old.parallel;delete old.panels.rack;expect(decodeEffectsSetup(JSON.stringify(old))).toMatchObject({parallel:null,panels:{rack:true}});store.dispose();
});
