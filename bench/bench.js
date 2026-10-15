// Audio-thread cost of the real engine (docs/DESIGN.md §5). Renders a
// planned arrangement through the role Instruments in an
// OfflineAudioContext and times it: load = render time / audio duration,
// the share of one core the realtime audio thread would need for it.
// Offline rendering has no background threads, so convolution reverbs read
// higher here than in Chrome's realtime rendering (which runs the long part
// of each impulse on a helper thread) - compare runs, not absolute numbers.
//
// Notes are booked progressively (the render suspends every STEP seconds)
// and voices/effects are put to sleep at those points, as in playback.
// Sleep timers are disabled: they would fire at arbitrary render times and
// make runs differ. Runs are deterministic, so mode=render output can be
// diffed between two versions of the engine.
//
// npm run dev, then open /bgm/bench/ with query parameters:
//   scenarios=busy,lush,default  seconds=20  reps=3
//   variants=full,noNotes,noReverb,...  (see VARIANTS; attributes cost by
//   switching one part off)
//   mode=render&scenarios=busy&variant=full - one render, stored as base64
//   float32 (left then right) in window.__render, for diffing
// Results also land in window.__results.

import Instrument from '../src/app/engine/Instrument';
import Generator, { ROLES } from '../src/app/Generator';
import { findPreset } from '../src/app/editor/presetStore';
import { defaultSettings } from '../src/app/settings';
import { METERS, unitsPerMinute } from '../src/app/meter';

const SR = 48000;
const STEP = 0.25;
const LOOKAHEAD = 0.5;

export const SCENARIOS = {
    // arpeggio pad, walking bass, lead every phrase
    busy: { padWeights: { sustain: 0, pulse: 0, arpeggio: 100 }, bassWeights: { whole: 0, half: 0, walking: 100 }, leadActivity: 1 },
    // sustained ninths: the most pad voices sounding at once
    lush: { padWeights: { sustain: 100, pulse: 0, arpeggio: 0 }, bassWeights: { whole: 100, half: 0, walking: 0 }, leadActivity: 1, padNotes: 5 },
    default: {},
};

// Note events with absolute times for `seconds` of music. Cached: a
// Generator builds its own (sleeping) instruments on the realtime context.
const planned = new Map();
function planEvents(settings, seconds) {
    const key = JSON.stringify([settings, seconds]);
    if (!planned.has(key)) {
        const gen = new Generator({ ...defaultSettings(), ...settings, seed: 42 });
        const meter = METERS[gen.settings.meter];
        const events = [];
        let t = 0.1;
        for (let bar = 0; t < seconds; bar++) {
            gen.currentBar = bar;
            gen.ensurePlanned(bar);
            const p = gen.plan.get(bar);
            const unit = 60 / unitsPerMinute(meter, p.bpm);
            p.events.forEach((e) => events.push({ ...e, time: t + e.beat * unit, dur: e.length * unit }));
            t += meter.units * unit;
        }
        planned.set(key, events.filter((e) => e.time < seconds - 1).sort((a, b) => a.time - b.time));
    }
    return planned.get(key);
}

const until = async (condition, ms = 5000) => {
    const end = performance.now() + ms;
    while (!condition() && performance.now() < end) await new Promise((r) => setTimeout(r, 10));
};

const setAll = (instruments, patch) => Object.values(instruments)
    .forEach((i) => Object.entries(patch).forEach(([key, value]) => i.set(key, value)));
const NO_EFFECTS = {
    distortionAmount: 0, flangerAmount: 0, chorusAmount: 0, phaserAmount: 0, bitCrushAmount: 0, delayAmount: 0,
    pingPongAmount: 0, reverbAmount: 0, eqLowGain: 0, eqHighGain: 0, masterFilterType: 'lowpass', masterFilterFreq: 11000,
};
const oscillators = (v) => [v.primaryOscillator, ...v.additionalOscillators, v.subOscillator, v.osc2];

// Each switches one part off (or back to how it was) to measure its share.
export const VARIANTS = {
    full: {},
    noNotes: { noNotes: true },
    noEffects: { tweak: (inst) => setAll(inst, NO_EFFECTS) },
    noReverb: { tweak: (inst) => setAll(inst, { reverbAmount: 0 }) },
    noChorus: { tweak: (inst) => setAll(inst, { chorusAmount: 0 }) },
    noDelays: { tweak: (inst) => setAll(inst, { delayAmount: 0, pingPongAmount: 0 }) },
    noVibrato: { tweak: (inst) => setAll(inst, { vibratoDepth: 0 }) },
    oneOscillator: { tweak: (inst) => setAll(inst, { voiceCount: 1 }) },
    // effects never sleep (as before chain sleeping)
    effectsAlwaysOn: { tweak: (inst) => Object.values(inst).forEach((i) => { i.tailSeconds = () => Infinity; i.wake(0); }) },
    // vibrato per sample (as before k-rate detune)
    aRateDetune: { tweak: (inst) => Object.values(inst).forEach((i) => i.voices.forEach((v) => oscillators(v).forEach((o) => { o.getOscillatorNode().detune.automationRate = 'a-rate'; }))) },
    kRateFilter: { tweak: (inst) => Object.values(inst).forEach((i) => i.voices.forEach((v) => { v.filter.getNode().detune.automationRate = 'k-rate'; })) },
};

