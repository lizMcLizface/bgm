// A small synthesised percussion kit (docs/DESIGN.md §9 C4): soft sounds
// to sit under calm music - a felt kick, a brush tap, a shaker, a rim click,
// a quiet closed hat, a brush swish, a felt tom, a soft clap, a soft
// ride, a soft crash and a ride bell - each hit built when it is booked
// from a sine or a burst of noise, with a touch of room reverb. No samples.
//
// It books like an Instrument (scheduleNote with the drum as the "note",
// silence, flushTails), so the Generator, mute / solo and the WAV render
// treat it as one more role. Like an Instrument it sleeps - output
// disconnected, so the reverb doesn't render silence - when nothing has
// sounded for its tail.

import { audioContext } from '../../audio/context';
import { DRUMS, defaultDrumKit } from '../percussion';
import { makeDrumRoom } from './fdnRoom';
import {drumForVoice,percussionVoice} from '../percussionVoices';

// Each drum's gain, so that at the same velocity they peak from about
// -6 dB (kick) to -15 dB (hat) - measured; the raw sounds span 18 dB. The
// swish is a bed under the rest: it lasts a whole beat, so it is kept well
// below the taps (its RMS about 10 dB under a brush tap's peak level).
// The tom, clap, ride, crash and bell (added later) are set by ear against those.
const GAIN = { kick: 1.3, brush: 2.6, shaker: 1.4, rim: 1.45, hat: 2.2, swish: 1.1, tom: 1.1, clap: 2.2, ride: 1.6, crash: 1.7, bell: 2, snare: 1.5, punch: 1.2, sizzle: 2 };
// (snare, punch and sizzle - the crisp kit - are set by ear against the felt ones: about as loud as the drum they stand in for.)

// Where each drum sits, -1 (left) .. 1 (right).
const PAN = { kick: 0, brush: -0.1, shaker: 0.3, rim: -0.25, hat: 0.2, swish: -0.15, tom: 0.15, clap: 0.05, ride: -0.3, crash: 0.25, bell: -0.2, snare: 0, punch: 0, sizzle: 0.2 };

// White noise, the same every time (renders are reproducible).
const noiseBuffers = new WeakMap();
function noiseBuffer(ctx) {
    if (!noiseBuffers.has(ctx)) {
        const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let x = 0x2545f491;
        for (let i = 0; i < data.length; i++) {
            x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
            data[i] = ((x >>> 0) / 4294967296) * 2 - 1;
        }
        noiseBuffers.set(ctx, buffer);
    }
    return noiseBuffers.get(ctx);
}

// A gain that rises to `peak` over `attack` and dies away exponentially.
function envelope(ctx, time, peak, attack, decay) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
    return gain;
}

