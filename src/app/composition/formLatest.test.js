import { planForm, formEnvelope, shapeFormNotes } from './formLatest';
import { arrangeBarLatest } from './arrangerLatest';
import { defaultSettings } from '../settings';
import { METERS } from '../meter';
import { drumBarLatest } from './percussionLatest';

const settings = () => ({ ...defaultSettings(), leadActivity: 1, leadDensity: .6,
    sections: { mode: 'gentle', phrases: 2 }, humanize: { timing: 0, velocity: 0, detune: 0 } });
const chord = { pitchClasses: [0, 4, 7] }, scalePcs = [0, 2, 4, 5, 7, 9, 11];
function run(seed = 42, patch = {}, count = 128, meter = METERS['4/4']) {
    const s = { ...settings(), ...patch }; let prev = null;
    return Array.from({ length: count }, (_, bar) => {
        const b = arrangeBarLatest({ bar, seed, settings: s, meter, chord, nextChord: chord, scalePcs,
            barsPerChord: 2, barsLeftInChord: 2 - bar % 2, chordStart: bar % 2 === 0, prev });
        // Restoring state between every bar must also remain deterministic.
        prev = JSON.parse(JSON.stringify(b.state)); return b;
    });
}

test('form has bounded variable durations, prepared destinations, history and no endless Full', () => {
    for (let seed = 1; seed <= 12; seed++) {
        const bars = run(seed, {}, 256);
        const sections = bars.filter((b, i) => b.state.phrase.section.start === i).map(b => b.state.phrase.section);
        expect(new Set(sections.map(s => s.type))).toEqual(new Set(['intro', 'build', 'full', 'breakdown']));
        expect(new Set(sections.map(s => s.bars)).size).toBeGreaterThan(1);
        sections.forEach((s, i) => {
            expect(s.start % 4).toBe(0); expect(s.bars % 4).toBe(0);
            expect(s.bars).toBeGreaterThanOrEqual(4); expect(s.bars).toBeLessThanOrEqual(12);
            if (i) {
                expect(s.type).toBe(sections[i - 1].nextType);
                expect(s.start).toBe(sections[i - 1].start + sections[i - 1].bars);
                expect(s.brightnessStart).toBe(sections[i - 1].brightnessEnd);
            }
            if (i >= 2) expect(sections.slice(i - 2, i + 1).every(t => t.type === 'full')).toBe(false);
        });
        expect(run(seed)).toEqual(run(seed));
    }
});

test('breakdowns remember a theme and Full returns recover the main theme', () => {
    const bars = run();
    const breakdown = bars.find(b => b.state.phrase.section.type === 'breakdown');
    expect(breakdown.state.composition.phrase.role).toBe('recollection');
    expect(breakdown.state.composition.themes).toEqual(bars[0].state.composition.themes);
    const returns = bars.filter((b, i) => b.state.phrase.section.returning && b.state.phrase.section.start === i);
    expect(returns.length).toBeGreaterThan(1);
    returns.forEach(b => {
        expect(b.state.composition.phrase.role).toBe('return');
        expect(b.state.composition.phrase.themeId).toBe(0);
        expect(b.state.composition.phrase.shift).toBe(0);
    });
    const source = [{ beat: 0, length: 1 }, { beat: 1, length: 1 }, { beat: 2, length: 1 }, { beat: 3, length: 1 }];
    expect(shapeFormNotes(source, { type: 'breakdown' }, 0, false).map(e => e.beat)).toEqual([0, 2]);
});

test('quick intro is one phrase, sections off has no new form, and explicit silence stays silent', () => {
    const quick = run(42, { sections: { mode: 'strong', phrases: 8, quickIntro: true } }, 9);
    expect(quick.slice(0, 4).every(b => b.state.phrase.section.type === 'intro')).toBe(true);
    expect(quick[4].state.phrase.section.type).toBe('full');
    const off = run(42, { sections: { mode: 'off', phrases: 2 } }, 8);
    expect(off.every(b => b.state.phrase.section === null && !b.state.composition.form)).toBe(true);
    expect(run(42, { leadActivity: 0 }).every(b => b.events.every(e => e.role !== 'lead'))).toBe(true);
});

test('form envelopes stay bounded and prepare exactly the closing phrase', () => {
    let previous;
    for (let bar = 0; bar < 96; bar++) {
        previous = planForm({ bar, seed: 17, sections: settings().sections, previous, settings: settings() });
        const s = formEnvelope(previous, bar, 'gentle');
        expect(s.energy).toBeGreaterThan(.4); expect(s.energy).toBeLessThanOrEqual(1);
        expect(s.brightness).toBeGreaterThanOrEqual(0); expect(s.brightness).toBeLessThanOrEqual(1);
        expect(Boolean(s.transition)).toBe(bar >= s.start + s.bars - 4);
    }
});

test('form, recollections and section percussion stay valid in all meters', () => {
    for (const meter of Object.values(METERS)) {
        const bars = run(17, { sections: { mode: 'strong', phrases: 2 } }, 64, meter);
        bars.forEach((b, bar) => {
            const hits = drumBarLatest({ bar, meter, drums: { style: 'lofi', activity: .8, variation: .8 },
                section: b.state.phrase.section, sectionsMode: 'strong', seed: 17, rhythm: b.state.composition.rhythm });
            for (const e of [...b.events, ...hits]) {
                expect(e.beat).toBeGreaterThanOrEqual(0); expect(e.beat).toBeLessThan(meter.units);
                expect(e.length).toBeGreaterThan(0); expect(Number.isFinite(e.midi)).toBe(true);
                expect(e.velocity).toBeGreaterThan(0); expect(e.velocity).toBeLessThanOrEqual(1);
            }
        });
    }
});


test('section edits wait for the next phrase and never introduce an off-grid section', () => {
    const s = settings();
    const initial = planForm({ bar: 0, seed: 42, sections: s.sections, settings: s });
    const changed = { mode: 'strong', phrases: 4 };
    const held = planForm({ bar: 1, seed: 42, sections: changed, previous: initial, settings: s });
    expect(held).toEqual(initial);
    const next = planForm({ bar: 4, seed: 42, sections: changed, previous: held, settings: s });
    expect(next.section.start).toBe(4); expect(next.signature).not.toBe(initial.signature);
    expect(planForm({ bar: 1, seed: 42, sections: changed, settings: s })).toBeNull();
    let prev = null;
    const output = [];
    for (let bar = 0; bar < 12; bar++) {
        const result = arrangeBarLatest({ bar, seed: 42, settings: { ...s, sections: bar === 0 ? { mode: 'off', phrases: 2 } : changed },
            meter: METERS['4/4'], chord, nextChord: chord, scalePcs, barsPerChord: 1, barsLeftInChord: 1, chordStart: true, prev });
        prev = result.state; output.push(result);
    }
    expect(output.slice(0, 4).every(b => b.state.phrase.section === null)).toBe(true);
    expect(output[4].state.phrase.section.start).toBe(4);
});
