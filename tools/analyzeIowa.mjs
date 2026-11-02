// Cuts the Iowa scale recordings into notes and measures every note into src/library/iowaTables/<patch>.json, the only part of them
// that ships (docs/IOWA_INSTRUMENTS.md). The notes go to banks/iowa/notes/<patch>/<dynamic>-<midi>.wav, git-ignored, for the page's A/B.
//   node tools/analyzeIowa.mjs [--only flute,oboe]     after tools/fetchIowa.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATCHES } from '../src/app/engine/iowaModel/patches.js';
import { readWav } from './refAnalyze.mjs';
import { parseName, parseVscoName, layerNames, measureRoll, heldStart, segmentHeld, segmentStruck, silenceBands, findPitch, analyzeHeld, analyzeDecay } from '../src/app/engine/iowaModel/analysis.js';

const arg = (flag) => { const i = process.argv.indexOf(flag); return i < 0 ? null : process.argv[i + 1]; };
const only = arg('--only')?.split(','), OUT = 'src/library/iowaTables', NOTES = 'banks/iowa/notes';
mkdirSync(OUT, { recursive: true });

/** Mono float samples and rate of an AIFF or AIFC file. */
function readAiff(path) {
    const b = readFileSync(path);
    if (b.toString('ascii', 0, 4) !== 'FORM') throw new Error(`not AIFF: ${path}`);
    const compressed = b.toString('ascii', 8, 12) === 'AIFC';
    let pos = 12, channels, frames, bits, rate, little = false, data;
    while (pos + 8 <= b.length) {
        const id = b.toString('ascii', pos, pos + 4), size = b.readUInt32BE(pos + 4);
        if (id === 'COMM') {
            channels = b.readInt16BE(pos + 8); frames = b.readUInt32BE(pos + 10); bits = b.readInt16BE(pos + 14);
            const exponent = b.readUInt16BE(pos + 16) & 0x7fff, mantissa = b.readUInt32BE(pos + 18);
            rate = Math.round(mantissa * 2 ** (exponent - 16383 - 31));
            if (compressed) little = b.toString('ascii', pos + 26, pos + 30) === 'sowt';
        }
        if (id === 'SSND') data = pos + 16 + b.readUInt32BE(pos + 8);
        pos += 8 + size + (size & 1);
    }
    const bytes = bits >> 3, available = Math.min(frames, Math.floor((b.length - data) / (bytes * channels))), mono = new Float32Array(available);
    for (let i = 0; i < available; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
            const at = data + (i * channels + c) * bytes;
            if (bytes === 2) sum += (little ? b.readInt16LE(at) : b.readInt16BE(at)) / 32768;
            else if (bytes === 3) sum += (little ? b.readIntLE(at, 3) : b.readIntBE(at, 3)) / 8388608;
            else if (bytes === 4) sum += (little ? b.readInt32LE(at) : b.readInt32BE(at)) / 2147483648;
            else throw new Error(`${bits}-bit AIFF: ${path}`);
        }
        mono[i] = sum / channels;
    }
    return { mono, rate };
}

function writeWav(path, x, rate) {
    const head = Buffer.alloc(44), body = Buffer.alloc(x.length * 2);
    head.write('RIFF', 0); head.writeUInt32LE(36 + body.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
    head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(body.length, 40);
    for (let i = 0; i < x.length; i++) body.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), i * 2);
    writeFileSync(path, Buffer.concat([head, body]));
}

const tenth = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const ints = (list, low = -99, high = 99) => list.map((v) => Math.max(low, Math.min(high, Math.round(v))));
const packHeld = (m) => ({
    m: m.midi, c: Math.round(m.cents), l: tenth(m.level), h: ints(m.harmonics), s: m.slices.map((row) => ints(row, -40, 40)),
    e: ints(m.envelope, -70), j: m.joined ? 1 : 0, r: ints(m.release, -70), n: ints(m.noise), b: ints(m.burst),
    v: [tenth(m.rate), tenth(m.depth), tenth(m.tremolo), tenth(m.pitchWander), tenth(m.levelWander)],
});
const packDecay = (m) => ({
    m: m.midi, l: tenth(m.level), d: tenth(m.seconds), b: ints(m.burst),
    p: m.partials.map((p) => [Math.round(p.ratio * 1e4) / 1e4, tenth(p.level), Math.round(p.rise * 1e3), tenth(p.early), tenth(p.late)]),
});

/** A VSCO patch: one note per file, so there is nothing to cut; a file more than 70 cents from its name moves to the octave it plays, or is dropped. */
function vscoLayers(patch, report) {
    const folder = join('banks/vsco', patch.folder), layers = {};
    const files = readdirSync(folder).filter((f) => /\.wav$/i.test(f)).map((f) => ({ file: f, ...parseVscoName(f) })).filter((f) => f.midi);
    const names = layerNames(files.map((f) => f.layer));
    for (const f of files) {
        const { mono: whole, rate } = readWav(join(folder, f.file)), midi = f.midi, mono = patch.decay ? whole : whole.subarray(heldStart(whole, rate, midi));
        if (!patch.decay) {
            const off = (m) => Math.abs(1200 * Math.log2(findPitch(mono, rate, Math.round(mono.length / 4), mono.length >> 1, 440 * 2 ** ((m - 69) / 12), 90) / (440 * 2 ** ((m - 69) / 12))));
            if (off(midi) > 70) { report.pitch++; continue; }
        }
        const found = patch.decay ? analyzeDecay(mono, rate, midi, null) : analyzeHeld(mono, rate, midi, null);
        if (!found) { report.pitch++; continue; }
        (layers[names[f.layer]] ??= {})[midi] = { from: midi, measured: patch.decay ? packDecay(found) : packHeld(found) };
        writeWav(join(NOTES, patch.id, `${names[f.layer]}-${midi}.wav`), mono, rate);
    }
    return layers;
}

