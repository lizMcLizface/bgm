import {createDeskObjects,validObjectLayout,spreadObjectPoses} from './deskObjects';
const definitions=[{binding:'synth',keys:['old:synth'],kind:'instrument',label:'Synth'},{binding:'effects',keys:['old:effects'],kind:'effects',label:'Effects'},{binding:'hidden',kind:'utility',label:'Hidden',visible:false}];
function fixture(data={}){
 const storage=new Map(Object.entries(data));let n=0;
 const options={storageKey:'objects',definitions,read:(key,otherwise)=>storage.get(key)??otherwise,write:(key,value)=>storage.set(key,structuredClone(value)),newId:()=>`obj-${++n}`};
 return {store:createDeskObjects(options),storage,options};
}
it('migrates legacy poses once and preserves opaque IDs, dimensions and z order across reload',()=>{
 const {store,storage,options}=fixture({'old:synth':{x:-200,y:350},'old:synth:angle':25});
 expect(store.get('old:synth')).toMatchObject({id:'obj-1',binding:'synth',pose:{x:-200,y:350,angle:25}});
 store.update('synth',{size:{w:720,h:420}});store.raise('synth');const saved=store.snapshot();store.flush();store.dispose();
 storage.set('old:synth',{x:9000,y:9000});const restored=createDeskObjects(options);
 expect(restored.snapshot()).toEqual(saved);expect(storage.get('old:synth')).toEqual({x:9000,y:9000});restored.dispose();
});
it('spreads visible mounted objects atomically without changing hidden poses, IDs or z order',()=>{
 const {store}=fixture();const applied=[];
 store.update('hidden',{pose:{x:-600,y:30,angle:45}});
 const before=store.snapshot();
 for(const binding of ['synth','effects','hidden'])store.attach(binding,{measure:()=>({w:800,h:300,visible:binding!=='hidden'}),apply:o=>applied.push({id:o.id,all:store.snapshot()})});
 expect(store.spread({width:1200,gap:40})).toBe(2);
 expect(store.get('synth').pose).toEqual({x:0,y:0,angle:0});expect(store.get('effects').pose).toEqual({x:0,y:340,angle:0});
 expect(store.get('hidden').pose).toEqual(before.objects[2].pose);expect(store.snapshot().objects.map(o=>[o.id,o.z])).toEqual(before.objects.map(o=>[o.id,o.z]));
 expect(applied).toHaveLength(2);expect(applied[0].all.objects[1].pose).toEqual({x:0,y:340,angle:0});store.dispose();
});
it('rejects invalid imports atomically and resets placement without replacing identity',()=>{
 const {store}=fixture();const before=store.snapshot();
 for(const damage of [d=>d.version=99,d=>d.objects[1].id=d.objects[0].id,d=>d.objects[1].binding=d.objects[0].binding,d=>d.objects[0].pose={x:Infinity,y:0,angle:0},d=>d.objects[0].z=-1]){
  const bad=structuredClone(before);damage(bad);expect(validObjectLayout(bad)).toBe(false);expect(()=>store.restore(bad)).toThrow('Invalid');expect(store.snapshot()).toEqual(before);
 }
 store.update('synth',{pose:{x:10,y:20,angle:80}});store.clearPoses();expect(store.get('synth').pose).toBeNull();expect(store.get('synth').id).toBe(before.objects[0].id);store.dispose();
});
it('packs different box sizes without overlaps, including a box wider than a row',()=>{
 const objects=[{id:'large',size:{w:4000,h:400}},{id:'small',size:{w:300,h:800}},{id:'wide',size:{w:2600,h:100}}];
 const poses=spreadObjectPoses(objects);for(let i=0;i<objects.length;i++)for(let j=i+1;j<objects.length;j++){
  const a=objects[i],b=objects[j],p=poses.get(a.id),q=poses.get(b.id);
  expect(p.x+a.size.w<=q.x||q.x+b.size.w<=p.x||p.y+a.size.h<=q.y||q.y+b.size.h<=p.y).toBe(true);
 }
});
it('adapts a full bench to wide and tall views with aligned, deterministic, non-overlapping rows',()=>{
 const objects=[{id:'synth',size:{w:1840,h:940}},...Array.from({length:19},(_,i)=>({id:'effect-'+i,size:{w:i===18?820:540,h:240+(i%4)*130}}))];
 const bounds=poses=>objects.reduce((b,o)=>{const p=poses.get(o.id);return {w:Math.max(b.w,p.x+o.size.w),h:Math.max(b.h,p.y+o.size.h)};},{w:0,h:0});
 const wide=spreadObjectPoses(objects,{aspect:2,gap:64}),tall=spreadObjectPoses(objects,{aspect:.6,gap:64});
 expect(bounds(wide).w).toBeGreaterThan(bounds(tall).w);expect(bounds(wide).h).toBeLessThan(bounds(tall).h);
 expect(spreadObjectPoses(objects,{aspect:2,gap:64})).toEqual(wide);
 for(const poses of [wide,tall])for(let i=0;i<objects.length;i++){
  const a=objects[i],p=poses.get(a.id);expect(p.angle).toBe(0);
  for(const b of objects.slice(i+1)){const q=poses.get(b.id);expect(p.x+a.size.w+64<=q.x||q.x+b.size.w+64<=p.x||p.y+a.size.h+64<=q.y||q.y+b.size.h+64<=p.y).toBe(true);}
 }
});
