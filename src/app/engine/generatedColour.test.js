import {generatedColourPlan} from './generatedColour';
import {soundFrom} from '../soundGenV3';
test('wind coverage is deterministic and restricted to folk melodic oscillator leads',()=>{
 const info={version:3,seed:42,profile:'folk',role:'lead',kind:'lead',gate:.6,register:76};
 const current=soundFrom(info),before=soundFrom(info,'latest',{voiceColour:false});
 expect(current.sourceFamily).toBe('Air wind');expect(current.preset.breathAmount).toBeGreaterThan(0);
 const colour=generatedColourPlan(info,'lead');expect(colour).toEqual(generatedColourPlan(info,'lead'));
 const stripped={...current.preset};for(const key of Object.keys(colour.parameters))delete stripped[key];
 const baseline={...before.preset};for(const key of Object.keys(colour.parameters))delete baseline[key];expect(stripped).toEqual(baseline);
 expect(generatedColourPlan({...info,gate:.1},'lead').parameters.breathAmount).toBeLessThan(colour.parameters.breathAmount);
 for(const role of ['pad','bass'])expect(generatedColourPlan({...info,role},'lead')).toBeNull();
 for(const kind of ['keys','pluck','bell'])expect(generatedColourPlan(info,kind)).toBeNull();
 expect(soundFrom(info,'legacy').preset).toEqual(soundFrom(info,'legacy',{voiceColour:false}).preset);
});
test('vowel textures are a minority, never add pitch glides, and spare other profiles and bass',()=>{
 for(const profile of ['ambient','cinematic']){
  let selected=0;for(let seed=1;seed<=200;seed++){
   const info={version:3,seed,profile,role:'pad',kind:profile==='ambient'?'texture':'pad',gate:3,register:64};
   const colour=generatedColourPlan(info,info.kind);if(colour){selected++;expect(colour.parameters.formantAmount).toBeLessThanOrEqual(.28);expect(colour.parameters.breathAmount).toBeLessThanOrEqual(.05);expect(Object.keys(colour.parameters).some(k=>/pitch|slide|portamento/i.test(k))).toBe(false);}
  }
  expect(selected).toBeGreaterThan(10);expect(selected).toBeLessThan(125);
 }
 for(const profile of ['chip','keys','organ','analogue','neutral'])for(const role of ['lead','counter','pad','bass'])expect(generatedColourPlan({seed:42,profile,role},'pad')).toBeNull();
});
