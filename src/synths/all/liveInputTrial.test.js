// @vitest-environment node
import {it,expect} from 'vitest';
import {liveInputPattern,liveInputRecipeIdentity} from './liveInputTrial';
it('matches the fixed live workload across unused song seeds while retaining all audio settings',()=>{
 const a={settings:{seed:1,bpm:138},sounds:{pad:{cutoff:1000}},tuning:{a4:440}},b={...a,settings:{...a.settings,seed:2}};
 expect(liveInputRecipeIdentity(a)).toEqual(liveInputRecipeIdentity(b));
 expect(a.settings.seed).toBe(1);
 expect(liveInputRecipeIdentity({...b,sounds:{pad:{cutoff:500}}})).not.toEqual(liveInputRecipeIdentity(a));
 expect(liveInputRecipeIdentity({...b,tuning:{a4:442}})).not.toEqual(liveInputRecipeIdentity(a));
});
it('uses a deterministic complete live pattern with balanced key ownership and no explicit future audio timestamps',()=>{
 const pattern=liveInputPattern(),keys=new Set();expect(pattern).toEqual(liveInputPattern());
 for(let i=0;i<pattern.length;i++){const e=pattern[i];expect(e.at).toBeGreaterThanOrEqual(i?pattern[i-1].at:0);expect(e.at).toBeLessThan(30);expect(e).not.toHaveProperty('time');
  if(e.type==='on'){expect(keys.has(e.key)).toBe(false);keys.add(e.key);}else{expect(keys.has(e.key)).toBe(true);keys.delete(e.key);}}
 expect(keys.size).toBe(0);expect(pattern.filter(e=>e.type==='on')).toHaveLength(118);
 expect(pattern.filter(e=>e.at<10&&e.type==='on')).toHaveLength(10);
 expect(pattern.filter(e=>e.at>=10&&e.at<20&&e.type==='on')).toHaveLength(30);
});
