import { drumBar, DRUMS } from './percussion';
import { METERS } from './meter';

const bars = (drums, meter = '4/4', count = 64) => Array.from({ length: count }, (_, bar) =>
    drumBar({ bar, meter: METERS[meter], drums, section: null, sectionsMode: 'off', phraseStart: bar - (bar % 4), seed: 99 }));
const shape = (events) => events.map((e) => `${DRUMS[e.midi]}@${e.beat}`).sort().join(' ');

test('every style plays in every meter, with backbeat taps even in 3/4', () => {
    ['heartbeat', 'brushes', 'lofi', 'shaker', 'downtempo'].forEach((style) => Object.keys(METERS).forEach((meter) => {
        const all = bars({ style, activity: 0.5, variation: 0.5 }, meter, 32).flat();
        expect(all.length).toBeGreaterThan(32);
        all.forEach((e) => {
            expect(e.beat).toBeGreaterThanOrEqual(0);
            expect(e.beat).toBeLessThan(METERS[meter].units);
            expect(Math.abs(e.detune)).toBeLessThanOrEqual(1);
        });
    }));
    const waltz = bars({ style: 'brushes', activity: 0.5, variation: 0 }, '3/4', 16).flat();
    expect(waltz.some((e) => DRUMS[e.midi] === 'brush')).toBe(true);
});

test('variation: more different bars, and hits that differ in sound; none at 0', () => {
    const distinct = (variation) => new Set(bars({ style: 'brushes', activity: 0.5, variation }).map(shape)).size;
    expect(distinct(0.9)).toBeGreaterThan(distinct(0) + 3);
    expect(distinct(0.9)).toBeGreaterThan(8);
    // (a swish's direction and a tom's pitch come from the groove)
    const still = bars({ style: 'lofi', activity: 0, variation: 0 }).flat().filter((e) => !['swish', 'tom'].includes(DRUMS[e.midi]));
    still.forEach((e) => expect(Math.abs(e.detune)).toBe(0));
    const varied = bars({ style: 'lofi', activity: 0, variation: 0.8 }).flat();
    expect(new Set(varied.map((e) => e.detune.toFixed(2))).size).toBeGreaterThan(20);
});

test('grooves change between sections (or every 16 bars) and stay put within one at variation 0', () => {
    const grooves = bars({ style: 'lofi', activity: 0, variation: 0 }, '4/4', 160);
    const firsts = new Set([0, 16, 32, 48, 64, 80, 96, 112, 128, 144].map((b) => shape(grooves[b])));
    expect(firsts.size).toBeGreaterThan(1);
});

test('variation colours phrases: swapped drums, every second bar differs from the first', () => {
    const lofi = (variation) => bars({ style: 'lofi', activity: 0.3, variation }, '4/4', 256);
    const drumsUsed = (b) => new Set(b.flat().map((e) => DRUMS[e.midi]));
    expect(drumsUsed(lofi(0.9)).has('ride')).toBe(true);
    // how often a phrase's second bar differs in shape from its first
    const twisted = (all) => [...Array(all.length / 4).keys()].filter((p) => shape(all[p * 4]) !== shape(all[p * 4 + 1])).length;
    expect(twisted(lofi(0.9))).toBeGreaterThan(twisted(lofi(0)) + 10);
});

test('fills may fall down the toms', () => {
    const toms = bars({ style: 'lofi', activity: 1, variation: 0.5 }, '4/4', 256).flat().filter((e) => DRUMS[e.midi] === 'tom');
    expect(toms.length).toBeGreaterThan(4);
    toms.forEach((e) => expect(Math.abs(e.detune)).toBeLessThanOrEqual(1));
});
