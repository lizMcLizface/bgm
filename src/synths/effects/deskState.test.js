import {POLY} from '../diy/patches';
import {RACK_PARAMS} from './params';
import {cleanEffectsState,drySourceValues,createEffectsObjects,encodeEffectsSetup,decodeEffectsSetup} from './deskState';
import {cleanDeskRack} from './deskState';

it('keeps reference patches dry without losing source edits or desk effects',()=>{
 const state=cleanEffectsState({patch:{name:'Edited',values:{...POLY.presets[0].values,'layers.0.cutoff':1234,'inserts.chorus':.8,'effects.reverb':.6,'global.chorus':.7}},rack:{'inserts.chorus':.45,'effects.reverb':.4}});
 expect(state.patch.values['layers.0.cutoff']).toBe(1234);expect(state.patch.values['global.chorus']).toBe(0);expect(state.patch.values['inserts.chorus']).toBe(0);expect(state.patch.values['effects.reverb']).toBe(0);
 expect(state.rack['inserts.chorus']).toBe(.45);expect(state.rack['effects.reverb']).toBe(.4);expect(drySourceValues(state.patch.values)).toEqual(state.patch.values);
});
it('defaults local saturation to full blend while bypassed, preserving saved blends and global defaults',()=>{
 expect(cleanDeskRack()).toMatchObject({'inserts.saturation':1,'switch.saturation':0});expect(cleanEffectsState().rack).toMatchObject({'inserts.saturation':1,'switch.saturation':0});
 expect(cleanEffectsState({rack:{'inserts.saturation':0,'switch.saturation':1}}).rack).toMatchObject({'inserts.saturation':0,'switch.saturation':1});expect(RACK_PARAMS.BY_KEY['inserts.saturation'].default).toBe(0);
});
it('round-trips sound, rack and object layout and rejects invalid files before applying them',()=>{
 localStorage.clear();const state=cleanEffectsState(),objects=createEffectsObjects(state),layout=objects.snapshot();
 const text=encodeEffectsSetup(state,layout);expect(decodeEffectsSetup(text)).toEqual({...state,workbench:layout});
 const original=JSON.parse(text);
 for(const damage of [d=>d.version=99,d=>d.patch.values['layers.0.cutoff']=null,d=>d.rack['inserts.chorus']=50,d=>d.workbench.objects[1].id=d.workbench.objects[0].id,d=>d.setup.midiChannel='25',d=>d.audition.tonic=100,d=>d.audition.mode='unknown']){
  const d=structuredClone(original);damage(d);expect(()=>decodeEffectsSetup(JSON.stringify(d))).toThrow();
 }
 expect(()=>decodeEffectsSetup('{')).toThrow('JSON');expect(RACK_PARAMS.sanitize(state.rack)).toEqual(state.rack);objects.dispose();localStorage.clear();
});
it('migrates Stage A files and validates optional effect views and tempo',()=>{
 localStorage.clear();const state=cleanEffectsState(),store=createEffectsObjects(state),data=JSON.parse(encodeEffectsSetup(state,store.snapshot()));
 delete data.panels.effects;delete data.panels.catalog;delete data.effectAdvanced;delete data.tempo;data.workbench.objects=data.workbench.objects.filter(o=>!o.binding.startsWith('effect:'));
 const old=decodeEffectsSetup(JSON.stringify(data));expect(old.panels.effects).toEqual({saturation:true});expect(old.tempo).toBe(100);store.restore(old.workbench);expect(store.snapshot().objects.filter(o=>o.binding.startsWith('effect:'))).toHaveLength(23);
 expect(old.panels.catalog).toBe(false);
 for(const damage of [d=>d.panels.effects={fake:true},d=>d.panels.catalog='yes',d=>d.effectAdvanced={delay:'yes'},d=>d.tempo=0]){const bad=structuredClone(data);damage(bad);expect(()=>decodeEffectsSetup(JSON.stringify(bad))).toThrow('effect views');}store.dispose();localStorage.clear();
});
it('imports version-one files compatibly and rejects broken instance graphs atomically',()=>{
 const state=cleanEffectsState(),store=createEffectsObjects(state),data=JSON.parse(encodeEffectsSetup(state,store.snapshot()));
 const old={...data,version:1};delete old.instances;expect(decodeEffectsSetup(JSON.stringify(old)).rack).toEqual(state.rack);expect(decodeEffectsSetup(JSON.stringify(old)).instances.compatibility).toBe('legacy');
 for(const damage of [d=>delete d.instances,d=>d.instances.chain.push('missing'),d=>d.instances.instances[0].id='duplicate',d=>d.instances.instances.find(i=>i.kind==='boost').params.gain=25]){const bad=structuredClone(data);damage(bad);expect(()=>decodeEffectsSetup(JSON.stringify(bad))).toThrow('processor chain');}store.dispose();
});
it('migrates combined-scope desks and rejects invalid monitor settings before import',()=>{
 const state=cleanEffectsState(),store=createEffectsObjects(state),data=JSON.parse(encodeEffectsSetup(state,store.snapshot()));expect(data.version).toBe(4);
 const old={...data,version:2,panels:{...data.panels,scope:false}};delete old.monitors;delete old.panels.spectrum;old.workbench.objects=old.workbench.objects.filter(o=>o.binding!=='spectrum');const migrated=decodeEffectsSetup(JSON.stringify(old));expect(migrated.panels.spectrum).toBe(false);expect(migrated.monitors.scope.paused).toBe(false);store.restore(migrated.workbench);expect(store.snapshot().objects.some(o=>o.binding==='spectrum')).toBe(true);
 for(const damage of [d=>delete d.monitors,d=>d.monitors.spectrum.size=99,d=>d.monitors.scope.level=null,d=>d.monitors.scope.paused='false',d=>d.panels.spectrum='yes']){const bad=structuredClone(data);damage(bad);expect(()=>decodeEffectsSetup(JSON.stringify(bad))).toThrow('monitor settings');}store.dispose();
});
