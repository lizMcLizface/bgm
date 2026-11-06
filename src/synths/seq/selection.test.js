import { describe, expect, it } from 'vitest';
import { chooseKeys, columnKeys, commonValue, describeSelection, parseKey, rowKeys, stepKey } from './selection';

describe('selection', () => {
    it('keys steps, rows and columns', () => {
        expect(parseKey(stepKey(3, 12))).toEqual([3, 12]);
        expect(rowKeys(2)).toHaveLength(16);
        expect(columnKeys(5, 8)).toEqual(['0:5', '1:5', '2:5', '3:5', '4:5', '5:5', '6:5', '7:5']);
    });
    it('replaces the selection, or with shift toggles a group in and out', () => {
        const one = chooseKeys(new Set(), ['1:1']);
        expect([...one]).toEqual(['1:1']);
        expect([...chooseKeys(one, ['2:2'])]).toEqual(['2:2']);
        const two = chooseKeys(one, ['2:2'], true);
        expect([...two].sort()).toEqual(['1:1', '2:2']);
        expect([...chooseKeys(two, ['1:1'], true)]).toEqual(['2:2']);
        const row = chooseKeys(new Set(), rowKeys(0), true);
        expect(row.size).toBe(16);
        expect(chooseKeys(row, rowKeys(0), true).size).toBe(0);   // all of a group in: shift takes the whole group out
        expect(chooseKeys(new Set(['0:0']), rowKeys(0), true).size).toBe(16);   // part of a group in: shift completes it
    });
    it('describes what is selected', () => {
        expect(describeSelection(new Set(), 8).kind).toBe('none');
        expect(describeSelection(new Set(['2:7']), 8)).toMatchObject({ kind: 'step', t: 2, s: 7 });
        expect(describeSelection(new Set(rowKeys(4)), 8)).toMatchObject({ kind: 'row', t: 4 });
        expect(describeSelection(new Set(columnKeys(9, 8)), 8)).toMatchObject({ kind: 'column', s: 9 });
        expect(describeSelection(new Set(['0:0', '3:5', '4:9']), 8)).toMatchObject({ kind: 'many', count: 3 });
        expect(describeSelection(new Set([...columnKeys(1, 8), ...columnKeys(6, 8)]), 8)).toMatchObject({ kind: 'columns', count: 2 });
        expect(describeSelection(new Set([...rowKeys(0), ...rowKeys(3)]), 8)).toMatchObject({ kind: 'rows', count: 2 });
    });
    it('finds the value a selection agrees on', () => {
        expect(commonValue([1, 1, 1], 0)).toEqual({ value: 1, mixed: false });
        expect(commonValue([1, 0.5], 0)).toEqual({ value: 1, mixed: true });
        expect(commonValue([], 0.8)).toEqual({ value: 0.8, mixed: false });
    });
});
