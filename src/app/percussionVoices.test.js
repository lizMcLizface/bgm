import {DRUM_KITS,DRUMS,defaultDrumKit} from './percussion';
import {defaultSettings,encodeSettings,decodeSettings} from './settings';
import {percussionVoice,percussionPads,percussionPresetKit,percussionEdited,drumForVoice} from './percussionVoices';

test('saved kit indices remain append-only and old links retain their balances',()=>{
 expect(Object.keys(DRUM_KITS)).toEqual(['felt','crisp','tr808','hand']);
 for(const id of Object.keys(DRUM_KITS)){
  const settings=defaultSettings();settings.seed=42;settings.drums.kit=id;settings.drumKit.bell.level=.35;settings.drumKit.swish.tone=-.4;
  expect(decodeSettings(encodeSettings(settings))).toEqual(settings);
 }
 for(const id of ['felt','crisp'])expect(percussionPresetKit(id)).toEqual(defaultDrumKit());
 expect(percussionVoice('808').id).toBe('tr808');
});
test('each voice presents eleven distinct named instruments with canonical legacy aliases',()=>{
 for(const id of Object.keys(DRUM_KITS)){
  const pads=percussionPads(id);expect(pads).toHaveLength(11);expect(new Set(pads.map(p=>p.name)).size).toBe(11);
  for(const [old,slot] of [['punch','kick'],['snare','brush'],['sizzle','hat']])expect(drumForVoice(DRUMS.indexOf(old),id)).toBe(drumForVoice(DRUMS.indexOf(slot),id));
 }
 expect(percussionPads('tr808').find(p=>p.slot==='bell').label).toBe('Cowbell');
 expect(percussionPads('tr808').find(p=>p.slot==='swish').label).toBe('Open hat');
 expect(percussionPads('crisp').find(p=>p.slot==='kick').name).toBe('punch');
 expect(drumForVoice(12,null)).toBe(12);
});
test('808 extras are balanced below the beat and sound edits are detectable without changing the preset',()=>{
 const kit=percussionPresetKit('tr808');expect(kit.bell.level).toBe(.35);expect(kit.swish.level).toBeLessThan(kit.kick.level);expect(percussionEdited('tr808',kit)).toBe(false);
 kit.punch.tone=.3;expect(percussionEdited('tr808',kit)).toBe(false);
 kit.snare.tone=.1;expect(percussionEdited('tr808',kit)).toBe(true);expect(percussionEdited('felt',defaultDrumKit())).toBe(false);
});


test('hand percussion is a separate source palette with balanced metallic extras',()=>{
 const voice=percussionVoice('hand'),pads=percussionPads('hand'),kit=percussionPresetKit('hand');
 expect(voice.wasmOnly).toBe(true);expect(voice.model).toBe('hand');expect(pads.map(p=>p.label)).toEqual(['Low conga','Muted conga','Seed shaker','Woodblock','Tambourine tap','Tambourine shake','Bongo','Palm clap','Cabasa','Seed sweep','Claves']);
 expect(kit.hat.level).toBeLessThan(kit.kick.level);expect(kit.bell.level).toBeLessThan(kit.brush.level);expect(percussionEdited('hand',kit)).toBe(false);
 const settings={...defaultSettings(),seed:42,drums:{...defaultSettings().drums,kit:'hand'},drumKit:kit};expect(decodeSettings(encodeSettings(settings))).toEqual(settings);
});
