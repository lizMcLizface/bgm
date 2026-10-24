// Acoustic pianos by modelling, not by sample: a grand, a felted (muted) piano and an old upright.
// Each note is a few stiff strings (stretched partials), each ringing in two polarisations (the
// quick "prompt" sound and the slow aftersound) and struck by a felt hammer whose contact time
// and strike point shape the spectrum. A soundboard of resonant modes colours the sum. The
// result is a mono buffer per pitch and velocity layer, played like any other piano buffer.
export const ACOUSTIC_TYPES = ['grand', 'felted', 'upright', ...Object.keys(MATCHED_TYPES)];
import { MATCHED_TYPES } from './acousticPianoMatched.js';
const MATCHED = MATCHED_TYPES;
export const isAcousticPiano = (type) => ACOUSTIC_TYPES.includes(type);

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo));

// strike: where the hammer meets the string (fraction of its length); contact: hammer softness
// over a concert grand's; loss: how fast upper partials die; inharm: stiffness over a grand's;
// spread: unison detuning in cents; slow: aftersound's decay over the prompt sound's; knee: the
// soundboard's low-frequency roll-off in Hz; lead: how far the fundamental stands above the other partials in the treble (1 as measured on a grand); thump/knock: action noise; body: soundboard modes.
// Optional per-piano shaping, absent (neutral) on the three types above: dark: [corner Hz, order,
// top pitch] rolls partials off above an absolute frequency, fully below `top - 24` and fading out at
// `top` (a bass string's upper partials die long before a treble string's); fund: dB added to the
// fundamental below E3 (the lowest strings put little into their first partial); ripple: dB of seeded
// unevenness across partials in the bass, each piano its own; stiffLow: multiplier on string stiffness
// below E3, fading in over the octave above G1 (the wound bass strings of some pianos are less stiff).
const TYPES = {
    grand: { strike: .118, contact: 1, loss: 1, inharm: 1, spread: .45, slow: 4.5, knee: 70, lead: 1, thump: .3, knock: .8, decayScale: 1.2, aftersound: .3,
        body: { count: 12, low: 110, high: 2200, q: [7, 16], gain: 1 } },
    felted: { strike: .131, contact: 3.4, loss: 2.4, inharm: 1.05, spread: .55, slow: 3, knee: 80, lead: 1.1, thump: .8, knock: .35, decayScale: .75, aftersound: .22,
        body: { count: 8, low: 100, high: 900, q: [6, 12], gain: .9 } },
    upright: { strike: .135, contact: .8, loss: 1.35, inharm: 1, spread: 1.6, slow: 3.2, knee: 110, lead: .65, thump: 1.1, knock: 1, decayScale: .8, aftersound: .38,
        body: { count: 8, low: 140, high: 1500, q: [10, 26], gain: 1.6 } },
    ...MATCHED,
};

/**
 * Stiffness coefficient of a string at a MIDI pitch, fitted to recordings of a grand and a house piano:
 * plain steel strings in the lowest octave, a floor through the wound bass and tenor, then roughly
 * doubling every seven semitones up the treble.
 */
export const inharmonicity = (midi) => 8e-5 + 3e-4 * 2 ** ((midi - 60) / 7.5) + 3e-4 * 2 ** ((30 - midi) / 6);

/** How many strings a note has: one in the wound bass, two below the treble, three above. */
export const stringCount = (midi) => (midi < 30 ? 1 : midi < 48 ? 2 : 3);

function generator(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        return (s >>> 0) / 2147483648 - 1;
    };
}

// The hammer's force pulse as heard in the string: a smooth roll-off above a corner set by its
// contact time (a felt hammer's pulse is skewed and has no deep nulls), 1 at f = 0.
const pulse = (f, contact, order) => (1 + (f * contact / 1.6) ** 2) ** -order;

function soundboard(sampleRate, kind, seed, input, amount) {
    if (amount <= 0) return input;
    const next = generator(seed * 7919 + 13), { count, low, high, q, gain } = kind.body, wet = new Float32Array(input.length);
    for (let m = 0; m < count; m++) {
        // Modes spread through the register, each with its own width and strength.
        const fc = Math.min(sampleRate * .4, low * (high / low) ** ((m + .5 + .35 * next()) / count));
        const quality = q[0] + (q[1] - q[0]) * (next() + 1) / 2, weight = gain * (.5 + (next() + 1) / 2) / Math.sqrt(count);
        const w0 = 2 * Math.PI * fc / sampleRate, alpha = Math.sin(w0) / (2 * quality), a0 = 1 + alpha;
        const a1 = -2 * Math.cos(w0) / a0, a2 = (1 - alpha) / a0, b = alpha / a0 * weight;
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < input.length; i++) {
            const x = input[i], y = b * (x - x2) - a1 * y1 - a2 * y2;
            wet[i] += y; x2 = x1; x1 = x; y2 = y1; y1 = y;
        }
    }
    const out = new Float32Array(input.length);
    for (let i = 0; i < out.length; i++) out[i] = input[i] + amount * 1.6 * wet[i];
    return out;
}

