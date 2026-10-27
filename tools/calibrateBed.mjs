// The bow-noise bed (docs/STRING_MODEL.md): what the recording has between the harmonic lines that the model, without a bed, does not.
// For every measured note: the recording's residual (analysis.js startShapeOf, harmonic lines masked) per stretch and third-octave band,
// minus the same residual of the model's own rendering of that note (the table in full, the page's default tuning, no bed); where the
// recording is more than 2.5 dB louder (a smaller difference is the scatter of measuring noise, and keeping only its positive half would add a bias), the difference in power is the bed (dB), otherwise nothing (-200). Written into the analysis file as `bed` per note.
// --leave-out: the model's rendering is made without the note's own pitch in the table (as an unmeasured pitch would be played), so the bed fills
// the gap that interpolation leaves rather than what a measured note already has.
// Usage: node tools/calibrateBed.mjs table.json take.wav timeline.json analysis.json [patch tuning name] [--leave-out]
import { readFileSync, writeFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderDecay, renderSustained } from '../src/app/engine/stringModel/synth.js';
import { findOnset, startShapeOf, BED_WINDOWS } from '../src/app/engine/stringModel/analysis.js';
import { defaultTuning, tunedModelFrom } from '../src/app/engine/stringModel/tuning.js';

const [tablePath, wavPath, timelinePath, analysisPath, patch = 'long'] = process.argv.slice(2);
const table = unpackTable(JSON.parse(readFileSync(tablePath, 'utf8'))), wav = readWav(wavPath), rate = wav.rate, timeline = JSON.parse(readFileSync(timelinePath, 'utf8')), analysis = JSON.parse(readFileSync(analysisPath, 'utf8'));
const tuning = defaultTuning(patch);
const unroll = (note) => { const L = note.loopEnd - note.loopStart, x = new Float32Array(3 * rate); for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; } return x; };
const pad = Math.round(.03 * rate);
for (const note of analysis.notes) {
    const e = timeline.events.find((ev) => ev.kind === 'held' && ev.pitch === note.pitch && ev.velocity === note.velocity); if (!e) continue;
    const onset = findOnset(wav.mono, rate, e.start - .05);
    const model = { ...tunedModelFrom({ ...table, pitches: table.pitches.map((p) => ({ ...p, layers: Object.fromEntries(Object.entries(p.layers).map(([v, l]) => { const { bed, ...rest } = l; return [v, rest]; })) })) }, note.pitch, note.velocity, tuning, process.argv.includes('--leave-out') ? note.pitch : null), f0: note.f0, bed: null, burst: false }   // the baseline has neither: with a bed the starting burst is not played, so the bed must make up what it carried;
    const body = analysis.mode === 'decay' ? renderDecay(model, rate).buffer : unroll(renderSustained(model, rate)), x = new Float32Array(body.length + pad); x.set(body, pad);
    note.bed = BED_WINDOWS.map(([a, b]) => {
        const r = startShapeOf(wav.mono, rate, onset, note.f0, a, b), m = startShapeOf(x, rate, .03, note.f0, a, b);
        return r.map((v, i) => {
            if (v == null) return null;
            const have = m[i] == null ? 0 : 10 ** (m[i] / 10), extra = 10 ** (v / 10) - have;
            return extra > .4 * 10 ** (v / 10) ? Math.round(10 * Math.log10(extra) * 10) / 10 : -200;
        });
    });
    console.log(`  ${note.pitch} v${note.velocity}`);
}
writeFileSync(analysisPath, JSON.stringify(analysis));
console.log(`${analysis.notes.length} notes`);
