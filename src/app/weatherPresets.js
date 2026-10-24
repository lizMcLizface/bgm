import { defaultShape } from './engine/ambienceSynth';

export const WEATHER_PRESETS = {
    rain: [
        { id: 'drizzle', name: 'Gentle drizzle', level: .45, shape: { intensity: .2, drops: .2, wind: .1, surface: 'leaves', texture: .4, coupling: .8 } },
        { id: 'open', name: 'Open rain', level: .6, shape: { intensity: .5, drops: .4, wind: .35, surface: 'mixed' } },
        { id: 'indoors', name: 'Rain indoors', level: .65, shape: { intensity: .7, drops: .2, wind: .4, shelter: .6, surface: 'mixed' } },
        { id: 'roof', name: 'Roof patter', level: .55, shape: { intensity: .6, drops: .3, wind: .3, surface: 'tin' } },
    ],
    thunder: [
        { id: 'distant', name: 'Distant rolls', level: .55, shape: { frequency: .3, intensity: .55, distance: .75, decay: .8, crack: .65, echo: .8 } },
        { id: 'nearby', name: 'Nearby thunder', level: .5, shape: { frequency: .45, intensity: .7, distance: .2, decay: .6, echo: .65 } },
        { id: 'storm', name: 'Rolling storm', level: .6, shape: { frequency: .7, intensity: .75, distance: .5, decay: .85, echo: .85 } },
    ],
    waves: [
        { id: 'gentle', name: 'Gentle shoreline', level: .75, shape: { period: .7, size: .3, retreat: .65 } },
        { id: 'surf', name: 'Rolling surf', level: .8, shape: { period: .5, size: .6, retreat: .7 } },
        { id: 'rough', name: 'Rough coast', level: .8, shape: { period: .3, size: .9, retreat: .8 } },
    ],
};
export function weatherPresetPatch(id, presetId, shape, levels) {
    const preset = WEATHER_PRESETS[id]?.find(p => p.id === presetId);
    if (!preset) return null;
    return { ambienceShape: { ...shape, [id]: { ...defaultShape(id), ...preset.shape } }, ambience: { ...levels, [id]: preset.level } };
}
export function matchingWeatherPreset(id, shape, level) {
    return WEATHER_PRESETS[id]?.find(preset => Math.abs(level - preset.level) < 1e-6 &&
        Object.entries({ ...defaultShape(id), ...preset.shape }).every(([key, value]) =>
            typeof value === 'number' ? Math.abs(shape[key] - value) < 1e-6 : shape[key] === value))?.id ?? '';
}
const scene = (name, blurb, sources) => {
    let state = { ambience: { rain: 0, thunder: 0, wind: 0, waves: 0, fire: 0, vinyl: 0 }, ambienceShape: {} };
    for (const [id, preset] of Object.entries(sources)) state = weatherPresetPatch(id, preset, state.ambienceShape, state.ambience);
    return { name, category: 'ambience', isNew: true, blurb, tags: ['weather', ...Object.keys(sources)], voices: {},
        settings: { playMusic: false, playAmbience: true, ambienceVolume: .85, ...state,
            ambienceWander: { mode: 'brownian', total: .04, layers: .08, period: 240 } } };
};
export const WEATHER_SCENES = [
    scene('Gentle drizzle', 'Soft leaf patter with small, subdued nearby drops.', { rain: 'drizzle' }),
    scene('Open rain', 'A textured sheet of rain with a quiet foreground patter.', { rain: 'open' }),
    scene('Rain indoors', 'Rain softened by shelter, with very little nearby impact.', { rain: 'indoors' }),
    scene('Distant thunder', 'Spaced low rolls and lingering echoes, without a rain bed.', { thunder: 'distant' }),
    scene('Gentle shoreline', 'Long swells and soft, continuous returning water.', { waves: 'gentle' }),
    scene('Rolling surf', 'Fuller breaking waves with a slow, receding wash.', { waves: 'surf' }),
    scene('Coastal storm', 'Textured rain, deep thunder and rough surf together.', { rain: 'open', thunder: 'storm', waves: 'rough' }),
];
