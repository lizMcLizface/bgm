import { describe, it, expect } from 'vitest';
import { MELODIC_STYLES, composeSong, scoreTheme, clashes, songStyle, mixThemes, changeBars, evolveSong } from './melodicStyle';
import { METERS } from '../meter';

const C = [0, 2, 4, 5, 7, 9, 11];
const harmony = [[0, 4, 7], [9, 0, 4], [5, 9, 0], [7, 11, 2]].map((pitchClasses) => ({ pitchClasses, scalePcs: C }));
const styles = Object.keys(MELODIC_STYLES).filter((name) => MELODIC_STYLES[name]);
const song = (over = {}) => composeSong({ seed: 11, styleName: 'song', meter: METERS['4/4'], harmony, density: .3, ...over });

describe('songStyle', () => {
    it('is nothing while the lead noodles, the named style, or one that suits the settings', () => {
        expect(songStyle({ melodyPlan: 'noodle', melodyStyle: 'hook' })).toBe(null);
        expect(songStyle({ melodyPlan: 'same', melodyStyle: 'hook' })).toBe('hook');
        expect(songStyle({ melodyPlan: 'change', melodyStyle: 'auto', bassWeights: { drive: 80, whole: 10 } })).toBe('hook');
        expect(songStyle({ melodyPlan: 'same', melodyStyle: 'auto', leadDensity: .7 })).toBe('game');
        expect(songStyle({ melodyPlan: 'same', melodyStyle: 'auto', swing: .35 })).toBe('lounge');
        expect(songStyle({ melodyPlan: 'same', melodyStyle: 'auto', padWeights: { sustain: 70 } })).toBe('cinema');
        expect(songStyle({ melodyPlan: 'same', melodyStyle: 'auto' })).toBe('song');
    });
});

describe('a changing song', () => {
    const theme = (name) => [[name], [`${name}1`], [`${name}2`], [`${name}3`]].map((bar) => bar.map((n) => ({ n })));
    const names = (mixed) => mixed[0].map((bar) => bar[0].n);

    it('takes the middle bars first and the opening last', () => {
        const a = [theme('a'), theme('a')], b = [theme('b'), theme('b')];
        expect(names(mixThemes(a, b, 0))).toEqual(['a', 'a1', 'a2', 'a3']);
        expect(names(mixThemes(a, b, 1))).toEqual(['a', 'a1', 'b2', 'a3']);
        expect(names(mixThemes(a, b, 3))).toEqual(['a', 'b1', 'b2', 'b3']);
    });

    it('takes 10 to 15 minutes at any tempo, by the seed', () => {
        const meter = METERS['4/4'], lengths = new Set();
        for (let seed = 1; seed < 40; seed++) {
            const bars = changeBars({ seed, meter, bpm: 120 });
            expect(bars * 2).toBeGreaterThanOrEqual(600);
            expect(bars * 2).toBeLessThanOrEqual(900);
            lengths.add(bars);
        }
        expect(lengths.size).toBeGreaterThan(10);
    });

    it('moves on only when a statement starts, and writes the next song only when it is reached', () => {
        const written = [], write = (gen) => { written.push(gen); return [theme(`g${gen}`), theme(`g${gen}`)]; };
        let song = evolveSong({ bar: 0, period: 80, moveOn: true, write });
        expect(written).toEqual([0, 1]);
        song = evolveSong({ previous: song, known: song.themes, bar: 25, moveOn: false, write });
        expect(song.step).toBe(0);
        song = evolveSong({ previous: song, known: song.themes, bar: 25, moveOn: true, write });
        expect(song.step).toBe(1);
        expect(names(song.themes)).toEqual(['g0', 'g01', 'g12', 'g03']);
        song = evolveSong({ previous: song, known: song.themes, bar: 84, moveOn: true, write });
        expect([song.gen, song.step]).toEqual([1, 0]);
        expect(names(song.themes)).toEqual(['g1', 'g11', 'g12', 'g13']);
        expect(written).toEqual([0, 1, 2]);
    });
});

describe('composeSong', () => {
    it('writes two themes of four playable bars in every style and metre', () => {
        for (const styleName of styles) for (const meter of Object.values(METERS)) for (const density of [0, .3, .7]) {
            for (const theme of song({ styleName, meter, density })) {
                expect(theme).toHaveLength(4);
                for (const bar of theme) {
                    expect(bar.length).toBeGreaterThan(0);
                    bar.forEach((note, i) => {
                        expect(note.beat).toBeGreaterThanOrEqual(0);
                        expect(note.beat + note.length).toBeLessThanOrEqual(meter.units + 1e-9);
                        expect(note.length).toBeGreaterThan(0);
                        expect(Number.isFinite(note.degree)).toBe(true);
                        if (i) expect(note.beat).toBeGreaterThan(bar[i - 1].beat);
                    });
                }
            }
        }
    });

    it('is the same song for the same seed, another for another seed, preset or style', () => {
        const text = (over) => JSON.stringify(song(over));
        expect(text({})).toBe(text({}));
        expect(text({ seed: 12 })).not.toBe(text({}));
        expect(text({ preset: 'another' })).not.toBe(text({}));
        expect(text({ styleName: 'hook' })).not.toBe(text({}));
    });

    it('prefers a tune that sits on the chords to one that fights them', () => {
        const style = MELODIC_STYLES.song, meter = METERS['4/4'], chords = [[0, 4, 7]];
        const bar = (degree) => [{ beat: 0, length: 4, degree, accent: true }];
        const onChord = [0, 2, 4, 2].map(bar), off = [3, 3, 3, 3].map(bar);
        expect(scoreTheme(onChord, { style, harmony: chords, pcs: C, meter })).toBeGreaterThan(scoreTheme(off, { style, harmony: chords, pcs: C, meter }));
    });

    it('knows a clash from a colour tone', () => {
        expect(clashes(5, [0, 4, 7])).toBe(true); // F over C major
        expect(clashes(2, [0, 4, 7])).toBe(false);
        expect(clashes(4, [0, 4, 7])).toBe(false);
    });
});
