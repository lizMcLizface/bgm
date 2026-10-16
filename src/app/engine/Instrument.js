// One playable synth voice-set with its own effects chain: what PolySynth
// is, minus React and minus being a module-level singleton
// (docs/DESIGN.md §2.2). Configured with the same flat preset
// objects as src/util/presetData.js, so presets made in unCAGED's synth tab
// load unchanged. Notes are booked ahead with scheduleNote(); nothing here
// uses timers.

import * as Nodes from '../../nodes';
import MonoSynth from '../../components/MonoSynth';
import { audioContext } from '../../audio/context';
import { CHROMATIC } from '../../theory/notes';
import PRESET_DEFAULTS from './presetDefaults';
import { gainEnvelopePoints, filterEnvelopeEvents, releasePoints, cancelAndHold } from './envelope';
import { minTime } from '../../util/util';
import { wanderLfo } from './wander';
import { MIN_WET } from '../../nodes/reverb';
import { SendReverb } from '../../nodes/sharedReverb';
import { blendPresets } from './morph';

// A held note is booked as if it lasted this long; its release replaces
// the tail when the key comes up.
const HELD_SECONDS = 600;

// How often a morph (morphTo) moves the parameters on.
const MORPH_STEP_MS = 80;

// 12-TET C4..B4, as in PolySynth's parseNoteString - the microtonal
// per-note multipliers scale these.
const BASE_FREQ = [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00, 415.30, 440.00, 466.16, 493.88];
const PITCH_KEYS = ['pitchC', 'pitchCSharp', 'pitchD', 'pitchDSharp', 'pitchE', 'pitchF', 'pitchFSharp', 'pitchG', 'pitchGSharp', 'pitchA', 'pitchASharp', 'pitchB'];

const eachVoice = (method, withTime = false) => (inst, value) => {
    const now = inst.AC.currentTime + 0.001;
    inst.voices.forEach((synth) => (withTime ? synth[method](value, now) : synth[method](value)));
};

