// Which parts of a voice cost the audio thread most: every built-in voice is
// rendered as in voices.js, once as it is and once with one part switched off
// (an effect at 0, the unison at 1, vibrato / filter LFO off), and the saving
// is averaged over the voices that use that part. Offline numbers: compare
// parts with each other. npm run dev, open /bench/effects.html?seconds=6.

import Instrument from '../src/app/engine/Instrument';
import voices from '../src/library/voices.json';

const SR = 48000;
const STEP = 0.25;
const seconds = Number(new URLSearchParams(window.location.search).get('seconds') || 6);
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

const PARTS = {
    chorus: { uses: (p) => p.chorusAmount > 0, off: { chorusAmount: 0 } },
    phaser: { uses: (p) => p.phaserAmount > 0, off: { phaserAmount: 0 } },
    flanger: { uses: (p) => p.flangerAmount > 0, off: { flangerAmount: 0 } },
    delay: { uses: (p) => p.delayAmount > 0 || p.pingPongAmount > 0, off: { delayAmount: 0, pingPongAmount: 0 } },
    distortion: { uses: (p) => p.distortionAmount > 0, off: { distortionAmount: 0 } },
    bitcrush: { uses: (p) => p.bitCrushAmount > 0, off: { bitCrushAmount: 0 } },
    vibrato: { uses: (p) => p.vibratoDepth > 0, off: { vibratoDepth: 0 } },
    filterLfo: { uses: (p) => p.filterLfoDepth > 0, off: { filterLfoDepth: 0 } },
    tremolo: { uses: (p) => p.tremoloDepth > 0 || p.autoPanDepth > 0, off: { tremoloDepth: 0, autoPanDepth: 0 } },
    noise: { uses: (p) => p.noiseMix > 0, off: { noiseMix: 0 } },
    unison: { uses: (p) => (p.voiceCount || 1) > 1, off: { voiceCount: 1 } },
    osc2: { uses: (p) => p.osc2Amount > 0, off: { osc2Amount: 0 } },
    reverb: { uses: (p) => p.reverbAmount >= 0.08, off: { reverbAmount: 0 } },
};

(async () => {
    const all = Object.values(voices).flatMap((presets) => Object.values(presets));
    const base = [];
    for (const preset of all) base.push(await cost(preset));
    print(`${all.length} voices, mean cost ${(base.reduce((a, b) => a + b, 0) / base.length * 100).toFixed(1)}% of a core`);
    const rows = [];
    for (const [name, { uses, off }] of Object.entries(PARTS)) {
        let saved = 0;
        let n = 0;
        for (let i = 0; i < all.length; i++) {
            if (!uses(all[i])) continue;
            saved += base[i] - await cost({ ...all[i], ...off });
            n++;
        }
        rows.push({ name, voices: n, saved: n ? saved / n : 0 });
    }
    rows.sort((a, b) => b.saved - a.saved);
    window.__effects = rows;
    rows.forEach((r) => print(`${(r.saved * 100).toFixed(2).padStart(6)}% saved per voice using it   ${r.name.padEnd(11)} (${r.voices} of ${all.length} voices)`));
})().catch((e) => { window.__error = String(e.stack || e); print(window.__error); });
