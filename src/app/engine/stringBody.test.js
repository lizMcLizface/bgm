import {stringBodyModes} from './stringBody';
import {stringPatch} from './stringPatches';
import {sanitizePreset} from '../editor/presetStore';
import {soundFrom} from '../soundGenV3';
test('body profiles have bounded stable poles and preserve explicit earlier/custom presets',()=>{
 for(const type of ['guitar','harp','bass','kalimba','bad','__proto__','constructor'])for(const sr of [8000,48000,192000]){
  const modes=stringBodyModes(sr,type);expect(modes).toHaveLength(3);expect(modes.every(m=>m.r2>0&&m.r2<1&&m.frequency<sr*.5&&m.b>0)).toBe(true);expect(modes.reduce((s,m)=>s+m.weight,0)).toBeCloseTo(1);
 }
 const original={vcoType:'sine'};expect(stringPatch('Nylon Guitar',original,'legacy')).toBe(original);expect(stringPatch('Soft Flute',original)).toBe(original);
 const next=stringPatch('Nylon Guitar',original),before=stringPatch('Nylon Guitar',original,'latest',{resonance:false});expect(next.stringBodyType).toBe('guitar');expect(next.stringResonance).toBeGreaterThan(0);expect(before.stringResonance).toBeUndefined();expect(sanitizePreset(next)).toEqual(next);
});
test('only generated physical strings use new body modes; Original and historical bypass stay available',()=>{
 const info={version:3,seed:42,role:'lead',kind:'pluck',profile:'folk',gate:.6,register:76};
 const current=soundFrom(info),before=soundFrom(info,'latest',{stringResonance:false});expect(current.preset.stringResonance).toBe(.6);
 const {stringResonance,stringBodyType,...rest}=current.preset;expect(rest).toEqual(before.preset);
 expect(soundFrom(info,'legacy').preset).toEqual(soundFrom(info,'legacy',{stringResonance:false}).preset);
 for(const profile of ['keys','chip','ambient','cinematic','organ'])expect(soundFrom({...info,profile}).preset.stringResonance).toBeUndefined();
});