/** How a patch's roll recordings go, the typical note of each; the notes are cut for the page's A/B as well. */
function measureRolls(patch) {
    const folder = join('banks/iowa', patch.folder), found = [];
    mkdirSync(join(NOTES, patch.rollId), { recursive: true });
    for (const file of readdirSync(folder).filter((f) => patch.rollFiles.test(f))) {
        const f = parseName(file);
        if (f.from === null) continue;
        const { mono, rate } = readAiff(join(folder, file));
        segmentHeld(mono, rate, f.from, f.to).forEach((span, i) => {
            if (!span) return;
            const note = mono.subarray(span[0], span[1]), roll = measureRoll(note, rate);
            if (roll) found.push(roll);
            writeWav(join(NOTES, patch.rollId, `${f.dynamic}-${f.from + i}.wav`), note, rate);
        });
    }
    if (!found.length) return null;
    const typical = (key) => { const list = found.map((r) => r[key]).sort((a, b) => a - b); return Math.round(list[list.length >> 1] * 100) / 100; };
    return { rate: typical('rate'), timing: typical('timing'), level: typical('level'), notes: found.length };
}

for (const patch of PATCHES.filter((p) => !p.uses && (!only || only.includes(p.id)))) {
    const folder = join('banks/iowa', patch.folder ?? '');
    if (!existsSync(patch.source === 'vsco' ? join('banks/vsco', patch.folder) : folder)) { console.log(`${patch.id}: not downloaded`); continue; }
    const files = patch.source === 'vsco' ? [] : readdirSync(folder).filter((f) => /\.aiff?$/i.test(f) && (!patch.match || patch.match.test(f))).map((f) => ({ file: f, ...parseName(f) })).filter((f) => f.from !== null);
    mkdirSync(join(NOTES, patch.id), { recursive: true });
    const report = { pitch: 0 }, layers = patch.source === 'vsco' ? vscoLayers(patch, report) : {};
    for (const f of files) {
        const { mono, rate } = readAiff(join(folder, f.file));
        const spans = (patch.decay ? segmentStruck : segmentHeld)(mono, rate, f.from, f.to);
        // the floor: what lies between notes; struck notes that never go quiet between strikes have it in the last fifth of each, but a held note's tail is the note
        const present = spans.filter(Boolean), gaps = present.slice(1).map(([start], i) => [present[i][1], start]).filter(([a, b]) => b - a > 8192);
        const floor = silenceBands(mono, rate, gaps.length || !patch.decay ? gaps : present.map(([a, b]) => [Math.round(b - (b - a) / 5), b]));
        spans.forEach((span, i) => {
            if (!span || span[1] - span[0] < rate * .15) { report.pitch++; return; }
            const midi = f.from + i, cut = mono.subarray(span[0], span[1]), note = patch.decay ? cut : cut.subarray(heldStart(cut, rate, midi)), named = 440 * 2 ** ((midi - 69) / 12);
            if (note.length < rate * .25) { report.pitch++; return; }
            if (!patch.decay && Math.abs(1200 * Math.log2(findPitch(note, rate, Math.round(note.length / 4), note.length >> 1, named, 150) / named)) > 70) { report.pitch++; return; }
            const layer = layers[f.dynamic] ??= {}, held = layer[midi];
            // the same pitch on several strings: the one played nearest its nut, the file whose scale starts highest
            if (held && f.from < held.from) return;
            const found = patch.decay ? analyzeDecay(note, rate, midi, floor) : analyzeHeld(note, rate, midi, floor);
            if (!found) { report.pitch++; return; }
            const measured = patch.decay ? packDecay(found) : packHeld(found);
            layer[midi] = { from: f.from, measured };
            writeWav(join(NOTES, patch.id, `${f.dynamic}-${midi}.wav`), note, rate);
        });
    }
    const table = { id: patch.id, name: patch.name, decay: !!patch.decay, ring: !!patch.ring, roll: patch.rollFiles ? measureRolls(patch) : undefined, layers: Object.fromEntries(Object.entries(layers).map(([d, notes]) => [d, Object.values(notes).map((n) => n.measured).sort((a, b) => a.m - b.m)])) };
    const text = JSON.stringify(table);
    writeFileSync(join(OUT, `${patch.id}.json`), text);
    const counts = Object.entries(table.layers).map(([d, notes]) => `${d} ${notes.length} (${notes[0]?.m}-${notes.at(-1)?.m})`).join(', ');
    console.log(`${patch.id.padEnd(22)} ${counts}  ${(text.length / 1024).toFixed(0)} KB${report.pitch ? `  ${report.pitch} dropped` : ''}${table.roll ? `  roll ${table.roll.rate} Hz, timing ${table.roll.timing}, level ${table.roll.level} dB over ${table.roll.notes} notes` : ''}`);
}
