import { describe, expect, test } from 'vitest';
import data from './data/survey.json';
import { binaryCorrelation, ruleBinaryValues, ruleDistribution } from './charts';

const sum = object => Object.values(object).reduce((a, b) => a + b, 0);

describe('survey snapshot', () => {
    test('excludes music-off presets from every population', () => {
        expect(data.metadata.excludedMusicOff).toHaveLength(12);
        expect(data.presets).toHaveLength(136);
        expect(data.presets.every(p => p.playMusic)).toBe(true);
        expect(sum(data.harmony.homeModes)).toBe(data.presets.length);
        expect(sum(data.harmony.modeDepartures)).toBe(data.presets.length);
        for (const rule of data.rules) {
            expect(sum(rule.statuses)).toBe(data.presets.length);
            expect(sum(rule.values)).toBe(data.presets.length - (rule.statuses.Off ?? 0));
            const distribution = ruleDistribution(rule);
            expect(distribution.values).toEqual(rule.values);
            expect(distribution.members.flatMap(member => member.names).some(name => data.metadata.excludedMusicOff.includes(name))).toBe(false);
            if (rule.path in data.timing.settings) {
                expect(data.timing.settings[rule.path]).toEqual(rule.values);
            }
        }
        for (const group of data.groups) {
            expect(Object.values(group.categories).flatMap(values => Object.values(values).flat()).some(name => data.metadata.excludedMusicOff.includes(name))).toBe(false);
        }
        for (const stack of Object.values(data.timing.stacks)) expect(stack.Off).toBeUndefined();
        expect(Object.values(data.chord.conversion.byStyle).reduce((total, values) => total + sum(values), 0)).toBe(sum(data.chord.conversion.outcomes));
        expect(sum(data.chord.conversion.pitchDifferences)).toBe(sum(data.chord.conversion.outcomes));
        expect(sum(data.chord.conversion.reference)).toBe(sum(data.chord.conversion.outcomes));
        expect(sum(data.chord.conversion.structures)).toBe(data.chord.conversion.reference['Roots agree']);
        expect(sum(data.chord.conversion.capturedHarmony)).toBe(data.chord.conversion.reference['Roots agree']);
        expect(Object.values(data.chord.conversion.chordSizes).reduce((total, values) => total + sum(values), 0)).toBe(data.chord.conversion.reference['Roots agree']);
        expect(Object.values(data.chord.conversion.structureVsPlayback).reduce((total, values) => total + sum(values), 0)).toBe(data.chord.conversion.reference['Roots agree']);
        expect(Object.values(data.chord.conversion.pitchByStyle).reduce((total, values) => total + sum(values), 0)).toBe(sum(data.chord.conversion.outcomes));
        expect(Object.values(data.chord.conversion.attacksByStyle).reduce((total, values) => total + sum(values), 0)).toBe(sum(data.chord.conversion.outcomes));
        expect(Object.values(data.chord.conversion.diagnostics).every(values => sum(values) === sum(data.chord.conversion.outcomes))).toBe(true);
        const P = data.chord.params, every = object => Object.values(object).reduce((total, values) => total + sum(values), 0);
        for (const key of ['family', 'chordFit', 'bassTone', 'inversion', 'omitted', 'doubled', 'spacing', 'fit', 'mode', 'gapCount', 'vectors', 'slotBars']) expect(sum(P[key])).toBe(P.instances);
        for (const key of ['bassToneByOmission', 'bassToneByFamily', 'inversionByMode', 'omittedByMode', 'omittedByFamily', 'omittedByRole', 'spacingByMode', 'fitByMode', 'doubledByOmission'])
            expect(every(P[key])).toBe(P.instances);
        expect(every(P.modeByStyle)).toBe(P.instances);
        expect(sum(P.slotOmitted)).toBe(every(P.slotOmittedByMode));
        expect(sum(P.slotOmitted)).toBe(every(P.slotOmittedByRole));
        expect(sum(P.slotOmitted)).toBe(every(P.slotOmittedByFamily));
        expect(sum(P.fitReason)).toBe(P.fit['Right tones, different spacing'] + P.fit['No fit']);
        expect(sum(P.best.complexity)).toBe(P.fit.Exact);
        expect(sum(P.variation)).toBe(every(P.variationByDirection));
        expect(data.chord.conversion.excludedAtonal).toEqual(['Altman']);
    });
    test('excludes disabled values but preserves off choices in correlations', () => {
        const rule = data.rules.find(r => r.id === 'lead-busyness');
        const distribution = ruleDistribution(rule);
        expect(distribution.onOff.Off).toBe(4);
        expect(sum(distribution.values)).toBe(132);
        expect(distribution.values['0']).toBeUndefined();
        expect(sum(data.timing.settings.leadDensity)).toBe(132);
        const vector = ruleBinaryValues(rule, data.presets);
        const diagonal = binaryCorrelation(vector, vector);
        expect(diagonal.bothOff).toBe(4);
        expect(diagonal.bothOn).toBe(132);
    });
    test('every rule pair covers the music preset population', () => {
        const vectors = data.rules.map(rule => ruleBinaryValues(rule, data.presets));
        for (let i = 0; i < vectors.length; i++) {
            for (let j = 0; j < vectors.length; j++) {
                const { bothOn, bothOff, onOff, offOn } = binaryCorrelation(vectors[i], vectors[j]);
                expect(bothOn + bothOff + onOff + offOn).toBe(data.presets.length);
            }
        }
    });
});