// The sounds. Each gets the hit - t (time), v (velocity), x (its variation
// -1..1), bright (2^tone: filter frequencies scale with it), long (decay
// multiplier), seconds (the event's length, for a swish) and out (the
// drum's input) - and returns the sources it started, to stop on silence().
// Variation moves pitch, brightness and length a little from hit to hit.
const HITS = {
    kick(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const osc = AC.createOscillator();
        const pitch = Math.pow(bright, 0.4) * (1 + 0.08 * x);
        osc.frequency.setValueAtTime(120 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(48 * pitch, t + 0.08);
        const decay = 0.34 * long * (1 + 0.15 * x);
        osc.connect(envelope(AC, t, 0.9 * v, 0.004, decay)).connect(out);
        osc.start(t);
        osc.stop(t + decay + 0.05);
        const click = kit.noise(t, 0.03);
        const tone = AC.createBiquadFilter();
        tone.frequency.value = 1200 * bright;
        click.connect(tone).connect(envelope(AC, t, 0.12 * v, 0.001, 0.02)).connect(out);
        return [osc, click];
    },
    brush(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const decay = 0.18 * long * (1 + 0.25 * x);
        const src = kit.noise(t, decay + 0.05);
        const band = AC.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 3000 * bright * Math.pow(2, 0.35 * x);
        band.Q.value = 0.7;
        src.connect(band).connect(envelope(AC, t, 0.35 * v, 0.004, decay)).connect(out);
        const osc = AC.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 190 * Math.pow(bright, 0.3) * (1 + 0.05 * x);
        osc.connect(envelope(AC, t, 0.12 * v, 0.002, 0.08 * long)).connect(out);
        osc.start(t);
        osc.stop(t + 0.08 * long + 0.05);
        return [src, osc];
    },
    shaker(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const decay = 0.06 * long * (1 + 0.3 * x);
        const src = kit.noise(t, decay + 0.04);
        const high = AC.createBiquadFilter();
        high.type = 'highpass';
        high.frequency.value = Math.min(16000, 5000 * bright * Math.pow(2, 0.3 * x));
        // a shaker's grains: the attack varies more than anything
        src.connect(high).connect(envelope(AC, t, 0.2 * v, 0.012 * (1 + 0.5 * x), decay)).connect(out);
        return [src];
    },
    rim(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const pitch = Math.pow(bright, 0.5) * (1 + 0.03 * x);
        return [[1100, 0.28], [1750, 0.1]].map(([freq, level]) => {
            const osc = AC.createOscillator();
            osc.frequency.value = freq * pitch;
            osc.connect(envelope(AC, t, level * v, 0.001, 0.05 * long)).connect(out);
            osc.start(t);
            osc.stop(t + 0.05 * long + 0.04);
            return osc;
        });
    },
    hat(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const decay = 0.045 * long * (1 + 0.4 * x);
        const src = kit.noise(t, decay + 0.03);
        const high = AC.createBiquadFilter();
        high.type = 'highpass';
        high.frequency.value = Math.min(16000, 7000 * bright * Math.pow(2, 0.25 * x));
        src.connect(high).connect(envelope(AC, t, 0.13 * v, 0.001, decay)).connect(out);
        return [src];
    },
    // A brush stirred across the head for the length of the event: one
    // soft, wide "shh" that rises and falls smoothly, travelling across the
    // stereo field with the stroke - its colour drifting up or down with
    // the direction. Meant to be felt more than heard. (No amplitude
    // wobble: even a shallow one reads as the brush going back and forth.)
    swish(kit, { t, v, x, bright, long, seconds, out }) {
        const { AC } = kit;
        const length = Math.min(4, Math.max(0.3, seconds * 0.95)) * long;
        const dir = x >= 0 ? 1 : -1;
        const src = kit.noise(t, length + 0.05);
        const band = AC.createBiquadFilter();
        band.type = 'bandpass';
        const centre = 2600 * bright;
        band.frequency.setValueAtTime(centre * (1 - 0.1 * dir), t);
        band.frequency.linearRampToValueAtTime(centre * (1 + 0.1 * dir), t + length);
        band.Q.value = 0.35;
        const soft = AC.createBiquadFilter();
        soft.frequency.value = Math.min(16000, 6000 * bright);
        // a smooth swell (a raised sine), no corners
        const shape = Float32Array.from({ length: 33 }, (_, i) => 0.12 * v * Math.pow(Math.sin((Math.PI * i) / 32), 1.5));
        const gain = AC.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.setValueCurveAtTime(shape, t, length);
        const pan = AC.createStereoPanner();
        pan.pan.setValueAtTime(-0.35 * dir, t);
        pan.pan.linearRampToValueAtTime(0.35 * dir, t + length);
        src.connect(band).connect(soft).connect(gain).connect(pan).connect(out);
        return [src];
    },
    // A felt tom: a low sine falling a little in pitch, a soft thump.
    // Its variation is its pitch, half an octave either way (fills fall
    // from high to low).
    tom(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const freq = 105 * Math.pow(bright, 0.3) * Math.pow(2, 0.5 * x);
        const osc = AC.createOscillator();
        osc.frequency.setValueAtTime(freq * 1.5, t);
        osc.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
        const decay = 0.32 * long;
        osc.connect(envelope(AC, t, 0.75 * v, 0.004, decay)).connect(out);
        osc.start(t);
        osc.stop(t + decay + 0.05);
        const thump = kit.noise(t, 0.05);
        const low = AC.createBiquadFilter();
        low.frequency.value = 900 * bright;
        thump.connect(low).connect(envelope(AC, t, 0.1 * v, 0.001, 0.03)).connect(out);
        return [osc, thump];
    },
    // A soft clap: three quick bursts of band-passed noise and a short tail.
    clap(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const decay = 0.13 * long * (1 + 0.2 * x);
        const src = kit.noise(t, decay + 0.08);
        const band = AC.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1400 * bright * Math.pow(2, 0.25 * x);
        band.Q.value = 0.9;
        const gain = AC.createGain();
        const peak = 0.3 * v;
        gain.gain.setValueAtTime(0, t);
        [0, 0.011, 0.022].forEach((d) => {
            gain.gain.setValueAtTime(peak, t + d);
            gain.gain.exponentialRampToValueAtTime(peak * 0.15, t + d + 0.009);
        });
        gain.gain.setValueAtTime(peak * 0.8, t + 0.031);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.031 + decay);
        src.connect(band).connect(gain).connect(out);
        return [src];
    },
    // The crisp kit. A snare: a short tuned body under a bright, snappy
    // burst of noise (the snares), ringing a little.
    snare(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const pitch = Math.pow(bright, 0.3) * (1 + 0.05 * x);
        const body = AC.createOscillator();
        body.type = 'triangle';
        body.frequency.setValueAtTime(260 * pitch, t);
        body.frequency.exponentialRampToValueAtTime(175 * pitch, t + 0.05);
        body.connect(envelope(AC, t, 0.32 * v, 0.001, 0.09 * long)).connect(out);
        body.start(t);
        body.stop(t + 0.09 * long + 0.05);
        const decay = 0.17 * long * (1 + 0.2 * x);
        const src = kit.noise(t, decay + 0.05);
        const band = AC.createBiquadFilter();
        band.type = 'highpass';
        band.frequency.value = Math.min(12000, 1800 * bright * Math.pow(2, 0.25 * x));
        src.connect(band).connect(envelope(AC, t, 0.32 * v, 0.001, decay)).connect(out);
        return [body, src];
    },
    // A punchy kick: a faster, higher drop than the felt one, a hard click, a shorter body.
    punch(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const osc = AC.createOscillator();
        const pitch = Math.pow(bright, 0.4) * (1 + 0.06 * x);
        osc.frequency.setValueAtTime(190 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(52 * pitch, t + 0.05);
        const decay = 0.24 * long;
        osc.connect(envelope(AC, t, 0.95 * v, 0.002, decay)).connect(out);
        osc.start(t);
        osc.stop(t + decay + 0.05);
        const click = kit.noise(t, 0.02);
        const tone = AC.createBiquadFilter();
        tone.type = 'highpass';
        tone.frequency.value = 2500 * bright;
        click.connect(tone).connect(envelope(AC, t, 0.22 * v, 0.001, 0.012)).connect(out);
        return [osc, click];
    },
    // A bright, tight hat: noise and a few inharmonic square tones, high-passed - an electronic "tss".
    sizzle(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const decay = 0.06 * long * (1 + 0.4 * x);
        const high = AC.createBiquadFilter();
        high.type = 'highpass';
        high.frequency.value = Math.min(16000, 8500 * bright * Math.pow(2, 0.2 * x));
        high.connect(envelope(AC, t, 0.1 * v, 0.001, decay)).connect(out);
        const src = kit.noise(t, decay + 0.03);
        src.connect(high);
        const tones = [2000, 3010, 4530, 5740].map((freq) => {
            const osc = AC.createOscillator();
            osc.type = 'square';
            osc.frequency.value = freq * Math.pow(bright, 0.3);
            osc.connect(high);
            osc.start(t);
            osc.stop(t + decay + 0.05);
            return osc;
        });
        return [src, ...tones];
    },
    // A soft ride: high noise and a few inharmonic partials ringing on.
    ride(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const decay = 0.7 * long * (1 + 0.2 * x);
        const src = kit.noise(t, decay + 0.05);
        const band = AC.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = Math.min(15000, 7500 * bright * Math.pow(2, 0.2 * x));
        band.Q.value = 0.6;
        src.connect(band).connect(envelope(AC, t, 0.09 * v, 0.002, decay)).connect(out);
        const partials = [3150, 4420, 5890].map((freq) => {
            const osc = AC.createOscillator();
            osc.frequency.value = freq * Math.pow(bright, 0.3) * (1 + 0.02 * x);
            osc.connect(envelope(AC, t, 0.012 * v, 0.002, decay * 0.8)).connect(out);
            osc.start(t);
            osc.stop(t + decay + 0.05);
            return osc;
        });
        return [src, ...partials];
    },
    // A soft crash: a wash of high noise swelling in a little, with inharmonic
    // partials ringing under it; long, and darker as it dies.
    crash(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const decay = 2.2 * long * (1 + 0.2 * x);
        const src = kit.noise(t, decay + 0.1);
        const band = AC.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.setValueAtTime(Math.min(15000, 6500 * bright * Math.pow(2, 0.2 * x)), t);
        band.frequency.exponentialRampToValueAtTime(Math.min(15000, 3500 * bright), t + decay);
        band.Q.value = 0.5;
        src.connect(band).connect(envelope(AC, t, 0.1 * v, 0.012, decay)).connect(out);
        const partials = [2300, 3410, 4870, 6260].map((freq) => {
            const osc = AC.createOscillator();
            osc.frequency.value = freq * Math.pow(bright, 0.3) * (1 + 0.02 * x);
            osc.connect(envelope(AC, t, 0.01 * v, 0.01, decay * 0.7)).connect(out);
            osc.start(t);
            osc.stop(t + decay + 0.1);
            return osc;
        });
        return [src, ...partials];
    },
    // A ride bell: a clear, short "ting" of inharmonic partials with a
    // breath of noise at the start.
    bell(kit, { t, v, x, bright, long, out }) {
        const { AC } = kit;
        const pitch = Math.pow(bright, 0.5) * Math.pow(2, 0.15 * x);
        const decay = 0.9 * long;
        const partials = [[1, 0.1, 1], [1.504, 0.06, 0.7], [2.46, 0.04, 0.45], [3.62, 0.02, 0.3]].map(([ratio, level, length]) => {
            const osc = AC.createOscillator();
            osc.frequency.value = 1650 * ratio * pitch;
            osc.connect(envelope(AC, t, level * v, 0.001, decay * length)).connect(out);
            osc.start(t);
            osc.stop(t + decay * length + 0.05);
            return osc;
        });
        const tick = kit.noise(t, 0.05);
        const high = AC.createBiquadFilter();
        high.type = 'highpass';
        high.frequency.value = Math.min(16000, 6000 * bright);
        tick.connect(high).connect(envelope(AC, t, 0.04 * v, 0.001, 0.03)).connect(out);
        return [tick, ...partials];
    },
};

// The longest a hit sounds (a long swish at full length).
const HIT_SECONDS = 8.1;

class DrumKit {
    constructor({ context = audioContext, reverbHub = null, externalEffects = false, sourceOnly = false } = {}) {
        this.AC = context;
        this.polyphony = 0;
        this.bus = this.AC.createGain();
        // per drum: its level, then its place in the stereo field
        this.drumOut = Object.fromEntries((sourceOnly ? [] : DRUMS).map((name) => {
            const level = this.AC.createGain();
            const pan = this.AC.createStereoPanner();
            pan.pan.value = PAN[name];
            level.connect(pan).connect(this.bus);
            return [name, level];
        }));
        this.output = this.AC.createGain();
        this.reverb = null;
        if(externalEffects)this.bus.connect(this.output);
        else {
            this.reverb = makeDrumRoom(this.AC, reverbHub);
            this.reverb.defer(); // until the drums play (Generator.warmRoles, wake)
            this.reverb.setType('reverb3');
            [].concat(this.reverb.getNode()).forEach((node) => this.bus.connect(node));
            this.reverb.connect(this.output);
        }
        // what render.js reads off an instrument
        this.preset = { gainRelease: HIT_SECONDS };

        this.sources = new Set();
        this.hitCount = 0;
        this.bookings = [];
        this.voicePreset = null;
        this.destinations = [];
        this.awake = false;
        this.soundUntil = 0;
        this.sleepTimer = null;
        // A derived persistent source supplies its own level controls.
        if (sourceOnly) this.kit = defaultDrumKit();
        else this.setKit(defaultDrumKit());
    }

    /** The kit's sound (percussion.js defaultDrumKit): room, and per drum on / level / tone / decay. */
    setKit(kit) {
        const retone = this.voicePreset && this.kit && DRUMS.some(name => this.kit[name].tone !== kit[name].tone || this.kit[name].decay !== kit[name].decay);
        this.kit = kit;
        const now = this.AC.currentTime;
        DRUMS.forEach((name) => {
            const { on, level } = kit[name];
            this.drumOut[name].gain.setTargetAtTime(on ? level : 0, now, 0.02);
        });
        if (this.reverb && this.reverb.amount !== kit.room) this.reverb.setAmount(kit.room);
        if (retone) this.setVoicePreset(this.voicePreset,{force:true});
    }

    futureBookings() {
        return this.bookings.filter(e => e.time >= this.AC.currentTime);
    }

    setVoicePreset(id,{force=false}={}) {
        if(percussionVoice(id).wasmOnly)throw Error(percussionVoice(id).name+' requires the Wasm percussion backend.');
        if (this.voicePreset === id && !force) return;
        const future = this.futureBookings();
        // Native compatibility needs to rebuild only not-yet-started nodes.
        // Already sounding hits keep their natural envelopes and tails.
        for (const event of future) for (const source of event.sources) {
            try {source.stop(this.AC.currentTime);} catch { /* already ended */ }
            this.sources.delete(source);
        }
        this.bookings = [];
        this.voicePreset = percussionVoice(id).id;
        this.preset = {...this.preset,name:percussionVoice(id).name,kind:'percussion',voice:this.voicePreset};
        for (const event of future) this.scheduleNote(event.drum,event.time,event.duration,event.velocity,event.vary);
    }

    connect(destination) {
        this.destinations.push(destination);
        if (this.awake) this.output.connect(destination);
    }

    disconnect() {
        this.output.disconnect();
        this.destinations = [];
    }

    // A noise source starting at a varying place in the buffer.
    noise(time, seconds) {
        const src = this.AC.createBufferSource();
        src.buffer = noiseBuffer(this.AC);
        // looped, so a long hit never runs off the buffer's end
        src.loop = true;
        src.start(time, (this.hitCount * 0.137) % 1.4, seconds);
        return src;
    }

    /**
     * Books one hit.
     * @param {number} drum - index into DRUMS
     * @param {number} time - AudioContext time
     * @param {number} [duration] - seconds (a swish lasts it; other hits have their own length)
     * @param {number} [velocity=0.7]
     * @param {number} [vary=0] - this hit's variation, -1..1 (percussion.js);
     *   a swish's sign is its direction
     */
    scheduleNote(drum, time, duration = 0.25, velocity = 0.7, vary = 0) {
        const requestedDrum = drum;
        drum = drumForVoice(drum,this.voicePreset);
        const name = DRUMS[drum];
        const hit = HITS[name];
        if (!hit || !this.kit[name].on) return;
        this.hitCount++;
        const { tone, decay } = this.kit[name];
        const x = Math.max(-1, Math.min(1, vary || 0));
        const args = { t: time, v: Math.max(0, Math.min(1, velocity)) * GAIN[name], x, bright: Math.pow(2, tone), long: decay, seconds: duration, out: this.drumOut[name] };
        const sources=hit(this, args);
        sources.forEach((src) => {
            this.sources.add(src);
            src.onended = () => this.sources.delete(src);
        });
        this.bookings = this.futureBookings();
        this.bookings.push({drum:requestedDrum,time,duration,velocity,vary,sources});
        this.soundUntil = Math.max(this.soundUntil, time + HIT_SECONDS);
        this.wake();
        return sources;
    }

    /** Stops every hit sounding or booked after `time`. */
    silence(time = this.AC.currentTime) {
        this.sources.forEach((src) => {
            try {
                src.stop(time + 0.02);
            } catch (e) {
                // not started yet in some browsers' eyes; it ends on its own
            }
        });
        this.sources.clear();
        this.bookings = [];
        this.soundUntil = time;
        this.scheduleSleep();
    }

    /** Drops the reverb's tail (as Instrument.flushTails). */
    flushTails() {
        if (this.reverb?.flush) return this.reverb.flush();
        const impulse = this.reverb?.node.buffer;
        if (impulse) this.reverb.node.buffer = impulse;
    }

    tailSeconds() {
        if (this.reverb?.tailSeconds) return this.reverb.tailSeconds();
        const impulse = this.reverb?.node.buffer;
        return this.reverb ? (impulse ? impulse.duration : 3) + 0.5 : 0;
    }

    wake() {
        this.reverb?.hear();
        if (!this.awake) {
            this.destinations.forEach((destination) => this.output.connect(destination));
            this.awake = true;
            if (this.reverb?.setAwake) this.reverb.setAwake(true);
        }
        this.scheduleSleep();
    }

    scheduleSleep() {
        if (this.sleepTimer) clearTimeout(this.sleepTimer);
        if (this.disposed || !this.awake) return;
        const at = this.soundUntil + this.tailSeconds();
        this.sleepTimer = setTimeout(() => {
            this.sleepTimer = null;
            if (this.AC.currentTime < at) return this.scheduleSleep();
            this.output.disconnect();
            this.awake = false;
            if (this.reverb?.setAwake) this.reverb.setAwake(false);
            return undefined;
        }, Math.max(50, (at - this.AC.currentTime) * 1000));
    }

    effectsAwake() {
        return this.awake;
    }

    dispose() {
        this.disposed = true;
        if (this.sleepTimer) clearTimeout(this.sleepTimer);
        this.silence();
        this.output.disconnect();
        this.bus.disconnect();
        this.reverb?.setAwake?.(false);
        this.reverb?.dispose?.();
        this.awake = false;
    }
}

export default DrumKit;
