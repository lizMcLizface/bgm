// Which presets a new listener has, and how more are earned.
//
// The list has hundreds of presets, which is a lot to meet at once. While the quest system is on, each
// category starts with its STARTERS (the best of it) and opens up as you listen to it: the time spent on
// the presets of a category, and how many different ones were heard, move it up the TIERS below. Presets
// stay in the order they have in the library, after the starters. Anything already heard stays available.
//
// This is switched off (everything is open) when the quests are off, in a shared-link preview, for people
// who knew the page before quests, and by the "Unlock all presets" button in the list (see usePresetAccess
// in GenerativeApp.jsx). Listening time per preset is kept by the quest log (questState.js `heard`).

/**
 * Preset names to start with, in the order they appear: the best preset of each category, picked by the author.
 * Wasm showcases and Feel demos are always open (OPEN_CATEGORIES).
 * @type {string[]}
 */
export const STARTERS = [
    'Rainy café', // Cozy
    'Ambient Piano, Distant Storm', // Night & deep (the preset the page opens on)
    'Solo Grand', // Focus
    'Thunderstorm', // Ambience
    'Hull Breach Brunch', // Sub-light Cruising
    'Mushroom Kingdom Commute', // Console Nostalgia
    'Island Shop Hours', // Dig, Farm, Repeat
    'Late Show Lounge', // Under Speech
    'Replicant Blues', // Synth Cinema
    'Seaside Hearth', // Unsettling
    'Progressive Night Bus', // Electronic Horizons
];

/**
 * How many of a category's presets are open once it has been listened to for at least `seconds` in all and
 * `distinct` different presets were heard (for HEARD_SECONDS each). The highest tier met applies; `total`
 * counts the starters too. Infinity opens the rest of the category.
 */
export const TIERS = [
    { seconds: 0, distinct: 0, total: 1 }, // the starter
    { seconds: 60, distinct: 0, total: 3 }, // a minute in the category: the next 2
    { seconds: 300, distinct: 0, total: 5 }, // 5 minutes: 2 more
    { seconds: 900, distinct: 4, total: 9 }, // 15 minutes and 4 presets heard: the next 4
    { seconds: 1800, distinct: 7, total: 14 },
    { seconds: 3600, distinct: 11, total: 22 },
    { seconds: 7200, distinct: 16, total: Infinity },
];

/** Categories that are always fully open: demos of new features and test presets. */
export const OPEN_CATEGORIES = ['wasm', 'demo'];

/** A preset counts as heard (for `distinct`) after this many seconds. */
export const HEARD_SECONDS = 30;

/** The names of a category's presets in the order they open: starters first, then library order. */
export function openingOrder(names, starters = STARTERS) {
    const first = starters.filter((name) => names.includes(name));
    // a category with no starter listed starts with its first preset
    const lead = first.length ? first : names.slice(0, 1);
    return [...lead, ...names.filter((name) => !lead.includes(name))];
}

/** { seconds, distinct } listened to in a category. `heard` maps a preset name to seconds. */
export function categoryStats(names, heard) {
    let seconds = 0, distinct = 0;
    for (const name of names) {
        const s = heard[name] ?? 0;
        seconds += s;
        if (s >= HEARD_SECONDS) distinct += 1;
    }
    return { seconds, distinct };
}

const meets = (tier, stats) => stats.seconds >= tier.seconds && stats.distinct >= tier.distinct;

/** How many presets the stats open, and the next tier to reach (null when everything is open). */
export function tierFor(stats, size) {
    let at = 0;
    TIERS.forEach((tier, i) => { if (meets(tier, stats)) at = i; });
    const total = Math.min(size, TIERS[at].total);
    const next = total >= size ? null : TIERS[at + 1] ?? null;
    return { total, next, tier: at };
}

const minutes = (seconds) => {
    const m = Math.ceil(seconds / 60);
    return `${m} more minute${m === 1 ? '' : 's'}`;
};

/** What to do to open more, in a few words ("Listen for 3 more minutes and to 2 more presets"). */
export function goalText(stats, next, label) {
    if (!next) return '';
    const parts = [];
    if (stats.seconds < next.seconds) parts.push(`for ${minutes(next.seconds - stats.seconds)}`);
    if (stats.distinct < next.distinct) {
        const more = next.distinct - stats.distinct;
        parts.push(`to ${more} more preset${more === 1 ? '' : 's'}`);
    }
    return `Listen ${parts.join(' and ')} in ${label} to open more.`;
}

/**
 * Everything the list needs. `categories` is [{ id, label, names }] (names in library order), `heard` the
 * seconds per preset, `starters` as STARTERS.
 * @returns {{ isOpen: function(string): boolean, byCategory: Object }} `byCategory[id]` is
 *   { open, total, stats, next, goal, progress } with `progress` 0..1 towards the next tier
 */
export function presetAccess(categories, heard, starters = STARTERS) {
    const open = new Set();
    const byCategory = {};
    for (const { id, label, names } of categories) {
        const stats = categoryStats(names, heard);
        const { total, next } = OPEN_CATEGORIES.includes(id) ? { total: names.length, next: null } : tierFor(stats, names.length);
        const ordered = openingOrder(names, starters);
        ordered.slice(0, total).forEach((name) => open.add(name));
        // what was already heard stays
        names.forEach((name) => { if ((heard[name] ?? 0) > 0) open.add(name); });
        const opened = names.filter((name) => open.has(name)).length;
        byCategory[id] = {
            open: opened,
            total: names.length,
            stats,
            next,
            goal: goalText(stats, next, label),
            progress: next ? Math.min(1, Math.max(next.seconds ? stats.seconds / next.seconds : 1, 0)) : 1,
        };
    }
    return { isOpen: (name) => open.has(name), byCategory };
}
