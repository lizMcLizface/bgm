import { fluidDimensions, SIM_RESOLUTIONS, DYE_RESOLUTIONS } from './fluid';

test('quality levels retain power-of-two dimensions and the requested longest edge', () => {
    for (const resolution of new Set([...SIM_RESOLUTIONS, ...DYE_RESOLUTIONS])) {
        for (const aspect of [0.125, 0.6, 1, 1.6, 2.5, 8]) {
            const [w, h] = fluidDimensions(aspect, resolution);
            expect(Math.max(w, h)).toBe(resolution);
            expect(Math.log2(w) % 1).toBe(0);
            expect(Math.log2(h) % 1).toBe(0);
            expect(w >= h).toBe(aspect >= 1);
        }
    }
});
