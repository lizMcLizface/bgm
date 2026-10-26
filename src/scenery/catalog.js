// Names and sizes only, so menus can list landscapes and weather without loading the generators.
export const BIOME_NAMES = {
    lake: 'Mountain lake',
    grassland: 'Grassland',
    hills: 'Rolling hills',
    desert: 'Desert',
    seaside: 'Seaside',
    industrial: 'Industrial',
    farmland: 'Farmland',
    savanna: 'Savanna',
    woodland: 'Woodland',
    river: 'River valley',
};

// Landscapes still in review: shown in the scenery tool (tools/scenery.html), not yet on the page.
export const DRAFT_BIOME_NAMES = {
    alpine: 'Alpine peaks',
    tundra: 'Tundra',
    swamp: 'Swamp',
    volcano: 'Volcano',
    synth: 'Synthwave',
    planet: 'Alien planet',
    camp: 'Campfire clearing',
};

// Scene size in landscape pixels for a window of this aspect (width / height). Wide windows
// get the 384x216 picture cropped to fill; narrower ones a picture of their own shape with
// about as many pixels, so a phone held upright shows more land and sky, not a cropped strip.
export function frameSize(aspect) {
    if (aspect >= 1.5) return [384, 216];
    const a = Math.max(0.4, aspect), W = Math.round(Math.sqrt(384 * 216 * a));
    return [W, Math.round(W / a)];
}

export const WEATHER = {
    clear: 'Clear',
    sparse: 'Sparse clouds',
    scattered: 'Scattered clouds',
    dense: 'Dense clouds',
    towering: 'Towering clouds',
    streaks: 'High streaks',
    mixed: 'Streaks and puffs',
    overcast: 'Overcast',
    rain: 'Rain',
    storm: 'Thunderstorm',
    snow: 'Snow',
    fog: 'Fog',
    haze: 'Haze',
    dust: 'Dust storm',
};
