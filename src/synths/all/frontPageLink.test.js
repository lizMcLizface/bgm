import {describe,it,expect} from 'vitest';
import {frontPageLink,parseFrontPageInput} from './frontPageLink';
import {sceneBySlug} from '../../app/scenes';
import {defaultSettings,encodeSettings} from '../../app/settings';
import {phraseToSeed} from '../../app/phrase';

describe('front-page setups',()=>{
 it('accepts names, preset links and phrases',()=>{
  const scene=sceneBySlug('rainy-cafe');
  expect(parseFrontPageInput(scene.name).scene).toBe(scene);
  const link=parseFrontPageInput('https://calmbgm.com/?preset=rainy-cafe&phrase=rainy+sunday');
  expect(link.scene).toBe(scene);
  expect(link.share.settings.seed).toBe(phraseToSeed('rainy sunday'));
 });
 it('reads compact settings and external and edited voices',()=>{
  const settings={...defaultSettings(),bpm:101,seed:1234};
  const presets={lead:{external:{synth:'poly',name:'Soft Pad',values:{cutoff:0.4}}},bass:{edit:{name:'Thump Bass',values:{masterVolume:0.4}}}};
  const link=frontPageLink({search:'?'+encodeSettings(settings,presets),hash:''});
  expect(link.scene).toBeNull();
  expect(link.share.settings.bpm).toBe(101);
  expect(link.share.settings.seed).toBe(1234);
  expect(link.share.presets.lead.external).toMatchObject(presets.lead.external);
  expect(link.share.presets.bass.edit).toEqual(presets.bass.edit);
 });
 it('accepts copied scene JSON and rejects unreadable input',()=>{
  const link=parseFrontPageInput(JSON.stringify({name:'My scene',settings:{bpm:93},voices:{lead:'Soft Pad'}}));
  expect(link).toMatchObject({custom:true,scene:{name:'My scene',voices:{lead:'Soft Pad'}}});
  expect(()=>parseFrontPageInput('not a real preset')).toThrow();
  expect(()=>parseFrontPageInput('https://calmbgm.com/?s=not-valid')).toThrow();
  expect(()=>parseFrontPageInput('{bad')).toThrow();
 });
});
