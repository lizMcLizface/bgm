import {buildContext,DEFAULT_HARMONY} from './harmonyContext';
import {DEFAULT_CONTEXT,phraseEvents,AUDITION_PHRASES} from './auditionPhrases';

test('the default is A natural minor over i VI III VII, the same as the fallback context', () => {
    const c = buildContext(DEFAULT_HARMONY);
    expect(c.key).toContain('A');
    expect(c.chords.map((x) => x.name)).toEqual(['Am', 'F', 'C', 'G']);
    expect([...c.scalePcs].sort((a, b) => a - b)).toEqual([...DEFAULT_CONTEXT.scalePcs].sort((a, b) => a - b));
});

test('a key, scale and progression give the chords of that key, and phrases play over them', () => {
    const c = buildContext({ tonic: 2, mode: 'Major-1', progression: 0 }); // D major, I V vi IV
    expect(c.chords.map((x) => x.name)).toEqual(['D', 'A', 'Bm', 'G']);
    for (const { id } of AUDITION_PHRASES) expect(phraseEvents(id, c).length, id).toBeGreaterThan(3);
});

test('every progression builds in every scale without throwing', () => {
    for (let i = 0; i < 31; i++) expect(buildContext({ tonic: 5, mode: 'Major-2', progression: i }).chords.length).toBeGreaterThan(0);
});
