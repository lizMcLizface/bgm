import { describe, expect, test } from 'vitest';
import { binaryCorrelation, correlationMatrix, numericDistribution, ruleBinaryValues, ruleDistribution, scatterChart, splitChart, stackedRows } from './charts';

describe('survey charts', () => {
    test('shows a single-value categorical distribution as 100%', () => {
        expect(splitChart('Drift', { off: 148 })).toContain('off <b>148</b> <small>100.0%</small>');
    });
    test('plots exact numeric values without dividing by zero for a constant', () => {
        const chart = scatterChart('Sync', { '0.2': 3 });
        expect(chart).toContain('cx="300"');
        expect(chart).toContain('0.2: 3');
        expect(numericDistribution({ '-2': 1, '0.5': 2 })).toBe(true);
        expect(numericDistribution({ off: 1 })).toBe(false);
    });
    test('filters values, statuses and names consistently by preset category', () => {
        const rule = { id: 'test', categories: { cozy: { 'Enabled | true': ['A'], 'Off | false': ['B'] }, night: { 'Muted | true': ['C'] } } };
        expect(ruleDistribution(rule, 'cozy')).toEqual({
            values: { true: 1 }, statuses: { Enabled: 1, Off: 1 }, onOff: { On: 1, Off: 1 },
            members: [{ category: 'cozy', status: 'Enabled', value: 'true', names: ['A'] }, { category: 'cozy', status: 'Off', value: 'false', names: ['B'] }],
        });
        expect(ruleDistribution(rule).values).toEqual({ true: 2 });
    });
    test('calculates positive, negative and constant binary correlations', () => {
        expect(binaryCorrelation([true, false], [true, false])).toEqual({ bothOn: 1, bothOff: 1, onOff: 0, offOn: 0, phi: 1 });
        expect(binaryCorrelation([true, false], [false, true]).phi).toBe(-1);
        expect(binaryCorrelation([true, true], [true, true]).phi).toBeNull();
        expect(() => binaryCorrelation([true], [])).toThrow();
    });
    test('retains overridden choices as enabled and displays constant agreements', () => {
        const rule = { id: 'a', title: 'A', categories: { cozy: { 'Not heard | true': ['A'], 'Overridden | true': ['B'] } } };
        const presets = [{ name: 'A' }, { name: 'B' }];
        expect(ruleBinaryValues(rule, presets)).toEqual([true, true]);
        expect(correlationMatrix([rule], presets)).toContain('>ON<');
        expect(() => ruleBinaryValues(rule, [{ name: 'missing' }])).toThrow();
    });
    test('compares independently normalized rows without dropping zero categories', () => {
        const chart = stackedRows('Timing', [['lead', { on: 3, off: 1 }], ['pad', { on: 0, off: 2 }]]);
        expect(chart).toContain('width:75%');
        expect(chart).toContain('on: 0 (0.0%)');
    });
});
