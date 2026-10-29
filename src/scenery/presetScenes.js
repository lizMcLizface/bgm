// Which landscape goes with which musical preset (scene): a landscape kind, a weather,
// an hour (0-24) and a time of year (0 spring, 1 summer, 2 autumn, 3 winter).
// Names only, so the page can look one up without loading the generators. See
// docs/LANDSCAPE_PRESETS.md for how well each match fits and what is still missing.
// `hours` and `seasons` (optional) keep a passing day or year inside a window, swinging back
// and forth across it: a night preset goes from dusk to deep night and back, never to noon.
// Windows may wrap: [20, 5] is 20:00 to 05:00, [3.5, 0.5] late winter to early spring.
// `look` pins what a seed would otherwise roll in the landscape (see createScene).
const L = (biome, weather, hour, year, { hours = null, seasons = null, look = null } = {}) => ({ biome, weather, hour, year, hours, seasons, look });

const NIGHT = { hours: [20, 5] }, LATE = { hours: [21, 3.5] }, EVENING = { hours: [17, 23] }, DUSK = { hours: [16.5, 21.5] };
const DAWN = { hours: [4.5, 9] }, MORNING = { hours: [6.5, 11] }, DAY = { hours: [8, 17.5] };
const WINTER = [2.85, 3.85], SPRING = [0.05, 0.8], AUTUMN = [1.8, 2.8];

