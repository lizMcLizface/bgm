import { sequencerBar, sequencerLanes, cleanMoves, moveValues, stageSpan, laneDefaults, sequencerStages, stageForBar, cleanEdits, cleanSlots, defaultSequencer, nearestDrum } from './sequencer';
import { METERS } from './meter';
import { defaultSettings, sanitizeSettings, encodeSettings, decodeShare } from './settings';
import { BEATS, ARRANGEMENTS } from '../synths/drums/beats';
import { DRUMS } from './percussion';

const seq = (extra = {}) => ({ ...defaultSequencer(), on: true, arrangement: 'techno', ...extra });

test('a single beat becomes eight stages and plays its Groove as written', () => {
    const stages = sequencerStages(seq());
    expect(stages).toHaveLength(8);
    const bar = sequencerBar({ meter: METERS['4/4'], seq: seq(), swing: 0.5 });
    const kicks = bar.filter((e) => e.track === 'bd').map((e) => e.beat);
    expect(kicks).toEqual([0, 1, 2, 3]);
    expect(bar.every((e) => e.role === 'perc' && DRUMS[e.midi])).toBe(true);
    expect(bar.filter((e) => e.track === 'ch')).toHaveLength(16);
});

test('a chord slot with its own stage overrides the arrangement chain', () => {
    const s = seq({ arrangement: 'house-lift', slots: [4, -1] });
    expect(stageForBar(s, { slotIndex: 0, bar: 0 })).toBe(4);
    const chain = ARRANGEMENTS.find((a) => a.id === 'house-lift').chain;
    expect(stageForBar(s, { slotIndex: 1, bar: 3 })).toBe(chain[3]);
    const breakdown = sequencerBar({ meter: METERS['4/4'], seq: s, slotIndex: 0, bar: 9 });
    expect(breakdown.some((e) => e.track === 'bd')).toBe(false);
});

test('edits replace a stage row, and swing delays the off sixteenths', () => {
    const s = seq({ edits: { 1: { bd: 'x...............' } } });
    expect(sequencerBar({ meter: METERS['4/4'], seq: s }).filter((e) => e.track === 'bd')).toHaveLength(1);
    const swung = sequencerBar({ meter: METERS['4/4'], seq: seq(), swing: 0.6 }).filter((e) => e.track === 'ch');
    expect(swung[1].beat).toBeGreaterThan(0.25);
    expect(swung[0].beat).toBe(0);
});

test('every beat and arrangement resolves and plays', () => {
    for (const id of [...BEATS, ...ARRANGEMENTS].map((b) => b.id)) {
        expect(sequencerBar({ meter: METERS['4/4'], seq: seq({ arrangement: id }) }).length).toBeGreaterThan(0);
    }
});

test('other meters tile or cut the sixteen steps; unknown arrangements play nothing', () => {
    const three = sequencerBar({ meter: METERS['3/4'], seq: seq() });
    expect(Math.max(...three.map((e) => e.beat))).toBeLessThan(METERS['3/4'].units);
    expect(sequencerBar({ meter: METERS['4/4'], seq: seq({ arrangement: 'nope' }) })).toEqual([]);
    expect(nearestDrum('mt')).toBe(DRUMS.indexOf('tom'));
});

test('hostile edits and slots are cleaned', () => {
    expect(cleanEdits({ 1: { bd: 'x...............', zz: 'x...............', sd: 'bad' }, 9: { bd: 'x...............' } })).toEqual({ 1: { bd: 'x...............' } });
    expect(cleanSlots([0, 8])).toBeUndefined();
    expect(cleanSlots([0, -1, 7])).toEqual([0, -1, 7]);
});

test('the sequencer survives settings sanitising and a share link, and a default one adds nothing', () => {
    const base = { ...defaultSettings(), seed: 5 };
    expect(encodeSettings(base)).not.toMatch(/x=/);
    const settings = { ...base, sequencer: seq({ arrangement: 'warehouse-shift', slots: [1, 6, 4, 7], edits: { 1: { bd: 'x...x...x...x...' } } }) };
    const back = decodeShare(encodeSettings(settings));
    expect(back.settings.sequencer).toEqual(settings.sequencer);
    expect(sanitizeSettings({ sequencer: { on: true, arrangement: 'not a beat' } }).sequencer.arrangement).toBe('');
});

