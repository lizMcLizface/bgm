import { describe, expect, it } from 'vitest';
import { parseName, parseVscoName, layerNames, measureRoll, heldStart, levels, segmentBySilence, segmentHeld, segmentStruck, analyzeHeld, analyzeDecay } from './analysis.js';
import { heldModel, heldVoice, decayModel, decayVoice, renderDecay, settleLevels, pitchRange } from './model.js';
import { SIZE, HeldVoice, DecayVoice, RollVoice } from './voice.js';
import { PATCHES } from './patches.js';

const RATE = 44100;
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
/** A held tone with these harmonic amplitudes, a 30 ms rise and fall, written into x at `from`. */
function tone(x, from, seconds, midi, amplitudes) {
    const length = Math.round(seconds * RATE), f = frequency(midi);
    for (let i = 0; i < length; i++) {
        const t = i / RATE, env = Math.min(1, t / .03, (seconds - t) / .03);
        amplitudes.forEach((a, k) => { x[from + i] += env * a * Math.sin(2 * Math.PI * (k + 1) * f * t); });
    }
}
const scale = (first, count, gap, amplitudes = [.3, .1, .05]) => {
    const note = 1, x = new Float32Array(Math.round((note + gap) * count * RATE) + RATE);
    for (let i = 0; i < x.length; i++) x[i] = (Math.random() - .5) * 1e-4;
    for (let i = 0; i < count; i++) tone(x, Math.round((.3 + i * (note + gap)) * RATE), note, first + i, amplitudes);
    return x;
};

describe('file names', () => {
    it('reads dynamic, range and string, whatever the order', () => {
        expect(parseName('Flute.vib.pp.B3B4.aiff')).toMatchObject({ dynamic: 'pp', from: 59, to: 71, string: null });
        expect(parseName('Viola.arco.sulC.ff.C3B3.aiff')).toMatchObject({ dynamic: 'ff', from: 48, to: 59, string: 'sulC' });
        expect(parseName('Guitar.ff.sul_E.C5Bb5.mono.aif')).toMatchObject({ dynamic: 'ff', from: 72, to: 82, string: 'sulE' });
        expect(parseName('crotale.C6.pp.aif')).toMatchObject({ dynamic: 'pp', from: 84, to: 84 });
        expect(parseName('TenorTrombone.pp. E2B2.aiff')).toMatchObject({ dynamic: 'pp', from: 40, to: 47 });
        expect(parseName('Vibraphone.bow.C6F6.aif')).toMatchObject({ dynamic: 'mf', from: 84, to: 89 });
    });
    it('reads a top note named an octave low as the one above', () => {
        expect(parseName('BassClarinet.pp.Db2C2.aiff')).toMatchObject({ from: 37, to: 48 });
    });
});

describe('VSCO file names', () => {
    it('reads note and layer, and passes over later round-robin takes', () => {
        expect(parseVscoName('MOHorn_mute_A#1_v2_1.wav')).toEqual({ midi: 34, layer: 2 });
        expect(parseVscoName('Sum_SHTrumpet_harmonM-sus_A#2_v3_rr1.wav')).toEqual({ midi: 46, layer: 3 });
        expect(parseVscoName('KSHarp_A2_mf.wav')).toEqual({ midi: 45, layer: 0 });
        expect(parseVscoName('piccolo_C5_sustain1.wav')).toEqual({ midi: 72, layer: 0 });
        expect(parseVscoName('Sum_SHTrumpet_harmonM-sus_A#2_v3_rr2.wav')).toBeNull();
        expect(parseVscoName('MOHorn_mute_A#1_v2_2.wav')).toBeNull();
        expect(parseVscoName('piccolo_C5_sustain2.wav')).toBeNull();
    });
    it('names the layers by their order', () => {
        expect(layerNames([1, 3, 1])).toEqual({ 1: 'pp', 3: 'ff' });
        expect(layerNames([1, 2, 3])).toEqual({ 1: 'pp', 2: 'mf', 3: 'ff' });
        expect(layerNames([0])).toEqual({ 0: 'mf' });
    });
});

