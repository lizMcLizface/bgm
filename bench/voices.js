// What each built-in voice costs the audio thread, ranked: every preset in
// src/library/voices.json plays the same busy line (a three-note chord every
// half second, plus a held one) on a pad-sized Instrument in an
// OfflineAudioContext, and the render is timed (load = render time / audio
// time; offline numbers read higher than realtime ones for convolution, so
// compare presets with each other). Use it before adding a voice, to see
// whether it is much heavier than its neighbours.
//
// npm run dev, open /bench/voices.html?seconds=8 (add &category=Pads to limit).
// Results land in window.__voices.

import Instrument from '../src/app/engine/Instrument';
import voices from '../src/library/voices.json';

const SR = 48000;
const STEP = 0.25;
const params = new URLSearchParams(window.location.search);
const seconds = Number(params.get('seconds') || 8);
const only = params.get('category');
const out = document.getElementById('out');
const print = (line) => { out.textContent += `${line}\n`; };

const until = async (condition, ms = 5000) => {
    const end = performance.now() + ms;
    while (!condition() && performance.now() < end) await new Promise((r) => setTimeout(r, 10));
};

async function cost(preset) {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: SR * seconds, sampleRate: SR });
    const inst = new Instrument({ polyphony: 4, preset, context: ctx });
    inst.scheduleSleep = () => {};
    inst.connect(ctx.destination);
    await until(() => inst.reverb.settled);
    await new Promise((r) => setTimeout(r, 100));
    const events = [];
    const chords = [[57, 60, 64], [55, 59, 62], [53, 57, 60], [55, 59, 62]];
    for (let t = 0.1, i = 0; t < seconds - 1; t += 0.5, i++) chords[Math.floor(t / 2) % 4].forEach((m, k) => events.push({ t: t + k * 0.02, midi: m + 12 * (i % 2), dur: 0.9 }));
    let next = 0;
    const book = (now) => {
        while (next < events.length && events[next].t < now + 0.5) {
            const e = events[next++];
            inst.scheduleNote(e.midi, Math.max(e.t, now), e.dur, 0.7);
        }
        inst.sleepIdle();
    };
    for (let s = STEP; s < seconds; s += STEP) ctx.suspend(s).then(() => { book(ctx.currentTime); ctx.resume(); });
    book(0);
    const start = performance.now();
    await ctx.startRendering();
    const ms = performance.now() - start;
    clearTimeout(inst.sleepTimer);
    return ms / (seconds * 1000);
}

(async () => {
    const results = [];
    for (const [category, presets] of Object.entries(voices)) {
        if (only && only !== category) continue;
        for (const [name, preset] of Object.entries(presets)) {
            const load = (await cost(preset) + await cost(preset)) / 2;
            results.push({ category, name, load, voiceCount: preset.voiceCount || 1, reverb: preset.reverbAmount || 0 });
        }
    }
    results.sort((a, b) => b.load - a.load);
    window.__voices = results;
    results.forEach((r) => print(`${(r.load * 100).toFixed(1).padStart(5)}%  ${r.name.padEnd(22)} ${r.category.padEnd(14)} unison ${r.voiceCount}  reverb ${r.reverb}`));
})().catch((e) => { window.__error = String(e.stack || e); print(window.__error); });
