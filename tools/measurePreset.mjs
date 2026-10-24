// Renders presets through the app's Instrument (headless Chrome, dry) on a reference take's sustained
// notes and prints the same measurements as the recording, side by side.
// Usage: node tools/measurePreset.mjs <instrument> <candidates.json> [recording.wav] [--origin=https://localhost:5176]
//   candidates.json: { "Name": {preset values}, ... } (values over the app's defaults)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { readWav } from './refAnalyze.mjs';
import { envelope, firstNoteOffset } from './refTimeline.mjs';
import { analyzeSustained } from './refWind.mjs';

const [instrument, candidatesFile, recording] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const origin = (process.argv.find((a) => a.startsWith('--origin=')) ?? '--origin=https://localhost:5176').slice(9);
const out = process.env.MEASURE_OUT ?? '.tmp/measured'; mkdirSync(out, { recursive: true });
const timeline = JSON.parse(readFileSync(`.tmp/reference-midi/${instrument}.timeline.json`, 'utf8'));
const events = timeline.events.filter((e) => e.kind === 'sustained'), seconds = events.at(-1).release + 4;
const candidates = JSON.parse(readFileSync(candidatesFile, 'utf8'));

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function summary(notes) {
    const by = (v) => notes.filter((n) => n.velocity === v);
    const slope = (ns) => mean(ns.map((x) => { const pts = x.harmonicsDb.slice(1, 12).map((y, i) => [Math.log2(i + 2), Math.max(y, -70)]); const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1])); return pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0); }));
    const rows = [35, 80, 120].map((v) => { const ns = by(v); return `v${String(v).padStart(3)}: lvl ${mean(ns.map((x) => x.levelDb)).toFixed(0).padStart(4)} dB  centroid ${mean(ns.map((x) => x.centroidHz)).toFixed(0).padStart(5)} Hz  slope ${slope(ns).toFixed(1).padStart(5)} dB/oct  to70% ${mean(ns.map((x) => x.reach70 ?? 0)).toFixed(2)} s  rel-40dB ${mean(ns.map((x) => x.release40 ?? 0)).toFixed(2)} s  vib ${mean(ns.map((x) => x.vibratoHz)).toFixed(1)} Hz ${mean(ns.map((x) => x.vibratoCents)).toFixed(1)} c  breath ${mean(ns.map((x) => x.breathDb)).toFixed(0)} dB`; });
    const profile = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => mean(by(80).map((x) => x.profile[i] ?? 0)).toFixed(0).padStart(3)).join(' ');
    return [...rows, `v 80 level over time (.05 .1 .2 .4 .8 1.5 2.5 3.5 s): ${profile}`, 'v 80 centroid by pitch: ' + by(80).map((x) => `${x.pitch}:${x.centroidHz.toFixed(0)}`).join('  ')];
}
const analyze = (wav) => { const env = envelope(wav), offset = firstNoteOffset(env, events[0].start) ?? 0; return events.map((e) => analyzeSustained(wav, env, e, offset)); };

let recorded = null;
if (recording) { recorded = analyze(readWav(recording)); console.log(`=== RECORDING ${instrument}`); summary(recorded).forEach((l) => console.log('  ' + l)); }
// rms difference of the first twelve harmonics (dB re the strongest, floored at -50), averaged over the notes
const ladderError = (notes) => mean(notes.map((n, i) => { const r = recorded[i].harmonicsDb.slice(0, 12), m = n.harmonicsDb.slice(0, 12); return Math.sqrt(mean(m.map((x, k) => (Math.max(x, -50) - Math.max(r[k], -50)) ** 2))); }));
const browser = await puppeteer.launch({ executablePath: process.env.SYNTH_BROWSER_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, acceptInsecureCerts: true, args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 600000 });
try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.goto(`${origin}/synths/`, { waitUntil: 'domcontentloaded' });
    for (const [name, preset] of Object.entries(candidates)) {
        const result = await page.evaluate(async (p, ev, s, live) => { const m = await import('/tools/measurePresetTake.js'); return (live ? m.renderLive : m.renderTake)(p, ev, s); }, preset, events, seconds, process.argv.includes('--live'));
        const mono = new Float32Array(Buffer.from(result.base64, 'base64').buffer.slice(0));
        const file = join(out, `${name.replace(/\W+/g, '_')}.f32`); writeFileSync(file, Buffer.from(mono.buffer));
        console.log(`=== PRESET ${name}`);
        const notes = analyze({ rate: result.sampleRate, mono });
        if (process.argv.includes('--brief')) console.log(`  ladder error ${recorded ? ladderError(notes).toFixed(1) : '-'} dB rms`);
        else { summary(notes).forEach((l) => console.log('  ' + l)); if (recorded) console.log(`  ladder error ${ladderError(notes).toFixed(1)} dB rms`); }
    }
} finally { await browser.close(); }
