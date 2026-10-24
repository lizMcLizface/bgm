// Reads a float/PCM WAV recording of a piano and lists its note onsets with level and pitch.
// Usage: node tools/refAnalyze.mjs file.wav
import { readFileSync } from 'node:fs';

export function readWav(path) {
    const b = readFileSync(path);
    let pos = 12, fmt = null, data = null;
    while (pos + 8 <= b.length) {
        const id = b.toString('ascii', pos, pos + 4), size = b.readUInt32LE(pos + 4);
        if (id === 'fmt ') fmt = { tag: b.readUInt16LE(pos + 8), channels: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
        if (id === 'data') { data = b.subarray(pos + 8, pos + 8 + Math.min(size, b.length - pos - 8)); break; }
        pos += 8 + size + (size & 1);
    }
    const { channels, bits, tag, rate } = fmt, frames = Math.floor(data.length / (channels * bits / 8)), mono = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
            const o = (i * channels + c) * bits / 8;
            sum += tag === 3 ? (bits === 32 ? data.readFloatLE(o) : data.readDoubleLE(o)) : bits === 16 ? data.readInt16LE(o) / 32768 : bits === 24 ? data.readIntLE(o, 3) / 8388608 : data.readInt32LE(o) / 2147483648;
        }
        mono[i] = sum / channels;
    }
    return { rate, mono };
}

export function onsets({ rate, mono }, { window = .01, rise = 9, quiet = 1e-4, gap = .25 } = {}) {
    const hop = Math.round(rate * window), env = [];
    for (let i = 0; i + hop < mono.length; i += hop) { let s = 0; for (let j = 0; j < hop; j++) s += mono[i + j] ** 2; env.push(Math.sqrt(s / hop)); }
    const out = [];
    for (let i = 3; i < env.length - 3; i++) {
        const before = Math.max(quiet, Math.min(...env.slice(Math.max(0, i - 10), i)) * 1.0, env.slice(Math.max(0, i - 6), i).reduce((a, b) => a + b, 0) / 6);
        if (env[i] > before * rise * .35 && env[i] > env[i - 1] && env[i] > 5e-3 && (!out.length || (i - out[out.length - 1].index) * window > gap)) out.push({ index: i, time: i * window });
    }
    return { onsets: out, env, window };
}

if (process.argv[1] && process.argv[1].endsWith('refAnalyze.mjs') && process.argv[2]) {
    const wav = readWav(process.argv[2]), { onsets: list, env, window } = onsets(wav);
    console.log(`${(wav.mono.length / wav.rate).toFixed(1)} s at ${wav.rate} Hz; peak ${wav.mono.reduce((m, x) => Math.max(m, Math.abs(x)), 0).toFixed(3)}`);
    for (const o of list) console.log(`t=${o.time.toFixed(2)}s  peak env ${Math.max(...env.slice(o.index, o.index + 30)).toFixed(4)}  floor before ${Math.min(...env.slice(Math.max(0, o.index - 20), o.index)).toFixed(5)}`);
}
