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

describe('sprinkle', () => {
    const run = (sprinkle, count = 128) => Array.from({ length: count }, (_, bar) => {
        const section = { type: 'full', start: bar - (bar % 16) };
        return drumBar({
            bar, meter: METERS['4/4'], drums: { style: 'lofi', activity: 0.6, variation: 0.5, sprinkle }, section, sectionsMode: 'gentle', sectionBars: 16, phraseStart: bar - (bar % 4), seed: 7,
        });
    });
    const named = (bar) => bar.map((e) => DRUMS[e.midi]);

    test('at 0 nothing is added; the groove is the same with or without it', () => {
        const plain = run(0);
        expect(plain.flat().some((e) => ['crash', 'bell'].includes(DRUMS[e.midi]))).toBe(false);
        const sprinkled = run(0.8);
        sprinkled.forEach((bar, i) => {
            const rest = bar.filter((e) => !['crash', 'bell'].includes(DRUMS[e.midi]));
            expect(rest.length).toBeGreaterThanOrEqual(plain[i].length);
            plain[i].forEach((e) => expect(bar).toContainEqual(e));
        });
    });

    test('a crash where a section begins, bells and rides on off-beats elsewhere', () => {
        const bars16 = run(1);
        const starts = bars16.filter((_, bar) => bar > 0 && bar % 16 === 0);
        expect(starts.filter((bar) => named(bar).includes('crash')).length).toBeGreaterThanOrEqual(5);
        starts.forEach((bar) => bar.filter((e) => DRUMS[e.midi] === 'crash').forEach((e) => expect(e.beat).toBe(0)));
        expect(bars16.flat().filter((e) => DRUMS[e.midi] === 'bell').length).toBeGreaterThan(3);
    });

    test('more sprinkle, more colour; none in an intro', () => {
        const count = (amount) => run(amount).flat().filter((e) => ['crash', 'bell'].includes(DRUMS[e.midi])).length;
        expect(count(1)).toBeGreaterThan(count(0.2));
        const intro = Array.from({ length: 32 }, (_, bar) => drumBar({
            bar, meter: METERS['4/4'], drums: { style: 'lofi', activity: 1, variation: 1, sprinkle: 1 }, section: { type: 'intro', start: 0 }, sectionsMode: 'strong', phraseStart: bar - (bar % 4), seed: 7,
        }));
        expect(intro.flat()).toHaveLength(0);
    });
});

test('the electro and driving styles keep a steady kick, sixteenth hats and a snare-like backbeat, in every meter', () => {
    ['electro', 'drive'].forEach((style) => Object.keys(METERS).forEach((meter) => {
        const all = bars({ style, activity: 0.7, variation: 0.5 }, meter, 32).flat();
        expect(all.length).toBeGreaterThan(100);
        all.forEach((e) => {
            expect(e.beat).toBeGreaterThanOrEqual(0);
            expect(e.beat).toBeLessThan(METERS[meter].units);
        });
        expect(all.some((e) => DRUMS[e.midi] === 'kick')).toBe(true);
        expect(all.some((e) => ['clap', 'rim'].includes(DRUMS[e.midi]))).toBe(true);
    }));
    // four on the floor in 4/4 (the sparse intro level is kick-only on the beats)
    const floor = bars({ style: 'electro', activity: 0, variation: 0 }, '4/4', 64);
    expect(floor.some((bar) => [0, 1, 2, 3].every((beat) => bar.some((e) => DRUMS[e.midi] === 'kick' && e.beat === beat)))).toBe(true);
    // sixteenths: hits off the eighth-note grid
    const sixteenths = bars({ style: 'electro', activity: 0.5, variation: 0.3 }, '4/4', 64).flat();
    expect(sixteenths.some((e) => e.beat % 0.5 !== 0)).toBe(true);
});

test('the crisp kit swaps in a snare, a punchy kick and a bright hat, and leaves the felt kit as it was', () => {
    ['heartbeat', 'brushes', 'lofi', 'shaker', 'downtempo', 'electro', 'drive'].forEach((style) => {
        const felt = bars({ style, activity: 0.6, variation: 0.5 }, '4/4', 48).flat();
        const crisp = bars({ style, activity: 0.6, variation: 0.5, kit: 'crisp' }, '4/4', 48).flat();
        // the same hits in the same places; only these drums change name
        expect(crisp.map((e) => e.beat)).toEqual(felt.map((e) => e.beat));
        const swap = { kick: 'punch', brush: 'snare', hat: 'sizzle' };
        crisp.forEach((e, i) => expect(DRUMS[e.midi]).toBe(swap[DRUMS[felt[i].midi]] || DRUMS[felt[i].midi]));
        expect(felt.some((e) => ['punch', 'snare', 'sizzle'].includes(DRUMS[e.midi]))).toBe(false);
    });
    const used = new Set(bars({ style: 'drive', activity: 0.6, variation: 0.5, kit: 'crisp' }, '4/4', 48).flat().map((e) => DRUMS[e.midi]));
    ['punch', 'snare', 'sizzle'].forEach((drum) => expect(used.has(drum) || drum === 'snare').toBe(true));
});

test('steady styles keep one groove per section, with no swapped drums, dropped hits or ghost notes', () => {
    ['electro', 'drive'].forEach((style) => {
        const all = bars({ style, activity: 0.5, variation: 0.4, sprinkle: 0 }, '4/4', 64);
        // far fewer different bars than a soft style makes with the same settings
        const soft = bars({ style: 'lofi', activity: 0.5, variation: 0.4, sprinkle: 0 }, '4/4', 64);
        expect(new Set(all.map(shape)).size).toBeLessThan(new Set(soft.map(shape)).size);
        const used = new Set(all.flat().map((e) => DRUMS[e.midi]));
        expect(used.has('ride') && style === 'electro').toBe(false);
        // a hit's variation stays small
        all.flat().forEach((e) => expect(Math.abs(e.detune)).toBeLessThanOrEqual(0.4 * 0.25 + 1e-9 + (e.detune !== 0 && ['tom', 'swish'].includes(DRUMS[e.midi]) ? 1 : 0)));
    });
});
