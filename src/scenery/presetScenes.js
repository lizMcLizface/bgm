// Which landscape goes with which musical preset (scene): a landscape kind, a weather,
// an hour (0-24) and a time of year (0 spring, 1 summer, 2 autumn, 3 winter).
// Names only, so the page can look one up without loading the generators. See
// docs/LANDSCAPE_PRESETS.md for how well each match fits and what is still missing.
const L = (biome, weather, hour, year) => ({ biome, weather, hour, year });

const BY_NAME = {
    'Rainy café': L('river', 'rain', 16, 2.3),
    'Late-night brushes': L('industrial', 'haze', 23, 2.5),
    'Deep night': L('lake', 'storm', 1, 1.5),
    'Glass garden': L('hills', 'sparse', 11, 0.5),
    'Underwater': L('seaside', 'fog', 3, 1),
    'Chapel organ': L('hills', 'mixed', 6.5, 2.5),
    'Fireside folk': L('woodland', 'clear', 21, 2.6),
    'Desert dusk': L('desert', 'haze', 18.5, 1.5),
    'Tape memories': L('industrial', 'haze', 20, 2),
    'Choir at sea': L('seaside', 'overcast', 17, 2),
    'Morning coffee': L('farmland', 'sparse', 8, 0.6),
    'Clockwork': L('industrial', 'scattered', 12, 2.2),
    'Slow motion': L('lake', 'fog', 5, 3),
    'Study session': L('lake', 'overcast', 21, 3),
    'Night drive': L('industrial', 'clear', 23, 1.7),
    'Quiet-room waltz': L('woodland', 'snow', 17, 3),
    'Dorian walk': L('river', 'scattered', 16, 2.3),
    'Breathing room': L('lake', 'haze', 4.5, 0.2),
    'Sunrise in seven': L('savanna', 'streaks', 6, 1),
    'Thunderstorm': L('grassland', 'storm', 17, 1.5),
    'Beach at night': L('seaside', 'clear', 23, 1.5),
    'Campfire': L('woodland', 'clear', 22, 2),
    'Rain on the window': L('river', 'rain', 20, 2.5),
    'Windy hill': L('hills', 'mixed', 14, 0.5),

    'Slightly Slower Than Light': L('desert', 'clear', 2, 1),
    'Mild Vacuum': L('desert', 'clear', 3.5, 1),
    'Hull Breach Brunch': L('industrial', 'dense', 1, 1),
    'Mildly Alarmed': L('industrial', 'storm', 22, 1),
    'Plotting a Course': L('lake', 'clear', 2, 1.5),

    'Bounty Hunter Basement': L('industrial', 'haze', 21, 1),
    'Damp Crater': L('hills', 'storm', 1, 1),
    'Zero Fun Zone': L('desert', 'clear', 14, 1),
    'Big Blue-ish': L('desert', 'haze', 16, 1),
    'Heroic Field Trip': L('grassland', 'scattered', 11, 0.4),
    'Slightly Lost Forest': L('woodland', 'fog', 9, 0.5),
    'Nervous Chicken Village': L('farmland', 'sparse', 10, 0.8),
    'Dark Mirror Dimension': L('desert', 'dust', 17, 2.8),
    'Cold Drifts, Warm Socks': L('lake', 'snow', 11, 3),
    'Ice Cave Echoes': L('lake', 'fog', 2, 3),
    'Soggy Home Planet': L('grassland', 'rain', 14, 1),
    'Ruins in the Drizzle': L('woodland', 'rain', 15, 2),

    'Turnip Town': L('farmland', 'scattered', 11, 0.7),
    'Rainy Day, Chickens Inside': L('farmland', 'rain', 15, 2),
    'Pint-Sized Saloon': L('desert', 'clear', 19, 1.4),
    'Block Forest': L('woodland', 'scattered', 12, 1),
    'Dig Straight Down': L('hills', 'dense', 22, 1),
    'Falling Stars, Mostly Harmless': L('lake', 'clear', 23.5, 1.2),
    'Island Shop Hours': L('seaside', 'sparse', 13, 1),
    'Quiet Blocky Cave': L('hills', 'overcast', 20, 1),

    'Open Mic Pad': L('lake', 'clear', 10, 1),
    'Quiet Studio': L('lake', 'sparse', 10, 0.8),
    'Soft Landing': L('hills', 'sparse', 9, 0.6),
    'Gentle Interview': L('grassland', 'scattered', 11, 0.8),
    'Room Tone': L('lake', 'overcast', 12, 2),
    'Upbeat Explainer': L('grassland', 'scattered', 13, 1),
    'Rain Under Speech': L('river', 'rain', 14, 2.2),
    'Late Show Lounge': L('industrial', 'clear', 22, 1.5),

    'Sunday Reading': L('farmland', 'overcast', 15, 2.3),
    'Whiteboard': L('industrial', 'sparse', 11, 0.8),
    'Lamplight': L('river', 'clear', 20.5, 2.5),
    'Solo Grand': L('lake', 'clear', 14, 2),
    'Five Notes Only': L('hills', 'clear', 10, 0.7),

    'Mushroom Kingdom Commute': L('grassland', 'sparse', 10, 0.5),
    'Tall Grass Route': L('grassland', 'scattered', 12, 1.3),
    'Falling Blocks Folk Dance': L('farmland', 'snow', 14, 3),
    'Haunted Staircase': L('woodland', 'fog', 23, 2.8),
    'Robot Factory Rush': L('industrial', 'dense', 15, 1.5),
    'Boss Fight, Politely': L('desert', 'dust', 17, 1.2),
    'Bonfire Rest': L('woodland', 'clear', 21.5, 2),

    'Seaside Hearth': L('seaside', 'overcast', 19, 3),
    'Drone and Drift': L('lake', 'haze', 5, 1.5),
    'Bittersweet Sunday': L('farmland', 'haze', 17.5, 2.5),
    'Wide Open Plains': L('grassland', 'streaks', 7, 1.5),
    'Same Tune, Slightly Different': L('river', 'mixed', 15, 1.8),
    'Almost Home': L('farmland', 'haze', 19, 2.7),
    'Altman': L('hills', 'fog', 6, 3),

    'Replicant Blues': L('industrial', 'rain', 23, 2),
    'Tears in Weather': L('industrial', 'rain', 0.5, 2),
    'Oxygen Debt': L('industrial', 'haze', 4, 2),
    'Oxygene Sunrise': L('lake', 'haze', 6, 0.3),
    'Real Hero Hours': L('industrial', 'scattered', 20, 1.5),
    'Getaway Driver, Off Duty': L('desert', 'clear', 21, 1.4),
    'Nightcall, Voicemail': L('industrial', 'clear', 23.5, 1.5),
    'Outrun Lullaby': L('seaside', 'clear', 19.5, 1.2),

    'Pastel Coastline': L('seaside', 'streaks', 18.5, 1.3),
    'Amber Transit': L('industrial', 'haze', 18, 2.2),
    'Pocket Circuit': L('industrial', 'clear', 22, 1.5),
    'Orbital Afterglow': L('lake', 'clear', 20, 1.3),
    'Long Way to Sunrise': L('hills', 'streaks', 5.5, 0.5),
    'Rooms Above the Clouds': L('lake', 'towering', 16, 1),

    'Glass Conservatory': L('grassland', 'sparse', 11, 0.6),
    'Tine and Tide': L('seaside', 'scattered', 15, 1),
    'Lantern Circuit': L('river', 'clear', 21, 1.8),

    'Piano and Pads': L('lake', 'fog', 20, 2),
    'Piano and Clarinet, Cinematic': L('hills', 'overcast', 17.5, 2.4),
    'Ambient Piano, Distant Storm': L('lake', 'storm', 22, 1.8),
};

