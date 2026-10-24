// Writes the test MIDI files used to record reference takes of an instrument: one standard MIDI
// file per instrument (tempo 120, so one second is two beats) and a timeline JSON naming every
// event, so the recording can be analysed against what was actually played.
// Usage: node tools/makeReferenceMidi.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PPQ = 480, TICKS_PER_SECOND = PPQ * 2;     // 120 bpm
const LEAD_IN = 2;                               // silence first, so the export has a clean start
const VELOCITIES = [35, 80, 120];                // soft, medium, hard
const HOLD = 4, REST = 3;                        // sustained notes: held 4 s, then 3 s to ring out

// Four or five pitches that the instrument can play, low to high (MIDI note numbers).
export const INSTRUMENTS = {
    violin: { pitches: [55, 64, 72, 84], sweep: true, phrase: true },            // G3 E4 C5 C6
    cello: { pitches: [36, 48, 60, 72], sweep: true, phrase: true },             // C2 C3 C4 C5
    'cello-pizzicato': { pitches: [36, 48, 60, 72] },
    strings: { pitches: [36, 48, 60, 72, 84], sweep: true, phrase: true },       // C2 .. C6
    chamber: { pitches: [36, 48, 60, 72, 84], sweep: true, phrase: true },
    'strings-epic': { pitches: [36, 48, 60, 72, 84], sweep: true, phrase: true },
    choir: { pitches: [48, 55, 64, 72], sweep: true, phrase: true },             // C3 G3 E4 C5
    celeste: { pitches: [60, 72, 84, 96] },                                      // C4 C5 C6 C7
    brass: { pitches: [41, 48, 55, 60, 67], sweep: true, phrase: true },         // F2 C3 G3 C4 G4
    trumpet: { pitches: [55, 64, 72, 79], sweep: true, phrase: true },           // G3 E4 C5 G5
    horn: { pitches: [43, 55, 64, 72], sweep: true, phrase: true },              // G2 G3 E4 C5
    clarinet: { pitches: [52, 60, 72, 84], sweep: true, phrase: true },          // E3 C4 C5 C6
    flute: { pitches: [60, 72, 84, 96], sweep: true, phrase: true },             // C4 C5 C6 C7
    // Piano: low octaves matter most (hammer and string stiffness show there), so `lows` adds a bass walk.
    piano: { pitches: [24, 36, 48, 60, 72, 84], repeated: 36, chordRoot: 48, sweep: false, lows: [21, 24, 28, 31, 33, 36, 40, 43, 45, 48, 52, 55] },  // C1 .. C6
    woodwinds: { pitches: [48, 60, 72, 84], sweep: true, phrase: true },         // C3 C4 C5 C6
};

const varLength = (value) => {
    const bytes = [value & 127];
    while ((value >>= 7)) bytes.unshift((value & 127) | 128);
    return bytes;
};

