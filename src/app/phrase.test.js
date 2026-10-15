import { seedToPhrase, phraseToSeed, PHRASE_WORDS } from './phrase';
import { seeded } from './random';

test('256 distinct plain words', () => {
    expect(PHRASE_WORDS.length).toBe(256);
    expect(new Set(PHRASE_WORDS).size).toBe(256);
    PHRASE_WORDS.forEach((w) => expect(w).toMatch(/^[a-z]+$/));
});

test('every seed reads as four words and back', () => {
    const rng = seeded(4);
    [0, 1, 255, 2 ** 31 - 1, ...Array.from({ length: 500 }, () => Math.floor(rng() * 2 ** 31))].forEach((seed) => {
        const phrase = seedToPhrase(seed);
        expect(phrase.split('-')).toHaveLength(4);
        expect(phraseToSeed(phrase)).toBe(seed);
        // spacing and case don't matter
        expect(phraseToSeed(` ${phrase.toUpperCase().replace(/-/g, '  ')} `)).toBe(seed);
    });
});

test('other text hashes to a stable seed in range; empty text is none', () => {
    const seed = phraseToSeed('Rainy Sunday');
    expect(seed).toBe(phraseToSeed('rainy   sunday!'));
    expect(seed).not.toBe(phraseToSeed('rainy monday'));
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 31);
    expect(phraseToSeed('   ')).toBeNull();
});

test('three-word phrases for 24-bit seeds (sounds)', () => {
    const opts = { count: 3, limit: 2 ** 24 };
    [0, 0xabcdef, 2 ** 24 - 1].forEach((seed) => {
        const phrase = seedToPhrase(seed, 3);
        expect(phrase.split('-')).toHaveLength(3);
        expect(phraseToSeed(phrase, opts)).toBe(seed);
    });
    const hashed = phraseToSeed('velvet midnight', opts);
    expect(hashed).toBe(phraseToSeed('Velvet  Midnight', opts));
    expect(hashed).toBeLessThan(2 ** 24);
});