describe('cutting scales into notes', () => {
    it('finds notes separated by silence', () => {
        expect(segmentBySilence(scale(60, 5, .6), RATE, 5)).toHaveLength(5);
    });
    it('says so when silence does not give the promised count', () => {
        expect(segmentBySilence(scale(60, 5, .6), RATE, 7)).toBeNull();
    });
    it('follows the pitch through a scale with no silence between notes', () => {
        const spans = segmentHeld(scale(60, 5, 0), RATE, 60, 64);
        expect(spans.filter(Boolean)).toHaveLength(5);
        spans.forEach(([start], i) => expect(Math.abs(start / RATE - (.3 + i))).toBeLessThan(.2));
    });
    const struck = (x, at, midi, level = .5) => {
        const f = frequency(midi);
        for (let i = 0; i < RATE * .7; i++) x[Math.round(at * RATE) + i] += Math.exp(-i / RATE / .1) * level * Math.sin(2 * Math.PI * f * i / RATE);
    };
    const noisy = (seconds) => { const x = new Float32Array(RATE * seconds); for (let i = 0; i < x.length; i++) x[i] = (Math.random() - .5) * .004; return x; };
    it('finds each strike of a scale when the room never goes quiet', () => {
        const x = noisy(5);
        [.5, 1.5, 2.5, 3.5].forEach((at, i) => struck(x, at, 72 + i));
        const spans = segmentStruck(x, RATE, 72, 75);
        spans.forEach(([start], i) => expect(Math.abs(start / RATE - (.5 + i))).toBeLessThan(.06));
    });
    it('is not moved along the scale by a mallet rebound', () => {
        const x = noisy(6);
        [.5, 1.5, 2.5, 3.5].forEach((at, i) => struck(x, at, 72 + i));
        struck(x, 1.75, 73, .2);        // the second note bounces, which counted by level alone would push the third and fourth down the scale
        const spans = segmentStruck(x, RATE, 72, 75);
        spans.forEach(([start], i) => expect(Math.abs(start / RATE - (.5 + i))).toBeLessThan(.06));
    });
    it('leaves out a note the recording does not play, and keeps the rest on their pitches', () => {
        const x = noisy(5);
        [[.5, 72], [1.5, 73], [2.5, 75]].forEach(([at, midi]) => struck(x, at, midi));
        const spans = segmentStruck(x, RATE, 72, 75);
        expect(spans[2]).toBeNull();
        expect(Math.abs(spans[3][0] / RATE - 2.5)).toBeLessThan(.06);
    });
});

describe('measuring', () => {
    const afterNoise = (seconds, noiseLevel = .002) => {
        const x = new Float32Array(Math.round((seconds + 2) * RATE));
        for (let i = 0; i < x.length; i++) x[i] = (Math.random() - .5) * noiseLevel;
        tone(x, Math.round(seconds * RATE), 1.9, 60, [.05, .02, .01]);
        return x;
    };
    it('finds a held note behind a second of room noise', () => {
        const start = heldStart(afterNoise(1.4), RATE, 60) / RATE;
        expect(Math.abs(start - 1.4)).toBeLessThan(.08);
    });
    it('does not take a note that starts at once for one that starts late', () => {
        expect(heldStart(afterNoise(.02), RATE, 60) / RATE).toBeLessThan(.08);
    });
    it('keeps the bow noise that leads straight into the note', () => {
        const x = afterNoise(1), from = Math.round(.9 * RATE);
        for (let i = 0; i < RATE * .1; i++) x[from + i] += (Math.random() - .5) * .04;       // 100 ms of scrape, well over the room
        const start = heldStart(x, RATE, 60) / RATE;
        expect(start).toBeLessThan(.93);
        expect(start).toBeGreaterThan(.82);
    });
    it('measures the note, not the noise before it: its attack and that it has no vibrato', () => {
        const x = afterNoise(1.4), m = analyzeHeld(x.subarray(heldStart(x, RATE, 60)), RATE, 60, null);
        expect(m.envelope.at(-1)).toBeGreaterThan(-3);
        expect(m.depth).toBeLessThan(3);
        expect(m.pitchWander).toBeLessThan(6);
    });
    it('reads the harmonics of a held tone', () => {
        const x = new Float32Array(RATE * 2);
        tone(x, 2000, 1.8, 69, [.4, .04, .004]);
        const m = analyzeHeld(x, RATE, 69, null);
        expect(m.harmonics[0] - m.harmonics[1]).toBeCloseTo(20, 0);
        expect(m.harmonics[0] - m.harmonics[2]).toBeCloseTo(40, 0);
        expect(m.level).toBeCloseTo(20 * Math.log10(.4 / Math.SQRT2), 0);
    });
    it('reads vibrato depth and rate', () => {
        const x = new Float32Array(RATE * 2), f = frequency(69);
        let phase = 0;
        for (let i = 0; i < x.length; i++) { phase += 2 * Math.PI * f * 2 ** (20 * Math.sin(2 * Math.PI * 5 * i / RATE) / 1200) / RATE; x[i] = .3 * Math.sin(phase) * Math.min(1, i / 1000, (x.length - i) / 1000); }
        const m = analyzeHeld(x, RATE, 69, null);
        expect(m.rate).toBeCloseTo(5, 0);
        expect(Math.abs(m.depth - 20)).toBeLessThan(4);
    });
    it('reads the level and decay of partials, and drops a hum that does not decay', () => {
        const x = new Float32Array(RATE * 3), f = frequency(60);
        for (let i = 0; i < x.length; i++) {
            const t = i / RATE;
            x[i] = .5 * 10 ** (-30 * t / 20) * Math.sin(2 * Math.PI * f * t) + .1 * 10 ** (-60 * t / 20) * Math.sin(2 * Math.PI * 3.9 * f * t) + .01 * Math.sin(2 * Math.PI * .6 * f * t);
        }
        const m = analyzeDecay(x, RATE, 60, null), first = m.partials.find((p) => Math.abs(p.ratio - 1) < .01), upper = m.partials.find((p) => Math.abs(p.ratio - 3.9) < .02);
        expect(Math.abs(first.early + 30)).toBeLessThan(3);
        expect(Math.abs(upper.early + 60)).toBeLessThan(6);
        expect(m.partials.some((p) => Math.abs(p.ratio - .6) < .02)).toBe(false);
    });
});

