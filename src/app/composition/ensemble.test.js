import { phraseRhythm, barRhythm, performEnsemble, spaceAccompaniment, spaceCounter, splitPulseRoots } from './ensembleRhythm';
import { walkingBass, alignBass, counterPitches, bassCell, varyBass } from './ensembleVoices';
import { METERS } from '../meter';
import { DRUMS } from '../percussion';
import { drumBarLatest, percussionGeometry } from './percussionLatest';

const note = (role, midi, beat, length = 0.9) => ({ role, midi, beat, length, velocity: 0.65, detune: 0 });
const C = { pitchClasses: [0, 4, 7] }, F = { pitchClasses: [5, 9, 0] }, scale = [0, 2, 4, 5, 7, 9, 11];

test('shared rhythm is deterministic, serialisable and leaves space for melodic attacks', () => {
    const phrase = phraseRhythm({ seed: 17, start: 4, meter: METERS['4/4'], bassStyle: 'half', role: 'development' });
    const first = JSON.parse(JSON.stringify(phrase));
    const lead = [note('lead', 72, 0), note('lead', 76, 2)];
    const rhythm = barRhythm({ phrase, bar: 4, meter: METERS['4/4'], lead });
    expect(rhythm.kicks).toContain(0); expect(rhythm.kicks).toContain(2);
    expect(rhythm.answers).not.toContain(0); expect(rhythm.answers).toContain(0.5);
    expect(phrase).toEqual(first);
    expect(phrase).toEqual(phraseRhythm({ seed: 17, start: 4, meter: METERS['4/4'], bassStyle: 'half', role: 'development' }));
});

test('walking bass connects changing roots through short motion and an approach in every meter', () => {
    for (const meter of Object.values(METERS)) for (let seed = 1; seed <= 20; seed++) {
        const line = walkingBass({ chord: C, nextChord: F, scalePcs: scale, range: [31, 50], previousMidi: 36,
            meter, chordEnds: true, seed, bar: 0, rhythm: { kicks: [0] } });
        expect(line[0].midi % 12).toBe(0);
        const end = line.at(-1).midi;
        expect(Math.min(...[29, 41, 53].map(root => Math.abs(root - end)))).toBeLessThanOrEqual(2);
        expect(end % 12).not.toBe(5);
        line.forEach((e, i) => {
            expect(e.midi).toBeGreaterThanOrEqual(31); expect(e.midi).toBeLessThanOrEqual(50);
            expect(e.beat).toBeLessThan(meter.units);
            if (i) expect(Math.abs(e.midi - line[i - 1].midi)).toBeLessThanOrEqual(7);
        });
    }
});

test('whole bass remains held while half-style pickups and electro kicks can share a handoff', () => {
    const original = [note('bass', 36, 0, 3.8)];
    expect(alignBass(original, { style: 'whole', rhythm: { kicks: [0, 2], pickup: 3.5 }, meter: METERS['4/4'] })).toEqual(original);
    const rhythm = { kicks: [0, 2, 3.5], pickup: 3.5 };
    const half = alignBass([note('bass', 36, 0, 1.8), note('bass', 43, 2, 1.8)], { style: 'half', rhythm, meter: METERS['4/4'] });
    expect(half.at(-1).beat).toBe(3.5);
    const hits = drumBarLatest({ bar: 3, meter: METERS['4/4'], drums: { style: 'electro', activity: 0, variation: 0 }, seed: 17, rhythm, embellish: false });
    expect(hits.some(e => DRUMS[e.midi] === 'kick' && e.beat === 3.5)).toBe(true);
    half.slice(0, -1).forEach((e, i) => expect(e.beat + e.length).toBeLessThanOrEqual(half[i + 1].beat));
});

test('pulse accompaniment answers attacks while preserving the chord entrance and thin-off option', () => {
    const events = [note('pad', 60, 0), note('pad', 64, 1), note('pad', 67, 2)];
    const rhythm = { leadAttacks: [0, 1, 2], answers: [0.5, 1.5, 2.5, 3], guard: 0.3 };
    const spaced = spaceAccompaniment(events, { rhythm, meter: METERS['4/4'], style: 'pulse', enabled: true });
    expect(spaced.map(e => e.beat)).toEqual([0, 1.5, 2.5]);
    expect(spaced[0]).toEqual(events[0]);
    const overlapping = spaceAccompaniment([note('pad', 64, 1), note('pad', 64, 1.5)], { rhythm, meter: METERS['4/4'], style: 'pulse', enabled: true });
    expect(overlapping).toHaveLength(1);
    expect(overlapping[0].beat).toBe(1.5);
    expect(spaceAccompaniment(events, { rhythm, meter: METERS['4/4'], style: 'pulse', enabled: false })).toEqual(events);
    expect(spaceAccompaniment(events, { rhythm, meter: METERS['4/4'], style: 'sustain', enabled: true })).toEqual(events);
});

