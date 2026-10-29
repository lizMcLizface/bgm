import {SCENES,BROWSABLE_SCENES,SCENE_CATEGORIES,SCENE_BROWSE_ORDER,stepBuiltinSceneEntry,sceneComparison,sceneSettings,sceneSoundSettings,sceneUsesWasm,parseSetup,sceneBySlug,sceneSlug} from './scenes';
const revisions=SCENES.filter(s=>s.comparisonSource);
const accepted=['Late-night brushes','Island Shop Hours','Desert dusk','Tape memories','Night drive','Pastel Coastline','Lantern Circuit'];
test('the seven accepted revisions become defaults and retain selectable previous versions',()=>{
 expect(SCENE_CATEGORIES.some(c=>c.id==='updated')).toBe(false);expect(revisions.map(s=>s.comparisonOf)).toEqual(accepted);expect(revisions.every(s=>s.hidden)).toBe(true);
 for(const revision of revisions){
  const previous=sceneComparison(revision),current=sceneBySlug(revision.comparisonOf);
  expect(previous.hidden).toBe(true);expect(previous.category).not.toBe('updated');
  expect(revision.isNew).toBe(true);expect(current.isNew).toBe(true);
  expect(current.voices).toEqual(revision.voices);expect(current.settings).toEqual(revision.settings);
  expect(current.rulebook).toEqual(previous.rulebook);
  expect(parseSetup(JSON.stringify(revision)).comparisonSource).toBe(previous.name);
  expect(sceneBySlug(sceneSlug(previous.name))).toBe(previous);
  expect(sceneBySlug(sceneSlug(revision.name))).toBe(revision);
 }
});
test('rejected grooves retain the preferred originals; experiments still resolve by their old URLs',()=>{
 for(const[name,style,kit]of[['Morning coffee','lofi','felt'],['Late Show Lounge','brushes','felt'],['Deep night','heartbeat','felt'],['Pocket Circuit','electro','crisp'],['Tine and Tide','downtempo','crisp']]){
  const s=sceneSettings(sceneBySlug(name),42);expect(s.drums.style).toBe(style);expect(s.drums.kit).toBe(kit);
  expect(revisions.some(s=>s.comparisonOf===name)).toBe(false);expect(BROWSABLE_SCENES.filter(s=>s.name===name)).toHaveLength(1);
 }
 for(const slug of ['morning-coffee-bossa','late-show-lounge-jazz','deep-night-ambient-percussion','pocket-circuit-808','tine-and-tide-broken-beat','night-drive-808-broken-beat'])expect(sceneBySlug(slug).hidden).toBe(true);
 expect(BROWSABLE_SCENES.filter(s=>sceneSettings(s,42).drums.style==='broken').map(s=>s.name)).toEqual(['Tape memories']);
});
test('Late-night brushes uses audible Soft Pipes; Desert dusk holds chords for a shorter cycle',()=>{
 const night=sceneBySlug('Late-night brushes');expect(night.voices.lead).toBe('Wasm Soft Pipes');expect(night.settings.volumes.lead).toBe(.073);expect(sceneUsesWasm(night)).toBe(true);
 const desert=sceneSettings(sceneBySlug('Desert dusk'),42),old=sceneSettings(sceneComparison(revisions.find(s=>s.comparisonOf==='Desert dusk')),42);
 expect(desert.barsPerChord).toBeLessThan(old.barsPerChord);expect(desert.sections.phrases).toBeLessThan(old.sections.phrases);
 expect(desert.bpm).toBe(old.bpm);expect(desert.drums.kit).toBe('hand');
 const drive=sceneSettings(sceneBySlug('Night drive'),42);expect(drive.drums.style).toBe('lofi');expect(drive.drums.kit).toBe('tr808');expect(drive.drumKit.kick.level).toBe(.55);
 expect(sceneBySlug('Tine and Tide').settings.volumes.counter).toBe(.019);
});
test('Sounds applies the kit without changing the beat; Composition retains kit and balances',()=>{
 const old=sceneSettings(sceneBySlug('rainy-cafe'),42),next=sceneSettings(revisions.find(s=>s.settings.drums.kit==='hand'),42);
 const sounds=sceneSoundSettings(next,old),composition={...next,...sceneSoundSettings(old,next)};
 expect(sounds.drums).toEqual({...old.drums,kit:'hand'});expect(sounds.drumKit).toEqual(next.drumKit);
 expect(composition.drums).toEqual({...next.drums,kit:old.drums.kit});expect(composition.drumKit).toEqual(old.drumKit);
 expect(sceneUsesWasm(sceneBySlug('morning-coffee'))).toBe(false);
});
test('the cleaned picker and bracket sequence contain each current scene once and omit archives',()=>{
 expect(SCENE_BROWSE_ORDER).toHaveLength(BROWSABLE_SCENES.length);expect(new Set(SCENE_BROWSE_ORDER.map(e=>e.scene.name)).size).toBe(BROWSABLE_SCENES.length);
 expect(SCENE_BROWSE_ORDER.every(e=>!e.scene.hidden&&!e.scene.comparisonOf)).toBe(true);
 for(let i=0;i<SCENE_BROWSE_ORDER.length;i++){
  const e=SCENE_BROWSE_ORDER[i];expect(stepBuiltinSceneEntry(e.scene.name,1,e.category)).toBe(SCENE_BROWSE_ORDER[(i+1)%SCENE_BROWSE_ORDER.length]);
 }
});
