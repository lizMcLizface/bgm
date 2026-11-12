import{retireAudioActions,awaitRetiredPreparation}from'../../audio/retireAudio.js';
import {InstrumentConstruction,createInstrumentTransaction} from '../../audio/instrumentConstruction.js';
import {retireInstrumentPart} from './instrumentOwnedParts.js';
import {awaitPhysicalInstrumentAdmission} from '../../modular-audio/physicalInstrumentAdmission.js';
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
import { scheduleEffectTiming } from './tempoEffects';
import PRESET_DEFAULTS from './presetDefaults';
import { gainEnvelopePoints, filterEnvelopeEvents, releasePoints, cancelAndHold } from './envelope';
import { minTime } from '../../util/util';
import { wanderLfo } from './wander';
import {ControlClock} from './controlSnapshot';
import { MIN_WET } from '../../nodes/reverb';
import { SendReverb } from '../../nodes/sharedReverb';
import FdnRoom, { fdnRoomSupported } from './fdnRoom';
import { blendPresets } from './morph';
import { cleanExpression, expressiveEnvelope, expressiveSource, breathEnvelope, gateEnvelope } from './noteExpression';
import { FX_STAGES, fxTail } from './voiceFx';
import { dynamicAttack } from '../composition/dynamics';
import { isAcousticPiano } from './acousticPiano';
import { isCalibratedPiano } from './calibratedPiano';
import { isTempered, tuningCents } from './temperament';
import { pianoBufferLater } from './pianoRenderPool';
import { createPianoLiveSource } from './pianoLiveSource';
import {createPluckedLiveSource} from './pluckedLiveSource.js';
import {instrumentCompressorPolicy,LIMITER_INITIAL_FIELDS} from './instrumentCompressorPolicy.js';

// A held note is booked as if it lasted this long; its release replaces
// the tail when the key comes up.
const HELD_SECONDS = 600;
const ownedSourceOf = instrument => instrument.pluckedSource ?? instrument.pianoSource;
// A prepared physical source owns one material for its entire lifetime. Reject
// before preset setters or a pending morph can touch the existing source/rack.
function assertOwnedMaterial(instrument, next) {
    const current = instrument.preset?.stringModel;
    if (instrument.sourceBackend === 'owned-rust' && current !== undefined && current !== next)
        throw Error('Changing owned physical source material requires a fresh instrument');
}

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
    reverbDecay: (inst, v) => inst.reverb.setDecay(v),
    reverbDamping: (inst, v) => inst.reverb.setDamping(v),
    reverbPredelay: (inst, v) => inst.reverb.setPredelay(v),
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
    eqMidGain: (inst, v) => inst.eq.setMidGain(v),
    eqMidFreq: (inst, v) => inst.eq.setMidFreq(v),
    eqMidQ: (inst, v) => inst.eq.setMidQ(v),
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
    filterLfoRate: (inst, v) => {const rate=Math.max(.01,v);inst.filterLfoCapture.rate(rate,inst.AC.currentTime);inst.filterLfo.frequency.setValueAtTime(rate, inst.AC.currentTime);},
    filterLfoDepth: (inst, v) => {
        inst.filterLfoCapture.depth(v,inst.AC.currentTime);
        inst.filterLfoDepth.gain.setValueAtTime(v, inst.AC.currentTime);
        inst.setFilterLfoConnected(v > 0);
    },
    fmRatio: (inst) => inst.updateFm(),
    fmIndex: (inst) => inst.updateFm(),
    fmEnvAmount: (inst) => inst.updateFm(),
    fmDecay: (inst) => inst.updateFm(),
};
// tape, compressor, shimmer and freeze: the stages' own setters (motion's are above)
for (const [stage, { setters }] of Object.entries(FX_STAGES)) {
    for (const [key, setter] of Object.entries(setters)) PARAM_SETTERS[key] ??= (inst, v) => setter(inst[stage], v);
}

// The effect chain, in order, and when each effect actually changes the
// sound (otherwise it is routed around - see Instrument.updateChain).
const EFFECT_STAGES = [
    { key: 'motion', active: (p) => p.tremoloDepth > 0 || p.autoPanDepth > 0 },
    { key: 'distortion', active: (p) => p.distortionAmount > 0 },
    { key: 'tape', active: FX_STAGES.tape.active },
    { key: 'flanger', active: (p) => p.flangerAmount > 0 },
    { key: 'chorus', active: (p) => p.chorusAmount > 0 },
    { key: 'phaser', active: (p) => p.phaserAmount > 0 },
    { key: 'bitCrush', active: (p) => p.bitCrushAmount > 0 },
    { key: 'compressor', active: FX_STAGES.compressor.active },
    { key: 'delay', active: (p) => p.delayAmount > 0 },
    { key: 'pingPong', active: (p) => p.pingPongAmount > 0 },
    { key: 'reverb', active: (p) => p.reverbAmount >= MIN_WET },
    { key: 'shimmer', active: FX_STAGES.shimmer.active },
    { key: 'freeze', active: FX_STAGES.freeze.active },
    { key: 'eq', active: (p) => p.eqLowGain !== 0 || p.eqMidGain !== 0 || p.eqHighGain !== 0 },
    { key: 'filter', active: (p) => !(p.masterFilterType === 'lowpass' && p.masterFilterFreq >= 11000) },
];

