// Room impulse responses, generated from a handful of numbers per room.
//
// The convolution reverbs used to fetch six recorded impulses (public/reverb/*.flac). Each is now
// a spec below - a pre-delay, how long low, middle and high frequencies ring, how much of the energy
// is early reflections, how wide the room is - and the impulse is rendered from it with a seeded
// random generator, so a room sounds the same every time and on every device. The specs were fitted
// to the recordings' measurements (docs/measurements/room-reference.json, tools/auditRoomModel.mjs).
//
// An impulse is two parts:
//   early   a few dozen sparse reflections after the pre-delay, some shared by both ears and some not
//   tail    noise in ten octave-wide bands, each decaying at its own RT60 (read off the spec's three
//           anchors at 250 Hz, 1 kHz and 4 kHz, in between on a log-frequency line), rising from
//           silence over `rise` seconds, left and right sharing a part of it (`width` is the
//           left/right correlation the room ends up with)
// and the early reflections are scaled so that `early` of the whole energy lies in the first 80 ms.

export const ROOM_SPECS = {
    // near-mono hall, dark
    reverb1: { seconds: 6.0, pre: 0.007, rt60: [8.8, 3.3, 0.8], tone: [-9.5, 0, -30], rise: 0.03, early: 0.26, taps: 24, span: 0.06, width: 0.98 },
    // near-mono, late onset
    reverb2: { seconds: 8.0, pre: 0.052, rt60: [5.4, 2.2, 0.7], tone: [-6.1, 0, -42.1], rise: 0.12, early: 0.11, taps: 16, span: 0.09, width: 0.99 },
    // tight room, strong early reflections (the drums)
    reverb3: { seconds: 3.0, pre: 0.004, rt60: [5, 1.4, 1.2], tone: [-26, 0, -8], rise: 0.01, early: 0.61, taps: 40, span: 0.07, width: 0.45 },
    // wide, bright, long hall
    reverb4: { seconds: 9.8, pre: 0.03, rt60: [6, 5.7, 2.6], tone: [-1.4, 0, -11.5], rise: 0.05, early: 0.41, taps: 32, span: 0.08, width: 0.08 },
    // short plate-like
    reverb5: { seconds: 2.5, pre: 0.039, rt60: [2.5, 2, 1.3], tone: [1.1, 0, -23.7], rise: 0.04, early: 0.33, taps: 20, span: 0.05, width: 0.96 },
    // very early-heavy, wide
    reverb6: { seconds: 2.0, pre: 0.001, rt60: [5.2, 1.5, 1.4], tone: [-5.1, 0, -10.2], rise: 0.005, early: 0.77, taps: 48, span: 0.06, width: 0 },
};

export const ROOM_TYPES = Object.keys(ROOM_SPECS);

const LN1000 = Math.log(1000);
const EARLY_WINDOW = 0.08;
const ANCHORS = [250, 1000, 4000];
// band edges, an octave apart; a band's anchors are read at its geometric centre
const EDGES = [44, 88, 177, 354, 707, 1414, 2828, 5657, 11314];

