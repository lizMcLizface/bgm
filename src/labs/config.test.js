import {initialLab,restoreLab,rememberFamilyVoice} from './config';
it('restores safe lab choices but never auto-resumes an arpeggiator',()=>{
 const c=initialLab('strings',JSON.stringify({voices:{pad:'no-such-voice'},armed:'lead',controls:{bend:90,texture:.3},arp:{enabled:true,notes:[60,60,64,'a',1000],transpose:99},velocity:{curve:.5}}));expect(c.voices.pad).toBe('bowed-glass');expect(c.armed).toBe('lead');expect(c.controls.bend).toBe(2);expect(c.controls.texture).toBe(.3);expect(c.arp.enabled).toBe(false);expect(c.arp.notes).toEqual([60,64]);expect(c.arp.transpose).toBe(24);expect(c.velocity.curve).toBe(.5);
});
it('takes runner/seed/tempo from a link and survives corrupt local data',()=>{
 expect(initialLab('keys','bad','?runner=sparse&seed=7&bpm=100')).toMatchObject({runner:'sparse',seed:7,bpm:100});expect(initialLab('organs','null').bpm).toBe(72);
});
it('shares controls and MIDI preferences across families while restoring their chosen voices',()=>{
 let config=initialLab('keys',JSON.stringify({runner:'keys',bpm:97,velocity:{curve:.6},controls:{brightness:.3},midi:{device:'my-piano',channel:'3'}}));config=rememberFamilyVoice(config,'strings','pad','rosin-silk');config=rememberFamilyVoice(config,'keys','pad','celeste');
 const restored=restoreLab('strings',JSON.stringify({...config,family:'keys'}),null);
 expect(restored).toMatchObject({runner:'keys',bpm:97,velocity:{curve:.6},controls:{brightness:.3},midi:{device:'my-piano',channel:'3'},voices:{pad:'rosin-silk'}});
 expect(restoreLab('keys',JSON.stringify({...restored,family:'strings'}),null).voices.pad).toBe('celeste');expect(initialLab('keys',JSON.stringify({midi:{channel:99}})).midi.channel).toBe('all');
});
it('starts bass and lead benches in fitting test roles and recalls a chosen role per family',()=>{
 expect(initialLab('bass').armed).toBe('bass');expect(initialLab('winds').armed).toBe('lead');
 let config=initialLab('strings');config=rememberFamilyVoice(config,'strings','lead','rosin-silk');const bass=restoreLab('bass',JSON.stringify({...config,family:'strings'}));expect(bass.armed).toBe('bass');const strings=restoreLab('strings',JSON.stringify({...bass,family:'bass'}));expect(strings.armed).toBe('lead');expect(strings.voices.lead).toBe('rosin-silk');
});
it('opens the all-instruments workspace without replacing the current test voice or MIDI settings',()=>{
 const bass=initialLab('bass',JSON.stringify({armed:'bass',voices:{bass:'library-Thump%20Bass'},engines:{bass:'wasm'},midi:{device:'piano',channel:'2'},controls:{bend:.3}}));
 const all=restoreLab('all',JSON.stringify({...bass,family:'bass'}));
 expect(all).toMatchObject({armed:'bass',voices:{bass:'library-Thump%20Bass'},engines:{bass:'wasm'},midi:{device:'piano',channel:'2'},controls:{bend:.3}});
 expect(initialLab('all').voices.pad).toBe('bowed-glass');
});
