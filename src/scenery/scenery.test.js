import { describe, expect, it } from 'vitest';
import { BIOMES, createScene } from './biomes.js';
import { REFLECT } from './scene.js';

describe('scenery', () => {
    it.each(Object.keys(BIOMES))('%s is deterministic per seed and fully opaque', biome => {
        const a = createScene(biome, 42).render(1.5, BIOMES[biome].hour);
        const b = createScene(biome, 42).render(1.5, BIOMES[biome].hour);
        expect(a).toEqual(b);
        expect(a.every(px => px >>> 24 === 255)).toBe(true);
    });

    it('relights without registering new colours mid-run', () => {
        const sc = createScene('seaside', 7);
        for (let h = 0; h < 24; h += 3) sc.render(h, h);
        const n = sc.defs.length;
        for (let h = 0; h < 24; h += 3) sc.render(h + 0.5, h);
        expect(sc.defs.length).toBe(n);
        expect(n).toBeLessThan(REFLECT);
    });

    it('different seeds give different scenes', () => {
        const a = createScene('lake', 1).render(0, 12);
        const b = createScene('lake', 2).render(0, 12);
        expect(a).not.toEqual(b);
    });
});
