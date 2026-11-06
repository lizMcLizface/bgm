import { describe, expect, it } from 'vitest';
import { LANES, clampOffset, drumLaneWindow, drumLanes, maxOffset, pageCount, pageLabel, pageOf, revealRow, windowLabel } from './lanes';

const kit = (n) => ({ tracks: Array.from({ length: n }, (_, i) => ['k' + i, 'V' + i, 'Voice ' + i]) });

describe('lanes', () => {
    it('shows eight voices at a time', () => {
        expect(LANES).toBe(8);
        expect(pageCount(8)).toBe(1);
        expect(pageCount(9)).toBe(2);
        expect(pageCount(16)).toBe(2);
        expect(pageOf(7)).toBe(0);
        expect(pageOf(8)).toBe(1);
    });
    it('maps a page onto rows of the pattern', () => {
        const second = drumLanes(kit(16), 1);
        expect(second.map((l) => l.index)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
        expect(pageLabel(kit(16), 1)).toBe('V8–V15');
    });
    it('leaves the unused places of the last page empty', () => {
        const last = drumLanes(kit(11), 1);
        expect(last.filter(Boolean).map((l) => l.index)).toEqual([8, 9, 10]);
        expect(last).toHaveLength(LANES);
        expect(last[3]).toBeNull();
    });
    it('slides a window of eight rows over the voices', () => {
        expect(maxOffset(16)).toBe(8);
        expect(maxOffset(6)).toBe(0);
        expect(clampOffset(16, 20)).toBe(8);
        expect(clampOffset(16, -3)).toBe(0);
        expect(drumLaneWindow(kit(16), 3).map((l) => l.index)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
        expect(drumLaneWindow(kit(11), 3).filter(Boolean)).toHaveLength(8);
        expect(drumLaneWindow(kit(6), 0).filter(Boolean)).toHaveLength(6);
        expect(windowLabel(16, 3)).toBe('4–11');
    });
    it('scrolls a row into view by the least it needs', () => {
        expect(revealRow(16, 4, 6)).toBe(4);     // already shown
        expect(revealRow(16, 4, 2)).toBe(2);     // above: it becomes the first row
        expect(revealRow(16, 4, 14)).toBe(7);    // below: it becomes the last row
    });
});
