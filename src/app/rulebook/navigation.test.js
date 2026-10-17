import { CHAPTERS } from './model';
import { RULE_ROWS, PAGE_IDS, initialPages, pageRules } from './navigation';

test('the main book separates instrument, harmonic and composition pages without duplicating standalone controls', () => {
    expect(RULE_ROWS.map(r => r.id)).toEqual(['instrument', 'harmonic', 'composition']);
    expect(new Set(PAGE_IDS).size).toBe(PAGE_IDS.length);
    expect(PAGE_IDS.every(id => CHAPTERS.some(c => c.id === id))).toBe(true);
    expect(PAGE_IDS).not.toContain('listen');expect(PAGE_IDS).not.toContain('evolution');
    expect(pageRules('performance').map(r => r.id)).not.toContain('pitch-wander');
    expect(pageRules('harmony').map(r => r.id)).toEqual(expect.arrayContaining(['borrowed-chords', 'bass-pedal', 'chord-colour-chance']));
    expect(pageRules('form').map(r => r.id)).toContain('section-tone');
    expect(pageRules('percussion').map(r => r.id)).toContain('percussion-presence');
});

test('old page and stage preferences retain access in the new navigation', () => {
    expect(initialPages(null, 7, 0)).toEqual(PAGE_IDS);
    expect(initialPages(null, 2, 0)).toEqual(expect.arrayContaining(['melody', 'ensemble']));
    expect(initialPages(null, null, 3)).toEqual(expect.arrayContaining(['pad', 'bass', 'percussion']));
    expect(initialPages(null, null, 6)).toEqual(PAGE_IDS);
    expect(initialPages(['harmony', 'invalid', 'evolution'], null, 0)).toEqual(['melody', 'harmony']);
});
