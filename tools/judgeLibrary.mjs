// Judges the audio of every preset and stores the result for the presetter table (src/presetter/judgements.json).
// Renders are made by `npm run render` (MP3s in one folder, named <preset slug>-<minutes>m); tools/judgeAudio.py measures them
// (loudness, spectrum, Essentia and CLAP tags). Run through vite-node, from the repo root:
//
//   npx vite-node tools/judgeLibrary.mjs -- [--renders .tmp/judge-renders] [--reuse]      (--reuse: keep the last judgeAudio output)
//
// Needs the Python environment from tools/judgeAudio.py (.tmp/judge-venv).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SCENES, sceneSlug } from '../src/app/scenes.js';

const arg = (key, fallback) => { const i = process.argv.indexOf('--' + key); return i < 0 ? fallback : process.argv[i + 1]; };
const dir = path.resolve(arg('renders', '.tmp/judge-renders')), raw = path.join(dir, 'judgements.raw.json');
const python = path.resolve('.tmp/judge-venv/Scripts/python.exe');

if (!process.argv.includes('--reuse')) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).map((f) => path.join(dir, f));
    console.log(`judging ${files.length} renders`);
    const run = spawnSync(python, ['tools/judgeAudio.py', ...files, '--json', raw, '--top', '5'], { stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 1 << 28 });
    if (run.status !== 0) throw new Error('judgeAudio.py failed');
}
const results = JSON.parse(fs.readFileSync(raw, 'utf8'));
const bySlug = new Map(SCENES.map((s) => [sceneSlug(s.name), s.name]));
const pairs = (o, n) => Object.entries(o ?? {}).slice(0, n);
const out = {}, missing = [];
for (const [stem, r] of Object.entries(results)) {
    const name = bySlug.get(stem.replace(/-[\d.]+m$/, ''));
    if (!name) { missing.push(stem); continue; }
    const t = r.technical, e = r.essentia ?? {}, positive = (head) => Object.values(e[head] ?? {})[0];
    out[name] = {
        lufs: t.lufs, range: t.loudness_range_db, quietest: t.quietest_3s_lufs, peak: t.peak_db, centroid: t.centroid_hz,
        bands: Object.values(t.bands), onsets: t.onsets_per_s, silent: t.near_silent_fraction, tempo: t.tempo_bpm_guess, stereo: t.stereo_correlation,
        feel: Object.fromEntries(['happy', 'sad', 'relaxed', 'aggressive', 'party', 'acoustic', 'electronic', 'danceability', 'voice_instrumental']
            .map((h) => [h === 'danceability' ? 'danceable' : h === 'voice_instrumental' ? 'instrumental' : h, positive(h.startsWith('d') || h.startsWith('v') ? h : 'mood_' + h)])
            .filter(([, p]) => p != null)),
        styles: pairs(e.styles, 5), moodThemes: pairs(e.mtg_jamendo_moodtheme, 5), instruments: pairs(e.mtg_jamendo_instrument, 5), genres: pairs(e.mtg_jamendo_genre, 5),
        clap: Object.fromEntries(Object.entries(r.clap ?? {}).map(([g, v]) => [g, pairs(v, 4)])), variation: r.clap_variation,
    };
}
const sorted = Object.fromEntries(SCENES.filter((s) => out[s.name]).map((s) => [s.name, out[s.name]]));
fs.writeFileSync('src/presetter/judgements.json', JSON.stringify({ generated: new Date().toISOString().slice(0, 10), presets: sorted }, null, 1) + '\n');
console.log(`${Object.keys(sorted).length} of ${SCENES.length} presets judged${missing.length ? `; no preset for: ${missing.join(', ')}` : ''}`);
const noRender = SCENES.filter((s) => !out[s.name]).map((s) => s.name);
if (noRender.length) console.log(`not rendered: ${noRender.join(', ')}`);
