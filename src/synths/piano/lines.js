// Short piano lines for judging the sound: a note is [beat, midi, length in beats, velocity 1..127].
// Pedal changes are [beat, down]. Each line is written for a few bars, with the register and touch
// the character needs, so the low end, the soft touch and the fast repeats each get used.

const note = (beat, midi, length, velocity) => [beat, midi, length, velocity];
const BAR = 4;

/** A broken chord: `pattern` offsets from the root, one every `step` beats, for `bars` bars. */
function broken(bar, root, pattern, step, velocity, bars = 1) {
    const out = [];
    for (let i = 0; i < bars * BAR / step; i++) out.push(note(bar * BAR + i * step, root + pattern[i % pattern.length], step * 2, velocity - (i % pattern.length === 0 ? 0 : 6)));
    return out;
}
const pedalEachBar = (bars) => Array.from({ length: bars }, (_, bar) => [[bar * BAR, false], [bar * BAR + .02, true]]).flat().slice(1);

// ---- calm: C major / A minor, slow, soft, a melody over rolling eighths
const CALM_CHORDS = [[36, [0, 7, 12, 16, 12, 7, 12, 7]], [33, [0, 7, 12, 15, 12, 7, 12, 7]], [29, [0, 7, 12, 16, 12, 7, 12, 7]], [31, [0, 7, 12, 17, 12, 7, 12, 7]]];
const calm = {
    name: 'Calm', tempo: 64, bars: 8,
    notes: [
        ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((bar) => broken(bar, CALM_CHORDS[bar % 4][0], CALM_CHORDS[bar % 4][1], .5, 44)),
        note(0, 67, 2, 58), note(2, 64, 2, 52), note(4, 69, 3, 60), note(7, 72, 1, 50), note(8, 69, 2, 54), note(10, 65, 2, 48),
        note(12, 67, 4, 56), note(16, 64, 1.5, 54), note(17.5, 67, .5, 46), note(18, 72, 2, 62), note(20, 71, 2, 52), note(22, 69, 2, 46),
        note(24, 65, 2, 50), note(26, 69, 2, 52), note(28, 67, 3, 56), note(31, 62, 1, 40),
    ],
    pedal: pedalEachBar(8),
};

// ---- melancholic: D minor, sparse, a low bass note under a falling melody
const MEL_BASS = [[38, [0, 7, 12, 17]], [34, [0, 7, 12, 16]], [31, [0, 7, 12, 15]], [33, [0, 7, 12, 16]]];
const melancholic = {
    name: 'Melancholic', tempo: 54, bars: 8,
    notes: [
        ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((bar) => {
            const [root, offsets] = MEL_BASS[bar % 4];
            return [note(bar * BAR, root - 12, 4, 54), ...offsets.map((o, i) => note(bar * BAR + .5 + i * .75, root + o + (i === 3 ? 0 : 0), 2, 34 + i * 3))];
        }),
        note(0, 69, 1.5, 62), note(1.5, 65, .5, 46), note(2, 62, 2, 56), note(4, 70, 2, 60), note(6, 69, 1, 48), note(7, 65, 1, 42),
        note(8, 67, 3, 58), note(11, 70, 1, 44), note(12, 69, 1.5, 62), note(13.5, 67, .5, 44), note(14, 64, 2, 52),
        note(16, 69, 1.5, 66), note(17.5, 72, .5, 50), note(18, 74, 2, 68), note(20, 70, 2, 58), note(22, 67, 1, 46), note(23, 70, 1, 40),
        note(24, 69, 2, 60), note(26, 65, 1, 46), note(27, 64, 1, 42), note(28, 62, 4, 52),
    ],
    pedal: pedalEachBar(8),
};

// ---- energetic: A minor, fast, an octave bass pulse and a sixteenth-note riff with accents
const ENERGY_ROOTS = [33, 29, 36, 31];
const ENERGY_CHORDS = [[0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12]];
const energetic = {
    name: 'Energetic', tempo: 132, bars: 8,
    notes: [
        ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((bar) => {
            const root = ENERGY_ROOTS[bar % 4], chord = ENERGY_CHORDS[bar % 4], out = [];
            for (let i = 0; i < 8; i++) out.push(note(bar * BAR + i * .5, root + (i % 2 ? 12 : 0), .45, i % 4 === 0 ? 100 : 74));
            for (let i = 0; i < 16; i++) out.push(note(bar * BAR + i * .25, root + 36 + chord[[0, 1, 2, 3, 2, 1, 3, 2][i % 8]], .22, i % 4 === 0 ? 108 : i % 2 ? 66 : 82));
            return out;
        }),
        ...[0, 4, 8, 12, 16, 20, 24, 28].map((beat) => note(beat, ENERGY_ROOTS[(beat / 4) % 4] - 12, 1.8, 112)),
    ],
    pedal: [],
};

