import { chordRegions } from './timelineDraw';

const chord = { name: 'C', numeral: 'I' };
const plan = [0, 1, 2, 3].map(bar => ({ bar, chord, chordStart: bar !== 1, events: [] }));

test('chord targets follow the rendered scrolling lane and retain separate repeated occurrences', () => {
    const regions = chordRegions(plan, 4, 700, 0);
    expect(regions.map(r => [r.startBar, r.endBar])).toEqual([[0, 2], [2, 3], [3, 4]]);
    expect(regions[0]).toMatchObject({ left: 102, width: 196, top: 2, height: 42, record: plan[0] });
    const scrolled = chordRegions(plan, 4, 700, 8);
    expect(scrolled[0]).toMatchObject({ left: 0, width: 98, record: plan[0] });
    expect(scrolled[1].left).toBe(102);
    expect(new Set(regions.map(r => r.key)).size).toBe(3);
});

test('targets outside the visible lane or a hidden canvas are omitted', () => {
    expect(chordRegions(plan, 4, 0, 0)).toEqual([]);
    expect(chordRegions(plan, 0, 700, 0)).toEqual([]);
    expect(chordRegions(plan, 4, 700, 100)).toEqual([]);
});