// Preset key -> how to apply it, mirroring PolySynth's parameter effects.
// Keys absent here (envelopes, tuning, portamento, polyphony) are read
// from this.preset when a note is scheduled.
const PARAM_SETTERS = {
    masterVolume: (inst, v) => inst.output.setGain(v),
    masterFilterType: (inst, v) => inst.filter.setType(v),
    masterFilterFreq: (inst, v) => inst.filter.setFreq(v),
    masterFilterQ: (inst, v) => inst.filter.setQ(v),
    masterFilterGain: (inst, v) => inst.filter.setGain(v),
    vcoType: eachVoice('setWaveform'),
    vcoDutyCycle: eachVoice('setDutyCycle'),
    subOscOctaveOffset: eachVoice('setSubOscOctaveOffset'),
    subOscType: eachVoice('setSubOscWaveform'),
    osc2Type: eachVoice('setOsc2Waveform'),
    osc2DutyCycle: eachVoice('setOsc2DutyCycle'),
    osc2Detune: eachVoice('setOsc2Detune', true),
    osc2Amount: eachVoice('setOsc2Amount'),
    osc2PhaseOffset: eachVoice('setOsc2PhaseOffset', true),
    osc2OctaveOffset: eachVoice('setOsc2OctaveOffset'),
    filterType: eachVoice('setFilterType'),
    filterFreq: eachVoice('setFilterFreq'),
    filterQ: eachVoice('setFilterQ'),
    filterGain: eachVoice('setFilterGain'),
    voiceCount: eachVoice('setVoiceCount'),
    detuneSpread: eachVoice('setDetuneSpread'),
    stereoSpread: eachVoice('setStereoSpread'),
    noiseType: eachVoice('setNoiseType'),
    noiseMix: eachVoice('setNoiseMix'),
    noiseFilterEnabled: eachVoice('setNoiseFilterEnabled'),
    noiseFilterQ: eachVoice('setNoiseFilterQ'),
    distortionAmount: (inst, v) => inst.distortion.setAmount(v),
    distortionDist: (inst, v) => inst.distortion.setDistortion(v),
    flangerAmount: (inst, v) => inst.flanger.setAmount(v),
    flangerDepth: (inst, v) => inst.flanger.setDepth(v),
    flangerRate: (inst, v) => inst.flanger.setRate(v),
    flangerFeedback: (inst, v) => inst.flanger.setFeedback(v),
    flangerDelay: (inst, v) => inst.flanger.setDelay(v),
    chorusAmount: (inst, v) => inst.chorus.setAmount(v),
    chorusRate: (inst, v) => inst.chorus.setRate(v),
    chorusDepth: (inst, v) => inst.chorus.setDepth(v),
    chorusFeedback: (inst, v) => inst.chorus.setFeedback(v),
    phaserAmount: (inst, v) => inst.phaser.setAmount(v),
    phaserRate: (inst, v) => inst.phaser.setRate(v),
    phaserDepth: (inst, v) => inst.phaser.setDepth(v),
    phaserFeedback: (inst, v) => inst.phaser.setFeedback(v),
    phaserFrequency: (inst, v) => inst.phaser.setFrequency(v),
    delayTone: (inst, v) => inst.delay.setTone(v),
    delayAmount: (inst, v) => inst.delay.setAmount(v),
    delayTime: (inst, v) => inst.delay.setDelayTime(v),
    delayFeedback: (inst, v) => inst.delay.setFeedback(v),
    pingPongDelayTime: (inst, v) => inst.pingPong.setDelayTime(v),
    pingPongFeedback: (inst, v) => inst.pingPong.setFeedback(v),
    pingPongTone: (inst, v) => inst.pingPong.setTone(v),
    pingPongAmount: (inst, v) => inst.pingPong.setAmount(v),
    reverbAmount: (inst, v) => inst.reverb.setAmount(v),
    reverbType: (inst, v) => inst.reverb.setType(v),
    bitCrushDepth: (inst, v) => inst.bitCrush.setBitDepth(v),
    bitCrushAmount: (inst, v) => inst.bitCrush.setAmount(v),
    vibratoRate: (inst, v) => inst.vibrato.setRate(v),
    vibratoDepth: (inst, v) => {
        inst.vibrato.setDepth(v);
        inst.setVibratoConnected(v > 0);
    },
    eqLowGain: (inst, v) => inst.eq.setLowGain(v),
    eqHighGain: (inst, v) => inst.eq.setHighGain(v),
    eqLowFreq: (inst, v) => inst.eq.setLowFreq(v),
    eqHighFreq: (inst, v) => inst.eq.setHighFreq(v),
    masterLimiterThreshold: (inst, v) => inst.limiter.setThreshold(v),
    masterLimiterRatio: (inst, v) => inst.limiter.setRatio(v),
    masterLimiterKnee: (inst, v) => inst.limiter.setKnee(v),
    masterLimiterAttack: (inst, v) => inst.limiter.setAttack(v),
    masterLimiterRelease: (inst, v) => inst.limiter.setRelease(v),
    // motion and modulation (docs/DESIGN.md §9 A)
    tremoloRate: (inst, v) => inst.motion.setTremoloRate(v),
    tremoloDepth: (inst, v) => inst.motion.setTremoloDepth(v),
    autoPanRate: (inst, v) => inst.motion.setAutoPanRate(v),
    autoPanDepth: (inst, v) => inst.motion.setAutoPanDepth(v),
    filterLfoRate: (inst, v) => inst.filterLfo.frequency.setValueAtTime(Math.max(0.01, v), inst.AC.currentTime),
    filterLfoDepth: (inst, v) => {
        inst.filterLfoDepth.gain.setValueAtTime(v, inst.AC.currentTime);
        inst.setFilterLfoConnected(v > 0);
    },
    fmRatio: (inst) => inst.updateFm(),
    fmIndex: (inst) => inst.updateFm(),
    fmEnvAmount: (inst) => inst.updateFm(),
    fmDecay: (inst) => inst.updateFm(),
};

