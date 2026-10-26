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

    it.each(Object.keys(BIOMES))('%s fills a portrait frame, horizon lower than in landscape', biome => {
        const sc = createScene(biome, 42, 'auto', 1, 192, 426);
        expect(sc.render(1.5, BIOMES[biome].hour).every(px => px >>> 24 === 255)).toBe(true);
        expect(sc.horizon / sc.H).toBeLessThan(createScene(biome, 42).horizon / 216);
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

    const hasKind = (sc, kind) => sc.frame.some(s => sc.defs[s]?.k === kind);

    it('draws aurora on a clear winter night, not by day', () => {
        const sc = createScene('lake', 3, 'clear', 3.3);
        sc.render(20, 1);
        expect(hasKind(sc, 'aur')).toBe(true);
        sc.render(20, 12);
        expect(hasKind(sc, 'aur')).toBe(false);
    });

    it('lights fireflies on a summer night, not in winter', () => {
        const sc = createScene('grassland', 5, 'clear', 1.2);
        sc.render(3, 23);
        expect(hasKind(sc, 'flame')).toBe(true);
        sc.year = 3.3;
        sc.render(3, 23);
        expect(hasKind(sc, 'flame')).toBe(false);
    });
});