test('lanes play the chord as short stabs and the root as a bass line on their own rows', () => {
    const chord = { pitchClasses: [9, 0, 4] };
    const s = seq({ arrangement: 'warehouse-shift', lanes: true, variation: 0, gate: 0.2, edits: { 1: { pad: '..x...x...x...x.', bass: '.xxf.xxf.xxf.xxf' } } });
    const lanes = sequencerLanes({ meter: METERS['4/4'], seq: s, chord, slotIndex: 0, bar: 0, });
    const stage = sequencerLanes({ meter: METERS['4/4'], seq: { ...s, slots: [1] }, chord });
    expect(stage.filter((e) => e.role === 'pad').map((e) => e.beat)).toEqual([0.5, 0.5, 0.5, 1.5, 1.5, 1.5, 2.5, 2.5, 2.5, 3.5, 3.5, 3.5]);
    expect(stage.filter((e) => e.role === 'bass')).toHaveLength(12);
    expect(stage.filter((e) => e.role === 'bass').every((e) => e.midi % 12 === 9 || e.midi % 12 === 9)).toBe(true);
    expect(stage.filter((e) => e.role === 'pad').every((e) => e.length === 0.2)).toBe(true);
    expect(lanes.length).toBeGreaterThan(0);
    expect(sequencerLanes({ meter: METERS['4/4'], seq: s, chord: null })).toEqual([]);
});

test('house and techno get off-beat stabs, and a breakdown has no bass', () => {
    expect(laneDefaults('Techno', 'Groove').pad).toBe('..x...x...x...x.');
    expect(laneDefaults('Techno', 'Breakdown').bass).toBe('................');
    expect(laneDefaults('Electro', 'Groove', 'x..x..x...x...x.').bass).toBe('x..x..x...x...x.');
});

test('moves are validated and run from their start to their end through a chord', () => {
    expect(cleanMoves({ 1: [{ key: 'inserts.phaser', from: 0, to: 0.6 }, { key: 'nope', from: 0, to: 1 }, { key: 'effects.delay', from: 0, to: 5 }], 9: [] })).toEqual({ 1: [{ key: 'inserts.phaser', from: 0, to: 0.6 }] });
    const s = seq({ moves: { 5: [{ key: 'effects.delayMs', from: 500, to: 125 }, { key: 'send.pad', from: 0, to: 0.5 }] } });
    expect(moveValues(s, 5, 0)).toEqual({ 'effects.delayMs': 500, 'send.pad': 0 });
    expect(moveValues(s, 5, 0.5)['effects.delayMs']).toBe(312.5);
    expect(moveValues(s, 5, 2)['send.pad']).toBe(0.5);
    expect(moveValues(s, 1, 0.5)).toEqual({});
});

test('fills play the Fill stage on every eighth bar, but not in an intro or a breakdown', () => {
    const s = seq({ arrangement: 'house-lift', fills: true, slots: [1, 1, 1, 1] });
    const kick = (bar, seq2 = s) => sequencerBar({ meter: METERS['4/4'], seq: seq2, bar }).filter((e) => e.track === 'lt').length;
    expect(kick(2)).toBe(0);
    expect(kick(3)).toBe(0);
    expect(kick(7)).toBeGreaterThan(0);
    expect(kick(7, { ...s, slots: [4] })).toBe(0);
    expect(kick(7, { ...s, fills: false })).toBe(0);
});

test('variation turns the wall of chords into a line: single tones, thinner bars, a resting eighth bar', () => {
    const chord = { pitchClasses: [9, 0, 4] };
    const s = seq({ arrangement: 'warehouse-shift', lanes: true, gate: 0.2, variation: 1, slots: [1] });
    const pads = (bar) => sequencerLanes({ meter: METERS['4/4'], seq: s, chord, bar, seed: 5 }).filter((e) => e.role === 'pad');
    const flat = sequencerLanes({ meter: METERS['4/4'], seq: { ...s, variation: 0 }, chord, bar: 0, seed: 5 }).filter((e) => e.role === 'pad');
    expect(flat).toHaveLength(12);
    // a bar mostly of single notes, with fewer events than the full chords
    expect(pads(0).length).toBeLessThan(12);
    expect(new Set(pads(0).map((e) => e.beat)).size).toBeGreaterThan(0);
    // the fourth bar of a phrase is sparser than the first, and the eighth bar rests (no plain stabs)
    const count = (bar) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((k) => pads(bar + k * 8).length).reduce((a, b) => a + b);
    expect(count(3)).toBeLessThan(count(0));
    expect(pads(7)).toEqual([]);
    // deterministic
    expect(pads(2)).toEqual(pads(2));
    // more than one pitch is played over a few bars: a line
    expect(new Set([0, 1, 2, 3].flatMap((b) => pads(b).map((e) => e.midi))).size).toBeGreaterThan(3);
});