// The effect chain, in order, and when each effect actually changes the
// sound (otherwise it is routed around - see Instrument.updateChain).
const EFFECT_STAGES = [
    { key: 'motion', active: (p) => p.tremoloDepth > 0 || p.autoPanDepth > 0 },
    { key: 'distortion', active: (p) => p.distortionAmount > 0 },
    { key: 'flanger', active: (p) => p.flangerAmount > 0 },
    { key: 'chorus', active: (p) => p.chorusAmount > 0 },
    { key: 'phaser', active: (p) => p.phaserAmount > 0 },
    { key: 'bitCrush', active: (p) => p.bitCrushAmount > 0 },
    { key: 'delay', active: (p) => p.delayAmount > 0 },
    { key: 'pingPong', active: (p) => p.pingPongAmount > 0 },
    { key: 'reverb', active: (p) => p.reverbAmount >= MIN_WET },
    { key: 'eq', active: (p) => p.eqLowGain !== 0 || p.eqHighGain !== 0 },
    { key: 'filter', active: (p) => !(p.masterFilterType === 'lowpass' && p.masterFilterFreq >= 11000) },
];

const ENVELOPE_KEYS = new Set([
    'gainAttack', 'gainHold', 'gainHoldLevel', 'gainDecay', 'gainSustain', 'gainRelease',
    'envelopeAttackShape', 'envelopeDecayShape', 'envelopeReleaseShape',
    'envelopeAttackExponent', 'envelopeDecayExponent', 'envelopeReleaseExponent',
    'filterAttack', 'filterDecay', 'filterRelease', 'filterEnvAmount',
]);

class Instrument {
    /**
     * @param {object} [options]
     * @param {number} [options.polyphony=8] - voices; a role's real need
     *   (bass 2, lead 2, pad 8) is the cheapest performance win (plan §5)
     * @param {object} [options.preset]
     * @param {BaseAudioContext} [options.context]
     */
    constructor({ polyphony = 8, preset = {}, context = audioContext, deferReverb = false, reverbHub = null } = {}) {
        this.AC = context;
        this.polyphony = polyphony;

        this.synthMix = new Nodes.Compressor(this.AC);
        this.distortion = new Nodes.Distortion(this.AC);
        this.flanger = new Nodes.Flanger(this.AC);
        this.chorus = new Nodes.Chorus(this.AC);
        this.phaser = new Nodes.Phaser(this.AC);
        this.bitCrush = new Nodes.BitCrusher(this.AC);
        this.delay = new Nodes.Delay(this.AC);
        this.pingPong = new Nodes.PingPongDelay(this.AC);
        // one shared with the other voices, or its own (nodes/sharedReverb.js)
        this.reverb = reverbHub ? new SendReverb(this.AC, reverbHub) : new Nodes.Reverb(this.AC);
        if (deferReverb) this.reverb.defer();
        this.eq = new Nodes.EQ2(this.AC);
        this.filter = new Nodes.Filter(this.AC);
        this.limiter = new Nodes.Compressor(this.AC);
        this.output = new Nodes.Gain(this.AC);
        this.vibrato = new Nodes.LFO(this.AC);
        this.motion = new Nodes.Motion(this.AC);
        // Filter LFO, in cents on every voice's cutoff (wired only while it
        // has depth - see setFilterLfoConnected).
        this.filterLfo = this.AC.createOscillator();
        this.filterLfoDepth = this.AC.createGain();
        this.filterLfoDepth.gain.value = 0;
        this.filterLfo.connect(this.filterLfoDepth);
        this.filterLfo.start();
        this.filterLfoConnected = false;
        // Slow wander (wander.js) in cents on the voices' cutoff and pitch;
        // each wave is made, and wired, only once it has depth.
        this.wanderLfos = {};
        this.filterWanderConnected = false;
        this.filterWanderOn = false;
        this.pitchWanderOn = false;
        this.pitchWanderOut = this.AC.createGain();
        // What the voices wire to their oscillators' detune: the vibrato and the pitch wander.
        this.pitchTap = { connect: (destination) => { this.vibrato.connect(destination); this.pitchWanderOut.connect(destination); } };

        // Same order as PolySynth's initSynth. Each effect sits between its
        // own input/output gain nodes, so the chain can route around it.
        this.stages = EFFECT_STAGES.map(({ key, active }) => {
            const stage = { key, active, input: this.AC.createGain(), output: this.AC.createGain(), on: null };
            [].concat(this[key].getNode()).forEach((node) => stage.input.connect(node));
            this[key].connect(stage.output);
            return stage;
        });
        this.limiter.connect(this.output.getNode());

        // Compressing all voices together to avoid clipping, as PolySynth does.
        this.synthMix.setThreshold(-6);
        this.synthMix.setKnee(0);
        this.synthMix.setRatio(20);

        const startTime = this.AC.currentTime + 0.01;
        this.voices = Array.from({ length: polyphony }, () => {
            const synth = new MonoSynth(this.AC);
            // Voices start asleep (disconnected); see wake()/sleepIdle().
            synth.connectVibratoToAll(this.pitchTap);
            synth.init(startTime);
            // Auto-resync recreates oscillators after 5s without noteOn
            // activity - a scheduleNote()d pad would trip it mid-note.
            synth.setAutoResyncEnabled(false);
            return synth;
        });
        this.vibrato.start();
        this.vibratoConnected = true;

        // Per voice: when its last booked note (incl. release) goes silent.
        this.busyUntil = new Array(polyphony).fill(0);
        this.nextVoice = 0;
        // Voices connected to the mix right now. An idle voice is
        // disconnected, which makes its oscillators/filters unreachable from
        // the output so the browser stops rendering them; it is woken when a
        // note is booked (ahead of time, while still silent) and put back to
        // sleep once its last release has ended.
        this.awake = new Array(polyphony).fill(false);
        this.sleepTimer = null;
        // Held (live-played) notes: id -> { index, voiceId }.
        this.held = new Map();
        this.heldIds = 0;
        // The effects chain sleeps as well (output disconnected, so nothing
        // in it renders) once every voice is asleep and the effects' tails
        // have died away: a reverb or delay fed silence costs as much as one
        // fed music. soundUntil: when the last booked sound (incl. release)
        // ends. It starts asleep; the first booked note wakes it.
        this.destinations = [];
        this.chainAwake = false;
        this.soundUntil = 0;
        // Set by flushTails: the effects are silent from then on, whatever
        // their tail would have been. A new note clears it.
        this.quietAt = Infinity;

        this.preset = null;
        this.chainSignature = null;
        this.applyPreset(preset);
    }

