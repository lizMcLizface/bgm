import { describe, expect, it } from 'vitest';
import { bjorklund, euclid, tile, randomRow, mutateRow, seeded } from './generate';

const show = (row) => row.map((v) => (v ? 'x' : '.')).join('');

describe('generators', () => {
    it('spreads Euclidean rhythms the way the classics are', () => {
        expect(show(bjorklund(3, 8))).toBe('x..x..x.');
        expect(show(bjorklund(5, 8))).toBe('x.xx.xx.');
        expect(show(bjorklund(4, 16))).toBe('x...x...x...x...');
        expect(show(bjorklund(2, 5))).toBe('x.x..');
        expect(bjorklund(0, 4)).toEqual([0, 0, 0, 0]);
        expect(bjorklund(9, 4)).toEqual([1, 1, 1, 1]);
        for (const [p, s] of [[7, 16], [5, 12], [11, 24]]) expect(bjorklund(p, s).filter(Boolean)).toHaveLength(p);
    });
    it('rotates and tiles', () => {
        expect(show(euclid(3, 8, 1))).toBe('.x..x..x');
        expect(show(euclid(3, 8, -1))).toBe('..x..x.x');
        expect(show(tile(euclid(3, 8), 16))).toBe('x..x..x.x..x..x.');
    });
    it('is repeatable from a seed, and density steers how many notes a random row has', () => {
        expect(randomRow(32, 0.5, seeded(7))).toEqual(randomRow(32, 0.5, seeded(7)));
        expect(randomRow(64, 0, seeded(1)).some(Boolean)).toBe(false);
        expect(randomRow(64, 1, seeded(1)).filter(Boolean).length).toBeGreaterThan(40);
        const sparse = randomRow(256, 0.1, seeded(3)).filter(Boolean).length, dense = randomRow(256, 0.7, seeded(3)).filter(Boolean).length;
        expect(dense).toBeGreaterThan(sparse * 2);
    });
    it('mutates a row without changing its length and not at all at amount 0', () => {
        const row = [...euclid(5, 16)];
        expect(mutateRow(row, 0, seeded(2))).toEqual(row);
        const changed = mutateRow(row, 0.8, seeded(2));
        expect(changed).toHaveLength(16);
        expect(changed).not.toEqual(row);
        expect(Math.abs(changed.filter(Boolean).length - 5)).toBeLessThanOrEqual(4);
    });
});