/**
 * One struck note. Options: type (grand | felted | upright), decay (seconds the prompt sound lasts
 * at A3), brightness, hammer (0 soft .. 1 hard), unison (string-to-string detuning), velocity,
 * resonance (soundboard), wear (an old piano: stiffer, looser, noisier), seed (this piano's identity),
 * shape (a type's parameter set, for fitting; replaces `type`).
 */
export function renderAcousticPiano(sampleRate, frequency, { type = 'grand', decay = 2.5, brightness = .5, hammer = .4, unison = .3, velocity = .8, seed = 1, resonance = .5, wear = 0, shape } = {}) {
    const sr = clamp(sampleRate, 8000, 192000), f0 = clamp(frequency, 15, sr / 6), kind = shape ?? TYPES[type] ?? TYPES.grand;
    decay = clamp(decay, .3, 5); brightness = clamp(brightness, 0, 1); hammer = clamp(hammer, 0, 1); unison = clamp(unison, 0, 1);
    velocity = clamp(velocity, 0, 1); resonance = clamp(resonance, 0, 1); wear = clamp(wear, 0, 1);
    const midi = 69 + 12 * Math.log2(f0 / 440), v = Math.max(.12, velocity), next = generator((seed >>> 0) ^ Math.round(f0 * 100));

    // Prompt decay lengthens towards the bass; the aftersound lasts several times longer.
    const prompt = decay * kind.decayScale * clamp((220 / f0) ** .45, .35, 2.2), aftersound = prompt * kind.slow;
    const duration = Math.min(7, Math.max(.8, aftersound * 1.1)), out = new Float32Array(Math.ceil(sr * duration));
    const alphaPrompt = Math.log(1000) / prompt, alphaAfter = Math.log(1000) / aftersound;
    const lossRate = .9 * kind.loss * (1 + wear * .3);

    // Hammer: contact time falls with pitch, harder felt and harder blows.
    const contact = clamp(.0018 * (220 / f0) ** .3 * kind.contact * (2.2 - 1.7 * hammer) * (1.2 - .4 * brightness) * (.7 / v) ** .6, .0004, .012);
    // Softer felt and softer blows also fall off faster above the corner.
    const order = .35 + .4 * (1 - hammer) + .6 * (1 - v);
    const stiffness = inharmonicity(midi) * kind.inharm * (1 + wear * .25) * (kind.stiffLow ? 1 + (kind.stiffLow - 1) * clamp((44 - midi) / 16, 0, 1) : 1);
    const limit = Math.min(sr * .45, 12000 * (.5 + brightness)), strings = stringCount(midi);
    const tilt = (1 - brightness) * .9;
    // Above the middle of the keyboard the fundamental stands well above the rest, up to 20 dB.
    const lead = 10 ** (-20 * kind.lead * clamp((midi - 50) / 14, 0, 1) / 20);

    // Unison strings: one is on pitch, the others off by a few tenths of a cent (a few cents when worn).
    const spread = kind.spread * (.3 + 1.4 * unison) + wear * 6;
    const detune = Array.from({ length: strings }, (_, i) => (i ? (next() > 0 ? 1 : -1) * spread * (.4 + (next() + 1) / 2 * .8) : 0));
    const perString = 1 / strings ** .7;

    function mode(freq, amplitude, alpha) {
        if (freq >= limit || amplitude < 1e-7) return;
        const theta = 2 * Math.PI * freq / sr, r = Math.exp(-alpha / sr), c = 2 * r * Math.cos(theta), r2 = r * r;
        const count = Math.min(out.length, Math.ceil(sr * 8 / alpha));
        let previous = 0, current = amplitude * Math.sin(theta) * r;
        for (let i = 0; i < count; i++) {
            out[i] += previous;
            const following = c * current - r2 * previous;
            previous = current; current = following;
        }
    }

    const ripple = generator((seed >>> 0) * 131 + Math.round(f0 * 10) + 7);
    for (let n = 1; ; n++) {
        const partial = n * Math.sqrt((1 + stiffness * n * n) / (1 + stiffness));
        if (f0 * partial >= limit) break;
        const reach = f0 * partial;
        // Strike point comb, hammer pulse, spectral tilt, and the soundboard's roll-off of the lowest partials.
        const bassWeight = kind.dark || kind.fund || kind.ripple ? clamp(((kind.dark?.[2] ?? 72) - midi) / 24, 0, 1) : 0;
        let shaped = 1;
        if (bassWeight) {
            if (kind.dark) shaped *= (1 + bassWeight * (reach / kind.dark[0]) ** 2) ** -kind.dark[1];
            if (n === 1 && kind.fund) shaped *= 10 ** (kind.fund * clamp((48 - midi) / 20, 0, 1) / 20);
            if (kind.ripple && n > 1) shaped *= 10 ** (kind.ripple * bassWeight * ripple() / 20);
        }
        const level = shaped * Math.abs(Math.sin(Math.PI * n * kind.strike)) * pulse(reach, contact, order) * n ** -tilt / Math.sqrt(1 + (kind.knee / reach) ** 6) * (n === 1 ? 1 : lead);
        const loss = lossRate * (reach / 1000) ** 2;
        // Above the tenth partial the strings' beating is inaudible: one merged string.
        const merged = n > 10 ? 1 : strings;
        for (let s = 0; s < merged; s++) {
            const shift = n > 10 ? 0 : detune[s], here = reach * 2 ** (shift / 1200);
            const gain = level * perString * (n > 10 ? Math.sqrt(strings) : 1);
            mode(here, gain, alphaPrompt + loss);
            if (n <= 24) mode(here * 2 ** (next() * .35 / 1200), gain * kind.aftersound * (1 + wear * .4), alphaAfter + loss * .35);
        }
    }

    const body = soundboard(sr, kind, seed, out, resonance * (type === 'grand' ? .8 : 1));

    // Action noise, scaled to the low band of the strings so it keeps its place at every pitch. The
    // felt thud barely depends on how hard the key is struck, so it stands out in a soft note; a hard
    // hammer adds a short high click.
    const lowRms = (data, count) => {
        const k = 1 - Math.exp(-2 * Math.PI * 700 / sr), n = Math.min(count, data.length);
        let a = 0, b = 0, sum = 0;
        for (let i = 0; i < n; i++) { a += k * (data[i] - a); b += k * (a - b); sum += b * b; }
        return Math.sqrt(sum / n) || 1e-6;
    };
    const reference = lowRms(body, Math.round(sr * .3));
    const thudCut = 1 - Math.exp(-2 * Math.PI * (600 + 700 * hammer) / sr), thudDecay = Math.exp(-1 / (sr * .005));
    const clickCut = 1 - Math.exp(-2 * Math.PI * 3000 / sr), clickDecay = Math.exp(-1 / (sr * .0012));
    const thudLevel = reference * .6 * kind.knock * (1.3 - .6 * hammer) * (.55 + .45 * v) * (1 + wear * .5);
    const clickLevel = reference * 1.1 * kind.knock * hammer ** 1.5 * v ** 1.2 * (1 + wear * .4), thumpHz = 70 + 40 * next() ** 2;
    const thumpLevel = reference * .35 * kind.thump * (.6 + .4 * v) * (1 + wear * .6), thumpDecay = Math.exp(-1 / (sr * .03));
    let thudNoise = 0, clickNoise = 0, thud = thudLevel, click = clickLevel, thump = thumpLevel;
    for (let i = 0, end = Math.min(body.length, Math.round(sr * .15)); i < end; i++) {
        const white = next();
        thudNoise += thudCut * (white - thudNoise); clickNoise += clickCut * (white - clickNoise);
        body[i] += thudNoise * thud + (white - clickNoise) * click + thump * Math.sin(2 * Math.PI * thumpHz * i / sr);
        thud *= thudDecay; click *= clickDecay; thump *= thumpDecay;
    }

    // Level every note by its low band (so a brighter blow is also a louder one), remove DC, fade the ends.
    let dc = 0, last = 0;
    const pole = Math.exp(-2 * Math.PI * 12 / sr), settle = Math.round(sr * .4), tail = Math.round(sr * .12);
    for (let i = 0; i < body.length; i++) { const x = body[i]; dc = x - last + pole * dc; last = x; body[i] = dc; }
    const scale = .08 / lowRms(body, settle);
    let peak = 0;
    for (let i = 0; i < body.length; i++) {
        const fade = Math.min(1, i / (sr * .0008), (body.length - 1 - i) / tail);
        body[i] *= scale * Math.max(0, fade); peak = Math.max(peak, Math.abs(body[i]));
    }
    if (peak > .85) for (let i = 0; i < body.length; i++) body[i] *= .85 / peak;
    return body;
}