    connect(destination) {
        this.destinations.push(destination);
        if (this.chainAwake) this.output.connect(destination);
    }

    disconnect() {
        this.output.disconnect();
        this.destinations = [];
    }

    /**
     * Applies a full or partial preset; missing keys take PolySynth's
     * defaults. Only keys whose value differs from the current one touch
     * the audio graph (some setters rebuild waveforms on every voice).
     */
    applyPreset(preset) {
        const next = { ...PRESET_DEFAULTS, ...preset };
        Object.keys(next).forEach((key) => this.set(key, next[key]));
    }

    /**
     * Glides to a preset over `seconds` of audio time instead of jumping
     * (blendPresets: numbers glide, choices switch halfway). Notes booked
     * meanwhile use the sound as it is then. An edit, another preset or
     * dispose() ends it, with the target applied.
     */
    morphTo(preset, seconds) {
        this.finishMorph();
        const to = { ...PRESET_DEFAULTS, ...preset };
        const from = { ...PRESET_DEFAULTS, ...this.preset };
        const changing = Object.keys(to).filter((key) => from[key] !== to[key]);
        if (!changing.length) return;
        if (!(seconds > 0.25)) {
            this.applyPreset(to);
            return;
        }
        const start = this.AC.currentTime;
        const morph = { to, stepping: false, timer: null };
        this.morph = morph;
        morph.timer = setInterval(() => {
            const t = (this.AC.currentTime - start) / seconds;
            if (t >= 1) {
                this.finishMorph();
                return;
            }
            const blended = blendPresets(from, to, t);
            morph.stepping = true;
            changing.forEach((key) => this.set(key, blended[key]));
            morph.stepping = false;
        }, MORPH_STEP_MS);
    }

    /** Ends a morph at once, on its target. */
    finishMorph() {
        const { morph } = this;
        if (!morph) return;
        this.morph = null;
        clearInterval(morph.timer);
        this.applyPreset(morph.to);
    }