/** One offline render of `scenario` with `variant` applied. */
export async function run({ scenario, seconds, variant = VARIANTS.full }) {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: SR * seconds, sampleRate: SR });
    const instruments = {};
    Object.entries(ROLES).forEach(([role, { polyphony, preset, volume }]) => {
        const inst = new Instrument({ polyphony, preset: findPreset(preset), context: ctx });
        inst.scheduleSleep = () => {};
        const gain = ctx.createGain();
        gain.gain.value = volume;
        inst.connect(gain);
        gain.connect(ctx.destination);
        instruments[role] = inst;
    });
    if (variant.tweak) variant.tweak(instruments, ctx);
    // impulses and worklet modules load asynchronously
    await until(() => Object.values(instruments).every((i) => i.reverb.amount === 0 || i.reverb.node.buffer));
    await new Promise((r) => setTimeout(r, 200));

    const events = variant.noNotes ? [] : planEvents(SCENARIOS[scenario], seconds);
    let next = 0;
    let awake = 0;
    let checks = 0;
    const book = (now) => {
        while (next < events.length && events[next].time < now + LOOKAHEAD) {
            const e = events[next++];
            instruments[e.role].scheduleNote(e.midi, Math.max(e.time, now), e.dur, e.velocity, e.detune);
        }
        Object.values(instruments).forEach((i) => i.sleepIdle());
        awake += Object.values(instruments).reduce((n, i) => n + i.awakeVoices(), 0);
        checks++;
    };
    for (let s = STEP; s < seconds; s += STEP) {
        ctx.suspend(s).then(() => {
            book(ctx.currentTime);
            ctx.resume();
        });
    }
    book(0);
    const start = performance.now();
    const buffer = await ctx.startRendering();
    const ms = performance.now() - start;
    Object.values(instruments).forEach((i) => clearTimeout(i.sleepTimer));
    let peak = 0;
    let sumSquares = 0;
    for (let c = 0; c < 2; c++) {
        buffer.getChannelData(c).forEach((x) => {
            peak = Math.max(peak, Math.abs(x));
            sumSquares += x * x;
        });
    }
    return { load: ms / (seconds * 1000), notes: events.length, awake: awake / checks, peak, rms: Math.sqrt(sumSquares / (2 * buffer.length)), buffer };
}

const out = document.getElementById('out');
const print = (line) => { out.textContent += `${line}\n`; };
const pct = (x) => `${(x * 100).toFixed(1)}%`.padStart(6);

async function table(params) {
    const seconds = Number(params.get('seconds') || 20);
    const reps = Number(params.get('reps') || 3);
    const scenarios = (params.get('scenarios') || 'busy,lush,default').split(',');
    const variants = (params.get('variants') || 'full,noNotes,noReverb').split(',');
    const results = [];
    print(`${seconds} s per render, median of ${reps}`);
    for (const scenario of scenarios) {
        for (const name of variants) {
            const runs = [];
            for (let r = 0; r < reps; r++) runs.push(await run({ scenario, seconds, variant: VARIANTS[name] }));
            runs.sort((a, b) => a.load - b.load);
            const { load, awake, notes, peak, rms } = runs[Math.floor(reps / 2)];
            results.push({ scenario, variant: name, load, min: runs[0].load, awake, notes, peak, rms });
            print(`${scenario.padEnd(8)} ${name.padEnd(16)} load ${pct(load)} (min ${pct(runs[0].load)})  voices awake ${awake.toFixed(1)}  peak ${peak.toFixed(2)}  rms ${rms.toFixed(3)}`);
        }
    }
    window.__results = results;
}

async function render(params) {
    const { buffer } = await run({
        scenario: params.get('scenarios') || 'default',
        seconds: Number(params.get('seconds') || 20),
        variant: VARIANTS[params.get('variant') || 'full'],
    });
    const samples = new Float32Array(buffer.length * 2);
    samples.set(buffer.getChannelData(0), 0);
    samples.set(buffer.getChannelData(1), buffer.length);
    const bytes = new Uint8Array(samples.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    window.__render = btoa(binary);
    print(`rendered ${buffer.duration} s`);
    window.__results = [];
}

const params = new URLSearchParams(window.location.search);
(params.get('mode') === 'render' ? render(params) : table(params)).catch((e) => {
    window.__error = String(e.stack || e);
    print(window.__error);
});
