import fs from 'node:fs';
import path from 'node:path';
import { readWav } from '../src/synths/wav.js';
import { powerSpectrum } from '../src/synth-lab/spectral.js';

// Descriptive diagnostics, not an optimizer. Re-run when local band WAVs change.
const directory = process.argv[2] ?? 'rain_synth/bands';
const rows = [];
const correlation = (a, b, lag = 0) => {
    const n = Math.min(a.length, b.length) - lag;
    let x = 0, y = 0, xx = 0, yy = 0, xy = 0;
    for (let i = 0; i < n; i++) { const u = a[i], v = b[i + lag]; x += u; y += v; xx += u * u; yy += v * v; xy += u * v; }
    return (xy - x * y / n) / Math.sqrt(Math.max(1e-30, (xx - x * x / n) * (yy - y * y / n)));
};
for (const file of fs.readdirSync(directory).filter(f => /^(rain|tin)_band\d_(ref|synth)\.wav$/.test(f)).sort()) {
    const { channels, sampleRate: rate } = readWav(fs.readFileSync(path.join(directory, file)));
    const n = channels[0].length, window = Math.round(rate * .02), envelope = [];
    let sum = 0, peak = 0;
    for (let start = 0; start + window <= n; start += window) {
        let energy = 0;
        for (const ch of channels) for (let i = start; i < start + window; i++) { energy += ch[i] ** 2; peak = Math.max(peak, Math.abs(ch[i])); }
        sum += energy; envelope.push(Math.sqrt(energy / (window * channels.length)));
    }
    const mean = envelope.reduce((a, b) => a + b, 0) / envelope.length;
    const variance = envelope.reduce((s, v) => s + (v - mean) ** 2, 0) / envelope.length;
    const rms = Math.sqrt(sum / (envelope.length * window * channels.length));
    const power = new Float64Array(4097);
    for (const ch of channels) for (let offset = 0; offset + 8192 <= n; offset += 16384) {
        const p = powerSpectrum(ch, rate, { offset, size: 8192 }).power;
        for (let i = 0; i < p.length; i++) power[i] += p[i];
    }
    const total = power.reduce((s, x) => s + x, 0); let cumulative = 0, medianHz = 0;
    for (let i = 0; i < power.length; i++) { cumulative += power[i]; if (cumulative >= total / 2) { medianHz = i * rate / 8192; break; } }
    const round = n => Number(n.toFixed(4));
    rows.push({ file, seconds: round(n / rate), rate, rms: round(rms), crest: round(peak / rms),
        medianHz: Math.round(medianHz), stereoCorrelation: round(correlation(channels[0], channels[1] ?? channels[0])),
        envelopeCV: round(Math.sqrt(variance) / mean),
        envelopeAC: Object.fromEntries([.1, .5, 2].map(seconds => [seconds, round(correlation(envelope, envelope, Math.round(seconds / .02)))])) });
}
fs.mkdirSync('src/ambient', { recursive: true });
fs.writeFileSync('src/ambient/referenceMetrics.json', JSON.stringify(rows, null, 2) + '\n');
console.table(rows.map(({ file, medianHz, crest, envelopeCV, envelopeAC }) => ({ file, medianHz, crest, envelopeCV, ac100ms: envelopeAC[.1], ac500ms: envelopeAC[.5] })));
