import { describe, expect, it } from 'vitest';
import { blankBank, normalizeBank, patternName, patternId, layerOf, letterOf, chainCommands, capacityFor, MAX_STEPS, cleanLocks } from './bank';
import { validPattern, emptyPattern, patternCommands } from '../drums/kits';
import { KITS } from '../drums/kits';

const empty = () => [[0, 0], [0, 0]];
const valid = (p) => Array.isArray(p) && p.length === 2;

describe('pattern bank', () => {
    it('names patterns by layer and letter', () => {
        expect(patternName(0)).toBe('1A');
        expect(patternName(9)).toBe('2B');
        expect(patternName(63)).toBe('8H');
        expect(patternId(layerOf(37), letterOf(37))).toBe(37);
    });
    it('fills an eight-pattern bank up to sixty-four, and keeps what it had', () => {
        const old = { patterns: Array.from({ length: 8 }, (_, i) => (i === 2 ? [[1, 0], [0, 1]] : empty())), lengths: Array(8).fill(8), tempos: Array(8).fill(0), chain: [0, 2], current: 2, title: 'Old', names: Array(8).fill('') };
        const bank = normalizeBank(old, { count: 64, empty, valid });
        expect(bank.patterns).toHaveLength(64);
        expect(bank.patterns[2]).toEqual([[1, 0], [0, 1]]);
        expect(bank.lengths.slice(0, 9)).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 16]);
        expect(bank.chain).toEqual([0, 2]);
        expect(bank.current).toBe(2);
        expect(bank.locks).toHaveLength(64);
        expect(bank.trackPlay).toHaveLength(64);
    });
    it('rejects bad patterns, and drops song blocks and a loop that point nowhere', () => {
        expect(normalizeBank({ patterns: [[1]] }, { count: 8, empty, valid })).toBeNull();
        expect(normalizeBank({ patterns: Array(65).fill(empty()) }, { count: 64, empty, valid })).toBeNull();
        const bank = normalizeBank({ patterns: [empty()], song: [{ p: 0, n: 2 }, { p: 70, n: 1 }, { p: 1, n: 1 }], loopIn: 1, loopOut: 9 }, { count: 8, empty, valid });
        expect(bank.song).toEqual([{ p: 0, n: 2 }, { p: 1, n: 1 }]);
        expect([bank.loopIn, bank.loopOut]).toEqual([1, null]);
    });
    it('puts a swapped loop the right way round', () => {
        const bank = normalizeBank({ patterns: [empty()], song: [{ p: 0, n: 1 }, { p: 0, n: 1 }, { p: 0, n: 1 }], loopIn: 2, loopOut: 0 }, { count: 8, empty, valid });
        expect([bank.loopIn, bank.loopOut]).toEqual([0, 2]);
    });
    it('gives the engine only the first eight patterns', () => {
        const bank = { ...blankBank(64, empty), chain: [1, 40, 2], current: 40 };
        const cmds = chainCommands(bank);
        expect(cmds.filter(([c]) => c === 5)).toHaveLength(8);
        expect(cmds).toContainEqual([4, 2, 0]);
        expect(cmds.some(([c]) => c === 2)).toBe(false);
    });
    it('keeps patterns of up to sixty-four steps and gives the engine only the first page', () => {
        expect([1, 16, 17, 40, 64, 99].map(capacityFor)).toEqual([16, 16, 32, 48, 64, 64]);
        const bank = normalizeBank({ patterns: [empty()], lengths: [40, 99] }, { count: 8, empty, valid });
        expect(bank.lengths.slice(0, 2)).toEqual([40, 16]);
        expect(chainCommands({ ...bank, chain: [] }).filter(([c]) => c === 5)[0]).toEqual([5, 16, 0]);
        expect(Object.keys(cleanLocks({ '0:63': { velocity: 0.5 }, '0:64': { velocity: 0.5 } }))).toEqual(['0:63']);
        expect(MAX_STEPS).toBe(64);
    });
    it('accepts drum patterns of whole pages and sends the engine only the first', () => {
        const kit = Object.values(KITS)[0], rows = kit.tracks.length + 1;
        const long = Array.from({ length: rows }, () => Array(48).fill(0));
        long[0][3] = 1; long[0][40] = 1;
        expect(validPattern(kit)(long)).toBe(true);
        expect(validPattern(kit)(emptyPattern(kit)())).toBe(true);
        expect(validPattern(kit)(long.map((r, i) => (i ? r : r.slice(0, 16))))).toBe(false);
        expect(validPattern(kit)(long.map((r) => r.slice(0, 20)))).toBe(false);
        expect(patternCommands(kit, 0, long).filter(([c]) => c === 1)).toHaveLength(1);
    });
    it('keeps the pattern change setting, and falls back to the end of the loop', () => {
        const base = { patterns: [empty()], lengths: [16], tempos: [0], chain: [], current: 0 };
        expect(normalizeBank({ ...base, quantize: 'beat' }, { count: 8, empty, valid }).quantize).toBe('beat');
        expect(normalizeBank({ ...base, quantize: 'sometime' }, { count: 8, empty, valid }).quantize).toBe('end');
        expect(normalizeBank(base, { count: 8, empty, valid }).quantize).toBe('end');
    });
});
