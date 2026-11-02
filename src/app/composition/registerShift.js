// Keeps a part inside an instrument's real range: a voice whose preset names a `range` [low, high] (MIDI) hears its role moved by whole octaves, one shift for a
// whole phrase, so the line keeps its shape, which is what an arranger does for a piccolo or crotales. Only a note the shift cannot reach folds on its own, the last
// resort. The composer does not know any of this: it still writes in the role's usual range (docs/ROADMAP.md, range-aware composing).
const MAX_FOLD = 8;

const median = (list) => [...list].sort((a, b) => a - b)[list.length >> 1];
const inside = (midi, [low, high]) => midi >= low && midi <= high;
const validRange = (range) => (Array.isArray(range) && range.length === 2 && range[1] > range[0] ? range : null);

/** The roles whose voice has a range. Empty for nearly every voice, and then this module does nothing at all. */
export function rangedRoles(voices = {}) {
    return Object.fromEntries(Object.entries(voices).flatMap(([role, voice]) => {
        const range = validRange(voice?.preset?.range);
        return range ? [[role, range]] : [];
    }));
}

/**
 * The octaves to move written notes by so they sit in `range`. A shift that already keeps nearly all of them inside stays, so the part does not change octave
 * from phrase to phrase for a stray note or two; otherwise the middle of what was written goes to the middle of the range.
 */
export function octaveShift(notes, range, keep = null) {
    const stay = keep ?? 0;       // no shift at all, when nothing has been chosen yet: an instrument that fits plays what was written
    if (notes.filter((midi) => inside(midi + stay, range)).length >= notes.length * .9) return stay;
    return 12 * Math.round(((range[0] + range[1]) / 2 - median(notes)) / 12);
}

/** A note moved by octaves to the nearest place inside the range; a range under an octave wide may have none, and then the nearest edge's octave. */
export function foldIntoRange(midi, [low, high]) {
    let moved = midi;
    for (let i = 0; i < MAX_FOLD && moved < low; i++) moved += 12;
    for (let i = 0; i < MAX_FOLD && moved > high; i++) moved -= 12;
    return moved;
}

/**
 * The shifts for a phrase, chosen when it starts. A phrase is not known ahead of time, since the bars are planned one by one: the first takes its measure from the
 * range the composer is writing the role in, and each later one from the notes the last phrase really had, which `heard` collects.
 */
export function planRegisterShift(start, roles, previous, composerRanges = {}) {
    const shifts = {};
    for (const [role, range] of Object.entries(roles)) {
        const written = composerRanges[role], heard = previous?.heard?.[role] ?? [];
        const notes = heard.length ? heard : written ? [Math.round((written[0] + written[1]) / 2)] : [];
        shifts[role] = octaveShift(notes, range, previous?.shifts?.[role] ?? null);
    }
    return { start, shifts, heard: {} };
}

/**
 * Applies a phrase's shifts to a bar's events, in place, and returns the plan with this bar's written notes added. Events of other roles are not touched. A chord
 * note that folds onto another of the same chord is dropped rather than played twice.
 */
export function applyRegisterShift(events, plan, roles) {
    const heard = { ...plan.heard }, sounding = new Set();
    for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i], range = roles[event.role];
        if (!range || !Number.isFinite(event.midi)) continue;
        heard[event.role] = [...(heard[event.role] ?? []), event.midi];
        event.midi = foldIntoRange(event.midi + (plan.shifts[event.role] ?? 0), range);
        const key = `${event.role}:${event.beat}:${event.midi}`;
        if (sounding.has(key)) events.splice(i, 1);
        else sounding.add(key);
    }
    return { ...plan, heard };
}
