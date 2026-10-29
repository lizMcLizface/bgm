// The kind of instrument a sound is, for the picker's colour coding. Worked out from the
// sound's name and the block it is listed in; a guess, so unknown names fall back on the block.

export const FAMILIES = {
    pad: { label: 'Pad', colour: '#8f7ae0' },
    strings: { label: 'Strings', colour: '#d9715f' },
    brass: { label: 'Brass', colour: '#e6a43c' },
    wind: { label: 'Woodwind', colour: '#58b88a' },
    choir: { label: 'Choir', colour: '#e07aa8' },
    keys: { label: 'Keys', colour: '#4fa8d8' },
    piano: { label: 'Piano', colour: '#6c8fe0' },
    pluck: { label: 'Pluck & bell', colour: '#47c2c2' },
    organ: { label: 'Organ', colour: '#b0925a' },
    bass: { label: 'Bass', colour: '#c9582f' },
    lead: { label: 'Lead', colour: '#d6d04a' },
    texture: { label: 'Texture', colour: '#8d9aa6' },
};

// First match wins, so the specific words come before the general ones.
const BY_NAME = [
    ['brass', /brass|trumpet|horn|fanfare|trombone/],
    ['choir', /choir|\bah\b/],
    ['strings', /string|violin|viola|cello|bowed|pizz/],
    ['wind', /flute|clarinet|ocarina|whistle|reed|pipes?\b|squeezebox/],
    ['organ', /organ|drawbar/],
    ['piano', /piano|grand|upright|ravel|meantone/],
    ['pluck', /pluck|harp|kalimba|music box|marimba|mallet|bell|celesta|guitar|\barp\b/],
    ['keys', /keys|rhodes|tine|felt/],
    ['bass', /bass|\bsub\b|throb|thump|deep pulse|pulse bass/],
    ['texture', /rain|wind pad|haze|underwater|drone|void/],
    ['pad', /\bpad\b/],
    ['lead', /lead|saw|square|signal/],
    ['pad', /sweep|shimmer|swell|glass|analog|ghost/],
];
const BY_GROUP = { Pads: 'pad', Bass: 'bass', Leads: 'lead', 'Keys & plucks': 'keys', Pianos: 'piano', Textures: 'texture', 'Classic keys': 'keys', Measured: 'strings', 'Wasm voices': 'pad' };

/** The family id of a sound: by its name, else by the block it is listed in, else `fallback`. */
export function soundFamily(name, group, fallback) {
    const lower = String(name).toLowerCase();
    if (group === 'Bass') return 'bass';
    const hit = BY_NAME.find(([, pattern]) => pattern.test(lower));
    return (hit && hit[0]) || BY_GROUP[group] || fallback || 'texture';
}

/** The colour of a listing block, from its name (a block of mixed sounds has none of its own). */
export function groupColour(group) {
    return BY_GROUP[group] ? FAMILIES[BY_GROUP[group]].colour : null;
}
