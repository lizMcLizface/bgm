import { describe, expect, it } from 'vitest';
import { sectionSpaceLevel, spaceTail } from './sectionSpace';

describe('section space', () => {
    it('opens out in breakdowns and intros and stays close in full sections', () => {
        const level = (type) => sectionSpaceLevel({ type }, 1);
        expect(level('breakdown')).toBeGreaterThan(level('intro'));
        expect(level('intro')).toBeGreaterThan(level('build'));
        expect(level('build')).toBeGreaterThan(level('full'));
    });
    it('is silent when off or without sections', () => {
        expect(sectionSpaceLevel({ type: 'breakdown' }, 0)).toBe(0);
        expect(sectionSpaceLevel(null, 1)).toBe(0);
    });
    it('has a tail for renders', () => expect(spaceTail()).toBeGreaterThan(1));
});
