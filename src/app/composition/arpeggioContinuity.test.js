import { arrangeBarLatest } from './arrangerLatest';
import { spaceAccompaniment } from './ensembleRhythm';
import { shapeRhythmicPart } from './rhythmDevelopment';
import { partGrammar } from './partGrammar';
import { gesturePart } from './transitionGesture';
import { METERS, groupStarts } from '../meter';
import { sceneBySlug, sceneSettings } from '../scenes';

const pattern = events => events.map(({ midi, beat, length }) => ({ midi, beat, length }));

test.each(['arpeggio', 'sequence'])('%s keeps every attack and its tail through accompaniment shaping', style => {
    for (const meter of Object.values(METERS)) for (const step of [.25, .5, 1]) {
        const events = Array.from({ length: meter.units / step }, (_, i) => ({ role: 'pad', midi: [60, 64, 67, 72][i % 4],
            beat: i * step, length: step * (style === 'sequence' ? 1.05 : 1.6), velocity: .6 }));
        const saved = structuredClone(events);
        const rhythm = { roles: { pad: 'answer' }, preferred: [.5, 1.5, 2.5], accents: groupStarts(meter),
            leadAttacks: events.map(e => e.beat), answers: [], guard: .3 };
        for (const operation of ['breathe', 'short', 'pickup', 'hold']) for (const kind of ['release', 'gather']) {
            let out = spaceAccompaniment(events, { rhythm, meter, style, enabled: true });
            out = shapeRhythmicPart(out, { role: 'pad', style, rhythm, meter });
            out = partGrammar(out, { plan: { pad: [operation] }, role: 'pad', index: 0, meter, style });
            out = gesturePart(out, { gesture: { kind, step: 1 }, meter, style });
            expect(pattern(out)).toEqual(pattern(events));
            expect(out.every(e => e.velocity > 0 && e.velocity <= .6)).toBe(true);
        }
        expect(events).toEqual(saved);
    }
});

test('Slightly Slower Than Light preserves its running notes with lead, phrase grammar and transitions enabled', () => {
    const scene = sceneBySlug('slightly-slower-than-light'), styles = new Set();
    let leadBars = 0, tailBars = 0;
    for (const seed of [1, 17, 42]) {
        const settings = sceneSettings(scene, seed), meter = METERS['4/4'];
        const scalePcs = [2, 4, 5, 7, 9, 10, 0];
        const chords = [[2, 5, 9, 0], [10, 2, 5, 9], [5, 9, 0, 4], [9, 0, 4, 7]].map(pitchClasses => ({ pitchClasses }));
        let prev = null;
        for (let bar = 0; bar < 48; bar++) {
            const args = { seed, bar, meter, settings, prev, chord: chords[Math.floor(bar / 2) % 4],
                nextChord: chords[Math.floor((bar + 1) / 2) % 4], scalePcs, chordStart: bar % 2 === 0,
                barsPerChord: 2, barsLeftInChord: 2 - bar % 2, rhythmDevelopment: true,
                partRhythmGrammar: true, transitionGestures: true };
            const actual = arrangeBarLatest(args);
            const reference = arrangeBarLatest({ ...args, coordinate: false });
            if (['arpeggio', 'sequence'].includes(actual.state.phrase.padStyle)) {
                styles.add(actual.state.phrase.padStyle);
                const pad = actual.events.filter(e => e.role === 'pad');
                expect(pattern(pad)).toEqual(pattern(reference.events.filter(e => e.role === 'pad')));
                if (actual.events.some(e => e.role === 'lead')) leadBars++;
                if (pad.at(-1).beat + pad.at(-1).length > meter.units) tailBars++;
            }
            prev = actual.state;
        }
    }
    expect([...styles].sort()).toEqual(['arpeggio', 'sequence']);
    expect(leadBars).toBeGreaterThan(0);
    expect(tailBars).toBeGreaterThan(0);
});
