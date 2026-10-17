import { randomFluidOptions, FLUID_LIMITS } from './fluidLooks';

test('random flow variations stay in bounds with finite parameters and fixed display quality', () => {
    for (let seed = 1; seed <= 100; seed++) {
        let state = seed;
        const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
        const next = randomFluidOptions({ simResolution: 256, dyeResolution: 512, palette: 'mono', circle: true, hueShift: 42 }, random);
        for (const [key, [min, max]] of Object.entries(FLUID_LIMITS)) {
            expect(Number.isFinite(next[key])).toBe(true);
            expect(next[key]).toBeGreaterThanOrEqual(min);
            expect(next[key]).toBeLessThanOrEqual(max);
        }
        expect(next).toMatchObject({ simResolution: 256, dyeResolution: 512, palette: 'mono', circle: true, hueShift: 42 });
        expect(['exhaust', 'forward']).toContain(next.jetDirection);
    }
});