// ---- low register: slow, for hearing the strings and hammer in the bass
const lowRegister = {
    name: 'Low register', tempo: 60, bars: 8,
    notes: [
        // a rising walk of single notes from A0, each held, soft then hard
        ...[21, 24, 28, 31, 33, 36, 40, 43].map((m, i) => note(i * 2, m, 2, i < 4 ? 50 : 100)),
        // open fifths and octaves, then a low cluster
        note(16, 33, 4, 80), note(16, 40, 4, 72), note(20, 36, 4, 80), note(20, 43, 4, 72), note(24, 31, 4, 90), note(24, 38, 4, 80), note(24, 47, 4, 70),
        note(28, 28, 4, 100), note(28, 35, 4, 90), note(28, 40, 4, 80), note(28, 44, 4, 80),
    ],
    pedal: [[0, true], [16, false], [16.02, true], [32, false]],
};

// ---- dynamics: the same key from barely touched to hard, then a scale across the keyboard
const dynamics = {
    name: 'Dynamics', tempo: 72, bars: 8,
    notes: [
        ...[18, 30, 42, 54, 66, 80, 94, 108, 127].map((v, i) => note(i, 60, .8, v)),
        ...[36, 48, 60, 72, 84].flatMap((m, i) => [note(11 + i * 2, m, .9, 64), note(12 + i * 2, m + 7, .9, 64)]),
        ...Array.from({ length: 12 }, (_, i) => note(22 + i * .5, 48 + i * 4, .5, 40 + i * 6)),
    ],
    pedal: [],
};

export const LINES = [calm, melancholic, energetic, lowRegister, dynamics];

/** The line's events in seconds, with the touch varied by up to ±`variation` (0..127 steps). */
export function lineEvents(line, variation = 0, random = Math.random) {
    const seconds = 60 / line.tempo, events = [];
    line.notes.forEach(([beat, midi, length, velocity], i) => {
        const v = Math.min(127, Math.max(1, velocity + (random() * 2 - 1) * variation)) / 127;
        events.push({ time: beat * seconds, type: 'on', key: `line:${i}`, midi, velocity: v }, { time: (beat + length) * seconds, type: 'off', key: `line:${i}` });
    });
    for (const [beat, on] of line.pedal) events.push({ time: beat * seconds, type: 'pedal', on });
    return events.sort((a, b) => a.time - b.time || (a.type === 'off' ? -1 : 1));
}
export const lineSeconds = (line) => line.bars * BAR * 60 / line.tempo + 2;

/** Plays a line through a PianoPlayer. Returns stop(). `ready` is called when the first note starts. */
export function playLine(player, line, { variation = 0, onEnd = () => {} } = {}) {
    const events = lineEvents(line, variation), context = player.context;
    let stopped = false, timer = null, index = 0, start = 0;
    // Render every distinct note first, so no note is late; then start together.
    const wanted = [...new Map(events.filter((e) => e.type === 'on').map((e) => [`${e.midi}:${Math.round(e.velocity * 7)}`, e])).values()];
    let warm = 0;
    const prepare = () => {
        if (stopped) return;
        if (warm < wanted.length) { player.buffer(wanted[warm].midi, wanted[warm].velocity); warm++; setTimeout(prepare, 0); return; }
        start = context.currentTime + .15;
        timer = setInterval(tick, 15);
    };
    const tick = () => {
        const now = context.currentTime - start;
        while (index < events.length && events[index].time <= now) {
            const e = events[index++];
            if (e.type === 'on') player.down(e.key, e.midi, e.velocity); else if (e.type === 'off') player.up(e.key); else player.sustain(e.on);
        }
        if (index >= events.length) { finish(); }
    };
    const finish = () => { clearInterval(timer); timer = null; if (!stopped) { stopped = true; player.sustain(false); onEnd(); } };
    const stop = () => {
        if (stopped) return;
        stopped = true; clearInterval(timer);
        for (const e of events) if (e.type === 'off') player.up(e.key);
        player.sustain(false); onEnd();
    };
    setTimeout(prepare, 0);
    return stop;
}