test('counter answers avoid attack collisions and sustained unisons where a consonant alternative exists', () => {
    const lead = [note('lead', 72, 0, 4)], counter = [note('counter', 72, 0, 2), note('counter', 74, 2, 1)];
    const rhythm = { leadAttacks: [0], answers: [.5, 1, 1.5, 2, 2.5, 3, 3.5], guard: .3 };
    const spaced = spaceCounter(counter, { rhythm, meter: METERS['4/4'], lead });
    expect(spaced[0].beat).toBe(.5);
    const pitched = counterPitches(spaced, { lead, scalePcs: scale, range: [62, 84], previousMidi: 67, chord: C, meter: METERS['4/4'] });
    pitched.forEach(e => {
        expect(Math.abs(e.midi - 72)).toBeGreaterThanOrEqual(3);
        expect([1, 2, 6, 10, 11]).not.toContain(Math.abs(e.midi - 72) % 12);
    });
});

test('ensemble timing locks bass to kick and does not change the melody when percussion is removed', () => {
    const input = [note('pad', 60, 0), note('bass', 36, 2), note('lead', 76, 2), { ...note('perc', DRUMS.indexOf('kick'), 2), anchor: true }];
    const full = structuredClone(input), music = structuredClone(input.filter(e => e.role !== 'perc'));
    const options = { timing: 35, velocity: .2, detune: 5 };
    performEnsemble(full, options, .5, 42, 7, METERS['4/4']);
    performEnsemble(music, options, .5, 42, 7, METERS['4/4']);
    expect(full.find(e => e.role === 'bass').beat).toBe(full.find(e => e.role === 'perc').beat);
    expect(full.filter(e => e.role !== 'perc')).toEqual(music);
    const exact = structuredClone(input);
    performEnsemble(exact, { timing: 0, velocity: 0, detune: 0 }, .5, 42, 7, METERS['4/4']);
    expect(exact).toEqual(input);
});

test('eighth-based uneven meters get kicks and backbeats on their groups, in eighths', () => {
    const seven = percussionGeometry(METERS['7/8']), five = percussionGeometry(METERS['5/8']);
    expect(seven.kicks).toEqual([0, 4]); expect(seven.backbeats).toEqual([2, 6]); expect(seven.step).toBe(1);
    expect(five.kicks).toEqual([0]); expect(five.backbeats).toEqual([3]);
    const shared = phraseRhythm({ seed: 3, start: 0, meter: METERS['7/8'], bassStyle: 'whole', role: 'development' });
    expect(shared.bars[0].kicks).toEqual([0, 4]);
    for (const style of ['lofi', 'electro', 'drive', 'brushes', 'shaker', 'downtempo'])
        for (let bar = 0; bar < 8; bar++) drumBarLatest({ bar, meter: METERS['7/8'], drums: { style, activity: 1, variation: 1 }, seed: 5, embellish: false })
            .forEach(e => expect(e.beat % 1).toBe(0));
});

test('a bare held bass root is only chosen while the lead plays, and bass cells never double or overlap hits', () => {
    for (let seed = 1; seed < 80; seed++) expect(bassCell({ style: 'half', seed, phraseStart: 0, leadPlaying: false })).not.toBe('hold');
    const seen = new Set();
    for (let seed = 1; seed < 80; seed++) seen.add(bassCell({ style: 'half', seed, phraseStart: 0, leadPlaying: true }));
    expect(seen.has('hold')).toBe(true); expect(seen.size).toBeGreaterThan(3);
    expect(bassCell({ style: 'whole', seed: 1, phraseStart: 0, leadPlaying: true })).toBe(null);
    for (const meter of Object.values(METERS)) for (const style of ['half', 'drive']) for (const cell of ['repeat', 'push', 'sync', 'octave', 'offbeat', 'gallop']) {
        const base = style === 'half'
            ? meter.groups.map((g, i) => note('bass', 36, meter.groups.slice(0, i).reduce((a, b) => a + b, 0), g * 0.9))
            : Array.from({ length: Math.round(meter.units / (meter.unitsPerBeat === 1 ? 0.5 : 1)) }, (_, i) => note('bass', 36, i * (meter.unitsPerBeat === 1 ? 0.5 : 1), 0.4));
        const out = varyBass(base, { style, cell, meter, range: [31, 50] });
        out.forEach((e, i) => {
            expect(e.beat).toBeGreaterThanOrEqual(0); expect(e.beat).toBeLessThan(meter.units); expect(e.length).toBeGreaterThan(0);
            if (i) { expect(e.beat).toBeGreaterThan(out[i - 1].beat); expect(out[i - 1].beat + out[i - 1].length).toBeLessThanOrEqual(e.beat + 1e-9); }
        });
    }
});

test('the low-note-then-chord pulse keeps its held roots apart from the stabs it spaces around the lead', () => {
    const meter = METERS['4/4'];
    const pad = (midi, beat, length) => ({ role: 'pad', midi, beat, length, velocity: 0.5 });
    const raw = [pad(48, 0, 1.9), pad(55, 1, 0.9), pad(64, 1, 0.9), pad(48, 2, 1.9), pad(55, 3, 0.9)];
    const { roots, rest } = splitPulseRoots(raw, { meter });
    expect(roots.map(e => e.beat)).toEqual([0, 2]);
    expect(roots.every(e => e.length === 1.9)).toBe(true);
    expect(rest).toHaveLength(3);
    expect(splitPulseRoots(raw, { meter, enabled: false })).toEqual({ roots: [], rest: raw });
});