const BY_NAME = {
    'Rainy café': L('cafe', 'rain', 16, 2.3, { hours: [10, 23] }),
    'Late-night brushes': L('cafe', 'overcast', 23, 2.5, LATE),
    'Fireside folk': L('camp', 'clear', 21, 2.6, NIGHT),
    'Tape memories': L('room', 'haze', 18.5, 1.6, EVENING),
    'Morning coffee': L('cafe', 'sparse', 8, 0.6, MORNING),
    'Quiet-room waltz': L('village', 'snow', 17, 3.3, { hours: [15.5, 23], seasons: WINTER }),
    'Lamplight': L('room', 'clear', 23, 2.1, { hours: [19, 2] }),
    'Bittersweet Sunday': L('farmland', 'haze', 17.5, 2.3, { hours: [14, 20], seasons: AUTUMN }),
    'Same Tune, Slightly Different': L('train', 'mixed', 15, 1.8),

    'Deep night': L('tundra', 'clear', 1, 2.4, LATE),
    'Underwater': L('reef', 'clear', 21, 1),
    'Chapel organ': L('ruins', 'mixed', 6.5, 2.5, DAWN),
    'Choir at sea': L('harbour', 'overcast', 17, 2, DUSK),
    'Slow motion': L('tundra', 'fog', 5, 3, DAWN),
    'Breathing room': L('garden', 'haze', 5.5, 0.3, { ...DAWN, seasons: SPRING }),
    'Wide Open Plains': L('grassland', 'clear', 23, 1.2, NIGHT),
    'Piano and Pads': L('lake', 'fog', 20, 2, { hours: [19, 5] }),
    'Ambient Piano, Distant Storm': L('lake', 'storm', 22, 1.8, { hours: [18, 4] }),

    'Glass garden': L('garden', 'sparse', 11, 0.4, { ...DAY, seasons: SPRING }),
    'Clockwork': L('industrial', 'scattered', 12, 2.2),
    'Study session': L('room', 'overcast', 21, 3, { hours: [18, 2] }),
    'Night drive': L('synth', 'clear', 1.5, 1.7, NIGHT),
    'Dorian walk': L('river', 'scattered', 16, 2.3),
    'Sunrise in seven': L('savanna', 'streaks', 6, 1, DAWN),
    'Sunday Reading': L('cafe', 'overcast', 14, 3.2, DAY),
    'Whiteboard': L('room', 'sparse', 14, 3.1, DAY),
    'Five Notes Only': L('alpine', 'clear', 10, 0.7, DAY),
    'Solo Grand': L('lake', 'clear', 14, 2),
    'Pure Piano': L('lake', 'clear', 15.5, 1.8),
    'Felted Piano': L('tundra', 'snow', 23, 3, { ...NIGHT, seasons: WINTER }),   // "Felted Piano (v1)" shares it

    'Desert dusk': L('desert', 'haze', 18.5, 1.5, { hours: [17, 21] }),
    'Damp Crater': L('swamp', 'fog', 1, 1.5, NIGHT),
    'Dark Mirror Dimension': L('volcano', 'clear', 22, 2.8, NIGHT),
    'Ice Cave Echoes': L('cave', 'clear', 13, 3, { seasons: WINTER, look: { icy: true } }),
    'Haunted Staircase': L('ruins', 'fog', 23, 2.5, { ...LATE, seasons: AUTUMN }),
    'Seaside Hearth': L('harbour', 'overcast', 19, 3.2, { ...EVENING, seasons: [2.4, 3.6] }),
    'Drone and Drift': L('lake', 'haze', 5, 2.6, DAWN),
    'Almost Home': L('train', 'haze', 19, 2.7, EVENING),
    'Altman': L('planet', 'clear', 2, 3.2, NIGHT),

    'Thunderstorm': L('grassland', 'storm', 17, 1.5),
    'Beach at night': L('seaside', 'clear', 23, 1.5, NIGHT),
    'Campfire': L('camp', 'clear', 20.5, 1.2, NIGHT),
    'Rain on the window': L('room', 'rain', 16.5, 2.6),
    'Windy hill': L('hills', 'mixed', 14, 0.5),

    'Slightly Slower Than Light': L('starship', 'clear', 2, 1),
    'Mild Vacuum': L('planet', 'clear', 3.5, 1),
    'Hull Breach Brunch': L('starship', 'clear', 11, 1, MORNING),
    'Mildly Alarmed': L('starship', 'clear', 22, 1, { ...NIGHT, look: { world: 'gas' } }),
    'Plotting a Course': L('starship', 'clear', 15, 1.5, { look: { open: true } }),

    'Bounty Hunter Basement': L('cave', 'clear', 2, 1),
    'Zero Fun Zone': L('desert', 'clear', 14, 1),
    'Big Blue-ish': L('reef', 'clear', 12, 1, DAY),
    'Heroic Field Trip': L('ruins', 'scattered', 11, 0.4, DAY),
    'Slightly Lost Forest': L('woodland', 'fog', 7.5, 2.5),
    'Nervous Chicken Village': L('farmland', 'sparse', 9.5, 0.3),
    'Cold Drifts, Warm Socks': L('village', 'snow', 11, 3.3, { seasons: WINTER }),
    'Soggy Home Planet': L('jungle', 'rain', 14, 1),
    'Ruins in the Drizzle': L('ruins', 'rain', 15, 2),
    'Mushroom Kingdom Commute': L('grassland', 'sparse', 10, 0.2),
    'Tall Grass Route': L('grassland', 'scattered', 13, 1.6),
    'Falling Blocks Folk Dance': L('village', 'snow', 14, 3.2, { seasons: WINTER }),
    'Robot Factory Rush': L('industrial', 'dense', 15, 1.5),
    'Boss Fight, Politely': L('volcano', 'clear', 17, 1.2),
    'Bonfire Rest': L('camp', 'clear', 23.5, 1.6, NIGHT),

    'Turnip Town': L('farmland', 'scattered', 12, 2.2),
    'Rainy Day, Chickens Inside': L('farmland', 'rain', 15, 0.6),
    'Pint-Sized Saloon': L('desert', 'clear', 21, 1.4, DUSK),
    'Block Forest': L('woodland', 'scattered', 15.5, 1.6),
    'Dig Straight Down': L('cave', 'clear', 9, 1),
    'Falling Stars, Mostly Harmless': L('lake', 'clear', 23.5, 1.2, LATE),
    'Island Shop Hours': L('harbour', 'sparse', 13, 1, DAY),
    'Quiet Blocky Cave': L('cave', 'clear', 20, 1),

    'Open Mic Pad': L('cafe', 'clear', 20, 1, { hours: [18, 1] }),
    'Quiet Studio': L('room', 'sparse', 9, 0.2),
    'Soft Landing': L('garden', 'sparse', 15, 2.2),
    'Gentle Interview': L('grassland', 'scattered', 11, 2.2),
    'Room Tone': L('room', 'overcast', 12.5, 1.6),
    'Upbeat Explainer': L('grassland', 'scattered', 16.5, 0.7),
    'Rain Under Speech': L('street', 'rain', 19.5, 2.2, { hours: [18, 2] }),
    'Late Show Lounge': L('cafe', 'clear', 22, 1.5, { hours: [20, 2] }),

    'Replicant Blues': L('street', 'rain', 23, 2.6, NIGHT),
    'Tears in Weather': L('street', 'rain', 0.5, 3, NIGHT),
    'Oxygen Debt': L('industrial', 'haze', 4, 2),
    'Oxygene Sunrise': L('floating', 'haze', 6, 0.3, DAWN),
    'Real Hero Hours': L('synth', 'scattered', 20, 1.5, DUSK),
    'Getaway Driver, Off Duty': L('synth', 'clear', 21, 1.4, NIGHT),
    'Nightcall, Voicemail': L('street', 'clear', 2.5, 1.5, LATE),
    'Outrun Lullaby': L('synth', 'clear', 18.5, 1.2, DUSK),
    'Piano and Clarinet, Cinematic': L('ruins', 'overcast', 17.5, 3.1),

    'Pastel Coastline': L('seaside', 'streaks', 18.5, 1.3, DUSK),
    'Amber Transit': L('train', 'haze', 18, 2.2, { hours: [16, 21] }),
    'Pocket Circuit': L('synth', 'clear', 16, 1.5),
    'Orbital Afterglow': L('starship', 'clear', 20, 1.3),
    'Long Way to Sunrise': L('train', 'streaks', 5.5, 0.5, { hours: [3.5, 8.5] }),
    'Rooms Above the Clouds': L('floating', 'sparse', 16.5, 1, { hours: [8, 20.5] }),

    'Glass Conservatory': L('jungle', 'sparse', 11, 0.6),
    'Tine and Tide': L('harbour', 'scattered', 10, 0.7),
    'Lantern Circuit': L('garden', 'clear', 21, 1.8, { ...NIGHT, look: { lanterns: true } }),

    // The weather-only presets (src/app/weatherPresets.js).
    'Gentle drizzle': L('swamp', 'rain', 7, 1.1, DAWN),
    'Open rain': L('river', 'rain', 15, 2.2),
    'Rain indoors': L('train', 'rain', 19, 2.6, EVENING),
    'Distant thunder': L('savanna', 'storm', 18.5, 1.6, DUSK),
    'Gentle shoreline': L('seaside', 'clear', 6.5, 1.1, DAWN),
    'Rolling surf': L('harbour', 'scattered', 14, 2.3),
    'Coastal storm': L('seaside', 'storm', 21, 3.1, NIGHT),

    'Demo: Breathing cadences': L('lake', 'haze', 8.5, 1.1),
    'Demo: Strong and soft': L('hills', 'mixed', 10, 2.2),
    'Demo: Make room': L('grassland', 'streaks', 7.5, 1.2),
    'Demo: Opening out': L('savanna', 'sparse', 17.5, 1.6),
    'Demo: Two-minute wave': L('seaside', 'scattered', 16, 1.1),
    'Demo: Living colour': L('farmland', 'sparse', 8, 1.1),
    'Demo: Shifting metre': L('river', 'scattered', 13, 1.6),
    'Demo: Seven-eight': L('woodland', 'sparse', 10, 2.4),
    'Odd-Time Lamplight': L('city', 'haze', 23, 2.4, LATE),
    'Demo: 7/8 electro': L('city', 'scattered', 22.5, 1.4, { ...NIGHT, look: { neon: true } }),
    'Demo: 5/8 downtempo': L('lake', 'haze', 19, 2.1, EVENING),
    'Bossa in Seven': L('city', 'sparse', 19, 1.2, DUSK),
    'Demo: Bass figures': L('room', 'sparse', 15, 0.8),
    'Neon Overpass': L('city', 'clear', 22, 2.2, { ...NIGHT, look: { neon: true } }),
    'Outrun After Midnight': L('city', 'clear', 23, 1.5, { ...NIGHT, look: { neon: true } }),
    'Rainfall Breaks': L('city', 'rain', 1, 2.2, { ...LATE, look: { neon: true } }),
    'Wet Pavement Two-Step': L('city', 'rain', 20, 2.6, EVENING),
    'Demo: Low note, then chord': L('lake', 'storm', 22, 1.8, { hours: [18, 4] }),
    'Demo: Struck leads, no trills': L('garden', 'sparse', 10, 0.4),

    // the step-sequencer presets: house, techno, trance and minimal at a warehouse party (neither synthwave nor the city)
    'Warehouse Lift': L('warehouse', 'clear', 23, 1.8, NIGHT),
    'Acid Jack Afterhours': L('warehouse', 'haze', 2, 2.2, LATE),
    'Electro Story': L('warehouse', 'sparse', 22, 1.6, NIGHT),
    'Dub Pulse Basement': L('warehouse', 'fog', 1, 2.6, LATE),
    'Uplifting Trance Departures': L('warehouse', 'clear', 22.5, 1.4, NIGHT),
    'Progressive Night Bus': L('warehouse', 'haze', 1.5, 2, LATE),
    'Minimal Click Lab': L('warehouse', 'fog', 3, 2.4, LATE),
    'Slow House Sunset': L('warehouse', 'scattered', 19.5, 1.5, DUSK),
    'Deep Pocket Daydream': L('warehouse', 'haze', 20, 2.1, EVENING),
    'Disco Ride Afternoon': L('warehouse', 'sparse', 18, 1.7, DUSK),
    // the hip hop ones sit in town
    'Trap House Tuesday': L('street', 'rain', 23.5, 2.2, LATE),
    'Boom Bap Bakery': L('street', 'overcast', 20, 2.3, EVENING),
    'Dusty Vinyl Sunday': L('room', 'haze', 17, 2.3, EVENING),
};

