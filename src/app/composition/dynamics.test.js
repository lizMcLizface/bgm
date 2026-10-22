import { describe, expect, it } from 'vitest';
import { applyDynamics, expressDynamics, dynamicAttack } from './dynamics';

const notes = () => [{ role: 'lead', velocity: 0.8 }, { role: 'pad', velocity: 0.5 }, { role: 'perc', velocity: 0.7 }];

describe('scene dynamics', () => {
    it('leave notes as they are at the defaults', () => {
        const events = notes();
        expect(applyDynamics(expressDynamics(events, undefined), {})).toEqual(notes());
    });
    it('narrow, widen and scale velocities around a typical strength', () => {
        const narrow = applyDynamics(notes(), { range: 0.5 });
        expect(narrow[0].velocity).toBeCloseTo(0.71);
        expect(narrow[1].velocity).toBeCloseTo(0.56);
        const wide = applyDynamics(notes(), { range: 2, level: 0.9 });
        expect(wide[0].velocity).toBeCloseTo(0.9 * 0.98);
        expect(wide[1].velocity).toBeCloseTo(0.9 * 0.38);
    });
    it('give pitched notes gentle onsets and brightness with strength, but not the drums', () => {
        const [lead, pad, perc] = expressDynamics(notes(), { attack: 0.5, brightness: 1 });
        expect(lead.expression.dynamicAttack).toBe(0.5);
        expect(lead.expression.brightnessCents).toBeCloseTo(300);
        expect(pad.expression.brightnessCents).toBeCloseTo(-150);
        expect(perc.expression).toBeUndefined();
        const kept = expressDynamics([{ role: 'lead', velocity: 0.6, expression: { brightnessCents: 30, attackScale: 1.2 } }], { brightness: 1 });
        expect(kept[0].expression).toMatchObject({ brightnessCents: 30, attackScale: 1.2 });
    });
    it('slow soft attacks, quicken strong ones and leave them alone at 0', () => {
        expect(dynamicAttack(0.1, 0.3, 0)).toBe(0.1);
        expect(dynamicAttack(0.1, 0.38, 1)).toBeCloseTo(0.1 * 2 ** 1.6);
        expect(dynamicAttack(0.002, 0.38, 1)).toBeCloseTo(0.06);
        expect(dynamicAttack(0.1, 0.9, 1)).toBeLessThan(0.1);
    });
});
