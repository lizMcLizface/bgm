import { generateProgression, STATES, MOODS, DEFAULT_MOOD, CORPUS_TRANSITIONS, transitionWeights } from './progressionGen';
import { romanDegree } from '../theory';

const many = (n, make) => Array.from({ length: n }, (_, i) => make(i + 1));
const share = (list, test) => list.filter(test).length / list.length;

test('the same inputs give the same progression, different seeds give different ones', () => {
    const a = generateProgression({ seed: 5, length: 4, family: 'major' });
    expect(generateProgression({ seed: 5, length: 4, family: 'major' })).toEqual(a);
    const distinct = new Set(many(40, (seed) => generateProgression({ seed, length: 4, family: 'major' }).ids.join()));
    expect(distinct.size).toBeGreaterThan(8);
});

test('every numeral is one the chord builder understands, in every family and length', () => {
    for (const family of ['major', 'minor']) for (const length of [2, 3, 4, 5, 6, 8]) for (const seed of [1, 2, 3, 4, 5, 6]) {
        const p = generateProgression({ seed, length, family, mood: MOODS.wandering });
        expect(p.numerals).toHaveLength(length);
        expect(p.borrows).toHaveLength(length);
        p.numerals.forEach((n) => { const d = romanDegree(n); expect(d).toBeGreaterThanOrEqual(1); expect(d).toBeLessThanOrEqual(7); });
    }
});

test('no chord repeats next to itself, including from the last chord back to the first', () => {
    for (const family of ['major', 'minor']) for (const mood of [DEFAULT_MOOD, ...Object.values(MOODS)]) for (let seed = 1; seed <= 30; seed++) {
        const { ids } = generateProgression({ seed, length: 4, family, mood });
        ids.forEach((id, i) => expect(id).not.toBe(ids[(i + 1) % ids.length]));
    }
});

test('a settled mood starts on and returns to the tonic; a floating one never plays it', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const settled = generateProgression({ seed, length: 4, family: 'major', mood: { stability: 0.9 } });
        expect(settled.ids).toContain('I');
        expect(settled.unsettled).toBe(false);
        const floating = generateProgression({ seed, length: 4, family: 'major', mood: { stability: 0.1 } });
        expect(floating.ids).not.toContain('I');
        expect(floating.unsettled).toBe(true);
    }
    for (let seed = 1; seed <= 20; seed++) expect(generateProgression({ seed, length: 4, family: 'minor', mood: { stability: 0.05 } }).ids).not.toContain('i');
});

test('the mood moves the harmony the way it says: dark takes flat and minor chords, bright the major ones', () => {
    const darkness = (mood) => {
        const all = many(150, (seed) => generateProgression({ seed, length: 4, family: 'major', mood }).ids).flat();
        return share(all, (id) => ['bVI', 'bVII', 'iv', 'iii', 'vi'].includes(id));
    };
    const dark = darkness({ brightness: -0.9 }), neutral = darkness({ brightness: 0 }), bright = darkness({ brightness: 0.9 });
    expect(dark).toBeGreaterThan(neutral + 0.05);
    expect(neutral).toBeGreaterThan(bright + 0.03);
});

test('adventure allows more borrowed chords and more distinct chords, never more than its cap', () => {
    const stats = (adventure) => {
        const runs = many(120, (seed) => generateProgression({ seed, length: 6, family: 'major', mood: { adventure, brightness: -0.3 } }));
        runs.forEach((p) => expect(p.borrows.filter(Boolean).length).toBeLessThanOrEqual(1 + Math.round(2 * adventure)));
        return { borrowed: runs.reduce((a, p) => a + p.borrows.filter(Boolean).length, 0) / runs.length, distinct: runs.reduce((a, p) => a + new Set(p.ids).size, 0) / runs.length };
    };
    const calm = stats(0), wild = stats(1);
    expect(wild.borrowed).toBeGreaterThan(calm.borrowed);
    expect(wild.distinct).toBeGreaterThanOrEqual(calm.distinct);
});

test('a neutral mood stays close to the corpus: I, IV and V dominate, motion by fifths and seconds', () => {
    const ids = many(300, (seed) => generateProgression({ seed, length: 4, family: 'major', mood: { stability: 0.75, adventure: 0.3 } }).ids).flat();
    expect(share(ids, (id) => ['I', 'IV', 'V'].includes(id))).toBeGreaterThan(0.55);
    expect(share(ids, (id) => id === 'I')).toBeGreaterThan(0.2);
    expect(share(ids, (id) => id === 'IV')).toBeGreaterThan(0.1);
    expect(share(ids, (id) => id === 'V')).toBeGreaterThan(0.1);
});

test('a cycle that follows another starts somewhere the corpus allows from its last chord', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const p = generateProgression({ seed, length: 4, family: 'major', after: 'V', mood: { stability: 0.5 } });
        expect(p.ids[0]).not.toBe('V');
    }
});

test('the weights have no move between variants of one root, and none to the tonic when the mood is floating', () => {
    const states = STATES.major, W = transitionWeights(states, { stability: 0.1 });
    const iv = states.findIndex((s) => s.id === 'iv'), IV = states.findIndex((s) => s.id === 'IV'), I = states.findIndex((s) => s.id === 'I');
    expect(W[iv][IV]).toBe(0);
    expect(W[IV][iv]).toBe(0);
    states.forEach((_, from) => expect(W[from][I]).toBe(0));
    expect(CORPUS_TRANSITIONS).toHaveLength(12);
    CORPUS_TRANSITIONS.forEach((row, i) => { expect(row).toHaveLength(12); expect(row[i]).toBe(0); });
});

test('tight limits never throw: a short, floating, calm cycle still returns a cycle of the right length', () => {
    for (const family of ['major', 'minor']) for (const length of [2, 3]) {
        const p = generateProgression({ seed: 9, length, family, mood: { stability: 0, adventure: 0, brightness: -1 } });
        expect(p.numerals).toHaveLength(length);
    }
});
