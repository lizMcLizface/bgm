import {cleanRack} from './params';
import {migrateInstances,validInstances,syncInstances,projectInstances,instanceStages,normalizeInstances} from './instances';
import {rackStages,routingPatch,logicalOrder,BOX_UNITS} from './routing';

it('migrates old racks without changing their stage grouping, order codes or parameters',()=>{
 for(const rank of [0,1,9762,87178291199])for(const independent of [false,true]){
  let rack={...cleanRack(),'master.order':rank,'effects.delay':.3,'effects.reverb':.4};if(independent)rack={...rack,...routingPatch(rack,{order:logicalOrder(rack).reverse()})};
  const before=structuredClone(rack),graph=migrateInstances(rack);expect(validInstances(graph,rack)).toBe(true);expect(instanceStages(graph,rack)).toEqual(rackStages(rack));expect(rack).toEqual(before);expect(graph.instances.find(i=>i.kind==='boost').enabled).toBe(false);
 }
});
it('routes new processors by stable IDs and preserves their settings and positions through ordinary edits',()=>{
 const rack=cleanRack(),graph=migrateInstances(rack);graph.compatibility='serial';graph.chain.splice(1,0,'boost','fuzz');graph.instances.find(i=>i.id==='boost').params.gain=12;
 const projected=projectInstances(graph,rack);expect(validInstances(graph,projected)).toBe(true);expect(instanceStages(graph,projected).some(s=>s.instance?.id==='boost')).toBe(true);
 const next=syncInstances(graph,{...projected,'effects.decay':3});expect(next.chain).toEqual(graph.chain);expect(next.instances.find(i=>i.id==='boost').params.gain).toBe(12);expect(validInstances(next,projected)).toBe(true);
 for(const damage of [g=>g.version=2,g=>g.chain.push(g.chain[0]),g=>g.chain.push('unknown'),g=>g.instances[0].id='renamed',g=>g.instances.find(i=>i.kind==='boost').params.gain=99,g=>g.instances.find(i=>i.kind==='fuzz').enabled='true']){const bad=structuredClone(graph);damage(bad);expect(validInstances(bad,projected)).toBe(false);}
});
it('keeps every base-processor move around the fixed tail exportable and stable on later knob edits',()=>{
 let rack=cleanRack();rack={...rack,...routingPatch(rack,{chain:BOX_UNITS})};const graph=migrateInstances(rack);graph.compatibility='serial';graph.chain.splice(2,0,'boost');graph.chain.push('fuzz');
 for(const id of graph.chain)for(const target of graph.chain){
  const chain=graph.chain.filter(k=>k!==id);chain.splice(graph.chain.indexOf(target),0,id);const next=normalizeInstances({...graph,chain},rack),projected=projectInstances(next,rack);
  expect(validInstances(next,projected)).toBe(true);expect(syncInstances(next,{...projected,'effects.decay':2}).chain).toEqual(next.chain);expect(next.chain.indexOf('boost')).toBe(chain.indexOf('boost'));expect(next.chain.indexOf('fuzz')).toBe(chain.indexOf('fuzz'));
 }
});