/** The events (seconds) of one instrument's take, and the same as a plain description of the timeline. */
export function plan({ pitches, sweep = false, phrase = false, repeated: repeatedPitch, chordRoot, lows = [] }) {
    const events = [], timeline = [];
    let t = LEAD_IN;
    // Samplers often start with the mod wheel and expression at 0, which is silent: set them (and the volume) first.
    for (const [controller, value] of [[7, 100], [1, 127], [11, 127]]) events.push({ time: .2, bytes: [0xb0, controller, value] });
    const note = (pitch, velocity, length, kind) => {
        events.push({ time: t, bytes: [0x90, pitch, velocity] }, { time: t + length, bytes: [0x80, pitch, 0] });
        timeline.push({ kind, pitch, velocity, start: t, release: t + length });
    };
    // 1. Sustained notes at three strengths: spectrum, level against velocity, decay and release.
    for (const pitch of pitches) for (const velocity of VELOCITIES) { note(pitch, velocity, HOLD, 'sustained'); t += HOLD + REST; }
    // 2. Short notes: the attack and how quickly it stops.
    for (const pitch of pitches) { note(pitch, 80, .3, 'short'); t += 3; }
    // 3. One medium note struck five times: how much each repetition differs.
    const repeated = repeatedPitch ?? pitches[1];
    for (let i = 0; i < 5; i++) { note(repeated, 80, 1, 'repeat'); t += 2; }
    t += 1;
    // 3b. Bass walk: every low pitch at medium strength, held 6 s, for harmonic content and decay by register.
    for (const pitch of lows) { note(pitch, 80, 6, 'low'); t += 6 + REST; }
    // 4. A chord, held.
    const root = chordRoot ?? pitches[1];
    for (const interval of [0, 7, 12, 16]) events.push({ time: t, bytes: [0x90, root + interval, 80] }, { time: t + HOLD + 1, bytes: [0x80, root + interval, 0] });
    timeline.push({ kind: 'chord', pitch: root, intervals: [0, 7, 12, 16], velocity: 80, start: t, release: t + HOLD + 1 });
    t += HOLD + 1 + REST;
    // 5. One long note while the mod wheel (CC1) and then expression (CC11) rise and fall.
    if (sweep) for (const controller of [1, 11]) {
        // The other controller stays fully open while this one moves.
        events.push({ time: t - .1, bytes: [0xb0, controller === 1 ? 11 : 1, 127] }, { time: t - .05, bytes: [0xb0, controller, 0] });
        events.push({ time: t, bytes: [0x90, pitches[2], 80] });
        for (let step = 0; step <= 100; step++) {
            const phase = step / 100, value = Math.round(127 * (phase < .5 ? phase * 2 : 2 - phase * 2));
            events.push({ time: t + 1 + step * .08, bytes: [0xb0, controller, value] });
        }
        events.push({ time: t + 10, bytes: [0x80, pitches[2], 0] }, { time: t + 10.1, bytes: [0xb0, controller, 127] });
        timeline.push({ kind: `sweep CC${controller}`, pitch: pitches[2], velocity: 80, start: t, release: t + 10, note: 'controller 0 to 127 to 0 between 1 s and 9 s' });
        t += 10 + REST;
    }
    // 6. The same five notes joined (each overlapping the next), then detached: the transitions.
    if (phrase) {
        const base = pitches[2], steps = [0, 2, 4, 5, 7];
        for (const [kind, length, advance] of [['legato phrase', .75, .7], ['detached phrase', .4, .75]]) {
            const start = t;
            steps.forEach((step, i) => { events.push({ time: t, bytes: [0x90, base + step, 80] }, { time: t + length, bytes: [0x80, base + step, 0] }); t += advance; });
            timeline.push({ kind, pitch: base, steps, velocity: 80, start, release: t, note: kind === 'legato phrase' ? 'each note starts 50 ms before the previous one ends' : 'gaps between notes' });
            t += REST;
        }
    }
    return { events, timeline, seconds: t };
}

export function midiFile(events, seconds, name) {
    const track = [];
    const push = (delta, bytes) => track.push(...varLength(delta), ...bytes);
    const label = [...Buffer.from(name)];
    push(0, [0xff, 0x03, label.length, ...label]);
    push(0, [0xff, 0x51, 3, 0x07, 0xa1, 0x20]);           // 500000 us per beat
    push(0, [0xff, 0x58, 4, 4, 2, 24, 8]);
    let last = 0;
    // Releases before attacks at the same tick, so a repeated pitch is never cut by its own previous release.
    const ordered = [...events].sort((a, b) => a.time - b.time || (a.bytes[0] === 0x80 ? -1 : 1));
    for (const { time, bytes } of ordered) {
        const tick = Math.round(time * TICKS_PER_SECOND);
        push(tick - last, bytes); last = tick;
    }
    push(Math.round((seconds + 1) * TICKS_PER_SECOND) - last, [0xff, 0x2f, 0]);
    const head = Buffer.alloc(14);
    head.write('MThd', 0); head.writeUInt32BE(6, 4); head.writeUInt16BE(0, 8); head.writeUInt16BE(1, 10); head.writeUInt16BE(PPQ, 12);
    const body = Buffer.alloc(8); body.write('MTrk', 0); body.writeUInt32BE(track.length, 4);
    return Buffer.concat([head, body, Buffer.from(track)]);
}

if (process.argv[1]?.endsWith('makeReferenceMidi.mjs')) {
    const out = process.argv[2] ?? '.tmp/reference-midi';
    mkdirSync(out, { recursive: true });
    for (const [name, spec] of Object.entries(INSTRUMENTS)) {
        const { events, timeline, seconds } = plan(spec);
        writeFileSync(join(out, `${name}.mid`), midiFile(events, seconds, name));
        writeFileSync(join(out, `${name}.timeline.json`), JSON.stringify({ instrument: name, tempo: 120, seconds, events: timeline }, null, 1));
        console.log(`${name.padEnd(16)} ${seconds.toFixed(0).padStart(4)} s  pitches ${spec.pitches.join(' ')}`);
    }
}