    /** Sets one preset parameter live - what the synth editor's knobs call. */
    set(key, value) {
        if (this.morph && !this.morph.stepping) this.finishMorph();
        if (this.preset && this.preset[key] === value) return;
        this.preset = { ...this.preset, [key]: value };
        const setter = PARAM_SETTERS[key];
        if (setter) setter(this, value);
        if (ENVELOPE_KEYS.has(key)) this.updateEnvelopes();
        this.updateChain();
    }

    // Routes the signal only through effects that change it. An effect at
    // 0% wet still processes every sample, and a skipped one is unreachable
    // from the output, so the browser stops rendering it - the main saving
    // of docs/DESIGN.md §5. Rewires only when the active set changes.
    updateChain() {
        const p = { ...PRESET_DEFAULTS, ...this.preset };
        const active = this.stages.filter((stage) => stage.active(p));
        const signature = active.map((stage) => stage.key).join();
        if (signature === this.chainSignature) return;
        this.chainSignature = signature;

        this.synthMix.getNode().disconnect();
        this.stages.forEach((stage) => stage.output.disconnect());
        let previous = this.synthMix.getNode();
        active.forEach((stage) => {
            previous.connect(stage.input);
            previous = stage.output;
        });
        previous.connect(this.limiter.getNode());
    }

    // Vibrato is wired to the oscillators only while it has depth: an
    // oscillator with its detune connected costs several times more.
    setVibratoConnected(wanted) {
        const connected = wanted || this.pitchWanderOn;
        if (connected === this.vibratoConnected) return;
        this.vibratoConnected = connected;
        if (!connected) {
            this.vibrato.getDepthNode().disconnect();
            this.pitchWanderOut.disconnect();
        }
        this.voices.forEach((synth) => synth.setVibratoEnabled(connected));
    }

    // Same for the filter LFO on the voices' cutoff: a filter whose detune
    // has an input recomputes its coefficients every sample.
    setFilterLfoConnected(connected) {
        if (connected === this.filterLfoConnected) return;
        this.filterLfoConnected = connected;
        this.voices.forEach((synth) => {
            const detune = synth.filter.getNode().detune;
            if (connected) this.filterLfoDepth.connect(detune);
            else this.filterLfoDepth.disconnect(detune);
        });
    }

    // Wires the wander in cents to every voice's cutoff, like the filter LFO.
    setFilterWanderConnected(connected) {
        if (connected === this.filterWanderConnected) return;
        this.filterWanderConnected = connected;
        const depth = this.wanderLfos.filter.depth;
        this.voices.forEach((synth) => {
            const detune = synth.filter.getNode().detune;
            if (connected) depth.connect(detune);
            else depth.disconnect(detune);
        });
    }

    /**
     * Slow drift of the cutoff and the pitch (wander.js instrumentWander):
     * +- `filter` / `pitch` cents on waves of `periods`, from `phases`
     * (`offset` seconds into them, and `immediate`: no easing in, for
     * renders). 0 stops a movement.
     */
    setWander({ filter = 0, pitch = 0, periods, phases, offset = 0, immediate = false }) {
        const now = this.AC.currentTime;
        [['filter', filter], ['pitch', pitch]].forEach(([kind, cents]) => {
            let lfo = this.wanderLfos[kind];
            if (!lfo) {
                if (!cents) return;
                lfo = wanderLfo(this.AC, { period: periods[kind], phase: phases[kind], offset });
                this.wanderLfos[kind] = lfo;
                if (kind === 'pitch') lfo.depth.connect(this.pitchWanderOut);
            }
            lfo.setPeriod(periods[kind]);
            if (immediate) lfo.depth.gain.value = cents;
            else lfo.depth.gain.setTargetAtTime(cents, now, 0.3);
        });
        this.filterWanderOn = filter > 0;
        this.pitchWanderOn = pitch > 0;
        if (this.filterWanderOn) this.setFilterWanderConnected(true);
        if (this.pitchWanderOn) this.setVibratoConnected(this.preset.vibratoDepth > 0);
        if ((this.wanderLfos.filter && !filter) || (this.wanderLfos.pitch && !pitch)) this.unwireWanderSoon();
    }

