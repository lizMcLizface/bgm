import { SUITABILITY, STYLES, ENSEMBLES, suggestRules } from './suitability';
import { RULES } from './model';
import { MOODS } from '../composition/progressionGen';
import library from '../../library/scenes.json';

const names = new Set(library.scenes.map((s) => s.name));

test('every entry names a rulebook rule and uses known styles and ensembles', () => {
    for (const [id, rule] of Object.entries(SUITABILITY)) {
        expect(RULES.some((r) => r.id === id)).toBe(true);
        const choiceKeys = Object.keys(rule.choices ?? {});
        for (const s of [...rule.styles, ...rule.avoid.styles, ...Object.keys(rule.amounts), ...choiceKeys.filter((k) => !ENSEMBLES.includes(k))]) expect(STYLES).toContain(s);
        for (const e of [...rule.ensembles, ...rule.avoid.ensembles, ...choiceKeys.filter((k) => !STYLES.includes(k))]) expect(ENSEMBLES).toContain(e);
        for (const s of rule.styles) expect(rule.avoid.styles).not.toContain(s);
        for (const e of rule.ensembles) expect(rule.avoid.ensembles).not.toContain(e);
    }
});

test('suggested amounts sit inside the rule slider, and suggested options are real options', () => {
    for (const [id, rule] of Object.entries(SUITABILITY)) {
        const def = RULES.find((r) => r.id === id);
        for (const v of Object.values(rule.amounts)) {
            expect(typeof v).toBe('number');
            expect(v).toBeGreaterThanOrEqual(def.parameter.min);
            expect(v).toBeLessThanOrEqual(def.parameter.max);
        }
        for (const v of Object.values(rule.choices ?? {})) expect(def.options ?? [def.off, def.on]).toContain(v);
    }
});

test('every suggested mood is a mood the generator knows', () => {
    for (const rule of Object.values(SUITABILITY)) for (const mood of Object.values(rule.moods ?? {})) expect(Object.keys(MOODS)).toContain(mood);
});

test('candidate presets exist in the library', () => {
    for (const rule of Object.values(SUITABILITY)) for (const name of rule.candidates) expect(names.has(name)).toBe(true);
});

test('suggestions follow the styles and the ensemble, and avoid lists win', () => {
    const find = (profile, id) => suggestRules(profile).find((r) => r.rule === id);
    expect(find({ styles: ['twostep'] }, 'lead-syncopation').value).toBe(0.55);
    expect(find({ styles: ['sleep'] }, 'lead-syncopation')).toBeUndefined();
    expect(find({ styles: ['folk'], ensemble: 'guitar+bass' }, 'pad-root').value).toBe('unlessBass');
    expect(find({ styles: ['folk'], ensemble: 'keys+bass' }, 'pad-root')).toBeUndefined(); // keys with a bass keep the root
    expect(find({ styles: ['jazz'] }, 'chord-size-by-function')).toBeUndefined();
    expect(find({ styles: ['saloon'], ensemble: 'keys+bass' }, 'chord-size-by-function').value).toBe('functional');
    expect(find({ styles: ['folk'] }, 'lead-inertia').value).toBe(0.4);
    expect(find({ styles: ['drone'] }, 'pad-contour')).toBeUndefined();
    expect(find({ styles: ['folk'] }, 'lead-tendency').value).toBe(0.5);
    expect(find({ styles: ['folk', 'modal'] }, 'lead-tendency')).toBeUndefined();
    expect(find({ styles: ['breaks'] }, 'bass-euclid').value).toBe(0.4);
    expect(find({ styles: ['jazz'] }, 'bass-euclid')).toBeUndefined();
    expect(find({ styles: ['cinematic'] }, 'borrow-style').value).toBe('corpus');
    expect(find({ styles: ['ambient'], ensemble: 'solo-pad' }, 'pad-vibrato').value).toBe(0.3);
    expect(find({ styles: ['ambient'], ensemble: 'piano' }, 'pad-vibrato')).toBeUndefined();
    expect(find({ styles: ['ambient'] }, 'progression-mode')).toEqual({ rule: 'progression-mode', value: 'generated', mood: 'dreamy' });
    expect(find({ styles: ['jazz'] }, 'progression-mode')).toBeUndefined();
    expect(suggestRules({})).toEqual([]);
});

test('every shipped optional rule is registered', () => {
    for (const id of ['lead-syncopation', 'pad-root', 'chord-size-by-function', 'lead-inertia', 'pad-contour', 'lead-tendency', 'bass-euclid', 'borrow-style', 'pad-vibrato', 'progression-mode']) expect(SUITABILITY[id]).toBeDefined();
});
