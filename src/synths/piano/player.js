// Plays the modelled pianos live: each key sounds the cached buffer for its tuned pitch and
// velocity layer, through a release envelope, the sustain pedal and a small room.
import { pianoBuffer } from '../../app/engine/piano';
import { tunedFrequency } from '../../app/engine/temperament';
import { isCalibratedPiano } from '../../app/engine/calibratedPiano';

/** The renderer's options for a page's settings (the same keys a generator preset uses). */
export const renderOptions = (s, velocity) => ({
    type: s.pianoType, decay: s.pianoDecay, brightness: s.pianoBrightness, hammer: s.pianoHammer, unison: s.pianoUnison,
    resonance: s.pianoResonance, wear: s.pianoWear, seed: s.pianoSeed, sustain: 0, velocity,
});
export const tuningOptions = (s) => ({ temperament: s.pianoTemperament, tonic: s.pianoTonic, a4: s.pianoA4, stretch: s.pianoStretch, wear: s.pianoWear, seed: s.pianoSeed });

// A room: decaying noise, darker as it fades.
function roomImpulse(context, seconds = 2.4) {
    const length = Math.round(context.sampleRate * seconds), buffer = context.createBuffer(2, length, context.sampleRate);
    for (let c = 0; c < 2; c++) {
        const data = buffer.getChannelData(c);
        let low = 0, seed = 1234 + c * 77;
        for (let i = 0; i < length; i++) {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            const t = i / length, white = seed / 2147483648 - 1;
            low += (white - low) * (.6 - .5 * t);
            data[i] = low * (1 - t) ** 3.2 * Math.min(1, i / (context.sampleRate * .004));
        }
    }
    return buffer;
}

// The renderer levels every note by its low band, which leaves the top of the keyboard several dB
// louder and makes a soft key almost as loud as a hard one. Here each buffer is brought to one
// loudness (measured once) and key velocity alone sets the level, over about 30 dB.
const TARGET_RMS = .1, loudness = new WeakMap(), rmsCache = new WeakMap();
// first half second of a buffer
function startRms(buffer) {
    if (!rmsCache.has(buffer)) {
        const data = buffer.getChannelData(0), n = Math.min(data.length, Math.round(buffer.sampleRate * .5));
        let sum = 0;
        for (let i = 0; i < n; i++) sum += data[i] * data[i];
        rmsCache.set(buffer, Math.sqrt(sum / n) || TARGET_RMS);
    }
    return rmsCache.get(buffer);
}
function normaliser(buffer) {
    if (!loudness.has(buffer)) {
        const data = buffer.getChannelData(0), n = Math.min(data.length, Math.round(buffer.sampleRate * .5));
        let sum = 0;
        for (let i = 0; i < n; i++) sum += data[i] * data[i];
        loudness.set(buffer, Math.min(2, Math.max(.25, TARGET_RMS / (Math.sqrt(sum / n) || TARGET_RMS))));
    }
    return loudness.get(buffer);
}
export const dynamics = (velocity) => velocity ** 1.7;
export const noteSource = (key) => (key.startsWith('midi:') ? 'MIDI' : key.startsWith('touch:') ? 'Screen' : key.startsWith('line:') ? 'Test line' : 'Computer keys');

export default class PianoPlayer {
    constructor(context, onChange = () => {}, onNote = () => {}) {
        this.context = context; this.onChange = onChange; this.onNote = onNote;
        // A limiter before the output: several keys together can no longer clip.
        this.limiter = context.createDynamicsCompressor();
        Object.assign(this.limiter.threshold, { value: -4 }); Object.assign(this.limiter.knee, { value: 2 });
        Object.assign(this.limiter.ratio, { value: 20 }); Object.assign(this.limiter.attack, { value: .002 }); Object.assign(this.limiter.release, { value: .12 });
        this.meter = context.createAnalyser(); this.meter.fftSize = 1024; this.scratch = new Float32Array(1024);
        this.master = context.createGain(); this.dry = context.createGain(); this.send = context.createGain(); this.room = context.createConvolver();
        this.room.buffer = roomImpulse(context); this.wet = context.createGain();
        this.dry.connect(this.master); this.send.connect(this.room); this.room.connect(this.wet); this.wet.connect(this.master); this.master.connect(this.limiter); this.limiter.connect(this.meter); this.limiter.connect(context.destination);
        this.settings = null; this.voices = new Map(); this.pedal = false; this.sustained = new Set();
    }
    set(settings, level = .9, room = .2) {
        this.settings = settings; this.master.gain.value = level; this.wet.gain.value = room * 1.6;
    }
    buffer(midi, velocity) {
        const s = this.settings;
        return pianoBuffer(this.context, tunedFrequency(midi, tuningOptions(s)), renderOptions(s, velocity));
    }
    /**
     * The gain that brings a buffer to the page's loudness. A measured piano has a loudness curve of its own, the top of the
     * keyboard quieter than the middle, so it is levelled once by a middle key at this strength and not note by note.
     */
    weight(velocity, buffer) {
        if (!isCalibratedPiano(this.settings.pianoType)) return normaliser(buffer);
        return Math.min(4, TARGET_RMS / startRms(this.buffer(63, velocity)));
    }
    down(key, midi, velocity = .7) {
        this.up(key, true);
        const ctx = this.context, v = Math.min(1, Math.max(.05, velocity)), source = ctx.createBufferSource(), gain = ctx.createGain();
        source.buffer = this.buffer(midi, v);
        const level = this.weight(v, source.buffer) * dynamics(v);
        gain.gain.value = level; source.connect(gain); gain.connect(this.dry); gain.connect(this.send);
        const voice = { source, gain, midi, held: true };
        source.onended = () => { gain.disconnect(); if (this.voices.get(key) === voice) this.voices.delete(key); this.sustained.delete(voice); this.onChange(); };
        source.start(); this.voices.set(key, voice); this.onChange();
        this.onNote({ key, midi, velocity: v, source: noteSource(key), db: 20 * Math.log10(level) });
    }
    release(voice) {
        const now = this.context.currentTime, tail = voice.midi < 48 ? .35 : voice.midi < 72 ? .22 : .12;
        voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.setTargetAtTime(0, now, tail / 3); voice.source.stop(now + tail * 2.5);
    }
    up(key, force = false) {
        const voice = this.voices.get(key);
        if (!voice) return;
        voice.held = false; this.voices.delete(key);
        if (this.pedal && !force) this.sustained.add(voice); else this.release(voice);
        this.onChange();
    }
    sustain(on) {
        this.pedal = on;
        if (!on) { for (const voice of this.sustained) this.release(voice); this.sustained.clear(); }
        this.onChange();
    }
    panic() { for (const v of [...this.voices.values(), ...this.sustained]) { try { v.source.stop(); } catch { /* already stopped */ } } this.voices.clear(); this.sustained.clear(); this.onChange(); }
    /** Largest sample at the output since the last call (0..1+; the limiter holds it near -4 dBFS). */
    peak() {
        this.meter.getFloatTimeDomainData(this.scratch);
        let peak = 0;
        for (const x of this.scratch) peak = Math.max(peak, Math.abs(x));
        return peak;
    }
    held() { return [...this.voices.values()].map((v) => v.midi); }
    close() { this.panic(); this.master.disconnect(); return this.context.close(); }
}