// Scenes not listed above (the user's own, or new ones) fall back to their category.
const BY_CATEGORY = {
    cozy: L('farmland', 'overcast', 17, 2.3),
    night: L('lake', 'clear', 1, 1.5),
    focus: L('lake', 'sparse', 11, 0.8),
    ambience: L('grassland', 'scattered', 12, 1),
    starship: L('desert', 'clear', 2, 1),
    classics: L('grassland', 'scattered', 11, 0.6),
    sandbox: L('woodland', 'scattered', 12, 1),
    podcast: L('lake', 'sparse', 10, 0.8),
    cinema: L('industrial', 'rain', 23, 2),
    unsettling: L('hills', 'fog', 5, 2.8),
    electronic: L('industrial', 'haze', 19, 1.5),
    wasm: L('lake', 'sparse', 14, 1),
    demo: L('lake', 'clear', 12, 1),
};

// "Name (previous piano)", "Name v1" and "Name · Bossa" share the landscape of "Name".
const baseName = (name) => name.replace(/\s*\((previous[^)]*|tonal)\)$/i, '').replace(/\s+v\d+$/i, '').replace(/\s+·\s+.*$/, '').trim();

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
        weather: l.weather, hour: l.hour, year: l.year,
        time: options.moveTime ? 'cycle' : 'fixed', season: options.moveSeason ? 'cycle' : 'fixed', epoch: Date.now(),
    };
}