function random(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const typeSeed = (type) => 0x9e3779b1 + 7919 * ROOM_TYPES.indexOf(type);

// two cascaded one-pole low-passes
function lowpass(input, hz, sr) {
    const a = 1 - Math.exp(-2 * Math.PI * hz / sr), out = new Float32Array(input.length);
    let p = 0, q = 0;
    for (let i = 0; i < input.length; i++) { p += a * (input[i] - p); q += a * (p - q); out[i] = q; }
    return out;
}

// value of a three-anchor curve at `hz`: straight in log-frequency, flat beyond the ends
function along(values, hz) {
    const x = Math.log2(hz / ANCHORS[0]), span = Math.log2(ANCHORS[1] / ANCHORS[0]);
    if (x <= 0) return values[0];
    if (x >= 2 * span) return values[2];
    return x <= span ? values[0] + (values[1] - values[0]) * x / span : values[1] + (values[2] - values[1]) * (x - span) / span;
}

// One channel of reverberation: unit white noise split into octave bands, each decaying at its own
// RT60 from `pre`, rising from silence over `rise` seconds.
function reverberation(spec, sr, noise, rt60, rise) {
    const length = noise.length;
    const cuts = EDGES.map((hz) => lowpass(noise, hz, sr));
    const bands = cuts.map((cut, k) => {
        const band = new Float32Array(length), below = k ? cuts[k - 1] : null;
        for (let i = 0; i < length; i++) band[i] = cut[i] - (below ? below[i] : 0);
        return band;
    });
    const last = new Float32Array(length), top = cuts[cuts.length - 1];
    for (let i = 0; i < length; i++) last[i] = noise[i] - top[i];
    bands.push(last);
    const edges = [20, ...EDGES, 20000];
    const start = Math.round(spec.pre * sr), out = new Float32Array(length);
    bands.forEach((band, k) => {
        const hz = Math.sqrt(edges[k] * edges[k + 1]);
        let rms = 0;
        for (let i = 0; i < length; i++) rms += band[i] * band[i];
        rms = Math.sqrt(rms / length) || 1;
        // white: energy in proportion to bandwidth, then the room's tone
        const level = Math.sqrt((edges[k + 1] - edges[k]) / 1000) * 10 ** (along(spec.tone, hz) / 20) / rms;
        const step = Math.exp(-LN1000 / (along(rt60, hz) * sr));
        let fall = 1;
        for (let i = start; i < length; i++, fall *= step) out[i] += band[i] * level * fall;
    });
    for (let i = start, t = 0; i < length; i++, t = (i - start) / sr) out[i] *= 1 - Math.exp(-t / rise);
    return out;
}

const energy = (a, to = a.length) => { let s = 0; for (let i = 0; i < to; i++) s += a[i] * a[i]; return s; };

/**
 * The impulse of a room type: { channels: [left, right], sampleRate }.
 * `seconds` shortens it (the convolver caps the tail anyway); the early/late balance is the room's.
 */
export function roomImpulse(type, sampleRate, seconds = Infinity) {
    const spec = ROOM_SPECS[type];
    if (!spec) throw new Error(`Unknown room "${type}"`);
    const length = Math.max(1, Math.round(Math.min(spec.seconds, seconds) * sampleRate));
    const rand = random(typeSeed(type));
    const common = Math.sqrt(Math.max(0, spec.width)), apart = Math.sqrt(1 - Math.max(0, spec.width));
    // two noises per ear, partly shared between the ears: the room's tail and its early burst
    const noises = (n) => {
        const shared = Float32Array.from({ length: n }, () => gauss(rand));
        return [0, 1].map(() => Float32Array.from(shared, (x) => common * x + apart * gauss(rand)));
    };
    const late = noises(length).map((noise) => reverberation(spec, sampleRate, noise, spec.rt60, spec.rise));
    // Early part: a burst that dies in a fraction of the tail's time, with the room's own tone, and a few
    // discrete reflections; the first is the direct sound. A share of them lands at the same time in both ears.
    const burstLength = Math.min(length, Math.round((spec.pre + 0.6) * sampleRate));
    const burstRt60 = spec.rt60.map((rt) => Math.min(0.5, Math.max(0.1, rt * 0.1)));
    const burst = noises(burstLength).map((noise) => reverberation(spec, sampleRate, noise, burstRt60, 0.002));
    const tapsLength = Math.min(length, Math.round((spec.pre + spec.span + 0.1) * sampleRate));
    const taps = [new Float32Array(tapsLength), new Float32Array(tapsLength)];
    const start = Math.round(spec.pre * sampleRate);
    for (let k = 0; k < spec.taps; k++) {
        const fade = k === 0 ? 1 : Math.exp(-2.5 * k / spec.taps) * (0.4 + 0.6 * rand());
        const sign = k === 0 || rand() < 0.5 ? 1 : -1;
        const at = () => start + (k === 0 ? 0 : Math.round(Math.sqrt(rand()) * spec.span * sampleRate));
        const together = rand() < spec.width, same = at();
        for (let c = 0; c < 2; c++) {
            const i = together ? same : at();
            if (i < tapsLength) taps[c][i] += sign * fade;
        }
    }
    // the reflections take the room's tone like everything else, rather than ticking at every frequency
    taps.forEach((t, c) => { taps[c] = reverberation(spec, sampleRate, t, [1e4, 1e4, 1e4], 1e-4); });
    const window = Math.min(length, Math.round(EARLY_WINDOW * sampleRate));
    const both = (parts, to) => parts.reduce((sum, part) => sum + energy(part, to ?? part.length), 0);
    // the tail at unit energy; the burst and taps (three to one) sized so `early` of the total is in the first 80 ms
    const lateScale = 1 / Math.sqrt(both(late) || 1);
    late.forEach((c) => c.forEach((x, i) => { c[i] = x * lateScale; }));
    const lateEarly = both(late, window), wanted = Math.min(0.97, Math.max(spec.early, lateEarly));
    const burstTotal = both(burst) || 1, tapsTotal = both(taps) || 1;
    const share = 0.75 * both(burst, window) / burstTotal + 0.25 * both(taps, window) / tapsTotal;
    const added = Math.min(60, (wanted - lateEarly) / Math.max(0.02, share - wanted));
    const burstGain = Math.sqrt(0.75 * added / burstTotal), tapsGain = Math.sqrt(0.25 * added / tapsTotal);
    const channels = late.map((c, k) => {
        for (let i = 0; i < burstLength; i++) c[i] += burstGain * burst[k][i];
        for (let i = 0; i < tapsLength; i++) c[i] += tapsGain * taps[k][i];
        return c;
    });
    // the direct sound is what a recording peaks on: one sample that stands clear of the rest
    channels.forEach((c) => {
        let top = 0;
        for (let i = 0; i < length; i++) top = Math.max(top, Math.abs(c[i]));
        if (start < length) c[start] = 1.2 * top * (c[start] < 0 ? -1 : 1);
    });
    // overall unit energy (the convolver normalises its own copy; this keeps unnormalised use sane)
    const total = both(channels) || 1;
    channels.forEach((c) => c.forEach((x, i) => { c[i] = x / Math.sqrt(total); }));
    return { channels, sampleRate };
}

/** The impulse as an AudioBuffer of `AC`. */
export function roomBuffer(AC, type, seconds = Infinity) {
    const { channels } = roomImpulse(type, AC.sampleRate, seconds);
    const buffer = AC.createBuffer(2, channels[0].length, AC.sampleRate);
    channels.forEach((data, c) => buffer.getChannelData(c).set(data));
    return buffer;
}
