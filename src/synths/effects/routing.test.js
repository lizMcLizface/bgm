import {cleanRack,rackPackets} from './params';
import {BOX_ORDER_COUNT,boxCodeFromOrder,boxOrderFromCode,logicalOrder,logicalChain,routingPatch,rackStages} from './routing';
import {orderFromCode,chainUnits,stagesFor,moveUnit} from './order';
import {useRackModel,presetValues} from './rackParts';

it('keeps old order codes, masks, reverb-first routing and native packets valid',()=>{
 for(const order of [0,12345678,331331331])for(const first of [0,1]){
  const v={...cleanRack(),'master.order':order,'master.reverbFirst':first,'effects.delay':.3,'effects.reverb':.2};
  expect(rackStages(v)).toEqual(stagesFor(orderFromCode(order),chainUnits(v['master.chain']),!!first));
  expect(logicalChain(v)).toContain('delay');expect(logicalChain(v)).toContain('reverb');
  const next={...v,...routingPatch(v)};expect(logicalOrder(next)).toEqual(logicalOrder(v));expect(rackStages(next).some(s=>s.kind==='space')).toBe(false);
  expect(rackPackets(next).effects).toEqual(rackPackets(v).effects);
 }
});
it('round trips independent orders safely and preserves every non-space position',()=>{
 expect(Number.isSafeInteger(BOX_ORDER_COUNT)).toBe(true);
 for(const code of [0,1,123456789,BOX_ORDER_COUNT-1])expect(boxCodeFromOrder(boxOrderFromCode(code))).toBe(code);
 const v=cleanRack(),order=logicalOrder(v),next=moveUnit(order,'delay',0),p=routingPatch(v,{order:next});
 expect(logicalOrder({...v,...p})).toEqual(next);expect(logicalOrder({...v,...p}).filter(id=>id!=='delay')).toEqual(order.filter(id=>id!=='delay'));
});
it('adds and removes either space effect through the local model without affecting the other settings or identity',()=>{
 let values={...cleanRack(),'effects.delay':.3,'effects.reverb':.4,'effects.decay':7};
 const model=()=>useRackModel({values,independentSpace:true,onChange:p=>values={...values,...p}});
 model().removeFromChain('delay');expect(logicalChain(values)).not.toContain('delay');expect(logicalChain(values)).toContain('reverb');expect(rackPackets(values).effects.reverb).toBe(.4);expect(rackPackets(values).effects.delay).toBe(0);
 expect(model().available.some(a=>a.unit==='delay')).toBe(true);model().addToChain('delay');model().removeFromChain('reverb');
 expect(logicalChain(values)).toContain('delay');expect(logicalChain(values)).not.toContain('reverb');expect(rackPackets(values).effects.delay).toBe(.3);expect(rackPackets(values).effects.delayToReverb).toBe(0);expect(values['effects.decay']).toBe(7);
});
it('rewires separated space effects in their own positions and presets retain that routing',()=>{
 const v=cleanRack(),order=moveUnit(logicalOrder(v),'delay',0),mine={...v,...routingPatch(v,{order,chain:['delay','eq','reverb']})};
 expect(rackStages(mine)).toEqual([{kind:'delay'},{kind:'inserts',units:['eq']},{kind:'reverb'}]);
 const next=presetValues({values:{...cleanRack(),'inserts.chorus':.4}},mine);expect(logicalOrder(next)).toEqual(order);expect(logicalChain(next)).toEqual(expect.arrayContaining(['delay','eq','reverb','chorus']));
});
it('retains legacy grouped editing on other instruments until independent routing is explicitly used',()=>{
 let values=cleanRack();const model=useRackModel({values,onChange:p=>values={...values,...p}});model.removeFromChain('delay');
 expect(values['master.routing']).toBe(0);expect(logicalChain(values)).not.toContain('reverb');expect(logicalChain(values)).not.toContain('delay');
});
it('bypasses the independent reverb dry-level control without changing saved settings or the legacy dry path',()=>{
 const old={...cleanRack(),'effects.dry':.4,'switch.reverb':0},next={...old,...routingPatch(old)};
 expect(rackPackets(old).effects.dry).toBe(.4);expect(rackPackets(next).effects.dry).toBe(1);expect(next['effects.dry']).toBe(.4);
});
