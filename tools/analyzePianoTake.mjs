// Measures every note of a recorded piano take (rendered from tools/makePianoCalibrationMidi.mjs or
// makePianoBassMidi.mjs) into the parameter set src/app/engine/pianoModel/analysis.js describes.
//   node tools/analyzePianoTake.mjs take.wav take.timeline.json out.json [--kinds held,short] [--pitches 36,48]
//        [--velocities 40,80,115] [--rate 48000] [--offset seconds]
// The WAV can be huge (96 kHz float stereo, many minutes): notes are read straight from the file, never all at once.
import { closeSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { analyzeNote } from '../src/app/engine/pianoModel/analysis.js';
import { decimate } from '../src/app/engine/pianoModel/dsp.js';

/** Header of a PCM or float WAV: where the samples start and how to read them. */
export function wavInfo(path) {
    const fd = openSync(path, 'r'), head = Buffer.alloc(8192);
    readSync(fd, head, 0, head.length, 0);
    let pos = 12, fmt = null, data = null;
    while (pos + 8 <= head.length) {
        const id = head.toString('ascii', pos, pos + 4), size = head.readUInt32LE(pos + 4);
        if (id === 'fmt ') {
            let tag = head.readUInt16LE(pos + 8);
            if (tag === 0xfffe) tag = head.readUInt16LE(pos + 8 + 24);          // extensible: the sub-format
            fmt = { tag, channels: head.readUInt16LE(pos + 10), rate: head.readUInt32LE(pos + 12), bits: head.readUInt16LE(pos + 22) };
        }
        if (id === 'data') { data = { start: pos + 8, bytes: size }; break; }
        pos += 8 + size + (size & 1);
    }
    if (!fmt || !data) throw new Error(`${path}: no fmt/data chunk`);
    const frameBytes = fmt.channels * fmt.bits / 8;
    return { fd, ...fmt, dataStart: data.start, frames: Math.floor(Math.min(data.bytes, 2 ** 40) / frameBytes) };
}

/** `seconds` of the take from `start`, channels averaged to mono. */
export function readSegment(info, start, seconds) {
    const from = Math.max(0, Math.round(start * info.rate)), frames = Math.min(info.frames - from, Math.round(seconds * info.rate));
    const frameBytes = info.channels * info.bits / 8, buf = Buffer.alloc(frames * frameBytes);
    readSync(info.fd, buf, 0, buf.length, info.dataStart + from * frameBytes);
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < info.channels; c++) {
            const o = (i * info.channels + c) * info.bits / 8;
            sum += info.tag === 3 ? (info.bits === 32 ? buf.readFloatLE(o) : buf.readDoubleLE(o))
                : info.bits === 16 ? buf.readInt16LE(o) / 32768 : info.bits === 24 ? buf.readIntLE(o, 3) / 8388608 : buf.readInt32LE(o) / 2147483648;
        }
        out[i] = sum / info.channels;
    }
    return out;
}

/** Seconds from the start of the take at which the first sound begins (the sampler's start and any latency, against the timeline). */
export function findFirstSound(info, within = 10) {
    const x = readSegment(info, 0, within), hop = Math.round(info.rate * .002);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    for (let i = 0; i + hop < x.length; i += hop) {
        let s = 0;
        for (let j = 0; j < hop; j++) s += x[i + j] ** 2;
        if (Math.sqrt(s / hop) > peak * .02) return i / info.rate;
    }
    return null;
}

const list = (flag) => { const i = process.argv.indexOf(flag); return i < 0 ? null : process.argv[i + 1].split(',').map(Number); };
const value = (flag, fallback) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };

if (process.argv[1]?.endsWith('analyzePianoTake.mjs')) {
    const [wavPath, timelinePath, outPath] = process.argv.slice(2, 5);
    if (!outPath) { console.error('usage: node tools/analyzePianoTake.mjs take.wav take.timeline.json out.json [--kinds held,short] [--pitches ..] [--velocities ..] [--rate 48000] [--offset s]'); process.exit(1); }
    const info = wavInfo(wavPath), timeline = JSON.parse(readFileSync(timelinePath, 'utf8')).events;
    const kinds = value('--kinds', 'held,low,sustained,short').split(','), pitches = list('--pitches'), velocities = list('--velocities');
    const targetRate = Number(value('--rate', 48000)), factor = Math.max(1, Math.round(info.rate / targetRate)), rate = info.rate / factor;
    const first = findFirstSound(info);
    const offset = Number(value('--offset', first === null ? 0 : first - timeline[0].start));
    console.error(`${wavPath}: ${info.rate} Hz ${info.channels} ch ${info.bits}-bit ${info.tag === 3 ? 'float' : 'int'}, ${(info.frames / info.rate).toFixed(1)} s; analysing at ${rate} Hz; take starts ${offset.toFixed(4)} s late`);
    const notes = [];
    const chosen = timeline.filter((e) => kinds.includes(e.kind) && (!pitches || pitches.includes(e.pitch)) && (!velocities || velocities.includes(e.velocity)));
    let done = 0;
    for (const e of chosen) {
        const held = e.release - e.start, pre = .06;
        const raw = readSegment(info, e.start + offset - pre, pre + held + 2.2);
        const x = decimate(raw, factor);
        const analysis = analyzeNote(x, rate, { midi: e.pitch, held });
        notes.push({ kind: e.kind, pitch: e.pitch, velocity: e.velocity, start: e.start, held, analysis: { ...analysis, onset: analysis.onset - pre } });
        process.stderr.write(`\r${++done}/${chosen.length} midi ${e.pitch} vel ${e.velocity} ${e.kind}: ${analysis.partials.length} partials    `);
    }
    process.stderr.write('\n');
    const round = (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toPrecision(6)) : v);
    writeFileSync(outPath, JSON.stringify({ source: wavPath, rate, offset, notes }, round));
    console.error(`wrote ${notes.length} notes to ${outPath}`);
}
