import { describe, expect, it } from 'vitest';
import { INSTRUMENTS, nearestPosition, windowStart, chordLayout, windowDots, pickPlaying } from './MiniFretboard';

describe('nearest position', () => {
    const { strings } = INSTRUMENTS.guitar;
    it('puts a high register further up the neck than a low one', () => {
        const low = nearestPosition(strings, 9, 50), high = nearestPosition(strings, 9, 76);
        const at = (spot) => windowStart(strings, spot.anchor, 9) + (spot.up ? 12 : 0);
        expect(at(high)).toBeGreaterThan(at(low));
    });
    it('finds a window for the bass too', () => {
        expect(nearestPosition(INSTRUMENTS.bass.strings, 4, 36).distance).toBeLessThanOrEqual(3);
    });
});

describe('playing board', () => {
    const { strings } = INSTRUMENTS.guitar;
    // G minor 7 in the window hung off the B string (frets 7-13)
    const now = chordLayout(strings, 4, 7, [7, 10, 2, 5], { shape: true });
    const { dots } = windowDots(strings, 4, 7);
    const pool = new Set(dots.filter((d) => [...now.held].some((h) => h.string === d.string && h.fret === d.fret)));
    it('lights the chord board\'s own dot when a sounding note is one of its highlights', () => {
        const target = [...now.held][0], midi = strings[target.string] + target.fret;
        const lit = pickPlaying(strings, dots, pool, [{ midi, colors: ['red'] }], true);
        expect(lit).toHaveLength(1);
        expect([lit[0].string, lit[0].fret]).toEqual([target.string, target.fret]);
    });
    it('uses each highlighted dot once and puts a leftover note at the closest playable place', () => {
        const target = [...now.held][0], midi = strings[target.string] + target.fret;
        const lit = pickPlaying(strings, dots, pool, [{ midi, colors: ['red'] }, { midi: midi + 1, colors: ['blue'] }], true);
        expect(lit).toHaveLength(2);
        expect(new Set(lit.map((l) => l.string + ':' + l.fret)).size).toBe(2);
    });
    it('merges voices sounding the same pitch into one dot', () => {
        const lit = pickPlaying(strings, dots, pool, [{ midi: 64, colors: ['red'] }, { midi: 64, colors: ['blue'] }], true);
        expect(lit.length).toBeLessThanOrEqual(1);
        if (lit.length) expect(lit[0].colors).toEqual(['red', 'blue']);
    });
});

describe('look ahead', () => {
    const { strings } = INSTRUMENTS.guitar, { dots } = windowDots(strings, 4, 7);
    it('places what sounds before what is only coming, and marks it as ahead', () => {
        const midi = strings[dots[10].string] + dots[10].fret;
        const lit = pickPlaying(strings, dots, new Set(), [{ midi, colors: ['red'], ahead: true }, { midi, colors: ['blue'] }], true);
        expect(lit).toHaveLength(1);
        expect(lit[0].ahead).toBe(false);
        expect(pickPlaying(strings, dots, new Set(), [{ midi, colors: ['red'], ahead: true }], true)[0].ahead).toBe(true);
    });
});

describe('a note fading while it is due again', () => {
    const { strings } = INSTRUMENTS.guitar, { dots } = windowDots(strings, 4, 7);
    const midi = strings[dots[10].string] + dots[10].fret;
    it('shows only the coming state, not a mix of both', () => {
        const lit = pickPlaying(strings, dots, new Set(), [{ midi, colors: ['grey'], opacity: 0.4 }, { midi, colors: ['red'], ahead: true, grow: 0.5 }], true);
        expect(lit).toHaveLength(1);
        expect(lit[0]).toMatchObject({ ahead: true, colors: ['red'], grow: 0.5 });
    });
    it('lets a sounding note beat both', () => {
        const lit = pickPlaying(strings, dots, new Set(), [{ midi, colors: ['grey'], opacity: 0.4 }, { midi, colors: ['red'], ahead: true, grow: 0.5 }, { midi, colors: ['red'] }], true);
        expect(lit[0]).toMatchObject({ ahead: false, colors: ['red'], opacity: 1 });
    });
});