    // Once a stopped movement has eased out, unwires it (a wired detune costs).
    unwireWanderSoon() {
        clearTimeout(this.wanderTimer);
        this.wanderTimer = setTimeout(() => {
            if (!this.filterWanderOn && this.wanderLfos.filter) this.setFilterWanderConnected(false);
            if (!this.pitchWanderOn) this.setVibratoConnected(this.preset.vibratoDepth > 0);
        }, 1500);
    }

    updateFm() {
        const p = { ...PRESET_DEFAULTS, ...this.preset };
        const fm = { ratio: p.fmRatio, index: p.fmIndex, envAmount: p.fmEnvAmount, decay: p.fmDecay };
        this.voices.forEach((synth) => synth.setFm(fm));
    }

    /**
     * Seconds the effects keep sounding after the voices stop: the reverb's
     * impulse plus each delay's echoes dying away to -80 dB, and a margin
     * for the short modulation effects.
     */
    tailSeconds() {
        const p = { ...PRESET_DEFAULTS, ...this.preset };
        const echoes = (amount, time, feedback) => {
            if (!(amount > 0)) return 0;
            const fb = Math.min(Math.max(feedback, 0.01), 0.95);
            return time * Math.ceil(Math.log(1e-4) / Math.log(fb));
        };
        const impulse = this.reverb.node.buffer;
        const reverb = p.reverbAmount >= MIN_WET && !this.reverb.shared ? (impulse ? impulse.duration : 10) : 0;
        return reverb
            + echoes(p.delayAmount, p.delayTime, p.delayFeedback)
            + echoes(p.pingPongAmount, p.pingPongDelayTime, p.pingPongFeedback)
            + 0.5;
    }

    /**
     * Drops what the effects are still ringing with - reverb tail, delay
     * echoes - so a stopped instrument is silent now and its chain can
     * sleep. Giving the convolver its impulse again resets it; each delay's
     * output and feedback are held at 0 until its line has emptied. Call it
     * once the output has been faded out (Generator.stop), or it clicks.
     */
    flushTails() {
        const now = this.AC.currentTime;
        const impulse = this.reverb.node.buffer;
        if (impulse) this.reverb.node.buffer = impulse;
        const holdAtZero = (param, seconds) => {
            const value = param.value;
            param.cancelScheduledValues(now);
            param.setValueAtTime(0, now);
            param.setValueAtTime(value, now + seconds);
        };
        // delay lines are at most 1 s long (src/nodes/delay.js, pingPongDelay.js)
        const drain = 1.05;
        [this.delay.wetGain, this.delay.feedbackGain, this.pingPong.wetGain, this.pingPong.leftFeedbackGain, this.pingPong.rightFeedbackGain]
            .forEach((gain) => holdAtZero(gain.getNode().gain, drain));
        this.quietAt = now + drain;
        this.scheduleSleep();
    }

    /** Effects currently in the signal path (for diagnostics). */
    activeEffects() {
        return this.chainSignature ? this.chainSignature.split(',').filter(Boolean) : [];
    }

    // Envelopes are read at scheduleNote time, so they are plain objects.
    updateEnvelopes() {
        const p = { ...PRESET_DEFAULTS, ...this.preset };
        this.gainEnv = {
            attack: p.gainAttack,
            hold: p.gainHold,
            holdLevel: p.gainHoldLevel,
            decay: p.gainDecay,
            sustain: p.gainSustain,
            release: p.gainRelease,
            attackShape: p.envelopeAttackShape,
            decayShape: p.envelopeDecayShape,
            releaseShape: p.envelopeReleaseShape,
            attackExponent: p.envelopeAttackExponent,
            decayExponent: p.envelopeDecayExponent,
            releaseExponent: p.envelopeReleaseExponent,
        };
        this.filterEnv = {
            attack: p.filterAttack,
            decay: p.filterDecay,
            release: p.filterRelease,
            amount: p.filterEnvAmount,
        };
    }

    // Per-note cutoff offset in cents: key tracking (octaves of cutoff per
    // octave from C4) and velocity (cents per unit of velocity from 0.6).
    filterOffset(midi, velocity) {
        const p = this.preset;
        return (p.filterKeyTrack || 0) * (midi - 60) * 100 + (p.filterVelocity || 0) * (velocity - 0.6);
    }

