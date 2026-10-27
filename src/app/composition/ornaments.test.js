import { describe, expect, it } from 'vitest';
import { ornamentNotes } from './ornaments';

const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const voices = (name, preset = {}) => ({ lead: { name, preset }, counter: { name: '', preset: {} } });
const bar = () => [{ role: 'lead', midi: 72, beat: 1, length: 3, velocity: 0.7 }, { role: 'pad', midi: 60, beat: 0, length: 4, velocity: 0.5 }];
const run = (name, preset, amount, b = 0) => ornamentNotes(bar(), { amount, bar: b, seed: 7, voices: voices(name, preset), scalePcs: C_MAJOR, unitSeconds: 0.6 });

describe('ornaments', () => {
    it('add nothing when off, and nothing on a swelling pad sound', () => {
        expect(run('Glass Lead', {}, 0)).toEqual(bar());
        for (let b = 0; b < 40; b++) expect(run('Soft Swell', { gainAttack: 1 }, 1, b)).toHaveLength(2);
    });
    it('decorate some bars with scale neighbours, one ornament per voice, never the pad', () => {
        const kinds = new Set();
        for (let b = 0; b < 80; b++) {
            const out = run('Wind Lead', {}, 1, b), extra = out.filter((e) => e.ornament && e.role === 'lead');
            for (const e of extra) {
                kinds.add(e.ornament);
                expect(C_MAJOR).toContain(e.midi % 12);
                expect(Math.abs(e.midi - 72)).toBeLessThanOrEqual(3);
            }
            expect(new Set(extra.map((e) => e.ornament)).size).toBeLessThanOrEqual(1);
            expect(out.filter((e) => e.role === 'pad')).toHaveLength(1);
            const lead = out.filter((e) => e.role === 'lead').sort((a, b) => a.beat - b.beat);
            for (let i = 1; i < lead.length; i++) expect(lead[i].beat).toBeGreaterThanOrEqual(lead[i - 1].beat + lead[i - 1].length - 1e-9);
        }
        expect(kinds.has('grace')).toBe(true);
        expect(kinds.has('trill')).toBe(true);
    });
    it('never trill a struck or bell-like voice, which would stutter', () => {
        for (const name of ['Celesta', 'Glass Bells', 'Music Box', 'Soft Vibes', 'Kalimba'])
            for (let b = 0; b < 120; b++) expect(run(name, {}, 1, b).some((e) => e.ornament === 'trill')).toBe(false);
    });
    it('plan the same bar the same way', () => {
        expect(run('Wind Lead', {}, 1, 5)).toEqual(run('Wind Lead', {}, 1, 5));
    });
});