const heldNote = (m, level, low = 0) => ({ m, l: level, c: 0, j: 0, h: [0 - low, -12, -24, -36], s: Array(6).fill([0, 0, 0, 0]), e: [-60, -40, -20, -10, -3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], r: [0, -6, -12, -24, -36, -48, -60, -70, -70], n: Array(22).fill(-99), b: Array(22).fill(-99), v: [5, 10, 1, 0, 0] });
const heldTable = () => settleLevels({ id: 't', decay: false, layers: { pp: [heldNote(60, -40), heldNote(64, -40)], ff: [heldNote(60, -20), heldNote(64, -20)] } });

describe('the note model', () => {
    it('blends strength in dB between the layers', () => {
        const table = heldTable();
        expect(heldModel(table, 60, 30).level).toBeCloseTo(-40);
        expect(heldModel(table, 60, 118).level).toBeCloseTo(-20);
        expect(heldModel(table, 60, 74).level).toBeCloseTo(-30);
    });
    it('blends pitch between the measured notes, and refuses a pitch far outside them', () => {
        const table = heldTable();
        table.layers.pp[1].level = -30;
        expect(heldModel(table, 62, 30).level).toBeCloseTo(-35);
        expect(heldModel(table, 75, 80)).toBeNull();
        expect(pitchRange(table)).toEqual([60, 64]);
    });
    it('keeps a single stray take in line with its neighbours', () => {
        const notes = [-30, -30, -30, -10, -30, -30, -30].map((l, i) => heldNote(60 + i, l));
        const table = settleLevels({ layers: { mf: notes } });
        expect(table.layers.mf[3].level).toBeCloseTo(-28.5);       // 3 dB at most, and half of that goes with the slope
    });
    it('lets the neighbours stand in for a held take that is far too quiet or lost in noise', () => {
        const notes = [-30, -30, -30, -50, -30, -30, -30].map((l, i) => heldNote(60 + i, l));
        notes[5].v = [5, 8, 1, 45, 2];
        const table = settleLevels({ layers: { mf: notes } });
        expect(table.layers.mf.map((n) => n.m)).toEqual([60, 61, 62, 64, 66]);
        expect(heldModel(table, 63, 80).level).toBeCloseTo(-30);
    });
    it('plays back the level and harmonics it was given', () => {
        const table = heldTable(), spec = heldVoice(heldModel(table, 60, 118), RATE), voice = new HeldVoice(spec, RATE, 10 ** (-20 / 20));
        const out = new Float32Array(RATE * 2);
        for (let at = 0; at < out.length; at += 128) { const block = new Float32Array(Math.min(128, out.length - at)); voice.render(block, block.length); out.set(block, at); }
        const back = analyzeHeld(out, RATE, 60, null);
        expect(Math.abs(back.level + 20)).toBeLessThan(1);
        expect(Math.abs(back.harmonics[0] - back.harmonics[1] - 12)).toBeLessThan(1.5);
        expect(Math.abs(back.harmonics[0] - back.harmonics[2] - 24)).toBeLessThan(1.5);
    });
    const heldSpec = (extra = {}) => ({ f0: 220, tables: [Float32Array.from({ length: SIZE }, (_, i) => Math.sin(2 * Math.PI * i / SIZE))], times: [0], noise: null, burst: null, envTimes: [0, 1], envDb: [0, 0], relTimes: [0, .1], relDb: [0, -80], rate: 5, depth: 0, tremolo: 0, pitchWander: 0, levelWander: 0, ...extra });
    const playHeld = (voice, seconds) => { const out = new Float32Array(Math.round(seconds * RATE)); for (let at = 0; at < out.length; at += 128) { const block = new Float32Array(Math.min(128, out.length - at)); voice.render(block, block.length); out.set(block, at); } return out; };
    const crossings = (x, from, to) => { let count = 0; for (let i = from + 1; i < to; i++) if (x[i - 1] < 0 && x[i] >= 0) count++; return count / ((to - from) / RATE); };
    it('opens a held note over a few ms, however loud its measured start, so it cannot click', () => {
        const out = playHeld(new HeldVoice(heldSpec(), RATE, 1), .05);
        expect(Math.max(...out.subarray(0, 44).map(Math.abs))).toBeLessThan(.25);
        expect(Math.max(...out.subarray(441, 1323).map(Math.abs))).toBeGreaterThan(.9);
    });
    it('glides a joined note from the pitch before, already past its attack', () => {
        const spec = heldSpec({ envTimes: [0, .3, .39], envDb: [-60, -60, 0], times: [.4] }), cents = 700, out = playHeld(new HeldVoice(spec, RATE, 1, 1, 1, { cents, seconds: .1 }), .4);
        expect(crossings(out, 882, 1764)).toBeGreaterThan(220 * 1.3);      // near the note it came from
        expect(crossings(out, RATE * .2 | 0, RATE * .39 | 0)).toBeCloseTo(220, -1);
        expect(Math.max(...out.subarray(RATE * .03 | 0, RATE * .05 | 0).map(Math.abs))).toBeGreaterThan(.1);    // no fresh attack, which here starts 60 dB down
    });
    it('evens out the takes of an instrument that asks for it, and softens the top of one that asks for that', () => {
        const note = (m, l, rise) => ({ m, l, h: [0, -10, -20], s: [[0, 0]], e: Array.from({ length: 17 }, (_, i) => (i < rise ? -40 : 0)), r: [0, -10], n: [-60], b: [-99], v: [5, 1, 0, 2, 1] });
        const bass = settleLevels({ id: 'double-bass', layers: { ff: [note(40, -30, 4), note(41, -30, 4), note(42, -30, 4), note(43, -42, 12), note(44, -30, 4), note(45, -30, 4), note(46, -30, 4)] } }).layers.ff[3];
        expect(bass.level).toBeGreaterThan(-32);      // 12 dB under its neighbours in the recording
        expect(bass.e[12]).toBe(0);
        expect(bass.e[4] - bass.e[3]).toBeLessThanOrEqual(.7 * 5);       // a 40 dB jump from one measuring point to the next is gone
        const high = (id) => settleLevels({ id, layers: { ff: [{ ...note(88, -30, 1), h: Array(5).fill(-10) }] } }).layers.ff[0].h;
        expect(high('violin')[0]).toBeCloseTo(-10, 0);      // E6 lies under the corner
        expect(high('violin')[4]).toBeLessThan(-20);
        expect(high('viola')[4]).toBe(-10);
    });
    it('ends a held voice after its release', () => {
        const table = heldTable(), voice = new HeldVoice(heldVoice(heldModel(table, 60, 118), RATE), RATE, 1), block = new Float32Array(128);
        for (let i = 0; i < 100; i++) voice.render(block, 128);
        voice.release();
        let alive = true, blocks = 0;
        while (alive && blocks++ < 2000) alive = voice.render(block.fill(0), 128);
        expect(alive).toBe(false);
    });
    const struckNote = (m, l, p) => ({ m, l, d: 2, b: Array(22).fill(-99), p });
    it('lets the neighbours stand in for a struck note that missed its strike', () => {
        const table = settleLevels({ decay: true, layers: { mf: [-30, -30, -30, -50, -30, -30, -30].map((l, i) => struckNote(60 + i, l, [[1, l, 0, -20, -20]])) } });
        expect(table.layers.mf.map((n) => n.m)).toEqual([60, 61, 62, 64, 65, 66]);
        expect(decayModel(table, 63, 80).partials[0].level).toBeCloseTo(-30, 0);
    });
    it('reaches a struck note at once, even if the measurement peaked late', () => {
        const table = settleLevels({ decay: true, layers: { mf: [struckNote(60, -20, [[1, -20, 180, -10, -10]])] } });
        const samples = renderDecay(decayModel(table, 60, 80), RATE), env = levels(samples, RATE, .002);
        expect(env[4]).toBeGreaterThan(-24);      // within 10 ms
    });
    it('blends the same partial of two strengths into one, so they cannot beat', () => {
        const table = settleLevels({ decay: true, layers: { pp: [struckNote(60, -40, [[1, -40, 0, -20, -20], [3, -60, 0, -20, -20]])], ff: [struckNote(60, -20, [[1.002, -20, 0, -40, -40], [5, -30, 0, -40, -40]])] } });
        const between = decayModel(table, 60, 74);
        expect(between.partials.filter((p) => p.f < 300)).toHaveLength(1);
        expect(between.partials[0].level).toBeCloseTo(-30, 0);
        expect(between.partials[0].early).toBeCloseTo(-30, 0);
        expect(between.partials).toHaveLength(3);                 // the two that have no twin stay, each at its layer's weight
    });
    it('sounds a struck note from its first block, with nothing rendered ahead', () => {
        const table = settleLevels({ decay: true, layers: { mf: [struckNote(60, -20, [[1, -20, 0, -20, -20]])] } });
        const voice = new DecayVoice(decayVoice(decayModel(table, 60, 80), RATE), RATE, 1), block = new Float32Array(512);
        voice.render(block, 512);
        expect(Math.max(...block.map(Math.abs))).toBeGreaterThan(.05);
    });
    it('damps a plucked note when asked, and it ends', () => {
        const table = settleLevels({ decay: true, layers: { mf: [struckNote(60, -20, [[1, -20, 0, -1, -1]])] } });
        const voice = new DecayVoice(decayVoice(decayModel(table, 60, 80), RATE), RATE, 1), block = new Float32Array(128);
        for (let i = 0; i < 50; i++) voice.render(block, 128);
        voice.release();
        let blocks = 0;
        while (voice.render(block.fill(0), 128) && blocks < 4000) blocks++;
        expect(blocks).toBeLessThan(RATE * .8 / 128);
    });
    it('rolls while the key is held, at the rate asked for, and rings out after', () => {
        const table = settleLevels({ decay: true, layers: { mf: [struckNote(72, -20, [[1, -20, 0, -60, -60]])] } });
        const voice = new RollVoice(decayVoice(decayModel(table, 72, 80), RATE), RATE, 1, { rate: 10, timing: 0, level: 0 }), out = new Float32Array(RATE);
        for (let at = 0; at < out.length; at += 128) { const block = new Float32Array(Math.min(128, out.length - at)); voice.render(block, block.length); out.set(block, at); }
        expect(Math.abs(measureRoll(out, RATE).rate - 10)).toBeLessThan(1);
        voice.release();
        const block = new Float32Array(128);
        let blocks = 0;
        while (voice.render(block.fill(0), 128) && blocks < 6000) blocks++;
        expect(blocks).toBeLessThan(6000);
    });
    it('renders the partials of a struck note, at the key it was asked for', () => {
        const table = settleLevels({ decay: true, layers: { mf: [{ m: 60, l: -20, d: 2, b: Array(22).fill(-99), p: [[1, -20, 0, -20, -20], [4, -32, 0, -40, -40]] }] } });
        const samples = renderDecay(decayModel(table, 62, 80), RATE), padded = new Float32Array(samples.length + 500);
        padded.set(samples, 400);
        const back = analyzeDecay(padded, RATE, 62, null), first = back.partials.find((p) => Math.abs(p.ratio - 1) < .01);
        expect(Math.abs(first.level + 20)).toBeLessThan(1.5);
        expect(back.partials.some((p) => Math.abs(p.ratio - 4) < .02)).toBe(true);
    });
});

describe('the list of instruments', () => {
    it('has unique ids and a family for each', () => {
        expect(new Set(PATCHES.map((p) => p.id)).size).toBe(PATCHES.length);
        for (const p of PATCHES) expect(p.family).toBeTruthy();
    });
});
