import { generationFromSearch, withGeneration } from './generation';
import { defaultSettings, shareFromLocation, sharePath } from './settings';
import { presetFromSearch } from './scenes';

test('Latest is the default and Original is an explicit URL choice', () => {
    expect(defaultSettings().generation).toBe('latest');
    expect(generationFromSearch('')).toBe('latest');
    expect(generationFromSearch('?generation=unknown')).toBe('latest');
    expect(generationFromSearch('?generation=legacy')).toBe('legacy');
    const path=withGeneration('/?preset=fireside-folk&intro=short','legacy');
    expect(path).toBe('/?preset=fireside-folk&intro=short&generation=legacy');
    expect(withGeneration(path,'latest')).toBe('/?preset=fireside-folk&intro=short');
    expect(presetFromSearch('?fireside-folk&generation=legacy&intro=short')).toBe('fireside-folk');
});

test('mode survives a share link without changing the compact payload layout', () => {
    for(const generation of ['latest','legacy']) {
        const settings={...defaultSettings(),seed:1234,generation};
        const path=sharePath(settings,{}, {pathname:'/'});
        expect(shareFromLocation({search:path.slice(1)}).settings).toEqual(settings);
    }
    expect(shareFromLocation({search:'?generation=legacy'}).settings.generation).toBe('legacy');
    expect(shareFromLocation({search:'?phrase=rainy+sunday&generation=legacy'}).settings.generation).toBe('legacy');
});
