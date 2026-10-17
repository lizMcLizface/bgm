import { describe, it, expect } from 'vitest';
import { compareSectionBars } from './sectionDiff';

describe('section comparison', () => {
    const note = {role:'pad', midi:60, beat:0, length:3, velocity:.5, detune:0};
    const plan = events => ({bars:[{bar:8, events}]});
    it('reports real per-voice changes and respects the selected voices', () => {
        const a = plan([note]), b = plan([{...note, length:2}]);
        expect(compareSectionBars(a,b,['pad'])).toMatchObject([{bar:8,voices:[{role:'pad',changes:['length']}]}]);
        expect(compareSectionBars(a,b,['lead'])[0].voices).toEqual([]);
    });
    it('ignores event ordering and insignificant numeric noise', () => {
        const second = {...note,midi:64};
        expect(compareSectionBars(plan([note,second]),plan([second,{...note,beat:1e-10}]),['pad'])[0].voices).toEqual([]);
    });
    it('detects reassigned note combinations even when marginal values match', () => {
        const a = plan([note,{...note,midi:64,beat:1}]);
        const b = plan([{...note,beat:1},{...note,midi:64}]);
        expect(compareSectionBars(a,b,['pad'])[0].voices[0].changes).toEqual(['note combinations']);
    });
});
