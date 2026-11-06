// The drum machine as a sequencer target: tracks (the kit's voices), the control names the sequencer may
// drive later (modulation lanes, step locks), the per-hit parameters it declares, and trigger(), which turns a
// core event into a timed note.

const FIELDS = ['Level', 'Tune', 'Decay', 'Tone', 'Pan'];
const BASE_NOTE = 36;
const PER_HIT = 4; // pressure keys: track * 4 + field // the kernel plays track t for note 36 + t
const KEY_BASE = 800;

/**
 * Per-hit parameters a step may carry (a lock, or the accent row), and whether this target can realize them.
 * The kernel takes them as timed pressure events just before the note (key = track * 4 + field, see
 * `poly_pressure` in drums.rs); a kernel without that (an older cached wasm) plays the note and ignores them.
 * Anything not declared realized is dropped and reported.
 */
export const DRUM_PARAMS = {
    accent: { min: 0, max: 1, default: 0, realized: true, field: 1 },
    tune: { min: -1, max: 1, default: 0, realized: true, field: 2 },
    decay: { min: -1, max: 1, default: 0, realized: true, field: 3 },
};

/**
 * @param kit  an entry of drums/kits.js
 * @param live () => the live synth engine ({ noteOn(id, note, velocity, time) }) or null
 * @param accentAmount () => the machine's Accent knob, 0..1
 * @param onIgnored (event, names) => void, called when a hit carries parameters this target cannot realize
 */
export function drumTarget(kit, live, accentAmount = () => 0.5, onIgnored = null) {
    const tracks = kit.tracks.map(([key, short, long]) => ({ key, short, long }));
    return {
        id: kit.id,
        tracks,
        params: DRUM_PARAMS,
        /** Control ids by track, and the machine's own: what a modulation lane or a step lock can point at. */
        controls: {
            tracks: Object.fromEntries(tracks.map((t) => [t.key, FIELDS.map((f) => t.key + f)])),
            machine: ['master', 'accent', 'tempo', 'swing', 'flam'],
        },
        /** The note's velocity: the kernel's gain is 0.35 + 0.65 * velocity, then times the hit's accent (sent separately). */
        velocity({ velocity }) {
            return Math.min(1, Math.max(0.2, velocity));
        },
        /** The names in the event's params this target cannot realize. */
        unsupported(event) {
            return Object.keys(event.params ?? {}).filter((name) => !DRUM_PARAMS[name]?.realized);
        },
        trigger(event) {
            const engine = live();
            if (!engine || event.track >= tracks.length) return;
            const ignored = this.unsupported(event);
            if (ignored.length) onIgnored?.(event, ignored);
            for (const [name, value] of Object.entries(event.params ?? {})) {
                const spec = DRUM_PARAMS[name];
                if (spec?.realized && value !== 0 && engine.pressure) engine.pressure(event.track * PER_HIT + spec.field, value, event.time);
            }
            engine.noteOn(KEY_BASE + event.track, BASE_NOTE + event.track, this.velocity(event), event.time);
        },
    };
}

/** The bank's per-step values of one pattern ({ "track:step": {...} }) as the core's nested locks. */
export function expandLocks(flat = {}) {
    const locks = {};
    for (const [key, value] of Object.entries(flat)) {
        const [track, step] = key.split(':').map(Number);
        ((locks[track] ??= {})[step] = value);
    }
    return locks;
}

/**
 * A drum page's pattern (rows of steps, the accent row last) as a core pattern. `ctx` is { bank, index }: the bank
 * keeps the pattern's step values (bank.locks[index]) and its tracks' own lengths (bank.trackLengths[index]).
 * `silent(track)` empties a muted (or not soloed) voice.
 */
export const drumPattern = (kit, silent = () => false) => (pattern, ctx) => ({
    rows: pattern.slice(0, kit.tracks.length).map((row, t) => (silent(t) ? row.map(() => 0) : row)),
    accent: pattern[kit.tracks.length],
    locks: ctx?.bank?.locks?.[ctx.index] ? expandLocks(ctx.bank.locks[ctx.index]) : pattern.locks,
    lengths: ctx?.bank?.trackLengths?.[ctx.index],
    play: ctx?.bank?.trackPlay?.[ctx.index],
});