    // What MonoSynth.scheduleNote needs besides the gain envelope.
    notePlan(midi, velocity, duration, gainPoints) {
        const offset = this.filterOffset(midi, velocity);
        const filterEvents = filterEnvelopeEvents(this.filterEnv, duration)
            .map((e) => (offset ? { ...e, value: e.value + offset } : e));
        return {
            gainPoints,
            filterEvents,
            filterOffset: offset,
            portamentoSpeed: this.polyphony === 1 ? this.preset.portamentoSpeed : 0,
            pitchEnv: { amount: this.preset.pitchEnvAmount || 0, decay: this.preset.pitchEnvDecay || 0 },
        };
    }

    /** MIDI note number -> MonoSynth noteInfo, honouring the preset's microtonal tuning. */
    noteInfo(midi) {
        const pc = ((midi % 12) + 12) % 12;
        const oct = Math.floor(midi / 12) - 1;
        const p = this.preset;
        const freq = BASE_FREQ[pc] * p[PITCH_KEYS[pc]] * p.allThemPitches * Math.pow(p.octaveRatio, oct - 4);
        return { freq, note: `${CHROMATIC[pc]}${oct}`, oct };
    }

    // A voice silent by `time` if there is one (round-robin from the last
    // pick, as PolySynth does); otherwise steal the one that frees soonest.
    allocateVoice(time) {
        for (let i = 0; i < this.polyphony; i++) {
            const v = (this.nextVoice + i) % this.polyphony;
            if (this.busyUntil[v] <= time) {
                this.nextVoice = (v + 1) % this.polyphony;
                return { index: v, steal: false };
            }
        }
        let index = 0;
        for (let v = 1; v < this.polyphony; v++) {
            if (this.busyUntil[v] < this.busyUntil[index]) index = v;
        }
        return { index, steal: true };
    }

    /**
     * Books one note.
     * @param {number} midi - MIDI note number (60 = C4)
     * @param {number} startTime - AudioContext time
     * @param {number} duration - seconds until release starts
     * @param {number} [velocity=0.8] - 0..1, scales envelope levels
     * @param {number} [detune=0] - cents, for humanized pitch
     */
    scheduleNote(midi, startTime, duration, velocity = 0.8, detune = 0) {
        const { points, releaseEnd } = gainEnvelopePoints(this.gainEnv, velocity, duration);

        const { index, steal } = this.allocateVoice(startTime);
        const info = this.noteInfo(midi);
        if (detune) info.freq *= Math.pow(2, detune / 1200);
        this.voices[index].scheduleNote(info, this.notePlan(midi, velocity, duration, points), startTime, steal);
        this.busyUntil[index] = startTime + releaseEnd;
        this.soundUntil = Math.max(this.soundUntil, startTime + releaseEnd);
        this.quietAt = Infinity;
        this.wake(index);
    }

    /**
     * Starts a note that sounds until stopNote (keyboard / MIDI play).
     * Same envelopes as scheduleNote, no timers.
     * @returns {number} id for stopNote
     */
    startNote(midi, velocity = 0.8) {
        const now = this.AC.currentTime + 0.005;
        const { points } = gainEnvelopePoints(this.gainEnv, velocity, HELD_SECONDS);
        const plan = this.notePlan(midi, velocity, HELD_SECONDS, points);
        const { index, steal } = this.allocateVoice(now);
        const voice = this.voices[index];
        voice.scheduleNote(this.noteInfo(midi), plan, now, steal);
        this.busyUntil[index] = Infinity;
        this.quietAt = Infinity;
        this.wake(index);
        const id = ++this.heldIds;
        this.held.set(id, { index, voiceId: voice.voiceId, filterOffset: plan.filterOffset });
        return id;
    }

