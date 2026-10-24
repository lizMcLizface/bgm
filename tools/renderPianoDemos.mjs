// Renders the modelled pianos to WAV files for listening: a scale across the keyboard, a held chord
// and a short phrase in each temperament. Usage: node tools/renderPianoDemos.mjs [outDir]
// Notes are mixed with a plain release (no generator, no effects), so this is the source alone.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderAcousticPiano } from '../src/app/engine/acousticPiano.js';
import { TEMPERAMENTS, tunedFrequency } from '../src/app/engine/temperament.js';

const SR = 44100, out = process.argv[2] ?? '.tmp/piano-demos';
mkdirSync(out, { recursive: true });

const PIANOS = {
    'concert-grand': { type: 'grand', decay: 2.8, brightness: .55, hammer: .45, unison: .25, resonance: .6, stretch: .8, seed: 11 },
    'studio-grand': { type: 'grand', decay: 2.2, brightness: .4, hammer: .3, unison: .2, resonance: .45, stretch: .6, seed: 23 },
    'felted': { type: 'felted', decay: 2.4, brightness: .35, hammer: .15, unison: .3, resonance: .55, temperament: 'vallotti', stretch: .3, seed: 37 },
    'old-upright': { type: 'upright', decay: 2.3, brightness: .8, hammer: .85, unison: .6, wear: .6, resonance: .8, a4: 436, stretch: .3, seed: 41 },
    'tired-upright': { type: 'upright', decay: 1.9, brightness: .85, hammer: .9, unison: 1, wear: 1, resonance: .9, a4: 432, stretch: .2, seed: 53 },
};

const cache = new Map();
function note(piano, midi, velocity) {
    const layer = Math.round(velocity * 7) / 7, key = JSON.stringify([piano, midi, layer]);
    if (!cache.has(key)) {
        const { temperament, tonic, a4, stretch, wear, seed } = piano;
        cache.set(key, renderAcousticPiano(SR, tunedFrequency(midi, { temperament, tonic, a4, stretch, wear, seed }), { ...piano, velocity: layer }));
    }
    return cache.get(key);
}

/** events: [midi, start, length, velocity]; the key release is a short exponential fade. */
function mix(piano, events, seconds) {
    const left = new Float32Array(Math.ceil(SR * seconds)), right = new Float32Array(left.length);
    for (const [midi, start, length, velocity] of events) {
        const data = note(piano, midi, velocity), at = Math.round(start * SR), off = Math.round(length * SR);
        // Treble to the right, bass to the left, as a player at the keyboard hears it.
        const pan = Math.max(-.6, Math.min(.6, (midi - 60) / 40)), l = Math.cos((pan + 1) * Math.PI / 4), r = Math.sin((pan + 1) * Math.PI / 4);
        const release = SR * (midi < 48 ? .35 : midi < 72 ? .22 : .12);
        for (let i = 0; i < data.length && at + i < left.length; i++) {
            const g = i < off ? 1 : Math.exp(-(i - off) / release) * (i - off < release * 8 ? 1 : 0);
            if (g === 0) break;
            const x = data[i] * g * velocity ** .8;
            left[at + i] += x * l; right[at + i] += x * r;
        }
    }
    return [left, right];
}

function wav(name, [left, right]) {
    let peak = 0;
    for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    const gain = peak > .9 ? .9 / peak : 1, bytes = Buffer.alloc(44 + left.length * 4);
    bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + left.length * 4, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(SR, 24); bytes.writeUInt32LE(SR * 4, 28);
    bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(left.length * 4, 40);
    for (let i = 0; i < left.length; i++) {
        bytes.writeInt16LE(Math.round(left[i] * gain * 32767), 44 + i * 4);
        bytes.writeInt16LE(Math.round(right[i] * gain * 32767), 46 + i * 4);
    }
    writeFileSync(join(out, name), bytes);
    console.log(name, `${(left.length / SR).toFixed(1)}s`);
}

// Slow arpeggiated C major 9 and a four-chord phrase: the chords are where tuning shows.
const chord = (root, quality, start, length, velocity = .6) => quality.map((interval, i) => [root + interval, start + i * .03, length, velocity - i * .02]);
const PHRASE = [
    ...chord(48, [0, 7, 12, 16, 19], 0, 3.6), ...chord(53, [0, 7, 12, 16, 19], 4, 3.6),
    ...chord(55, [0, 7, 11, 14, 17], 8, 3.6), ...chord(48, [0, 7, 12, 16, 19, 24], 12, 5),
    [72, 1, 1.4, .5], [76, 2.5, 1.4, .45], [79, 5, 1.4, .5], [77, 6.5, 1.4, .45], [74, 9, 1.4, .5], [71, 10.5, 1.4, .45], [72, 13, 3, .55],
];
const SCALE = Array.from({ length: 30 }, (_, i) => [28 + i * 2, i * .45, .4, .4 + (i % 5) * .1]);

for (const [name, piano] of Object.entries(PIANOS)) {
    wav(`${name}-scale.wav`, mix(piano, SCALE, 15));
    wav(`${name}-phrase.wav`, mix(piano, PHRASE, 19));
}
// The same grand under each temperament, on a held major and minor triad and a tritone-rich chord.
const TRIADS = [...chord(48, [0, 7, 12, 16, 19, 24], 0, 5), ...chord(52, [0, 7, 12, 15, 19, 24], 6, 5), ...chord(54, [0, 7, 12, 16, 22], 12, 5)];
for (const temperament of Object.keys(TEMPERAMENTS)) wav(`grand-${temperament}-triads.wav`, mix({ ...PIANOS['concert-grand'], temperament, stretch: 0 }, TRIADS, 18));

// The same note struck from very soft to very hard, then with the hammer from soft to hard.
const LADDER = [.1, .25, .45, .65, .85, 1].flatMap((velocity, i) => [[52, i * 2.4, 1.6, velocity], [64, i * 2.4 + .8, 1.4, velocity]]);
wav('concert-grand-velocity-ladder.wav', mix(PIANOS['concert-grand'], LADDER, 15.5));
const HAMMERS = [0, .25, .5, .75, 1].flatMap((hammer, i) => [[{ ...PIANOS['concert-grand'], hammer }, 52, i * 2.4, 1.6, .65], [{ ...PIANOS['concert-grand'], hammer }, 64, i * 2.4 + .8, 1.4, .65]]);
const hammerMix = [new Float32Array(SR * 13), new Float32Array(SR * 13)];
for (const [piano, ...event] of HAMMERS) { const [l, r] = mix(piano, [event], 13); for (let i = 0; i < l.length; i++) { hammerMix[0][i] += l[i]; hammerMix[1][i] += r[i]; } }
wav('concert-grand-hammer-ladder.wav', hammerMix);
