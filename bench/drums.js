// What the drums cost the audio thread: every style, on the felt and the crisp
// kit, rendered through the DrumKit in an OfflineAudioContext (the notes come
// from percussion.js's drumBar, 136 BPM) and timed; and the kit on its own
// with no hits. load = render time / audio time. npm run dev, open
// /bench/drums.html?seconds=12.

import DrumKit from '../src/app/engine/drumKit';
import { drumBar, DRUM_STYLES, defaultDrumKit } from '../src/app/percussion';
import { METERS } from '../src/app/meter';

const SR = 48000;
const STEP = 0.25;
const BPM = 136;
const seconds = Number(new URLSearchParams(window.location.search).get('seconds') || 12);
const out = document.getElementById('out');
const print = (line) => { out.textContent += `${line}\n`; };

async function cost(style, kitName) {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: SR * seconds, sampleRate: SR });
    const kit = new DrumKit({ context: ctx });
    kit.scheduleSleep = () => {};
    kit.setKit(defaultDrumKit());
    kit.connect(ctx.destination);
    kit.reverb.hear();
    await new Promise((r) => setTimeout(r, 300));
    const meter = METERS['4/4'];
    const beat = 60 / BPM;
    const hits = [];
    for (let bar = 0; bar * 4 * beat < seconds - 1; bar++) {
        if (style === 'none') break;
        drumBar({
            bar, meter, drums: { style, activity: 0.7, variation: 0.5, sprinkle: 0.2, kit: kitName }, section: null, sectionsMode: 'off', phraseStart: bar - (bar % 4), seed: 7,
        }).forEach((e) => hits.push({ t: 0.1 + bar * 4 * beat + e.beat * beat, e }));
    }
    let next = 0;
    const book = (now) => {
        while (next < hits.length && hits[next].t < now + 0.5) {
            const { t, e } = hits[next++];
            kit.scheduleNote(e.midi, Math.max(t, now), 0.25, e.velocity, e.detune);
        }
    };
    for (let s = STEP; s < seconds; s += STEP) ctx.suspend(s).then(() => { book(ctx.currentTime); ctx.resume(); });
    book(0);
    const start = performance.now();
    await ctx.startRendering();
    const ms = performance.now() - start;
    return { load: ms / (seconds * 1000), hits: hits.length };
}

(async () => {
    const results = [];
    for (const style of ['none', ...Object.keys(DRUM_STYLES).filter((s) => s !== 'off')]) {
        for (const kitName of style === 'none' ? ['felt'] : ['felt', 'crisp']) {
            const a = await cost(style, kitName);
            const b = await cost(style, kitName);
            const load = (a.load + b.load) / 2;
            results.push({ style, kit: kitName, load, hits: a.hits });
            print(`${style.padEnd(10)} ${kitName.padEnd(6)} ${(load * 100).toFixed(1).padStart(5)}%   ${(a.hits / seconds).toFixed(1).padStart(5)} hits/s`);
        }
    }
    window.__drums = results;
})().catch((e) => { window.__error = String(e.stack || e); print(window.__error); });