    /** Releases a note from startNote - unless its voice was taken since. */
    stopNote(id) {
        const held = this.held.get(id);
        if (!held) return;
        this.held.delete(id);
        const voice = this.voices[held.index];
        if (voice.voiceId !== held.voiceId) return;
        const now = this.AC.currentTime;
        const gain = voice.gain.getNode().gain;
        const level = gain.value;
        cancelAndHold(gain, now);
        const points = releasePoints(this.gainEnv, level);
        gain.setValueAtTime(level, now);
        points.slice(1).forEach(([t, v]) => gain.linearRampToValueAtTime(v, now + t));
        const detune = voice.filter.getNode().detune;
        cancelAndHold(detune, now);
        detune.setTargetAtTime(held.filterOffset, now, Math.max(this.filterEnv.release, minTime));
        this.busyUntil[held.index] = now + points[points.length - 1][0];
        this.soundUntil = Math.max(this.soundUntil, this.busyUntil[held.index]);
        this.scheduleSleep();
    }

    /** Fades every voice out quickly, cancelling anything booked after `time`. */
    silence(time = this.AC.currentTime) {
        this.voices.forEach((synth, i) => {
            const gain = synth.gain.getNode().gain;
            cancelAndHold(gain, time);
            gain.setTargetAtTime(0, time, 0.05);
            this.busyUntil[i] = 0;
        });
        this.soundUntil = time + 0.5; // the fade, to below -80 dB
        this.held.clear();
        if (this.sleepTimer) clearTimeout(this.sleepTimer);
        this.sleepTimer = setTimeout(() => this.sleepIdle(), 300);
    }

    wake(index) {
        this.reverb.hear();
        if (!this.chainAwake) {
            this.destinations.forEach((destination) => this.output.connect(destination));
            this.chainAwake = true;
            if (this.reverb.setAwake) this.reverb.setAwake(true);
        }
        if (!this.awake[index]) {
            this.voices[index].volume.getNode().connect(this.synthMix.getNode());
            this.awake[index] = true;
        }
        this.scheduleSleep();
    }

    // Disconnects voices whose last note (incl. release) has finished. A
    // small margin covers effect-free tails inside the voice. Then the
    // effects chain, once nothing has sounded for its tail time.
    sleepIdle() {
        this.sleepTimer = null;
        const now = this.AC.currentTime;
        this.voices.forEach((voice, i) => {
            if (this.awake[i] && this.busyUntil[i] + 0.2 < now) {
                voice.volume.getNode().disconnect();
                this.awake[i] = false;
            }
        });
        if (this.chainAwake && !this.awake.some(Boolean) && this.silentFrom() < now) {
            this.output.disconnect();
            this.chainAwake = false;
            if (this.reverb.setAwake) this.reverb.setAwake(false);
        }
        this.scheduleSleep();
    }

    // One timer for the next voice due to go idle, or - all asleep - for
    // the chain (a late timer only means something stays awake a little
    // longer - harmless). Held notes keep everything awake.
    scheduleSleep() {
        const due = this.busyUntil.filter((t, i) => this.awake[i] && Number.isFinite(t));
        let at;
        if (due.length) at = Math.min(...due) + 0.25;
        else if (this.chainAwake && !this.awake.some(Boolean)) at = this.silentFrom() + 0.25;
        else return;
        const delay = Math.max(0.05, at - this.AC.currentTime);
        if (this.sleepTimer) clearTimeout(this.sleepTimer);
        this.sleepTimer = setTimeout(() => this.sleepIdle(), delay * 1000);
    }

    // When the effects will have nothing left to play.
    silentFrom() {
        return Math.min(this.soundUntil + this.tailSeconds(), this.quietAt);
    }

    /** Whether the effects chain is connected right now (for diagnostics). */
    effectsAwake() {
        return this.chainAwake;
    }

    /** How many voices are connected right now (for diagnostics). */
    awakeVoices() {
        return this.awake.filter(Boolean).length;
    }

    dispose() {
        if (this.morph) clearInterval(this.morph.timer);
        this.morph = null;
        if (this.sleepTimer) clearTimeout(this.sleepTimer);
        clearTimeout(this.wanderTimer);
        Object.values(this.wanderLfos).forEach((lfo) => lfo.dispose());
        this.silence();
        this.voices.forEach((synth) => synth.destroy());
        this.output.disconnect();
    }
}

export default Instrument;
