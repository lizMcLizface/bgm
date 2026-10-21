// @vitest-environment node
import {SYNTHS} from './models';

test('every synth sorts each of its sounds into one of its own categories, and uses every category',()=>{
 for(const [id,synth] of Object.entries(SYNTHS)){
  const ids=synth.categories.map(c=>c.id);
  expect(new Set(ids).size,id).toBe(ids.length);
  for(const c of synth.categories){expect(c.label,id).toBeTruthy();expect(synth.presets.some(p=>p.category===c.id),`${id}: ${c.id} is empty`).toBe(true);}
  for(const p of synth.presets){
   expect(ids,`${id}: ${p.name}`).toContain(p.category);
   expect(Array.isArray(p.styles)&&p.styles.length>0,`${id}: ${p.name} has styles`).toBe(true);
  }
 }
});
