// Renders the real-time string (realtime.js) offline in headless Chrome next to the rendered note, and compares level and band levels;
// writes both as WAVs to renders/cello-reference/ab/. Needs a dev server.  Usage: node tools/checkRealtimeStrings.mjs [origin] [midi...]
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const origin = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5173', pitches = process.argv.slice(2).filter((a) => !a.startsWith('http')).map(Number);
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(origin + '/synths/strings/', { waitUntil: 'networkidle0' });
mkdirSync('renders/cello-reference/ab', { recursive: true });
const wav = (x, rate) => { const b = Buffer.alloc(44 + x.length * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(x.length * 4, 40); x.forEach((v, i) => b.writeFloatLE(v, 44 + i * 4)); return b; };
for (const midi of pitches.length ? pitches : [48, 60, 72]) for (const parts of ['full', 'smooth']) {
    const r = await page.evaluate(async (midi, parts) => {
        const { default: RealtimeStrings } = await import('/src/app/engine/stringModel/realtime.js');
        const { default: StringPlayer, DEFAULT_TUNING } = await import('/src/app/engine/stringModel/player.js');
        const rate = 48000, seconds = 4, tuning = { ...DEFAULT_TUNING, parts };
        const ctx = new OfflineAudioContext(1, rate * seconds, rate);
        const rt = new RealtimeStrings(ctx).connect(ctx.destination);
        rt.setTuning(tuning); await rt.ready;
        const started = performance.now();
        rt.start('long', midi, 80 / 127);
        const built = performance.now() - started;
        setTimeout(() => {}, 0);
        const heard = await ctx.startRendering();
        const other = new StringPlayer(new OfflineAudioContext(1, 1, rate)); other.setTuning(tuning);
        const ref = other.note('long', midi, 80).made.buffer;
        return { rt: Array.from(heard.getChannelData(0)), ref: Array.from(ref.slice(0, rate * seconds)), built, stats: rt.stats };
    }, midi, parts);
    const rms = (x, a, b) => Math.sqrt(x.slice(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
    const db = (v) => (20 * Math.log10(v)).toFixed(1);
    console.log(`midi ${midi} ${parts}: realtime rms ${db(rms(r.rt, 48000, 144000))} dB, rendered ${db(rms(r.ref, 48000, 144000))} dB; peak rt ${r.rt.reduce((m, v) => Math.max(m, Math.abs(v)), 0).toFixed(3)}; start() ${r.built.toFixed(0)} ms (table ${r.stats.tableMs} ms, body ${r.stats.bodyMs} ms)`);
    writeFileSync(`renders/cello-reference/ab/rt-${midi}-${parts}.wav`, wav(Float32Array.from(r.rt), 48000));
    writeFileSync(`renders/cello-reference/ab/rendered-${midi}-${parts}.wav`, wav(Float32Array.from(r.ref), 48000));
}
console.log('errors', errors);
await browser.close();
