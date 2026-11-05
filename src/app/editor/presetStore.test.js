import {presetGroups,findPreset} from './presetStore';
it('leaves hidden presets out of the pickers but still resolves them by name',()=>{
 const listed=presetGroups().flatMap(({presets})=>Object.keys(presets));
 for(const name of ['Measured Violin','Measured Cello','Measured Cello Pizzicato']){expect(listed).not.toContain(name);expect(findPreset(name)).not.toBeNull();}
 expect(listed).toContain('Measured Trumpet');
});