// Scenes not listed above (the user's own, or new ones) fall back to their category.
const BY_CATEGORY = {
    cozy: L('cafe', 'overcast', 17, 2.3),
    night: L('lake', 'clear', 1, 1.5, NIGHT),
    focus: L('room', 'sparse', 11, 0.8),
    ambience: L('grassland', 'scattered', 12, 1),
    starship: L('starship', 'clear', 2, 1),
    classics: L('grassland', 'scattered', 11, 0.6),
    sandbox: L('woodland', 'scattered', 12, 1),
    podcast: L('room', 'sparse', 10, 0.8),
    cinema: L('street', 'rain', 23, 2, NIGHT),
    unsettling: L('hills', 'fog', 5, 2.8),
    electronic: L('synth', 'clear', 21, 1.5),
    wasm: L('lake', 'sparse', 14, 1),
    demo: L('lake', 'clear', 12, 1),
};

// "Name (previous piano)", "Name v1" and "Name · Bossa" share the landscape of "Name".
const baseName = (name) => name.replace(/\s*\((previous[^)]*|tonal|v\d+)\)$/i, '').replace(/\s+v\d+$/i, '').replace(/\s+·\s+.*$/, '').trim();

export function landscapeForScene(name, category) {
    return BY_NAME[name] || BY_NAME[baseName(name)] || BY_CATEGORY[category] || null;
}

export const SCENE_LANDSCAPES = BY_NAME;

// `options` (the scenery options) as they become when a preset is picked; unchanged when the
// user turned following off or the preset has no landscape. `random` supplies a new seed.
export function sceneryForScene(options, scene, random = () => Math.floor(Math.random() * 1e6)) {
    const l = scene && landscapeForScene(scene.name, scene.category);
    if (!options.follow || !l) return options;
    return {
        ...options, biome: l.biome, seed: options.biome === l.biome ? options.seed : random(),
        weather: l.weather, hour: l.hour, year: l.year, hours: l.hours, seasons: l.seasons, look: l.look,
        time: options.moveTime ? 'cycle' : 'fixed', season: options.moveSeason ? 'cycle' : 'fixed', epoch: Date.now(),
    };
}
