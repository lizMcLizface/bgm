// The measured piano as a file the app can load: one analysis per measured pitch at the reference strength
// (the others follow from the hammer curves, hammer.js), the hammer curves and the damper release.
// Numbers are kept to four significant figures and partials are stored as rows to keep the file small.
//
//   { format: 2, name, rate, reference, evenness, S, Sn, release: { settle, slow, fast },
//     notes: [{ pitch, f1, B, onset, held, level, partials: [[n, dB, tPeak, delay, rise, s1, s2, tb|null, beat, depth, phase]],
//   (format 1 also had the frequency f of each partial, second in the row; it is n f1 sqrt(1 + B n^2) and was never read)
//               noise: [[dB, tPeak, tau, floorDb?, floorTau?]] }] }   (the floor: a sustained part of a low band in a high note)
import { fitHammer, liftToReference, NODES } from './hammer.js';
import { NOISE_EDGES } from './analysis.js';
import { RELEASE } from './synth.js';

const q = (v) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(4)) : v);
// format 2 keeps only what can be heard: levels to 0.1 dB, times and rates to three figures, beating to two decimals.
const sig = (v, n = 3) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(n)) : v);
const dec = (v, n) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(n)) : v);
const dB = (a) => 20 * Math.log10(Math.max(a, 1e-12));

/**
 * How far each note's level is from a smooth curve through the neighbouring pitches (dB): a Gaussian-weighted mean of the
 * levels within about `sigma` semitones, minus the note's own. A sampled piano is uneven from note to note (and steps
 * where its recording zones meet); a well-regulated piano is not.
 */
export function levelTrims(pitches, levelsDb, sigma = 4) {
    return levelsDb.map((own, i) => {
        let sum = 0, weight = 0;
        for (let j = 0; j < pitches.length; j++) { const w = Math.exp(-.5 * ((pitches[i] - pitches[j]) / sigma) ** 2); sum += w * levelsDb[j]; weight += w; }
        return sum / weight - own;
    });
}

/**
 * The file contents from the measured notes ({ pitch, velocity, analysis }, as analyzePianoTake writes them).
 * `evenness` (0..1) is how much of each note's departure from the smooth level curve is taken out: 0 keeps the
 * recording's unevenness, 1 follows the curve exactly.
 */
export function packTable(notes, { name = 'piano', rate = 48000, floorDb = 70, evenness = .7 } = {}) {
    // a struck-and-held note, whatever the take called it (cc1 takes: held; the older piano take: sustained, low)
    const held = notes.filter((n) => n.kind === undefined || ['held', 'sustained', 'low'].includes(n.kind));
    const hammer = fitHammer(held);
    if (!hammer) throw new Error('packTable: needs measurements at more than one strength to learn the hammer');
    const reference = hammer.reference;
    // a pitch measured at one strength only (below the reference) is lifted to the reference by the learned curves
    const strongest = new Map();
    for (const n of held) if (!strongest.has(n.pitch) || n.velocity > strongest.get(n.pitch).velocity) strongest.set(n.pitch, n);
    const layer = [...strongest.values()].map((n) => (n.velocity === reference ? n : { ...n, analysis: liftToReference(n.analysis, hammer, n.velocity) })).sort((a, b) => a.pitch - b.pitch);
    const trims = levelTrims(layer.map((n) => n.pitch), layer.map((n) => dB(n.analysis.level))).map((t) => t * evenness);
    return {
        format: 2, name, rate, reference, evenness, S: hammer.S.map((v) => dec(v, 2)), Sn: (hammer.Sn ?? hammer.S).map((v) => dec(v, 2)), release: RELEASE,
        notes: layer.map(({ pitch, analysis: m }, i) => {
            const top = Math.max(...m.partials.map((p) => dB(p.a))), trim = trims[i];
            return {
                pitch, f1: q(m.f1), B: sig(m.B), onset: sig(m.onset, 2), held: m.held, level: dec(dB(m.level) + trim, 1),
                partials: m.partials.filter((p) => dB(p.a) > top - floorDb).map((p) => [p.n, dec(dB(p.a) + trim, 1), sig(p.tPeak, 2), sig(p.delay, 2), sig(p.rise, 2), sig(p.s1), sig(p.s2), p.tb == null ? null : sig(p.tb), dec(p.beat, 2), dec(p.beatDepth, 2), dec(p.beatPhase, 1)]),
                noise: m.noise.map((b) => (b.floor > 0 ? [dec(dB(b.rms) + trim, 1), sig(b.tPeak, 2), sig(b.tau, 2), dec(dB(b.floor) + trim, 1), sig(b.floorTau, 2)] : [dec(dB(b.rms) + trim, 1), sig(b.tPeak, 2), sig(b.tau, 2)])),
            };
        }),
    };
}

/** The table array `modelFor` takes, with the hammer curves attached, from a packed file. */
export function unpackTable(file) {
    if (file.format !== 1 && file.format !== 2) throw new Error(`unpackTable: unknown format ${file.format}`);
    const table = file.notes.map((n) => ({
        pitch: n.pitch, velocity: file.reference,
        analysis: {
            midi: n.pitch, f1: n.f1, B: n.B, onset: n.onset, held: n.held, level: 10 ** (n.level / 20), rate: file.rate,
            partials: n.partials.map((row) => {
                // format 1 rows carry the frequency second; format 2 leaves it to the stiff-string series
                const [pn, f, db, tPeak, delay, rise, s1, s2, tb, beat, beatDepth, beatPhase] = file.format === 1 ? row : [row[0], n.f1 * row[0] * Math.sqrt(1 + n.B * row[0] * row[0]), ...row.slice(1)];
                return { n: pn, f, a: 10 ** (db / 20), tPeak, delay, rise, s1, s2, tb, beat, beatDepth, beatPhase };
            }),
            noise: n.noise.map(([db, tPeak, tau, floorDb, floorTau], i) => ({ lo: NOISE_EDGES[i], hi: NOISE_EDGES[i + 1], rms: db < -170 ? 0 : 10 ** (db / 20), tPeak, tau, floor: floorDb == null ? 0 : 10 ** (floorDb / 20), floorTau: floorTau ?? 0 })),
        },
    }));
    table.hammer = { reference: file.reference, S: file.S, Sn: file.Sn };
    table.release = file.release;
    return table;
}
