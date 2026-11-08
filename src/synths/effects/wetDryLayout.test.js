import {wetDryPoses} from './wetDryLayout';
import {parallelPreset,validParallel,cleanParallel} from './parallelModel';

it('places branch pedals above the source and master effects/analysers below the eight-channel desk',()=>{
 const poses=wetDryPoses({objects:[{binding:'source',size:{w:1840,h:900}},{binding:'keyboard',size:{w:1802,h:250}},{binding:'mixer',size:{w:980,h:710}}]});
 expect(poses.source.y).toBeGreaterThan(337);expect(poses.keyboard.y).toBeGreaterThan(poses.source.y+900);
 expect(poses.mixer.x).toBeGreaterThan(1840);expect(poses['patch:master:reverb'].y).toBeGreaterThan(710);
 expect(poses['patch:wet:zplane'].x).toBeLessThan(poses['patch:wet:chorus'].x);expect(poses['patch:wet:chorus'].x).toBeLessThan(poses['patch:wet:delay'].x);
 expect(poses.spectrum.y).toBe(poses.scope.y);expect(poses.spectrum.x).toBeGreaterThan(poses.scope.x);expect(poses['patch:master:reverb'].x).toBe(poses.scope.x);
});
it('migrates saved three-strip mixers to eight without changing their sound controls or accepting malformed strips',()=>{
 const old=parallelPreset();for(const id of ['spare4','spare5','spare6','spare7','spare8'])delete old.mixer.strips[id];
 old.mixer.strips.drive.vol=.23;old.mixer.strips.wet.pan=.8;expect(validParallel(old)).toBe(true);
 const migrated=cleanParallel(old);expect(Object.keys(migrated.mixer.strips)).toHaveLength(8);expect(migrated.mixer.strips.drive).toEqual(old.mixer.strips.drive);expect(migrated.mixer.strips.wet).toEqual(old.mixer.strips.wet);expect(migrated.mixer.master).toEqual(old.mixer.master);
 const bad=structuredClone(migrated);bad.mixer.strips.spare4.vol=2;expect(validParallel(bad)).toBe(false);
});
