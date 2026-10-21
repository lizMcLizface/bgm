import {describe,it,expect} from 'vitest';
import {cleanEnsemble,encodeEnsemble,decodeEnsemble,ENSEMBLES,ROLES} from './state';
describe('ensemble setups',()=>{
 it('round trips every source, sound, rack, settings and light mode through shared links',()=>{
  const setup=cleanEnsemble({...ENSEMBLES[3],light:true});setup.roles.lead.rack['effects.delay']=.35;setup.roles.pad.values.cutoff=1900;setup.percussionRack['effects.reverb']=.2;setup.roles.lead.matched=true;
  expect(decodeEnsemble(encodeEnsemble(setup))).toEqual(setup);
 });
 it('validates imported sources and clamps synth, mix and rack parameters',()=>{
  const setup=cleanEnsemble({roles:{lead:{synth:'prophet5',values:{cutoff:Infinity,unknown:100},level:-20},pad:{synth:'untrusted'}}});
  expect(setup.roles.lead.level).toBe(.01);expect(setup.roles.lead.values.cutoff).toBeGreaterThan(0);expect(setup.roles.lead.values.unknown).toBeUndefined();expect(setup.roles.pad.synth).toBe('calmbgm');
  expect(()=>decodeEnsemble('not a link')).toThrow();
 });
 it('built-in ensembles have all generator roles and no imported comparison banks',()=>{
  for(const preset of ENSEMBLES){expect(Object.keys(preset.roles)).toEqual(ROLES);for(const role of Object.values(preset.roles))expect(role.values).toBeTruthy();}
 });
});