test('the kick drops out in every sixteenth bar and before a build lands; hats are played, not stamped', () => {
    const s = seq({ arrangement: 'warehouse-shift', fills: true, slots: [1] });
    const kicks = (bar, extra = {}, args = {}) => sequencerBar({ meter: METERS['4/4'], seq: { ...s, ...extra }, bar, ...args }).filter((e) => e.track === 'bd').length;
    expect(kicks(7)).toBe(4);
    expect(kicks(15)).toBe(0);
    // the last bar of a build chord cuts the kick; the bars before it keep it
    expect(kicks(2, { slots: [5] }, { barsLeft: 1 })).toBe(0);
    expect(kicks(2, { slots: [5] }, { barsLeft: 2 })).toBe(4);
    const hats = sequencerBar({ meter: METERS['4/4'], seq: s, bar: 0, seed: 3 }).filter((e) => e.track === 'ch').map((e) => e.velocity);
    expect(new Set(hats.map((v) => v.toFixed(2))).size).toBeGreaterThan(6);
    expect(Math.max(...hats)).toBeLessThan(1);
    // off-beat eighths lead the sixteenths between them
    const byStep = (step) => hats[step];
    expect(byStep(2)).toBeGreaterThan(byStep(1));
    expect(sequencerBar({ meter: METERS['4/4'], seq: s, bar: 0, seed: 3 })).toEqual(sequencerBar({ meter: METERS['4/4'], seq: s, bar: 0, seed: 3 }));
});

test('house and techno swing a little and get a syncopated shaker; a lone bass is syncopated, not a run', () => {
    const bar = sequencerBar({ meter: METERS['4/4'], seq: seq({ arrangement: 'minimal-click' }) });
    expect(bar.filter((e) => e.track === 'ma').length).toBeGreaterThan(0);
    expect(bar.filter((e) => e.track === 'ch').find((e) => e.beat > 0.7 && e.beat < 0.85).beat).toBeGreaterThan(0.75);
    expect(laneDefaults('Techno', 'Groove').bass).toBe('..x...xx..x...xf');
});

test('filter moves run in octaves, and are validated', () => {
    const s = seq({ moves: { 5: [{ key: 'filter.lowpass', from: 400, to: 12800 }] } });
    expect(moveValues(s, 5, 0)['filter.lowpass']).toBe(400);
    expect(moveValues(s, 5, 0.5)['filter.lowpass']).toBeCloseTo(2263, 0);
    expect(moveValues(s, 5, 1)['filter.lowpass']).toBeCloseTo(12800);
    expect(cleanMoves({ 5: [{ key: 'filter.highpass', from: 20, to: 2000 }, { key: 'filter.highpass', from: 2, to: 9000 }] })).toEqual({ 5: [{ key: 'filter.highpass', from: 20, to: 2000 }] });
});

test('with sections, a stage lasts its own number of bars whatever the chords do', () => {
    const s = seq({ arrangement: 'house-lift', sectionBars: 8, slots: [0, 1, 5, 6] });
    expect([0, 7, 8, 15, 16, 23, 24, 31, 32].map((bar) => stageForBar(s, { slotIndex: bar % 4, bar }))).toEqual([0, 0, 1, 1, 5, 5, 6, 6, 0]);
    expect(stageSpan(s, { start: 3, bars: 2, left: 1 }, 11)).toEqual({ start: 8, bars: 8, left: 5 });
    expect(stageSpan({ ...s, sectionBars: 0 }, { start: 4, bars: 2, left: 1 }, 5)).toEqual({ start: 4, bars: 2, left: 1 });
    // with none listed it walks the arrangement's chain, a stage per section
    const chain = ARRANGEMENTS.find((a) => a.id === 'house-lift').chain;
    const follow = { ...s, slots: [] };
    expect([0, 4, 8].map((bar) => stageForBar({ ...follow, sectionBars: 4 }, { bar }))).toEqual([chain[0], chain[1], chain[2]]);
});

test('cymbal steps play well under the other drums, and a preset can silence them', () => {
    const s = seq({ arrangement: 'disco-ride' });
    const bar = sequencerBar({ meter: METERS['4/4'], seq: s, bar: 0, seed: 1 });
    const ride = bar.filter((e) => e.track === 'rd'), hats = bar.filter((e) => e.track === 'ch');
    expect(ride.length).toBeGreaterThan(0);
    expect(Math.max(...ride.map((e) => e.velocity))).toBeLessThan(Math.max(...hats.map((e) => e.velocity)) + 0.01);
    const quiet = sequencerBar({ meter: METERS['4/4'], seq: seq({ arrangement: 'disco-ride', edits: { 1: { rd: '.'.repeat(16) } } }), bar: 0, seed: 1 });
    expect(quiet.some((e) => e.track === 'rd')).toBe(false);
});