const DELAY_KEYS = new Set(['delayAmount', 'delayFeedback', 'pingPongAmount', 'pingPongFeedback']);

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
    constructor({ polyphony = 8, preset = {}, context = audioContext, deferReverb = false, reverbHub = null, fdnRoom = false, sourceBackend = 'native', voiceCompressorFactory = null, pianoSourceFactory = null, pluckedSourceFactory = null, ordinaryCompressorFactory = null, shimmerFactory = null, motionFactory = null, fdnRoomFactory = null } = {}) {
        if (!['native', 'owned-rust'].includes(sourceBackend)) throw Error('Unsupported instrument source backend');
        if (pianoSourceFactory !== null && typeof pianoSourceFactory !== 'function') throw Error('Invalid piano source factory');
        if (pluckedSourceFactory !== null && typeof pluckedSourceFactory !== 'function') throw Error('Invalid plucked source factory');
        if (fdnRoomFactory !== null && typeof fdnRoomFactory !== 'function') throw Error('Invalid FDN room factory');
        this.fdnRoomFactory=fdnRoom?fdnRoomFactory:null;
        if (motionFactory !== null && typeof motionFactory !== 'function') throw Error('Invalid Motion factory');
        motionFactory?.validatePreset?.({...PRESET_DEFAULTS,...preset});
        this.validateMotionPreset=motionFactory?.validatePreset;
        if (shimmerFactory !== null && typeof shimmerFactory !== 'function') throw Error('Invalid Shimmer factory');
        shimmerFactory?.validatePreset?.({...PRESET_DEFAULTS,...preset});
        this.validateShimmerPreset=shimmerFactory?.validatePreset;
        this.pianoSourceFactory = pianoSourceFactory;this.pluckedSourceFactory=pluckedSourceFactory;
        this.pendingSourceBookings = new Set(); this.sourceBackend = sourceBackend; this.pianoSource = null; this.pianoSourcePromise = null; this.pluckedSource = null; this.pluckedSourcePromise = null; this.sourceFailure = null;
        this.sourceBookingTrace = []; this.sourcePreparationLateFrames = 0; this.sourcePreparationLateBookings = 0;
        this.AC = context;
        const compressorPolicy=instrumentCompressorPolicy(context,preset,ordinaryCompressorFactory);
        this.ordinaryDynamicsOwned=compressorPolicy.owned;
        this.polyphony = polyphony;
        this.construction=new InstrumentConstruction(context);
        try {

        this.synthMix = this.construction.nested('synthMix',()=>new Nodes.Compressor(this.AC,compressorPolicy.synthMix),retireInstrumentPart);
        this.distortion = this.construction.nested('distortion',()=>new Nodes.Distortion(this.AC),retireInstrumentPart);
        this.flanger = this.construction.nested('flanger',()=>new Nodes.Flanger(this.AC),retireInstrumentPart);
        this.chorus = this.construction.nested('chorus',()=>new Nodes.Chorus(this.AC),retireInstrumentPart);
        this.phaser = this.construction.nested('phaser',()=>new Nodes.Phaser(this.AC),retireInstrumentPart);
        this.bitCrush = this.construction.nested('bitCrush',()=>new Nodes.BitCrusher(this.AC),retireInstrumentPart);
        this.tape = this.construction.nested('tape',()=>FX_STAGES.tape.create(this.AC),retireInstrumentPart);
        this.compressor = this.construction.nested('compressor',()=>(voiceCompressorFactory ?? FX_STAGES.compressor.create)(this.AC, {hostLifetime:'instrument'}),retireInstrumentPart);
        this.shimmer = this.construction.nested('shimmer',()=>(shimmerFactory ?? FX_STAGES.shimmer.create)(this.AC),retireInstrumentPart);
        this.freeze = this.construction.nested('freeze',()=>FX_STAGES.freeze.create(this.AC),retireInstrumentPart);
        this.delay = this.construction.nested('delay',()=>new Nodes.Delay(this.AC),retireInstrumentPart);
        this.pingPong = this.construction.nested('pingPong',()=>new Nodes.PingPongDelay(this.AC),retireInstrumentPart);
        // one shared with the other voices, or its own (nodes/sharedReverb.js)
        // or, for a voice the Wasm engine runs natively, the kernel's room (engine/fdnRoom.js)
        this.reverb = this.construction.nested('reverb',()=>fdnRoom && (fdnRoomFactory || fdnRoomSupported(this.AC)) ? fdnRoomFactory ? fdnRoomFactory(this.AC,'reverb1',{onError:error=>{this.effectFailure??=error instanceof Error?error:Error(String(error));}}) : new FdnRoom(this.AC, 'reverb1')
            : reverbHub ? new SendReverb(this.AC, reverbHub) : new Nodes.Reverb(this.AC),retireInstrumentPart);
        if (deferReverb) this.reverb.defer();
        this.eq = this.construction.nested('eq',()=>new Nodes.EQ2(this.AC),retireInstrumentPart);
        this.filter = this.construction.nested('filter',()=>new Nodes.Filter(this.AC),retireInstrumentPart);
        this.limiter = this.construction.nested('limiter',()=>new Nodes.Compressor(this.AC,compressorPolicy.limiter),retireInstrumentPart);
        this.output = this.construction.nested('output',()=>new Nodes.Gain(this.AC),retireInstrumentPart);
        this.vibrato = this.construction.nested('vibrato',()=>new Nodes.LFO(this.AC),retireInstrumentPart);
        this.motion = this.construction.nested('motion',()=>(motionFactory ?? FX_STAGES.motion.create)(this.AC,{hostAwake:false,onError:error=>{this.effectFailure??=error instanceof Error?error:Error(String(error));}}),retireInstrumentPart);
        // Filter LFO, in cents on every voice's cutoff (wired only while it
        // has depth - see setFilterLfoConnected).
        let filterLfoStarted=false;
        this.filterLfo = this.construction.acquire('filter LFO',()=>this.AC.createOscillator(),node=>retireAudioActions([()=>{if(filterLfoStarted)node.stop();},()=>node.disconnect()],'Instrument filter LFO retirement failed'));
        this.filterLfoCapture = new ControlClock(this.AC.currentTime,440);
        this.filterLfoDepth = this.construction.acquire('filter LFO depth',()=>this.AC.createGain(),node=>node.disconnect());
        this.filterLfoDepth.gain.value = 0;
        this.filterLfo.connect(this.filterLfoDepth);
        this.filterLfo.start();filterLfoStarted=true;
        this.filterLfoConnected = false;
        // Slow wander (wander.js) in cents on the voices' cutoff and pitch;
        // each wave is made, and wired, only once it has depth.
        this.wanderLfos = {};this.construction.acquire('lazy wander set',()=>this.wanderLfos,owners=>retireAudioActions(Object.values(owners).map(owner=>()=>owner.dispose()),'Instrument wander retirement failed'));
        this.filterWanderConnected = false;
        this.filterWanderOn = false;
        this.pitchWanderOn = false;
        this.pitchWanderOut = this.construction.acquire('pitch wander output',()=>this.AC.createGain(),node=>node.disconnect());
        // What the voices wire to their oscillators' detune: the vibrato and the pitch wander.
        this.pitchTap = { connect: (destination) => { this.vibrato.connect(destination); this.pitchWanderOut.connect(destination); },
            disconnect: destination => { try { this.vibrato.getDepthNode().disconnect(destination); } catch {} try { this.pitchWanderOut.disconnect(destination); } catch {} } };

        // Same order as PolySynth's initSynth. Each effect sits between its
        // own input/output gain nodes, so the chain can route around it.
        this.stages = EFFECT_STAGES.map(({ key, active }) => {
            const stage = { key, active, input: this.construction.acquire('stage input '+key,()=>this.AC.createGain(),node=>node.disconnect()), output: this.construction.acquire('stage output '+key,()=>this.AC.createGain(),node=>node.disconnect()), on: null };
            [].concat(this[key].getNode()).forEach((node) => stage.input.connect(node));
            this[key].connect(stage.output);
            return stage;
        });
        this.limiter.connect(this.output.getNode());

        // Compressing all voices together to avoid clipping, as PolySynth does.
        if(!compressorPolicy.offline){
            this.synthMix.setThreshold(-6);
            this.synthMix.setKnee(0);
            this.synthMix.setRatio(20);
        }

        const startTime = this.AC.currentTime + 0.01;
        this.voiceOscillatorStartTime=startTime;
        const returnedVoices=this.construction.voicePrefix();
        this.voices = Array.from({ length: polyphony }, () => {
            const synth = returnedVoices.create(()=>new MonoSynth(this.AC));
            // Voices start asleep (disconnected); see wake()/sleepIdle().
            synth.connectVibratoToAll(this.pitchTap);
            synth.stringPitchTap = this.pitchTap;
            synth.init(startTime);
            // Auto-resync recreates oscillators after 5s without noteOn
            // activity - a scheduleNote()d pad would trip it mid-note.
            synth.setAutoResyncEnabled(false);
            return synth;
        });
        this.vibrato.start();
        this.vibrato.captureClock.setActive(false,this.AC.currentTime);
        this.filterLfoCapture.setActive(false,this.AC.currentTime);
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
        this.pianoEpoch = 0; // bumped by silence(), so piano notes rendering in the background are not booked
        // The effects chain sleeps as well (output disconnected, so nothing
        // in it renders) once every voice is asleep and the effects' tails
        // have died away: a reverb or delay fed silence costs as much as one
        // fed music. soundUntil: when the last booked sound (incl. release)
        // ends. It starts asleep; the first booked note wakes it.
        this.destinations = [];
        this.chainAwake = false;
        this.externalSourceInputs = 0;
        this.soundUntil = 0;
        // Set by flushTails: the effects are silent from then on, whatever
        // their tail would have been. A new note clears it.
        this.quietAt = Infinity;
        this.heldUntil = 0;

        this.preset = null;
        this.chainSignature = null;
        this.offlineOrdinaryInitial=compressorPolicy.offline;
        try{this.applyPreset(preset);}finally{this.offlineOrdinaryInitial=false;}
        this.effectsReady = Promise.all([this.synthMix.ready,this.limiter.ready,...this.stages.map(({ key }) => this[key]?.ready)].filter(Boolean));
        this.sourceConstructionRequest=this.construction.sourceRequest('physical source request',{requireTerminal:!(sourceBackend==='owned-rust'&&this.preset.stringModel==='piano'&&(this.pianoSourceFactory??createPianoLiveSource)===createPianoLiveSource)});
        const source = sourceBackend === 'owned-rust' ? this.preset.stringModel === 'piano' ? this.ensurePianoSource() : this.preset.stringModel === 'plucked' ? this.ensurePluckedSource() : Promise.resolve(null) : Promise.resolve(null);
        this.sourceReady = Promise.all([source, this.effectsReady]).then(() => ownedSourceOf(this));
        this.sourceReady.catch(error => { this.sourceFailure = error; });
        }catch(error){this.disposed=true;throw this.construction.failure(error);}
    }

    static create(options){return createInstrumentTransaction(()=>new Instrument(options));}
    physicalSource(){return ownedSourceOf(this)??null;}
    async awaitPhysicalAdmission(){await this.sourceReady;return awaitPhysicalInstrumentAdmission(this,ownedSourceOf(this));}

    ensurePianoSource() {
        if (this.sourceBackend !== 'owned-rust') return Promise.resolve(null);
        if(this.preset?.stringModel!=='piano'||this.pluckedSource||this.pluckedSourcePromise)return Promise.reject(Error('Piano source requires its unchanged physical material'));
        this.pianoSourcePromise ??= this.sourceConstructionRequest.start(({signal})=>(this.pianoSourceFactory ?? createPianoLiveSource)(this,{signal})).then(async source => {
            if (this.disposed) { await source.dispose(); throw Object.assign(Error('Disposed instrument'),{code:'AUDIO_OWNER_DISPOSED'}); }
            this.pianoSource = source; return source;
        }).catch(error => { this.sourceFailure = error; throw error; });
        return this.pianoSourcePromise;
    }
    prepareOwnedPiano(frequency, options) {
        if (this.pianoSource) return this.pianoSource.prepare(frequency, options);
        return this.ensurePianoSource().then(source => source.prepare(frequency, options));
    }
    ensurePluckedSource() {
        if (this.sourceBackend !== 'owned-rust') return Promise.resolve(null);
        if(this.preset?.stringModel!=='plucked'||this.pianoSource||this.pianoSourcePromise)return Promise.reject(Error('Plucked source requires its unchanged physical material'));
        this.pluckedSourcePromise ??= this.sourceConstructionRequest.start(({signal})=>(this.pluckedSourceFactory ?? createPluckedLiveSource)(this,{signal})).then(async source => {
            if (this.disposed) { await source.dispose(); throw Object.assign(Error('Disposed instrument'),{code:'AUDIO_OWNER_DISPOSED'}); }
            this.pluckedSource = source; return source;
        }).catch(error => { this.sourceFailure = error; throw error; });
        return this.pluckedSourcePromise;
    }
    prepareOwnedPlucked(frequency, options) {
        if (this.pluckedSource) return this.pluckedSource.prepare(frequency, options);
        return this.ensurePluckedSource().then(source => source.prepare(frequency, options));
    }
    reserveOwnedPiano(frequency, options) { return this.reserveOwnedBuffer(frequency, options, 'piano'); }
    reserveOwnedBuffer(frequency, options, material) {
        if ((this.pendingSourceBookings?.size ?? 0) >= 2000) throw Error('Owned piano pending booking capacity exceeded');
        let release = () => {};
        const prepare = source => { release = source.retain(frequency, options); try { return source.prepare(frequency, options); } catch (error) { release(); throw error; } };
        if (!['piano','plucked'].includes(material)) throw Error('Unsupported owned physical source material');
        const source = material === 'plucked' ? this.pluckedSource : this.pianoSource;
        return {waiting:source ? prepare(source) : (material === 'plucked' ? this.ensurePluckedSource() : this.ensurePianoSource()).then(prepare), release:() => release()};
    }
    trackSourceBooking(job) {
        const pending = this.pendingSourceBookings ??= new Set();
        if (pending.size >= 2000) throw Error('Owned piano pending booking capacity exceeded');
        const watched = Promise.resolve(job).catch(error => { this.sourceFailure = error; throw error; });
        pending.add(watched);
        void watched.then(() => pending.delete(watched), () => pending.delete(watched));
    }
    queueSourceBooking(preparation, action, epoch, release = () => {}) {
        const queue = this.sourceBookingQueue ??= [];
        if (queue.length >= 2000) throw Error('Owned piano pending booking capacity exceeded');
        let resolve, reject;
        const completion = new Promise((yes, no) => { resolve = yes; reject = no; });
        const record = {ready:false, action, epoch, resolve, reject, release, error:null};
        queue.push(record); this.trackSourceBooking(completion);
        const drain = () => {
            while (queue[0]?.ready) {
                const current = queue.shift();
                try { if (current.error) throw current.error;
                    if (!this.disposed && current.epoch === this.pianoEpoch) current.action();
                    current.resolve();
                } catch (error) { this.sourceFailure = error; current.reject(error); }
                finally { current.release(); }
            }
        };
        Promise.resolve(preparation).then(() => { record.ready = true; drain(); }, error => { record.error = error; record.ready = true; drain(); });
        return completion;
    }
    async awaitPendingSourceBookings() {
        await this.sourceReady;
        while (this.pendingSourceBookings?.size) await Promise.all([...this.pendingSourceBookings]);
        if (this.sourceFailure) throw this.sourceFailure;
    }
    prepareOffline() { return ownedSourceOf(this)?.prepareOffline(); }
    async armRuntime(){
        if(this.effectFailure)throw this.effectFailure;
        if(!this.ordinaryDynamicsOwned&&!this.shimmer?.arm&&!this.motion?.arm&&!(this.fdnRoomFactory&&this.reverb?.arm))return;
        await this.effectsReady;
        if(this.AC.state==='running'){
            if(this.ordinaryDynamicsOwned){this.ordinaryArm ??= Promise.all([this.synthMix.arm?.(),this.limiter.arm?.()]).catch(error=>{this.ordinaryArm=null;throw error;});await this.ordinaryArm;}
            await this.shimmer?.arm?.();
            await this.motion?.arm?.();
            if(this.fdnRoomFactory)await this.reverb?.arm?.();
        }
    }
    updateOrdinaryDemand(){
        if(this.disposed)return;
        const on=!!this.chainAwake&&this.destinations?.length>0;
        this.motion?.setHostAwake?.(on&&!!this.motionInChain);
        if(this.fdnRoomFactory)this.reverb?.setHostAwake?.(on&&!!this.fdnRoomInChain);
        if(!this.ordinaryDynamicsOwned)return;
        this.synthMix.setHostAwake?.(on);this.limiter.setHostAwake?.(on);
    }
    sourceStatus() {
        const source = ownedSourceOf(this), status = source?.status() ?? {backend:this.sourceBackend ?? 'native',ready:this.sourceBackend !== 'owned-rust',error:this.sourceFailure?.message ?? null};
        return {...status,error:status.error??(this.effectFailure?String(this.effectFailure):null),ready:status.ready&&!this.effectFailure,material:status.material ?? (source ? this.preset?.stringModel ?? 'piano' : null),pendingBookings:this.pendingSourceBookings?.size ?? 0,preparationLateFrames:this.sourcePreparationLateFrames ?? 0,preparationLateBookings:this.sourcePreparationLateBookings ?? 0,hostBookingTrace:(this.sourceBookingTrace ?? []).map(record=>({...record}))};
    }
    recordOwnedBooking(booking) {
        this.sourcePreparationLateFrames = (this.sourcePreparationLateFrames ?? 0) + booking.preparationLateFrames;
        if (booking.preparationLateFrames > 0) this.sourcePreparationLateBookings = (this.sourcePreparationLateBookings ?? 0) + 1;
        const trace = this.sourceBookingTrace ??= []; if (trace.length < 32) trace.push({...booking});
    }

    connect(destination) {
        this.destinations.push(destination);
        ownedSourceOf(this)?.setHostAwake?.(!!this.chainAwake);
        if (this.chainAwake) this.output.connect(destination);
        this.updateOrdinaryDemand();
    }

    disconnect() {
        this.output.disconnect();
        this.destinations = [];
        this.updateOrdinaryDemand();
        ownedSourceOf(this)?.setHostAwake?.(false);
    }

    /**
     * Applies a full or partial preset; missing keys take PolySynth's
     * defaults. Only keys whose value differs from the current one touch
     * the audio graph (some setters rebuild waveforms on every voice).
     */
    preflightRoomPreset(next,keys){if(this.fdnRoomFactory){this.fdnRoomFactory.validatePreset?.(next);this.reverb?.preflightPreset?.(next,keys);}}
    applyPreset(preset) {
        const next = { ...PRESET_DEFAULTS, ...preset };
        this.preflightRoomPreset(next,['reverbAmount','reverbType','reverbDecay','reverbDamping','reverbPredelay'].filter(key=>this.preset?.[key]!==next[key]));
        this.validateShimmerPreset?.(next);
        this.validateMotionPreset?.(next);
        this.motion?.preflightPreset?.(next,Object.keys(FX_STAGES.motion.setters).filter(key=>this.preset?.[key]!==next[key]));
        assertOwnedMaterial(this, next.stringModel);
        Object.keys(next).forEach((key) => this.set(key, next[key]));
        if (this.tempoTimingTouched) scheduleEffectTiming(this, 0, this.AC.currentTime);
    }

    /**
     * Glides to a preset over `seconds` of audio time instead of jumping
     * (blendPresets: numbers glide, choices switch halfway). Notes booked
     * meanwhile use the sound as it is then. An edit, another preset or
     * dispose() ends it, with the target applied.
     */
    morphTo(preset, seconds) {
        const to = { ...PRESET_DEFAULTS, ...preset };
        this.preflightRoomPreset(to,['reverbAmount','reverbType','reverbDecay','reverbDamping','reverbPredelay'].filter(key=>this.preset?.[key]!==to[key]));
        this.validateShimmerPreset?.(to);
        this.validateMotionPreset?.(to);
        assertOwnedMaterial(this, to.stringModel);
        this.finishMorph();
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
            this.preflightRoomPreset(blended,changing.filter(key=>['reverbAmount','reverbType','reverbDecay','reverbDamping','reverbPredelay'].includes(key)&&this.preset?.[key]!==blended[key]));
            this.motion?.preflightPreset?.(blended,Object.keys(FX_STAGES.motion.setters).filter(key=>changing.includes(key)&&this.preset?.[key]!==blended[key]));
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

    /**
     * Timbre drift (composition/timbreDrift.js): parameters applied live without changing the
     * preset, so the editor, saving and links never see them; null puts the preset's back.
     */
    setDrift(values) {
        const keys = new Set([...Object.keys(this.drift ?? {}), ...Object.keys(values ?? {})]);
        const roomKeys=[...keys].filter(key=>['reverbAmount','reverbType','reverbDecay','reverbDamping','reverbPredelay'].includes(key));
        if(roomKeys.length)this.preflightRoomPreset({...PRESET_DEFAULTS,...this.preset,...values},roomKeys);
        const motionKeys=[...keys].filter(key=>key in FX_STAGES.motion.setters);
        if(motionKeys.length){const next={...PRESET_DEFAULTS,...this.preset,...values};this.validateMotionPreset?.(next);this.motion?.preflightPreset?.(next,motionKeys);}
        for (const key of keys) {
            const value = values && key in values ? values[key] : this.preset?.[key];
            if (value !== undefined && PARAM_SETTERS[key]) PARAM_SETTERS[key](this, value);
        }
        this.drift = values;
        ownedSourceOf(this)?.sync();
    }

    /** Sets one preset parameter live - what the synth editor's knobs call. */
    set(key, value) {
        const next={...PRESET_DEFAULTS,...this.preset,[key]:value};
        if(['reverbAmount','reverbType','reverbDecay','reverbDamping','reverbPredelay'].includes(key)&&this.preset?.[key]!==value)this.preflightRoomPreset(next,[key]);
        this.validateShimmerPreset?.(next);
        this.validateMotionPreset?.(next);
        if(key in FX_STAGES.motion.setters&&this.preset?.[key]!==value)this.motion?.preflightPreset?.(next,[key]);
        if (key === 'stringModel') assertOwnedMaterial(this, value);
        if (this.morph && !this.morph.stepping) this.finishMorph();
        if (this.preset && this.preset[key] === value) return;
        this.preset = { ...this.preset, [key]: value };
        const setter = PARAM_SETTERS[key];
        if (setter && !(this.offlineOrdinaryInitial && LIMITER_INITIAL_FIELDS.some(([field])=>field===key))) setter(this, value);
        if (ENVELOPE_KEYS.has(key)) this.updateEnvelopes();
        // a delay setting changed while flushTails holds the delays at 0
        if (DELAY_KEYS.has(key) && this.heldUntil > this.AC.currentTime) this.holdDelays(this.heldUntil);
        this.updateChain();
        ownedSourceOf(this)?.sync();
    }

    // Routes the signal only through effects that change it. An effect at
    // 0% wet still processes every sample, and a skipped one is unreachable
    // from the output, so the browser stops rendering it - the main saving
    // of docs/DESIGN.md §5. Rewires only when the active set changes.
    updateChain() {
        const p = { ...PRESET_DEFAULTS, ...this.preset };
        const active = this.stages.filter((stage) => this[stage.key]?.managedBypass === true || stage.active(p));
        this.motionInChain=active.some(stage=>stage.key==='motion');
        if(this.fdnRoomFactory)this.fdnRoomInChain=active.some(stage=>stage.key==='reverb');
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
        this.updateOrdinaryDemand();
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
        this.voices.forEach((synth) => {
            synth.setVibratoEnabled(connected);
            synth.stringPitchEnabled = connected;
            for (const item of synth.stringSources || []) {
                if (connected && !item.pitchConnected) this.pitchTap.connect(item.source.detune);
                item.pitchConnected = connected;
            }
        });
        this.setVoiceControlActive(this.awake.some(Boolean));
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
        this.setVoiceControlActive(this.awake.some(Boolean));
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
        this.setVoiceControlActive(this.awake.some(Boolean));
    }

    /**
     * Slow drift of the cutoff and the pitch (wander.js instrumentWander):
     * +- `filter` / `pitch` cents on waves of `periods`, from `phases`
     * (`offset` seconds into them, and `immediate`: no easing in, for
     * renders). 0 stops a movement.
     */
    setWander({ filter = 0, pitch = 0, periods, phases, seeds = {}, mode = 'sine', offset = 0, immediate = false }) {
        const now = this.AC.currentTime;
        [['filter', filter], ['pitch', pitch]].forEach(([kind, cents]) => {
            let lfo = this.wanderLfos[kind];
            if (!lfo) {
                if (!cents) return;
                lfo = wanderLfo(this.AC, { period: periods[kind], phase: phases[kind], seed: seeds[kind], mode, offset });
                this.wanderLfos[kind] = lfo;
                lfo.setActive(false,now);
                if (kind === 'pitch') lfo.depth.connect(this.pitchWanderOut);
            }
            lfo.setMode(mode);
            lfo.setPeriod(periods[kind]);
            lfo.setDepth(cents,immediate);
        });
        this.filterWanderOn = filter > 0;
        this.pitchWanderOn = pitch > 0;
        if (this.filterWanderOn) this.setFilterWanderConnected(true);
        if (this.pitchWanderOn) this.setVibratoConnected(this.preset.vibratoDepth > 0);
        if ((this.wanderLfos.filter && !filter) || (this.wanderLfos.pitch && !pitch)) this.unwireWanderSoon();
        this.setVoiceControlActive(this.awake.some(Boolean));
    }

    // Once a stopped movement has eased out, unwires it (a wired detune costs).
    unwireWanderSoon() {
        clearTimeout(this.wanderTimer);
        this.wanderTimer = setTimeout(() => {
            if (!this.filterWanderOn && this.wanderLfos.filter) this.setFilterWanderConnected(false);
            if (!this.pitchWanderOn) this.setVibratoConnected(this.preset.vibratoDepth > 0);
        }, 1500);
    }

    voiceModulationSettings() {
        return {stringPitch:this.voices.map(v=>Boolean(v.stringPitchEnabled)),vibrato:this.vibrato.captureSettings(),filter:this.filterLfoCapture.settings(),wander:Object.fromEntries(Object.entries(this.wanderLfos).map(([k,lfo])=>[k,lfo.captureSettings()]))};
    }
    captureVoiceModulation(time=this.AC.currentTime) {
        const controls=[];
        const add=(axis,c)=>{if(c.initialDepth||c.targetDepth)controls.push({axis,...c});};
        const pitch=this.voices.some(v=>v.stringPitchEnabled);
        if(pitch&&this.vibratoConnected)add('pitch',this.vibrato.captureControl(time));
        if(this.filterLfoConnected)add('filter',this.filterLfoCapture.capture(time));
        if(this.filterWanderConnected)add('filter',this.wanderLfos.filter.captureControl(time));
        if(pitch&&this.vibratoConnected&&this.wanderLfos.pitch)add('pitch',this.wanderLfos.pitch.captureControl(time));
        return controls;
    }

    captureLiveVoiceModulation(time=this.AC.currentTime) {
        const controls=[],awake=this.awake.some(Boolean),pitch=this.voices.some(v=>v.stringPitchEnabled);
        const add=(id,axis,c,enabled)=>controls.push({id,axis,...c,enabled:!!enabled});
        add(0,'pitch',this.vibrato.captureLiveControl(time),awake&&pitch&&this.vibratoConnected);
        add(1,'filter',this.filterLfoCapture.captureLive(time),awake&&this.filterLfoConnected);
        if(this.wanderLfos.pitch)add(2,'pitch',this.wanderLfos.pitch.captureLiveControl(time),awake&&pitch&&this.vibratoConnected);
        if(this.wanderLfos.filter)add(3,'filter',this.wanderLfos.filter.captureLiveControl(time),awake&&this.filterWanderConnected);
        return controls;
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
        const reverb = p.reverbAmount >= MIN_WET && !this.reverb.shared
            ? (this.reverb.tailSeconds ? this.reverb.tailSeconds() : impulse ? impulse.duration : 10) : 0;
        return reverb
            + echoes(p.delayAmount, (this.tempoTailReserve ? 1 : p.delayTime), p.delayFeedback)
            + echoes(p.pingPongAmount, (this.tempoTailReserve ? 1 : p.pingPongDelayTime), p.pingPongFeedback)
            + fxTail(p)
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
        if (this.reverb.flush) this.reverb.flush();
        else {
            const impulse = this.reverb.node.buffer;
            if (impulse) this.reverb.node.buffer = impulse;
        }
        this.shimmer.clear();
        this.freeze.clear();
        // delay lines are at most 1 s long (src/nodes/delay.js, pingPongDelay.js)
        const drain = 1.05;
        this.holdDelays(now + drain);
        this.quietAt = now + drain;
        this.scheduleSleep();
    }

    /**
     * Holds the delays' output and feedback at 0 until `until`, then lets them
     * go to what the preset says *then* - not what they were when the hold
     * began, which a preset change inside the hold would be undone by (the
     * old feedback came back and stayed, echoes that never died).
     */
    holdDelays(until) {
        const now = this.AC.currentTime;
        const p = { ...PRESET_DEFAULTS, ...this.preset };
        const wet = (amount) => (amount < 0.5 ? amount * 2 : 1);
        [
            [this.delay.wetGain, wet(p.delayAmount)],
            [this.delay.feedbackGain, p.delayFeedback],
            [this.pingPong.wetGain, wet(p.pingPongAmount)],
            [this.pingPong.leftFeedbackGain, p.pingPongFeedback],
            [this.pingPong.rightFeedbackGain, p.pingPongFeedback],
        ].forEach(([gain, value]) => {
            const param = gain.getNode().gain;
            param.cancelScheduledValues(now);
            param.setValueAtTime(0, now);
            param.setValueAtTime(value, until);
        });
        this.heldUntil = until;
    }

    /**
     * Delays whose feedback on the audio node is not what the preset says:
     * a diagnostic for stuck echoes (a node left at its default of 1 by a
     * scheduling race). Only a chain that is awake and a delay in the chain
     * can be read - a sleeping or bypassed node is never rendered, so it
     * reads its default whatever was set. A preset that really asks for 1
     * matches and is not reported.
     */
    auditEchoes() {
        if (!this.effectsAwake()) return [];
        const inChain = new Set(this.activeEffects());
        return [
            ['pingPong', this.pingPong.getFeedback(), this.preset.pingPongFeedback || 0],
            ['delay', this.delay.getFeedback(), this.preset.delayFeedback || 0],
        ].filter(([name, actual, wanted]) => inChain.has(name) && Math.abs(actual - wanted) > 0.02)
            .map(([effect, actual, preset]) => ({ effect, actual, preset }));
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
    notePlan(midi, velocity, duration, gainPoints, filterEnv = this.filterEnv) {
        const offset = this.filterOffset(midi, velocity);
        const filterEvents = filterEnvelopeEvents(filterEnv, duration)
            .map((e) => (offset ? { ...e, value: e.value + offset } : e));
        return {
            gainPoints,
            voiceColour:{breathAmount:this.preset.breathAmount,formantAmount:this.preset.formantAmount,formantVowel:this.preset.formantVowel,formantShift:this.preset.formantShift},
            piano: this.preset.stringModel === 'piano' ? { type: this.preset.pianoType, decay: this.preset.pianoDecay,
                brightness: this.preset.pianoBrightness, hammer: this.preset.pianoHammer, unison: this.preset.pianoUnison,
                velocity, resonance:this.preset.pianoResonance, sustain: isAcousticPiano(this.preset.pianoType) || isCalibratedPiano(this.preset.pianoType) ? 0 : this.preset.pianoSustain, seed: this.preset.pianoSeed, wear: this.preset.pianoWear } : null,
            string: this.preset.stringModel === 'plucked' ? { decay: this.preset.stringDecay, damping: this.preset.stringDamping,
                position: this.preset.stringPosition, body: this.preset.stringBody, resonance:this.preset.stringResonance,bodyType:this.preset.stringBodyType, seed: this.preset.stringSeed } : null,
            filterEvents,
            filterOffset: offset,
            portamentoSpeed: this.polyphony === 1 ? this.preset.portamentoSpeed : 0,
            duration,
            pitchEnv: { amount: this.preset.pitchEnvAmount || 0, decay: this.preset.pitchEnvDecay || 0 },
        };
    }

    /** The preset's piano tuning as temperament.js takes it. */
    pianoTuning() {
        const p = this.preset;
        return { temperament: p.pianoTemperament, tonic: p.pianoTonic, a4: p.pianoA4, stretch: p.pianoStretch, wear: p.pianoWear, seed: p.pianoSeed };
    }

    /** MIDI note number -> MonoSynth noteInfo, honouring the preset's microtonal tuning. */
    noteInfo(midi) {
        const pc = ((midi % 12) + 12) % 12;
        const oct = Math.floor(midi / 12) - 1;
        const p = this.preset;
        let freq = BASE_FREQ[pc] * p[PITCH_KEYS[pc]] * p.allThemPitches * Math.pow(p.octaveRatio, oct - 4);
        // A piano is tuned as a whole: temperament, stretch and wear move each key from equal temperament.
        if (p.stringModel === 'piano' && isTempered(this.pianoTuning())) freq *= 2 ** (tuningCents(midi, this.pianoTuning()) / 1200);
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
     * @param {object} [rawExpression] - bounded per-note envelope and tone overrides
     */
    scheduleNote(midi, startTime, duration, velocity = 0.8, detune = 0, rawExpression = null, rendered = false, ownedPrepared = false, sourceBooking = null) {
        const expression = cleanExpression(rawExpression), shaped = expressiveEnvelope(this.gainEnv, duration, expression);
        // the scene's gentle onsets (composition/dynamics.js)
        if (expression?.dynamicAttack) shaped.env = { ...shaped.env, attack: dynamicAttack(shaped.env.attack, velocity, expression.dynamicAttack) };
        const { points, releaseEnd } = gainEnvelopePoints(shaped.env, velocity, shaped.duration);
        if (this.delay) scheduleEffectTiming(this, expression?.tempoBeat ?? 0, startTime);

        const allocation = this.sourceBackend === 'owned-rust' ? null : this.allocateVoice(startTime);
        const info = this.noteInfo(midi);
        if (detune) info.freq *= Math.pow(2, detune / 1200);
        const plan=expressiveSource(this.notePlan(midi, velocity, shaped.duration, breathEnvelope(points, shaped.duration, expression), gateEnvelope(this.filterEnv,shaped.duration,expression)), expression);
        if(expression?.slideFromMidi !== null && expression?.slideFromMidi !== undefined) {
            const from=this.noteInfo(expression.slideFromMidi).freq,to=this.noteInfo(midi).freq;
            plan.slide={cents:Math.max(-2400,Math.min(2400,1200*Math.log2(from/to))),seconds:Math.max(.005,Math.min(expression.slideSeconds,shaped.duration*.8))};
        }
        if(expression?.pitchTargets) {
            const base=this.noteInfo(midi).freq;
            plan.pitchPath=[{time:0,cents:0},...expression.pitchTargets.filter(p=>p.time>0&&p.time<=shaped.duration).map(p=>({time:p.time,cents:Math.max(-2400,Math.min(2400,1200*Math.log2(this.noteInfo(p.midi).freq/base)))}))];
        }
        // a piano note not rendered yet (a chord the first time): rendered on the workers, all of its notes at once, then booked
        const material = plan.piano ? 'piano' : plan.string ? 'plucked' : null;
        if (this.sourceBackend === 'owned-rust' && !material) throw Error('This owned source requires an actual piano or plucked preset');
        if (this.sourceBackend === 'owned-rust' && !ownedPrepared) {
            const reserved = this.reserveOwnedBuffer(info.freq, plan.piano ?? plan.string, material);
            this.queueSourceBooking(reserved.waiting, () => {
                const guarded = Number.isFinite(this.AC.length) ? startTime : Math.max(startTime, this.AC.currentTime + 0.005);
                const booking = {material,kind:'scheduled',requestedOnsetFrame:startTime*this.AC.sampleRate,guardedOnsetFrame:guarded*this.AC.sampleRate,preparedAtFrame:this.AC.currentTime*this.AC.sampleRate,preparationLateFrames:Math.max(0,(guarded-startTime)*this.AC.sampleRate)};
                this.scheduleNote(midi, guarded, duration, velocity, detune, rawExpression, true, true, booking);
            }, this.pianoEpoch, reserved.release);
            return;
        }
        const waiting = this.sourceBackend === 'owned-rust' ? material === 'plucked' ? this.prepareOwnedPlucked(info.freq, plan.string) : this.prepareOwnedPiano(info.freq, plan.piano) : !rendered && plan.piano ? pianoBufferLater(this.AC, info.freq, plan.piano) : null;
        if (waiting) {
            const epoch = this.pianoEpoch;
            void waiting.then(() => { if (epoch === this.pianoEpoch) this.scheduleNote(midi, Math.max(startTime, this.AC.currentTime + 0.005), duration, velocity, detune, rawExpression, true); }).catch(error => { this.sourceFailure = error; });
            return;
        }
        const { index, steal } = allocation ?? this.allocateVoice(startTime);
        if (sourceBooking) plan.sourceBooking = sourceBooking;
        this.voices[index].scheduleNote(info, plan, startTime, steal);
        if (sourceBooking) this.recordOwnedBooking(sourceBooking);
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
        const { points } = gainEnvelopePoints(this.gainEnv, velocity, HELD_SECONDS);
        const plan = this.notePlan(midi, velocity, HELD_SECONDS, points), info = this.noteInfo(midi);
        const id = ++this.heldIds;
        // a piano note not rendered yet (the velocity changes with every key, so most are): rendered on the workers, a chord's
        // notes at once, then started; a key let go in the meantime still plays its short note
        const material = plan.piano ? 'piano' : plan.string ? 'plucked' : null;
        if (this.sourceBackend === 'owned-rust' && !material) throw Error('This owned source requires an actual piano or plucked preset');
        if (this.sourceBackend === 'owned-rust') {
            const reserved = this.reserveOwnedBuffer(info.freq, plan.piano ?? plan.string, material);
            if (!reserved.waiting && !this.sourceBookingQueue?.length) { reserved.release(); this.beginHeld(id, info, plan); return id; }
            const entry = {pending:true, released:false}; this.held.set(id, entry);
            const booking = this.queueSourceBooking(reserved.waiting, () => {
                if (this.held.get(id) !== entry) return;
                this.held.delete(id); this.beginHeld(id, info, plan);
                if (entry.released) this.stopNote(id);
            }, this.pianoEpoch, reserved.release);
            void booking.catch(() => { if (this.held.get(id) === entry) this.held.delete(id); });
            return id;
        }
        const waiting = plan.piano ? pianoBufferLater(this.AC, info.freq, plan.piano) : null;
        if (waiting) {
            const entry = { pending: true, released: false };
            this.held.set(id, entry);
            void waiting.then(() => {
                if (this.held.get(id) !== entry) return;
                this.held.delete(id);
                this.beginHeld(id, info, plan);
                if (entry.released) this.stopNote(id);
            }).catch(error => { this.held.delete(id); this.sourceFailure = error; });
            return id;
        }
        this.beginHeld(id, info, plan);
        return id;
    }

    beginHeld(id, info, plan) {
        const now = this.AC.currentTime + 0.005;
        const { index, steal } = this.allocateVoice(now);
        const voice = this.voices[index];
        voice.scheduleNote(info, plan, now, steal);
        this.busyUntil[index] = Infinity;
        this.quietAt = Infinity;
        this.wake(index);
        this.held.set(id, { index, voiceId: voice.voiceId, filterOffset: plan.filterOffset, owned: this.sourceBackend === 'owned-rust' && !!(plan.piano || plan.string) });
    }

    /** Releases a note from startNote - unless its voice was taken since. */
    stopNote(id) {
        const held = this.held.get(id);
        if (!held) return;
        if (held.pending) { held.released = true; return; }
        this.held.delete(id);
        const voice = this.voices[held.index];
        if (voice.voiceId !== held.voiceId) return;
        const now = this.AC.currentTime;
        if (held.owned && ownedSourceOf(this)) {
            ownedSourceOf(this).release(held.index, this.gainEnv, this.filterEnv, held.filterOffset, now);
            const until = now + Math.max(this.gainEnv.release, minTime);
            this.busyUntil[held.index] = until; this.soundUntil = Math.max(this.soundUntil, until); this.scheduleSleep();
            return;
        }
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
        voice.stopStrings?.(this.busyUntil[held.index]);
        this.soundUntil = Math.max(this.soundUntil, this.busyUntil[held.index]);
        this.scheduleSleep();
    }

    /** Fades every voice out quickly, cancelling anything booked after `time`. */
    silence(time = this.AC.currentTime) {
        this.pianoEpoch++; // piano notes still being rendered are dropped
        ownedSourceOf(this)?.silence(time);
        if (this.tempoTimingTouched) scheduleEffectTiming(this, 0, time);
        this.voices.forEach((synth, i) => {
            synth.stopStrings?.(time + .3);
            synth.clearHeldExpression?.(time);
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

    wakeEffects() {
        ownedSourceOf(this)?.setHostAwake?.(this.destinations.length > 0);
        this.reverb.hear();
        if (!this.chainAwake) {
            this.destinations.forEach((destination) => this.output.connect(destination));
            this.chainAwake = true;
            if (this.reverb.setAwake) this.reverb.setAwake(true);
        }
        this.updateOrdinaryDemand();
    }

    // A prepared Rust source feeds synthMix without waking legacy oscillators.
    // Multiple owners keep the existing shared effects alive independently.
    holdSourceInput() {
        if (this.disposed) throw Error('Disposed instrument');
        this.externalSourceInputs++;
        this.wakeEffects();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.externalSourceInputs--;
            if (this.disposed) return;
            this.soundUntil = Math.max(this.soundUntil, this.AC.currentTime);
            this.quietAt = Infinity;
            this.scheduleSleep();
        };
    }

    wake(index) {
        this.wakeEffects();
        if(!this.awake.some(Boolean))this.setVoiceControlActive(true,index);
        if (!this.awake[index]) {
            if (!(this.sourceBackend === 'owned-rust' && ownedSourceOf(this))) this.voices[index].volume.getNode().connect(this.synthMix.getNode());
            this.awake[index] = true;
        }
        ownedSourceOf(this)?.wake(index);
        this.scheduleSleep();
    }

    // Disconnects voices whose last note (incl. release) has finished. A
    // small margin covers effect-free tails inside the voice. Then the
    // effects chain, once nothing has sounded for its tail time.
    sleepIdle() {
        this.sleepTimer = null;
        if (this.disposed) return;
        const now = this.AC.currentTime;
        this.voices.forEach((voice, i) => {
            if (this.awake[i] && this.busyUntil[i] + 0.2 < now) {
                voice.volume.getNode().disconnect();
                this.awake[i] = false;
                ownedSourceOf(this)?.awake(i, false);
            }
        });
        if(!this.awake.some(Boolean))this.setVoiceControlActive(false);
        ownedSourceOf(this)?.setHostAwake?.(this.destinations.length > 0 && this.chainAwake && this.awake.some(Boolean));
        if (this.chainAwake && !this.externalSourceInputs && !this.awake.some(Boolean) && this.silentFrom() < now) {
            this.output.disconnect();
            this.chainAwake = false;
            if (this.reverb.setAwake) this.reverb.setAwake(false);
        }
        this.updateOrdinaryDemand();
        this.scheduleSleep();
    }

    // One timer for the next voice due to go idle, or - all asleep - for
    // the chain (a late timer only means something stays awake a little
    // longer - harmless). Held notes keep everything awake.
    scheduleSleep() {
        if (this.disposed) return;
        const due = this.busyUntil.filter((t, i) => this.awake[i] && Number.isFinite(t));
        let at;
        if (due.length) at = Math.min(...due) + 0.25;
        else if (this.chainAwake && !this.externalSourceInputs && !this.awake.some(Boolean)) at = this.silentFrom() + 0.25;
        else return;
        const delay = Math.max(0.05, at - this.AC.currentTime);
        if (this.sleepTimer) clearTimeout(this.sleepTimer);
        this.sleepTimer = setTimeout(() => this.sleepIdle(), delay * 1000);
    }
    setVoiceControlActive(on,index) {
        const now=this.AC.currentTime,strings=this.voices.flatMap((v,i)=>this.awake[i]||i===index?[...(v.stringSources??[]),...(v.ownedStringSources??[])].map(s=>s.start):[]);
        // k-rate detune pulls its input for the whole first render quantum,
        // including the silent samples before a source's fractional onset.
        const first=Math.min(this.voiceOscillatorStartTime,...strings),pitchStart=Math.max(now,Math.floor(first*this.AC.sampleRate/128)*128/this.AC.sampleRate);
        this.pianoPitchNotBefore = pitchStart; this.bufferPitchNotBefore = pitchStart;
        this.vibrato.captureClock.setActive(on&&this.vibratoConnected,now,pitchStart);this.filterLfoCapture.setActive(on&&this.filterLfoConnected,now);
        for(const [kind,lfo]of Object.entries(this.wanderLfos))lfo.setActive(on&&(kind==='pitch'?this.vibratoConnected:this.filterWanderConnected),now,kind==='pitch'?pitchStart:now);
        ownedSourceOf(this)?.sync();
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
        if (this.disposed) return this.disposal;
        this.disposed = true;
        const actions=[
            ()=>this.sourceConstructionRequest?.retire(),
            ()=>{if(this.morph)clearInterval(this.morph.timer);this.morph=null;clearTimeout(this.sleepTimer);clearTimeout(this.wanderTimer);},
            ...Object.values(this.wanderLfos).map(lfo=>()=>lfo.dispose()),
            ()=>this.silence(),()=>clearTimeout(this.sleepTimer),
            ()=>ownedSourceOf(this)?.dispose(),
            ...(!this.sourceConstructionRequest?[this.pianoSourcePromise,this.pluckedSourcePromise].filter(Boolean).map(p=>()=>awaitRetiredPreparation(p)):[]),
            ()=>{const effects=retireAudioActions([this.compressor,this.synthMix,this.limiter,this.shimmer,this.freeze,this.motion].filter(Boolean).map(owner=>()=>owner.dispose?.()),'Instrument effects disposal failed');this.effectsDisposal=effects.catch(error=>{this.effectsDisposalError=error.errors?.[0]??error;});return effects;},
            ...this.voices.map(synth=>()=>synth.destroy()),()=>this.reverb.dispose?.(),()=>this.output.disconnect(),
            ()=>this.construction.retire(),
        ];
        this.disposal=retireAudioActions(actions,'Instrument disposal failed');
        this.disposal.catch(error=>{this.disposalError=error;});
        return this.disposal;
    }
}

export default Instrument;
