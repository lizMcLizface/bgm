// Names and sizes only, so menus can list landscapes and weather without loading the generators.
export const BIOME_NAMES = {
    lake: 'Mountain lake',
    grassland: 'Grassland',
    hills: 'Rolling hills',
    alpine: 'Alpine peaks',
    woodland: 'Woodland',
    river: 'River valley',
    farmland: 'Farmland',
    village: 'Snowy village',
    tundra: 'Tundra',
    swamp: 'Swamp',
    jungle: 'Jungle',
    savanna: 'Savanna',
    desert: 'Desert',
    volcano: 'Volcano',
    seaside: 'Seaside',
    harbour: 'Harbour town',
    reef: 'Underwater',
    garden: 'Blossom garden',
    ruins: 'Castle on the hill',
    camp: 'Campfire clearing',
    cave: 'Glowworm cavern',
    industrial: 'Industrial',
    street: 'Rainy neon street',
    city: 'City skyline',
    synth: 'Synthwave',
    train: 'Train window',
    room: 'Window view',
    cafe: 'Café',
    planet: 'Alien planet',
    starship: 'Observation deck',
};

// Landscapes still in review: shown in the scenery tool (tools/scenery.html), not yet on the
// page. Empty while every landscape is approved; a new one starts here.
export const DRAFT_BIOME_NAMES = {};

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
