import {WasmRoomPool} from '../synth-lab/roomPool';
import {createWasmRoomRoute} from './engine/wasmRoomRoute';
import { busActive, createBusRack } from './engine/bus';
import {atonalChord,describeBitonality,applyBitonality} from './composition/tonality';
import {breathPatch,isBreathPatch} from './engine/breathPatches';
import {joinHeldNotes} from './composition/heldGlides';
// Wires plan -> Transport -> role Instruments -> masterBus.
//
// Music is decided ahead of time into a rolling *plan* of bars (chord, pad
// voicing, every note event in beats), and the Transport only books plan
// events as they enter its lookahead window. Randomness is resolved when a
// bar is planned, so what the timeline shows is exactly what will play, and
// later layers can look ahead (e.g. a bass approaching the next chord).
//
// Each planned bar carries its *music* (key, mode, progression, tempo) and
// the music the following cycle will use: the Conductor (conductor.js)
// decides that at the start of each progression cycle, a whole cycle early,
// so every bar knows what is coming - the cycle's last chord can become the
// new key's dominant, and the bass can approach it. planBar() then resolves the chord and hands it to the arranger
// (arranger.js) for the notes. Changing a "home" setting (key, mode,
// progression, tempo, bars per chord) restarts the music from home at the
// next bar; any other change continues the drift.
//
// The ambient bed (engine/ambience.js) has its own output and volume and
// plays with the music or on its own: start/stop are the music,
// startAmbience/stopAmbience the bed, startAll/stopAll both. The sleep
// timer's fadeOut takes whatever is playing.

import { audioContext } from '../audio/context';
import { masterBus } from '../audio/bus';
import Instrument from './engine/Instrument';
import DrumKit from './engine/drumKit';
import WasmDrumKit from './engine/wasmDrumKit';
import {percussionFromSearch} from '../audio/percussionChoice';
import {percussionVoice,percussionPresetKit} from './percussionVoices';
import Ambience from './engine/ambience';
import { PERFORMANCE } from '../audio/performance';
import { hubFor } from '../nodes/sharedReverb';
import Transport from './engine/transport';
import { RoleWander, instrumentWander } from './engine/wander';
import { scaleById, scaleSemitones, spellScale, romanDegree, diatonicChord, chordSymbol, displayNumeral, noteAtOrAbove, voiceLead } from './theory';
import { arrangeBar, notesInRange } from './arranger';
import { arrangeBarLatest } from './composition/arrangerLatest';
import { planForm } from './composition/formLatest';
import { sectionCadence } from './composition/sectionCadence';
import { commonToneBridge } from './composition/commonToneBridge';
import { harmonicDurations, harmonicSlot } from './composition/harmonicRhythm';
import { harmonicDestination } from './composition/harmonicDestinations';
import { planBoundaries, prepareEnding } from './composition/boundaries';
import { prepareSectionSuspension, commitSectionSuspension } from './composition/sectionSuspension';
import { drumBarLatest, loosenDrumsLatest } from './composition/percussionLatest';
import { harmonyMode } from './composition/harmonyScale';
import { planPerformance, performPhrase } from './composition/performance';
import { performEnsemble } from './composition/ensembleRhythm';
import { instrumentGroovePlan } from './composition/instrumentGroove';
import { slideNotes } from './composition/noteSlides';
import { expressNotes, expressHeldNotes, connectWindNotes, timeSoundNotes } from './composition/noteExpression';
import { applyDynamics, expressDynamics } from './composition/dynamics';
import { planRubato, rubatoTime } from './composition/rubato';
import { ornamentNotes } from './composition/ornaments';
import { Ducker, DUCKED_BY, duckFloor } from './engine/ducking';
import { planLoudness } from './composition/loudness';
import { SPACE_RACK, SPACE_ROLE, sectionSpaceLevel } from './composition/sectionSpace';
import { arcEnergy, applyArc, arcTone, arcSpace } from './composition/arc';
import { timbreDrift } from './composition/timbreDrift';
import { nextMusic, glideTempo, scaleDistance } from './conductor';
import { METERS, unitsPerMinute, swingEvents } from './meter';
import { drumBar, loosenDrums, auditionHits } from './percussion';
import { normal, seeded } from './random';
import { defaultSettings } from './settings';
import { findPreset } from './editor/presetStore';
import { stringPatch, isStringPatch } from './engine/stringPatches';
import { pianoPatch, isPianoPatch } from './engine/pianoPatches';
import { ROLE_PRESETS, ROLE_VOLUMES } from './presets';
import PROGRESSIONS, { progressionsOfLength, isUnsettlingProgression, progressionFamily } from './progressions';

// Stop fades everything out - reverb and echo tails included - with this
// time constant (-60 dB after ~0.5 s), then drops the tails (STOP_FADE_MS).
const STOP_FADE = 0.07;
const STOP_FADE_MS = 500;

// Bars decided ahead of the playhead, and bars kept behind it for display.
export const PLAN_AHEAD_BARS = 8;
const PLAN_KEEP_BARS = 4;
// Bars kept behind the playhead for stepping back: played bars are kept,
// not re-planned, so going back plays exactly what was heard.
const HISTORY_BARS = 512;

// Settings that define "home"; changing one resets drift to it.
// A cycle's music moved by `semitones` (key lifts, Generator.planBar).
const transposeMusic = (music, semitones) => (semitones ? { ...music, tonic: (((music.tonic + semitones) % 12) + 12) % 12 } : music);
const HOME_KEYS = new Set(['tonic', 'mode', 'progression', 'bpm', 'barsPerChord']);
// Settings that don't change what is planned.
const SOUND_KEYS = new Set(['ambience', 'ambienceShape', 'ambienceVolume', 'playMusic', 'playAmbience', 'volumes', 'drumKit', 'muted', 'wander', 'ambienceWander', 'bus']);

// Ambience volume slider (0..1) to gain: 0.8, the default, is unity.
const ambienceGain = (volume) => Math.pow(volume / 0.8, 2);

// Section tone (settings.sectionTone): a lowpass on the melodic voices,
// darker in intros and breakdowns, open in Full - cutoff in Hz per section.
export const OPEN_TONE = 20000;
const SECTION_TONE = {
    gentle: { intro: 2200, build: 4500, full: OPEN_TONE, breakdown: 2800 },
    strong: { intro: 1200, build: 3000, full: OPEN_TONE, breakdown: 1600 },
};
export const TONE_ROLES = ['pad', 'lead', 'counter'];
export const sectionTone = (settings, section) =>
    (settings.sectionTone && section && SECTION_TONE[settings.sections.mode] ? SECTION_TONE[settings.sections.mode][section.type] : OPEN_TONE);

// An ending (endSoon, and rendering with an ending): the bar before it
// plays the key's V, the final bar a held I; music stops this many bars
// after the final bar starts, once its chord has rung out.
const ENDING_RING_BARS = 3;

/** The percussion role (engine/drumKit.js): not a synth, so not in ROLES. */
export const PERC_ROLE = { perc: { label: 'Percussion' } };
/** A voice played by a classic synth or a DIY patch rather than the generator's own synth (presets). */
export const externalSource = (preset) => !!(preset?.classics || preset?.diy);

// In display order.
export const ROLES = {
    lead: { label: 'Lead', polyphony: 2, preset: ROLE_PRESETS.lead },
    counter: { label: 'Second lead', polyphony: 2, preset: ROLE_PRESETS.counter },
    pad: { label: 'Rhythm / pad', polyphony: 8, preset: ROLE_PRESETS.pad },
    bass: { label: 'Bass / support', polyphony: 2, preset: ROLE_PRESETS.bass },
};

class Generator {
    /** @param {object} [settings] - complete, valid settings (settings.js) */
    constructor(settings = defaultSettings(), {percussion = percussionFromSearch(globalThis.location?.search)} = {}) {
        // Old perc=808 links selected a sound through the backend selector.
        // Migrate that meaning to the kit while retaining their drum edits.
        if (percussion === '808') settings = {...settings,drums:{...settings.drums,kit:'tr808'}};
        this.percussionEngine = percussion === 'wasm' || percussion === '808' || percussionVoice(settings.drums.kit).wasmOnly ? 'wasm' : 'native';
        this.AC = audioContext;
        this.output = this.AC.createGain();
        // the bars' loudness trims (composition/loudness.js), after the fades on output
        this.levelTrim = this.AC.createGain();
        this.output.connect(this.levelTrim);
        this.levelTrim.connect(masterBus);

        // settings.js: defaults, validation, share links. Randomness is
        // re-seeded from settings.seed on every reset, so Play always starts
        // the same piece for the same settings - what a share link relies on.
        this.settings = settings;

        this.roles = {};
        // the voices' reverbs, when they share one (Performance menu, nodes/sharedReverb.js)
        this.reverbHub = PERFORMANCE.sharedReverb ? hubFor(this.AC) : null;
        // volumes are settings (they travel in links); mute / solo are not
        Object.entries(ROLES).forEach(([role, { polyphony, preset }]) => {
            const volume = (this.settings.volumes && this.settings.volumes[role]) ?? ROLE_VOLUMES[role];
            const instrument = new Instrument({ polyphony, preset: breathPatch(preset,findPreset(preset),this.settings.generation), deferReverb: role === 'counter', reverbHub: this.reverbHub });
            const gain = this.AC.createGain();
            gain.gain.value = volume;
            // section tone: open (and inaudible) unless settings.sectionTone
            const tone = this.AC.createBiquadFilter();
            tone.frequency.value = OPEN_TONE;
            tone.Q.value = 0.5;
            instrument.connect(tone);
            tone.connect(gain);
            const wander = new RoleWander(this.AC, role);
            // ducking under the melody (engine/ducking.js), after the volume
            const duck = this.AC.createGain();
            gain.connect(duck);
            duck.connect(wander.input);
            wander.output.connect(this.output);
            this.roles[role] = { instrument, gain, tone, wander, ducker: new Ducker(duck.gain), presetName: preset, stringPatchBase:isBreathPatch(preset)?{name:preset,preset:findPreset(preset)}:null, edited: false, volume, mute: false, solo: false };
        });
        {
            const volume = (this.settings.volumes && this.settings.volumes.perc) ?? ROLE_VOLUMES.perc;
            const Kit = this.percussionEngine === 'native' ? DrumKit : WasmDrumKit;
            const instrument = new Kit({ context: this.AC, reverbHub: this.reverbHub, model:this.percussionEngine });
            const gain = this.AC.createGain();
            gain.gain.value = volume;
            instrument.connect(gain);
            const wander = new RoleWander(this.AC, 'perc');
            gain.connect(wander.input);
            wander.output.connect(this.output);
            instrument.setKit(this.settings.drumKit);
            instrument.setVoicePreset(this.settings.drums.kit);
            this.roles.perc = { instrument, gain, wander, presetName: percussionVoice(this.settings.drums.kit).name, edited: false, volume, mute: false, solo: false, drums: true };
        }
        if (this.reverbHub) this.reverbHub.connect(this.output);
        // mutes are settings (they persist and travel in links); solo is not
        Object.entries(this.roles).forEach(([role, r]) => { r.mute = Boolean(this.settings.muted && this.settings.muted[role]); });
        this.applyMix();
        this.applyWander();
        this.applyBus();
        this.toneNow = null;

        this.transport = new Transport({
            bpm: unitsPerMinute(this.meter, this.settings.bpm),
            beatsPerBar: this.meter.units,
        });
        this.transport.onBeat((event) => this.onBeat(event));
        this.planListeners = new Set();
        this.runningListeners = new Set();
        this.visualListeners = new Set();
        this.liveNotes = new Set();
        this.quickStop = true;

        this.ambienceOut = this.AC.createGain();
        this.ambienceOut.gain.value = ambienceGain(this.settings.ambienceVolume ?? 0.8);
        this.ambienceOut.connect(masterBus);
        this.ambience = new Ambience({ context: this.AC, seed: 1 });
        this.ambience.connect(this.ambienceOut);
        this.ambience.setShape(this.settings.ambienceShape);
        this.ambience.setLevels(this.settings.ambience);
        this.ambience.setWander(this.settings.ambienceWander);

        this.warmRoles();
        this.reset();
    }

    /** Whether the music plays. */
    get isRunning() {
        return this.transport.isRunning;
    }

    get ambienceRunning() {
        return this.ambience.running;
    }

    /** Music or ambience. */
    get anyRunning() {
        return this.isRunning || this.ambienceRunning;
    }

    // The master meter requests sleep only after one second of exact silence.
    canSleepAudio(){return !this.anyRunning&&!this.liveNotes?.size&&!this.stopFade&&!this.auditionPending;}

    get meter() {
        return METERS[this.settings.meter];
    }

    /** Units (Transport pulses) per bar - quarters, or eighths in 6/8. */
    get beatsPerBar() {
        return this.meter.units;
    }

    // Fresh plan from bar 0 and no playhead history. While stopped this is
    // the preview of what Play will start with. (Stop pauses instead: see
    // stop() - this is "back to the start".)
    reset() {
        this.emitVisualNote({ type: 'clear' });
        this.rng = seeded(this.settings.seed);
        this.transport.beatsPerBar = this.meter.units;
        this.plan = new Map();
        this.beatLog = [];
        this.noteLog = [];
        this.currentBar = -1;
        this.resetMusicAt = 0;
        this.resumeBar = 0;
        // Whether settings changed mid-piece: then what plays is no longer
        // exactly what the seed (phrase) and settings make from the start.
        this.editedSinceStart = false;
        this.loop = null;
        this.endBar = null;
        this.ensurePlanned(0);
    }

    /** Whether Play would continue a piece rather than start it. */
    get paused() {
        return !this.isRunning && this.resumeBar > 0;
    }

    /** Back to the piece's first bar (continuing to play if playing). */
    async rewind() {
        const wasRunning = this.isRunning;
        if (wasRunning) this.stop();
        this.reset();
        this.planListeners.forEach((listener) => listener());
        if (wasRunning) await this.start();
        else this.notifyRunning();
    }

    // Stop keeps the plan: Play picks up at the bar after the one heard.
    // Notes booked beyond it were silenced, so they are booked again.
    pause(heardBeat) {
        this.resumeBar = Math.floor(heardBeat / this.beatsPerBar) + 1;
        this.plan.forEach((planned) => {
            if (planned.bar >= this.resumeBar) planned.events.forEach((ev) => { ev.booked = false; });
        });
        this.beatLog = [];
        this.currentBar = this.resumeBar - 1;
        this.ensurePlanned(this.resumeBar);
        this.planListeners.forEach((listener) => listener());
    }

    async start() {
        if(this.sourceLoads?.size)await Promise.all(this.sourceLoads);
        if(Object.values(this.roles).some(r=>r.instrument.preset?.wasmVoice)&&this.audioEngine!=='wasm'&&!this.audioEngineReady)await this.setAudioEngine('wasm');
        if(this.audioEngineReady)await this.audioEngineReady;
        if(this.percussionReady)await this.percussionReady;
        if(this.roles.perc.instrument.ready)await this.roles.perc.instrument.ready;
        if (this.AC.state !== 'running') await this.AC.resume();
        if (this.stopFade) {
            // still fading out from Stop: finish quickly so the old tails
            // can't ring into the new start
            this.output.gain.setTargetAtTime(0, this.AC.currentTime, 0.005);
            await new Promise((resolve) => setTimeout(resolve, 30));
            this.endStopFade();
        }
        this.ensurePlanned(this.resumeBar);
        this.transport.setBpm(unitsPerMinute(this.meter, this.plan.get(this.resumeBar).bpm));
        this.startedAt = performance.now();
        this.transport.start(this.resumeBar * this.beatsPerBar);
        this.notifyRunning();
    }

    /** Prepare the percussion source independently of melodic engine selection.
     * Live Wasm kit changes reinterpret queued attacks; the long queue stays.
     */
    syncPercussionVoice() {
        const r = this.roles.perc, voice = percussionVoice(this.settings.drums.kit);
        if (r.machine) return Promise.resolve(); // a drum machine (setPercussionSource) keeps the part
        const revision = this.percussionRevision = (this.percussionRevision ?? 0) + 1;
        if (!voice.wasmOnly || this.percussionEngine === 'wasm') {
            r.instrument.setVoicePreset(voice.id);r.presetName = voice.name;this.percussionError = null;
            return Promise.resolve();
        }
        const old = r.instrument, replacement = new WasmDrumKit({context:this.AC,reverbHub:this.reverbHub});
        const work = (async () => {
            try {
                await replacement.ready;
                if (revision !== this.percussionRevision || this.roles.perc.instrument !== old) {replacement.dispose();return;}
                replacement.setKit(this.settings.drumKit);replacement.setVoicePreset(this.settings.drums.kit);
                const future = old.futureBookings();
                replacement.connect(r.gain);r.instrument = replacement;r.presetName = percussionVoice(this.settings.drums.kit).name;
                this.percussionEngine = 'wasm';
                old.bus.gain.setTargetAtTime(0,this.AC.currentTime,.006);old.silence();
                for (const event of future) replacement.scheduleNote(event.drum,event.time,event.duration,event.velocity,event.vary);
                setTimeout(() => old.dispose(),40);
                this.percussionError = null;
            } catch (error) {replacement.dispose();this.percussionError = error;throw error;}
        })();
        this.percussionReady = work;
        work.catch(() => {}).finally(() => {if (this.percussionReady === work) this.percussionReady = null;});
        return work;
    }

    /** A whole-kit sound preset; volume, groove and expression remain intact. */
    async loadPercussionVoice(id) {
        const before = this.settings.drums, kit = this.settings.drumKit;
        this.setMany({drums:{...before,kit:percussionVoice(id).id},drumKit:percussionPresetKit(id)});
        try {if(this.percussionReady)await this.percussionReady;}
        catch(error){this.setMany({drums:before,drumKit:kit});throw error;}
        return true;
    }

    async setAudioEngine(mode) {
        if(mode!=='wasm'&&Object.values(this.roles).some(r=>r.instrument.preset?.wasmVoice))throw Error('This preset uses Wasm-only voices. Choose another sound or preset to compare engines.');
        mode=mode==='wasm'?'wasm':'legacy';const revision=(this.audioEngineRevision??0)+1;this.audioEngineRevision=revision;
        const work=(async()=>{
            const replacements=[];let committed=false;const roomPool=mode==='wasm'&&PERFORMANCE.sharedReverb?new WasmRoomPool(this.AC,this.output):null;
            try {
                const Wasm=mode==='wasm'?(await import('./engine/wasmInstrument')).default:null;
                for(const role of Object.keys(ROLES)){
                    const r=this.roles[role],old=r.instrument,snapshot=JSON.stringify(old.preset);
                    if(externalSource(old.preset))continue;
                    const instrument=Wasm?await Wasm.create({context:this.AC,preset:old.preset,polyphony:old.polyphony,roomPool,dynamics:this.settings.dynamics}):new Instrument({context:this.AC,preset:old.preset,polyphony:old.polyphony,reverbHub:this.reverbHub});
                    const replacement={role,instrument,source:old,snapshot,roomRoute:null};replacements.push(replacement);
                    if(roomPool)replacement.roomRoute=createWasmRoomRoute(this.AC,instrument,{roleWander:r.wander,volume:r.volume,cutoff:r.tone.frequency.value});
                }
                if(revision!==this.audioEngineRevision){replacements.forEach(r=>{r.roomRoute?.dispose();r.instrument.dispose();});roomPool?.dispose();return;}
                if(replacements.some(r=>this.roles[r.role].instrument!==r.source||JSON.stringify(r.source.preset)!==r.snapshot))throw Error('Sounds changed while preparing the engine. Please try the engine switch again.');
                const running=this.isRunning;if(running)this.stop();
                for(const {role,instrument,roomRoute}of replacements){const r=this.roles[role];r.roomRoute?.dispose();r.instrument.dispose();r.instrument=instrument;r.roomRoute=roomRoute;instrument.connect(r.tone);}
                this.wasmRoomPool?.dispose();this.wasmRoomPool=roomPool;
                this.audioEngine=mode;committed=true;this.applyWander();this.applyMix();
                if(running){this.audioEngineReady=null;await this.start();}
            }catch(error){if(!committed){replacements.forEach(r=>{r.roomRoute?.dispose();r.instrument.dispose();});roomPool?.dispose();}throw error;}
        })();this.audioEngineReady=work;
        try{await work;}finally{if(this.audioEngineReady===work)this.audioEngineReady=null;}
    }

    async startAmbience() {
        if (this.ambienceRunning) return;
        if (this.AC.state !== 'running') await this.AC.resume();
        this.ambience.start(this.AC.currentTime + 0.05);
        this.notifyRunning();
    }

    stopAmbience(fade = 0.6) {
        if (!this.ambienceRunning) return;
        this.ambience.stop(this.AC.currentTime, fade);
        this.notifyRunning();
    }

    /** Music and ambience together (the main Play). */
    async startAll() {
        await Promise.all([this.isRunning ? null : this.start(), this.startAmbience()]);
    }

    stopAll() {
        this.cancelFadeOut();
        if (this.isRunning) this.stop();
        this.stopAmbience();
    }

    /** @param {function} callback - called on any Play / Stop of music or ambience (a sleep timer's too) */
    onRunningChange(callback) {
        this.runningListeners.add(callback);
        return () => this.runningListeners.delete(callback);
    }

    notifyRunning() {
        this.runningListeners.forEach((listener) => listener(this.isRunning));
        this.watchEchoes();
    }

    /**
     * While playing, every few seconds, warns in the console (once per
     * case) about a delay whose real feedback differs from its preset - the
     * mark of a stuck echo. It only reports; a preset may want feedback of 1.
     */
    watchEchoes() {
        if (!this.isRunning) {
            clearInterval(this.echoWatch);
            this.echoWatch = null;
            return;
        }
        if (this.echoWatch) return;
        const reported = new Set();
        this.echoWatch = setInterval(() => {
            Object.entries(this.roles).forEach(([role, { instrument }]) => {
                if (!instrument.auditEchoes) return;
                instrument.auditEchoes().forEach(({ effect, actual, preset }) => {
                    const key = `${role}/${effect}/${actual.toFixed(2)}/${preset}`;
                    if (reported.has(key)) return;
                    reported.add(key);
                    console.warn(`bgm: ${role} ${effect} feedback is ${actual.toFixed(2)} but its preset says ${preset} - a stuck echo? (Audio menu > Benchmark has the details)`);
                });
            });
        }, 5000);
    }

    /**
     * The sleep timer's last `seconds`: the music comes to an end in time
     * (endSoon - a V, a held I) instead of fading, the ambience fades out,
     * then everything stops. Stop in the meantime cancels it.
     */
    fadeOut(seconds) {
        if (!this.anyRunning) return;
        const now = this.AC.currentTime;
        if (this.isRunning) {
            clearTimeout(this.endTimer);
            this.endTimer = setTimeout(() => {
                this.endTimer = null;
                this.endSoon();
            }, Math.max(0, seconds - this.endingSeconds() - 2) * 1000);
        }
        // the bed fades the same way and stops at the end
        this.fadeAmbience = this.ambienceRunning;
        if (this.fadeAmbience) this.ambience.stop(now, seconds * 5 / 7);
        clearTimeout(this.fadeTimer);
        this.fadeTimer = setTimeout(() => {
            this.fadeTimer = null;
            this.fadeAmbience = false;
            // silent already: drop the tails and restore the output
            const quickStop = this.quickStop;
            this.quickStop = true;
            if (this.isRunning) this.stop();
            this.quickStop = quickStop;
            this.notifyRunning();
        }, seconds * 1000);
    }

    get fadingOut() {
        return Boolean(this.fadeTimer);
    }

    /** Back to full level from a fadeOut that is under way. */
    cancelFadeOut() {
        if (!this.fadeTimer) return;
        clearTimeout(this.fadeTimer);
        this.fadeTimer = null;
        clearTimeout(this.endTimer);
        this.endTimer = null;
        // an ending under way: the music carries on instead
        if (this.ending) {
            this.endBar = null;
            this.replan([]);
        }
        const gain = this.output.gain;
        gain.cancelScheduledValues(this.AC.currentTime);
        gain.setValueAtTime(gain.value, this.AC.currentTime);
        gain.setTargetAtTime(1, this.AC.currentTime, 0.3);
        if (this.fadeAmbience) {
            this.fadeAmbience = false;
            this.ambience.start(this.AC.currentTime + 0.05);
        }
    }

    // Stops (pauses) the music; the ambience plays on. With quickStop (the default), Stop doesn't wait for long reverbs and
    // echoes: the output fades out, then the effects' tails are dropped and
    // the output is restored (for auditions and live play). Without it the
    // voices fade and the tails ring out.
    stop() {
        this.emitVisualNote({ type: 'clear' });
        const heard = this.position();
        this.transport.stop();
        this.runPendingChange();
        this.flushPendingVoices();
        this.toneNow = null;
        const ending = this.endBar !== null;
        this.endBar = null;
        const wasFading = Boolean(this.fadeTimer);
        clearTimeout(this.fadeTimer);
        this.fadeTimer = null;
        clearTimeout(this.endTimer);
        this.endTimer = null;
        Object.values(this.roles).forEach(({ instrument }) => instrument.silence());
        this.heldActiveRoles=new Set();delete this.heldResetBar;
        this.liveNotes?.clear();
        if (!this.quickStop) {
            // a sleep fade cut short: back to full level for the tails
            if (wasFading) this.output.gain.setTargetAtTime(1, this.AC.currentTime, 0.05);
            this.pause(heard);
            if (ending) this.replan([]);
            this.notifyRunning();
            return;
        }
        const gain = this.output.gain;
        gain.cancelScheduledValues(this.AC.currentTime);
        gain.setTargetAtTime(0, this.AC.currentTime, STOP_FADE);
        clearTimeout(this.stopFade);
        this.stopFade = setTimeout(() => this.endStopFade(), STOP_FADE_MS);
        this.pause(heard);
        // stopped during an ending: Play carries on with the music instead
        if (ending) this.replan([]);
        this.notifyRunning();
    }

    /**
     * Brings the piece to an end: the next bar plays the key's V, the one
     * after a held I, and the music stops once that has rung out (and goes
     * back to the start). Stop before then cancels it.
     */
    endSoon() {
        if (!this.isRunning || this.endBar !== null) return;
        const from = this.currentBar + 1;
        this.loop = null;
        this.queueHeldGlideReset();
        this.endBar = from + 1;
        [...this.plan.keys()].filter((bar) => bar >= from).forEach((bar) => this.plan.delete(bar));
        this.ensurePlanned(from);
    }

    /** Whether an ending is under way. */
    get ending() {
        return this.endBar !== null;
    }

    /** Seconds an ending takes from endSoon() until the music stops (about). */
    endingSeconds() {
        const planned = this.plan.get(Math.max(this.currentBar, 0)) || this.getPlan()[0];
        const bar = (60 / unitsPerMinute(this.meter, planned.bpm)) * this.beatsPerBar;
        return bar * (ENDING_RING_BARS + 2);
    }

    // The ending has rung out: stop (letting the tails ring) and go back to
    // the start.
    finishEnding() {
        const quickStop = this.quickStop;
        this.quickStop = false;
        this.endBar = null;
        this.stop();
        this.quickStop = quickStop;
        this.reset();
        this.planListeners.forEach((listener) => listener());
        this.notifyRunning();
    }

    endStopFade() {
        if (!this.stopFade) return;
        clearTimeout(this.stopFade);
        this.stopFade = null;
        Object.values(this.roles).forEach(({ instrument }) => instrument.flushTails());
        if (this.reverbHub) this.reverbHub.flushTails();
        this.wasmRoomPool?.clear();
        this.output.gain.cancelScheduledValues(this.AC.currentTime);
        this.output.gain.setValueAtTime(1, this.AC.currentTime);
    }

    /**
     * Musical settings re-plan everything after the bar now playing. Home
     * settings also bring the music back to them from that bar.
     */
    /**
     * The second lead's and the drums' reverbs load only once those play
     * (a convolver's memory is large, see nodes/reverb.js): called when
     * their settings change.
     */
    warmRoles() {
        const hear = (role) => { const { reverb } = this.roles[role].instrument; if (reverb) reverb.hear(); };
        if (this.settings.counter && this.settings.counter.mode !== 'off') hear('counter');
        if (this.settings.drums && this.settings.drums.style !== 'off') hear('perc');
    }

    set(key, value) {
        const soundOnlyDrums = key === 'drums' && Object.keys(value).every(k => k === 'kit' || value[k] === this.settings.drums[k]);
        this.settings[key] = value;
        if (key === 'generation') this.refreshStringPatches();
        if (key === 'counter' || key === 'drums') this.warmRoles();
        if (key === 'ambience') this.ambience.setLevels(value);
        if (key === 'ambienceShape') this.ambience.setShape(value);
        if (key === 'ambienceWander') this.ambience.setWander(value);
        if (key === 'ambienceVolume') this.setAmbienceVolume(value);
        if (key === 'volumes') this.applyVolumes();
        if (key === 'drumKit') this.roles.perc.instrument.setKit(value);
        if (key === 'drums') void this.syncPercussionVoice();
        if (key === 'muted') this.applyMutes();
        if (key === 'wander') this.applyWander();
        if (key === 'bus') this.applyBus();
        if (key === 'dynamics') this.applyDynamics();
        if (SOUND_KEYS.has(key) || soundOnlyDrums) return;
        this.replan([key]);
    }

    // After a settings change: while playing or paused, everything after
    // the bar now playing (or from the resume point) is planned again -
    // from home, if a home setting changed - and the piece carries on. A
    // new time signature starts at that bar too. Otherwise (at the start)
    // the preview is planned afresh. Only rewind() goes back to the start.
    replan(keys, meterChanged = keys.includes('meter')) {
        this.queueHeldGlideReset();
        if (this.loop) this.loop.dirty = true;
        if (this.isRunning || this.paused) {
            this.editedSinceStart = true;
            const from = this.currentBar + 1;
            if (meterChanged && this.isRunning) {
                // the bar playing finishes in its old length
                this.transport.rebase(from * this.transport.beatsPerBar, from * this.meter.units, this.meter.units);
            } else if (meterChanged) {
                this.transport.beatsPerBar = this.meter.units;
            }
            [...this.plan.keys()].filter((bar) => bar >= from).forEach((bar) => this.plan.delete(bar));
            if (keys.some((key) => HOME_KEYS.has(key))) this.planHomeChange(from, meterChanged);
            this.ensurePlanned(from);
        } else {
            this.reset();
        }
    }

    // A new home while playing (another scene, key or tempo). With smooth changes (the page's
    // preference, smoothChanges) a change of key first plays the new key's dominant in the old
    // key (pivotChord), so the arrival sounds intended, and the tempo glides there over about
    // three bars; otherwise the new music starts at once.
    planHomeChange(from, meterChanged) {
        this.homeGlide = null;
        this.pivotBar = null;
        const prev = this.plan.get(from - 1);
        if (!this.smoothChanges || meterChanged || !prev) { this.resetMusicAt = from; return; }
        const home = this.homeMusic(), keyChange = scaleDistance(prev.nextMusic, home) > 0 && !this.avoidTonic(home);
        this.resetMusicAt = keyChange ? from + 1 : from;
        if (keyChange) this.pivotBar = from;
        const gap = Math.abs(home.bpm - prev.bpm);
        if (gap > 0) this.homeGlide = { from, step: Math.max(2, gap / 3) };
    }

    /**
     * Several settings at once with a single re-plan (loading shared
     * settings, "keep this"). A meter change restarts playback as in set().
     */
    setMany(patch) {
        const meterChanged = 'meter' in patch && patch.meter !== this.settings.meter;
        const soundOnlyDrums = patch.drums && Object.keys(patch.drums).every(k => k === 'kit' || patch.drums[k] === this.settings.drums[k]);
        Object.assign(this.settings, patch);
        if ('generation' in patch) this.refreshStringPatches();
        this.warmRoles();
        if ('ambienceShape' in patch) this.ambience.setShape(this.settings.ambienceShape);
        if ('ambience' in patch) this.ambience.setLevels(this.settings.ambience);
        if ('ambienceWander' in patch) this.ambience.setWander(this.settings.ambienceWander);
        if ('ambienceVolume' in patch) this.setAmbienceVolume(this.settings.ambienceVolume);
        if ('volumes' in patch) this.applyVolumes();
        if ('drumKit' in patch) this.roles.perc.instrument.setKit(this.settings.drumKit);
        if ('drums' in patch) void this.syncPercussionVoice();
        if ('muted' in patch) this.applyMutes();
        if ('wander' in patch) this.applyWander();
        if ('bus' in patch) this.applyBus();
        if ('dynamics' in patch) this.applyDynamics();
        if (Object.keys(patch).every((key) => SOUND_KEYS.has(key) || key === 'drums' && soundOnlyDrums)) return;
        this.replan(Object.keys(patch), meterChanged);
    }

    /**
     * A short opening: with sections, the intro lasts one phrase and goes straight to Full (a
     * per-visit preference, not part of the settings and so not of share links).
     */
    setQuickIntro(on) {
        if (Boolean(this.quickIntro) === on) return;
        this.quickIntro = on;
        this.replan(['sections']);
    }

    /** What is audible now: { tonic, mode, progression, bpm, keyName }. */
    nowPlaying() {
        const planned = this.plan.get(Math.floor(this.position() / this.beatsPerBar)) || this.getPlan()[0];
        const { tonic, mode, progression } = planned.music;
        return { tonic, mode, progression, bpm: Math.round(planned.bpm), keyName: planned.chord.keyName };
    }

    refreshStringPatches() {
        for (const r of Object.values(this.roles)) if (!r.edited && r.stringPatchBase) {
            const { name, preset } = r.stringPatchBase;
            r.instrument.applyPreset(breathPatch(name,pianoPatch(name, stringPatch(name, preset, this.settings.generation), this.settings.generation),this.settings.generation));
        }
    }

    /** Makes what is playing now the home settings. */
    keepCurrent() {
        const { tonic, mode, progression, bpm } = this.nowPlaying();
        this.setMany({ tonic, mode, progression, bpm });
    }

    applyVolumes() {
        Object.entries(this.roles).forEach(([role, r]) => { r.volume = this.settings.volumes[role] ?? ROLE_VOLUMES[role]; });
        this.applyMix();
    }

    setAmbienceVolume(volume) {
        this.ambienceOut.gain.setTargetAtTime(ambienceGain(volume), this.AC.currentTime, 0.05);
    }

    /** Gain of the ambience volume (for rendering to a file). */
    get ambienceGain() {
        return ambienceGain(this.settings.ambienceVolume ?? 0.8);
    }

    /**
     * The shared effects bus (settings.bus, engine/bus.js): built the first time a voice sends to
     * it, then patched. Each voice's send leaves after its wander, so volume, mute and solo apply.
     */
    // The scene's dynamics reach the Wasm voices through their patches (velocity → attack and
    // filter); the notes carry the rest (composition/dynamics.js).
    applyDynamics() {
        for (const { instrument } of Object.values(this.roles)) instrument?.setDynamics?.(this.settings.dynamics);
    }

    applyBus() {
        const bus = this.settings.bus;
        if (!this.busRack) {
            if (!busActive(bus) || this.busLoading) return;
            this.busLoading = createBusRack(this.AC, bus.rack, this.output).then((rack) => {
                this.busRack = rack;
                for (const r of Object.values(this.roles)) {
                    r.send = this.AC.createGain();
                    r.send.gain.value = 0;
                    r.wander.output.connect(r.send);
                    r.send.connect(rack.input);
                }
                this.applyBus();
            }).catch((error) => console.error('Could not build the effects bus', error)).finally(() => { this.busLoading = null; });
            return;
        }
        this.busRack.patch(bus.rack);
        for (const [role, r] of Object.entries(this.roles)) r.send?.gain.setTargetAtTime(bus.sends[role] ?? 0, this.AC.currentTime, 0.03);
    }

    // Timbre drift (composition/timbreDrift.js) at a bar's start, for each melodic role; a role
    // that was drifting gets its preset back when the setting goes to 0.
    applyDrift(bar, barSeconds) {
        const amount = this.settings.timbreDrift;
        for (const role of ['lead', 'counter', 'pad', 'bass']) {
            const r = this.roles[role], instrument = r?.instrument;
            if (!instrument?.setDrift) continue;
            const values = timbreDrift(instrument.preset, role, bar, amount, this.settings.seed);
            if (!values && !r.drifting) continue;
            instrument.setDrift(values, barSeconds);
            r.drifting = !!values;
        }
    }

    // The section space (composition/sectionSpace.js): built on first use, then each role's send
    // follows the bar's section, gliding over about two bars.
    applySpace(level, time, barSeconds) {
        if (!this.spaceRack) {
            if (!(level > 0) || this.spaceLoading) return;
            this.spaceLoading = createBusRack(this.AC, SPACE_RACK, this.output).then((rack) => {
                this.spaceRack = rack;
                for (const r of Object.values(this.roles)) {
                    r.spaceSend = this.AC.createGain();
                    r.spaceSend.gain.value = 0;
                    r.wander.output.connect(r.spaceSend);
                    r.spaceSend.connect(rack.input);
                }
            }).catch((error) => console.error('Could not build the section space', error)).finally(() => { this.spaceLoading = null; });
            return;
        }
        for (const [role, r] of Object.entries(this.roles)) r.spaceSend?.gain.setTargetAtTime(level * (SPACE_ROLE[role] ?? 1), time, barSeconds * 0.7);
    }

    homeMusic() {
        const { tonic, mode, progression, bpm } = this.settings;
        return { tonic, mode, progression, bpm };
    }

    /**
     * Replace one melodic source, committing only the latest successful load: a classic synth
     * ({classics}), or a preset of the generator's own synth on the current audio engine.
     * `name` is the preset's (a classic is named by its sound); a classic counts as edited.
     */
    async setRoleSource(role, source, name) {
        if(!ROLES[role])throw Error('Unknown melodic role');
        const r=this.roles[role],revision=r.sourceRevision=(r.sourceRevision??0)+1;
        const pending=(async()=>{
            let instrument;
            if(source?.classics){
                const Classics=(await import('./engine/classicsInstrument')).default;
                instrument=await Classics.create({context:this.AC,preset:source,polyphony:source.classics.light?Math.min(4,ROLES[role].polyphony):ROLES[role].polyphony});
            }else if(source?.diy){
                const [Wasm,{diySpec}]=await Promise.all([import('./engine/wasmInstrument').then(m=>m.default),import('./engine/diySource')]);
                instrument=await Wasm.create({context:this.AC,preset:source,polyphony:ROLES[role].polyphony,spec:diySpec(source.diy,ROLES[role].polyphony),roomPool:this.wasmRoomPool});
            }else if(source?.wasmVoice||this.audioEngine==='wasm'){
                const Wasm=(await import('./engine/wasmInstrument')).default;
                instrument=await Wasm.create({context:this.AC,preset:source,polyphony:ROLES[role].polyphony,roomPool:this.wasmRoomPool,dynamics:this.settings.dynamics});
            }else instrument=new Instrument({context:this.AC,preset:source??findPreset(ROLES[role].preset),polyphony:ROLES[role].polyphony,reverbHub:this.reverbHub});
            if(revision!==r.sourceRevision){instrument.dispose();return;}
            r.roomRoute?.dispose();r.roomRoute=null;r.instrument.dispose();r.instrument=instrument;instrument.connect(r.tone);
            if(this.wasmRoomPool&&!source?.classics)r.roomRoute=createWasmRoomRoute(this.AC,instrument,{roleWander:r.wander,volume:r.volume,cutoff:r.tone.frequency.value});
            r.stringPatchBase=null;r.edited=externalSource(source);r.presetName=name??source?.classics?.name??source?.diy?.name??ROLES[role].preset;
            this.applyMix();
        })();
        this.sourceLoads??=new Set();this.sourceLoads.add(pending);
        try{await pending;}finally{this.sourceLoads.delete(pending);}
    }

    /**
     * The percussion part's source: a classic drum machine ({classics: {synth: 'tr808' | 'tr909',
     * values, rack}}) playing the generator's drums on its pads, or null for the kit chosen in
     * settings. The pattern and its bookings carry on; only the sound changes.
     */
    async setPercussionSource(source) {
        const r = this.roles.perc, revision = r.sourceRevision = (r.sourceRevision ?? 0) + 1;
        let instrument;
        if (source?.classics) {
            const Classics = (await import('./engine/classicsInstrument')).default;
            instrument = await Classics.create({ context: this.AC, preset: source, polyphony: 16 });
        } else {
            if (!r.machine) return;
            const Kit = this.percussionEngine === 'native' ? DrumKit : WasmDrumKit;
            instrument = new Kit({ context: this.AC, reverbHub: this.reverbHub, model: this.percussionEngine });
            if (instrument.ready) await instrument.ready;
        }
        if (revision !== r.sourceRevision) { instrument.dispose(); return; }
        instrument.setKit(this.settings.drumKit);
        r.instrument.silence?.();r.instrument.dispose();
        r.instrument = instrument;r.machine = !!source?.classics;instrument.connect(r.gain);
        r.presetName = source?.classics?.name ?? percussionVoice(this.settings.drums.kit).name;
        if (!r.machine) { instrument.setVoicePreset(this.settings.drums.kit); await this.syncPercussionVoice(); }
        this.applyMix();
    }

    /** Loads a preset onto a role; `preset` defaults to looking `name` up. */
    loadRolePreset(role, name, preset = findPreset(name), morphSeconds = 0) {
        if (!preset) return false;
        if (this.pendingVoices) this.pendingVoices = this.pendingVoices.filter((p) => p.role !== role || p.preset === preset);
        const r = this.roles[role];
        r.stringPatchBase = (isStringPatch(name) || isPianoPatch(name) || isBreathPatch(name)) && preset === findPreset(name) ? { name, preset } : null;
        if (r.stringPatchBase) preset = breathPatch(name,pianoPatch(name, stringPatch(name, preset, this.settings.generation), this.settings.generation),this.settings.generation);
        // a classic synth or DIY patch gives the role back to the generator's own synth
        if (externalSource(r.instrument.preset)) {
            const base = r.stringPatchBase;
            this.setRoleSource(role, preset, name).then(() => { r.stringPatchBase = base; }, (error) => console.error('Could not restore the voice', error));
        } else if (morphSeconds > 0) r.instrument.morphTo(preset, morphSeconds);
        else r.instrument.applyPreset(preset);
        r.presetName = name;
        r.edited = false;
        return true;
    }

    /**
     * Loads a preset onto a role at the next bar line while playing, so a
     * new sound arrives with the music that goes with it (a change of
     * composition re-plans from the next bar too); at once when stopped.
     * A later load for the role (either kind) replaces a waiting one.
     * @param {function} [applied] - called when it has been loaded
     * @param {object} [options]
     * @param {boolean} [options.morph] - glide to the sound over the chord that starts then,
     *   instead of switching (only when it arrives at a bar line while playing)
     * @returns {boolean} whether the preset exists
     */
    loadRolePresetAtBar(role, name, preset = findPreset(name), applied, { morph = false } = {}) {
        if (!preset) return false;
        this.pendingVoices = (this.pendingVoices || []).filter((p) => p.role !== role);
        if (!this.isRunning) {
            this.loadRolePreset(role, name, preset);
            if (applied) applied();
        } else {
            this.pendingVoices.push({ role, name, preset, applied, morph });
        }
        return true;
    }

    /**
     * Holds `change` (a function that changes settings and sounds) until the last beat before
     * the next chord, so the music moves there with a new chord's first bar; at once when the
     * music is not playing. A later call replaces a waiting one.
     */
    atNextChord(change) {
        if (!this.isRunning) {
            this.pendingChange = null;
            change();
        } else {
            this.pendingChange = change;
        }
    }

    /** Runs the change waiting for a chord (atNextChord), if any. */
    runPendingChange() {
        const change = this.pendingChange;
        this.pendingChange = null;
        if (change) change();
    }

    /**
     * Loads the sounds waiting for a bar line.
     * @param {number} [bar] - the bar starting; with `secondsPerBeat`, the sounds that asked to
     *   morph glide over the chord that starts there
     */
    flushPendingVoices(bar, secondsPerBeat) {
        const waiting = this.pendingVoices || [];
        if(this.heldActiveRoles?.size)for(const {role} of waiting)if(this.heldActiveRoles.has(role)){this.roles[role].instrument.silence();this.heldActiveRoles.delete(role);for(const p of this.plan.values())if(p.bar>=bar)for(const e of p.events)if(e.role===role)e.booked=false;}
        this.pendingVoices = [];
        let morphSeconds = 0;
        if (waiting.some((p) => p.morph) && bar !== undefined && secondsPerBeat) {
            const { start, end } = this.chordOf(bar);
            morphSeconds = (end - start + 1) * this.beatsPerBar * secondsPerBeat;
        }
        waiting.forEach(({ role, name, preset, applied, morph }) => {
            this.loadRolePreset(role, name, preset, morph ? morphSeconds : 0);
            if (applied) applied();
        });
    }

    /** One synth parameter, live (the editor's knobs). */
    setRoleParam(role, key, value) {
        this.roles[role].instrument.set(key, value);
        this.roles[role].edited = true;
    }

    /** The role's full current preset (defaults filled in). */
    getRolePreset(role) {
        return { ...this.roles[role].instrument.preset };
    }

    getRolePolyphony(role) {
        return this.roles[role].instrument.polyphony;
    }

    /** 'wasm' when the role's voice plays in a Wasm kernel, 'native' for the Web Audio Instrument
     * (also a Wasm instrument's piano and plucked string): which reverb controls apply. */
    getRoleEngine(role) {
        const spec = this.roles[role].instrument.spec?.();
        return spec && spec.kind !== 'legacy' ? 'wasm' : 'native';
    }

    /**
     * Plays the role's part of the chord under the playhead right now, so
     * edits can be heard while stopped (while playing they are heard live).
     */
    async audition(role) {
        if(role==='perc'&&this.percussionReady)await this.percussionReady;
        const {instrument}=this.roles[role];
        this.auditionPending=(this.auditionPending??0)+1;
        try{if(instrument.ready)await instrument.ready;
        if (this.AC.state !== 'running') await this.AC.resume();
        this.endStopFade();
        const bar = Math.floor(this.position() / this.beatsPerBar);
        const planned = this.plan.get(bar) || this.getPlan()[0];
        const time = this.AC.currentTime + 0.05;
        if (role === 'perc') {
            const beat = 60 / unitsPerMinute(this.meter, planned.bpm);
            auditionHits(this.settings.drums.kit).forEach((e) => instrument.scheduleNote(e.midi, time + e.beat * beat, 0.1, e.velocity));
            return;
        }
        const notes = {
            bass: [noteAtOrAbove(planned.chord.pitchClasses[0], planned.state.ranges.bass[0] + 5)],
            pad: planned.state.padVoicing,
            lead: [planned.state.leadMidi],
            counter: [planned.state.counterMidi || 72],
        }[role];
        notes.forEach((midi) => instrument.scheduleNote(midi, time, 1.5, 0.7));
        }finally{this.auditionPending--;}
    }

    setRoleVolume(role, volume) {
        this.roles[role].volume = volume;
        this.settings.volumes = { ...this.settings.volumes, [role]: volume };
        this.applyMix();
    }

    /** Mute / solo, as on a mixer: any solo silences every role not soloed. Mutes are kept in the settings. */
    setRoleMix(role, { mute, solo }) {
        const r = this.roles[role];
        if (mute !== undefined) {
            r.mute = mute;
            this.settings.muted = { ...this.settings.muted, [role]: mute };
        }
        if (solo !== undefined) r.solo = solo;
        this.applyMix();
    }

    // Slow pan / volume wander on each role's output, filter and pitch on its sound (engine/wander.js).
    applyWander() {
        const { wander } = this.settings;
        Object.entries(this.roles).forEach(([role, r]) => {
            r.wander.apply(wander);
            if (r.instrument.setWander) r.instrument.setWander(instrumentWander(wander, role));
        });
    }

    applyMutes() {
        Object.entries(this.roles).forEach(([role, r]) => { r.mute = Boolean(this.settings.muted[role]); });
        this.applyMix();
    }

    // Generated notes keep being booked for silent roles, so unmuting is
    // instant and in time.
    /** Whether a role is heard (not muted, or soloed when anything is). */
    audible(role) {
        const anySolo = Object.values(this.roles).some((r) => r.solo), r = this.roles[role];
        return anySolo ? r.solo : !r.mute;
    }

    applyMix() {
        const anySolo = Object.values(this.roles).some((r) => r.solo);
        Object.values(this.roles).forEach((r) => {
            const audible = anySolo ? r.solo : !r.mute;
            r.gain.gain.setTargetAtTime(audible ? r.volume : 0, this.AC.currentTime, 0.02);
            r.roomRoute?.gain.gain.setTargetAtTime(audible ? r.volume : 0, this.AC.currentTime, 0.02);
            if (r.instrument.reverb && r.instrument.reverb.setLevel) r.instrument.reverb.setLevel(audible ? r.volume : 0);
        });
    }

    /**
     * Plays a held note on a role (keyboard / MIDI); returns an id for
     * liveNoteOff. For percussion `midi` is the drum (percussion.js DRUMS):
     * one hit, nothing to release.
     */
    // A separate subscription avoids dropping chord notes when the frame rate dips.
    // Visual consumers never run on the audio-rendering thread.
    onVisualNote(listener) {
        this.visualListeners.add(listener);
        return () => this.visualListeners.delete(listener);
    }

    emitVisualNote(event) {
        if (!this.visualListeners?.size) return;
        const instrument = this.roles[event.role]?.instrument;
        const enriched = event.type === 'on' ? {
            ...event,
            preset: { ...instrument.preset },
            env: instrument.gainEnv ? { ...instrument.gainEnv } : undefined,
        } : event;
        this.visualListeners.forEach((listener) => {
            try { listener(enriched); } catch (error) { console.warn('Visual note consumer failed', error); }
        });
    }

    /**
     * Plays a held note on a role (keyboard / MIDI); returns an id for
     * liveNoteOff. For percussion `midi` is the drum (percussion.js DRUMS):
     * one hit, nothing to release.
     */
    liveNoteOn(role, midi, velocity = 0.8) {
        if (this.AC.state !== 'running') this.AC.resume();
        this.endStopFade();
        if (role === 'perc') {
            this.roles.perc.instrument.scheduleNote(midi, this.AC.currentTime + 0.005, 0.8, velocity, Math.random() * 2 - 1);
            this.emitVisualNote({ type: 'on', role, midi, velocity, time: this.AC.currentTime + 0.005, length: 0.15 });
            return null;
        }
        const id = this.roles[role].instrument.startNote(midi, velocity);
        this.liveNotes?.add(role+':'+id);
        this.emitVisualNote({ type: 'on', role, midi, velocity, time: this.AC.currentTime + 0.005, liveId: id });
        return id;
    }

    liveNoteOff(role, id) {
        this.liveNotes?.delete(role+':'+id);
        if (role === 'perc') return;
        this.roles[role].instrument.stopNote(id);
        this.emitVisualNote({ type: 'off', role, liveId: id, time: this.AC.currentTime });
    }

    /** @param {function} callback - called whenever planned bars change */
    onPlanChange(callback) {
        this.planListeners.add(callback);
        return () => this.planListeners.delete(callback);
    }

    /** Planned bars, ascending: { bar, chord, chordStart, events, music, bpm } */
    getPlan() {
        const from = Math.floor(this.position() / this.beatsPerBar) - PLAN_KEEP_BARS;
        return [...this.plan.values()].filter((planned) => planned.bar >= from).sort((a, b) => a.bar - b.bar);
    }

    /**
     * Where the *audible* playhead is, in beats (fractional). Derived from
     * the audio clock minus output latency, against the times beats were
     * actually booked at, so it stays right across tempo changes.
     */
    position() {
        if (!this.isRunning || !this.beatLog.length) return (this.resumeBar || 0) * this.beatsPerBar;
        const now = this.audioClock() - (this.AC.outputLatency || this.AC.baseLatency || 0);
        let entry = this.beatLog[0];
        for (const e of this.beatLog) {
            if (e.time <= now) entry = e;
        }
        // in bars, each beat a share of its own bar: smooth across a time
        // signature change; then in units of the current bar
        // (not before the first booked beat: just after a jump it lies ahead)
        const bars = entry.bar + Math.min(1, (entry.beatInBar + Math.max(0, now - entry.time) / entry.secondsPerBeat) / entry.units);
        return Math.max(0, bars * this.beatsPerBar);
    }

    /**
     * The audio clock, smoothed for drawing. AudioContext.currentTime moves
     * in steps of one output buffer, which is nothing at the lowest latency
     * but at 100-200 ms made the playhead jump. Between the steps the page's
     * own clock (performance.now) carries it: its offset to the audio clock is
     * the highest seen recently - right at each step - and only eases down
     * slowly, so it follows a real drift but not the staircase. A jump (a
     * suspended context, a seek) starts it over.
     */
    audioClock() {
        const wall = performance.now() / 1000;
        const raw = this.AC.currentTime;
        const offset = raw - wall;
        const clock = this.clock;
        if (!clock || this.AC.state !== 'running' || Math.abs(offset - clock.offset) > 0.5) {
            this.clock = { offset, wall };
            return raw;
        }
        clock.offset = Math.max(offset, clock.offset - 0.0005 * Math.min(1, wall - clock.wall) * 20);
        clock.wall = wall;
        return wall + clock.offset;
    }

    // A chord on a scale degree of `music`'s key, with display names.
    // `borrow` takes the chord from the parallel mode instead (the major IV or V
    // in a minor key; the minor iv or the flat VI or VII in a major one), while
    // the melody stays in the home scale.
    buildChord(music, numeral, colour = 'plain', borrow = false) {
        const { tonic, mode } = music;
        const scale = scaleSemitones(scaleById(mode).intervals);
        const harmonicMode = harmonyMode(mode, this.settings.harmonyScale, this.settings.generation);
        const harmonic = scaleSemitones(scaleById(harmonicMode).intervals);
        const degree = romanDegree(numeral);
        const minorHome = harmonic.length === 7 && harmonic[2] === 3;
        const majorHome = harmonic.length === 7 && harmonic[2] === 4;
        const borrowed = borrow && ((minorHome && [4, 5].includes(degree)) || (majorHome && [4, 6, 7].includes(degree)));
        const chordScale = borrowed ? scaleSemitones(scaleById(minorHome ? 'Major-1' : 'Major-6').intervals) : harmonic;
        const names = spellScale(tonic, chordScale);
        const offsets = diatonicChord(chordScale, degree, this.settings.padNotes, colour);
        const result = {
            numeral: displayNumeral(numeral, offsets),
            pitchClasses: offsets.map((o) => (tonic + o) % 12),
            scalePcs: scale.map((st) => (tonic + st) % 12),
            root: names[(degree - 1) % chordScale.length],
            name: names[(degree - 1) % chordScale.length] + chordSymbol(offsets),
            keyName: `${names[0]} ${scaleById(mode).name}`,
            ...(this.rulebookTrace?{provenance:{borrowed:Boolean(borrowed),sourceMode:borrowed?(minorHome?'Major-1':'Major-6'):harmonicMode,
                baseMode:mode,harmonicMode,colour,degree,requestedNumeral:numeral}}:{}),
            ...(harmonicMode === mode ? {} : { harmonyMode: harmonicMode, harmonyPcs: harmonic.map(st => (tonic + st) % 12) }),
        };
        return this.settings.tonality.mode==='bitonal'?describeBitonality(result,music,this.settings.tonality.separation):result;
    }

    avoidTonic(music) { return this.settings.tonality.mode==='atonal'||isUnsettlingProgression(music.progression); }
    endingChord(music,bar,numeral) { return this.avoidTonic(music)?this.chordAt(bar,music):this.buildChord(music,numeral); }

    // The chord at `bar` under `music` (progressions restart each cycle).
    chordAt(bar, music) {
        const numerals = PROGRESSIONS[music.progression];
        const slot = this.harmonicSlotAt(bar,music);
        if(this.settings.tonality.mode==='atonal')return atonalChord({seed:this.settings.seed,tonic:music.tonic,slot:Math.floor(music.cycleStart/this.settings.barsPerChord)+slot.index,size:this.settings.padNotes,colour:this.colourFor(slot.start)});
        const colourBar = this.variableHarmonyOn() && music.harmonicDurations ? slot.start : bar;
        const chord=this.buildChord(music, numerals[slot.index], this.colourFor(colourBar), this.borrowFor(colourBar));
        return isUnsettlingProgression(music.progression)?{...chord,unresolved:true}:chord;
    }

    variableHarmonyOn() {
        return this.harmonicRhythm !== false && this.settings.generation !== 'legacy'
            && this.formDevelopment !== false && this.settings.sections.mode !== 'off';
    }

    harmonicSlotAt(bar,music) {
        return harmonicSlot({bar,cycleStart:music.cycleStart,count:PROGRESSIONS[music.progression].length,
            barsPerChord:this.settings.barsPerChord,durations:this.variableHarmonyOn()?music.harmonicDurations:undefined});
    }

    cycleMusic(music,cycleStart,fromBar) {
        const next={...music,cycleStart};delete next.harmonicDurations;
        if(this.variableHarmonyOn()){
            const durations=harmonicDurations({count:PROGRESSIONS[next.progression].length,barsPerChord:this.settings.barsPerChord,cycleStart,
                develop:this.harmonicDevelopment!==false, section:this.sectionFormAt(cycleStart,next,fromBar)?.section});
            if(durations.some(n=>n!==this.settings.barsPerChord))next.harmonicDurations=durations;
        }
        return next;
    }

    // 'plain' or the chord colour setting, for the chord `bar` falls in: a fixed
    // share of the chords (chordColour.amount) get it, which ones is set by
    // the seed and the bar, so replaying a bar plays the same chord.
    colourFor(bar) {
        const { mode, amount } = this.settings.chordColour;
        if (mode === 'plain' || amount <= 0) return 'plain';
        if (amount >= 1) return mode;
        return seeded(this.settings.seed * 31 + Math.floor(bar / this.settings.barsPerChord))() < amount ? mode : 'plain';
    }

    // Whether the chord `bar` falls in is borrowed (settings.chordBorrow): by the seed and the bar, like colourFor.
    borrowFor(bar) {
        const share = this.settings.chordBorrow;
        if (!(share > 0)) return false;
        return seeded(this.settings.seed * 37 + 11 + Math.floor(bar / this.settings.barsPerChord))() < share;
    }

    // The new key's dominant, played in the old key's last bar: a standard
    // way to make a modulation sound intended. Labelled V/<new tonic>.
    pivotChord(from, to) {
        const dominant = this.buildChord(to, 'V');
        return { ...dominant, numeral: `${dominant.numeral}/${this.buildChord(to, 'I').root}`, keyName: this.buildChord(from, 'I').keyName,
            ...(this.rulebookTrace?{provenance:{...dominant.provenance,pivotTo:this.buildChord(to,'I').keyName}}:{}) };
    }

    // The chord at `bar`: the progression's, or - in the last chord slot of
    // a cycle that changes key, with pivots on - the new key's dominant.
    chordFor(bar, music, upcoming) {
        const { barsPerChord, drift } = this.settings;
        const cycleBars = PROGRESSIONS[music.progression].length * barsPerChord;
        const inLastSlot = this.harmonicSlotAt(bar,music).index === PROGRESSIONS[music.progression].length-1;
        if (!this.avoidTonic(music) && inLastSlot && drift.pivot && scaleDistance(music, upcoming) > 0) return this.pivotChord(music, upcoming);
        return this.chordAt(bar, music);
    }

    // Forecast the same small section state used by the arranger, without reading
    // stale future bars during a re-plan or advancing the conductor's RNG.
    sectionFormAt(bar, music, fromBar = bar) {
        if (this.settings.generation === 'legacy' || this.formDevelopment === false || this.settings.sections.mode === 'off') return null;
        const previous = this.plan.get(fromBar - 1)?.state;
        let form = previous?.composition?.form;
        const size = this.settings.barsPerChord;
        for (let at = fromBar; at <= bar; at++) {
            const inChord = ((at - music.cycleStart) % size + size) % size;
            form = planForm({ bar: at, seed: this.settings.seed,
                sections: this.quickIntro ? { ...this.settings.sections, quickIntro: true } : this.settings.sections,
                settings: this.settings, previous: form, barsPerChord: size, barsLeftInChord: size - inChord,
                formStrategies:this.formStrategies!==false,sectionCurves:this.sectionCurves!==false,strategyOverride:this.formStrategy, previousTheme: previous?.composition?.phrase?.themeId, developSections: this.sectionDevelopment !== false });
        }
        return form;
    }

    sectionChord(bar, music, upcoming, chord, fromBar = bar) {
        if (this.avoidTonic(music) || this.sectionCadences === false || this.settings.generation === 'legacy'
            || this.formDevelopment === false || this.settings.sections.mode === 'off') return chord;
        // A conductor pivot takes precedence over a local section cadence.
        if (this.settings.drift.pivot && scaleDistance(music, upcoming) > 0
            && bar >= music.cycleStart + (PROGRESSIONS[music.progression].length - 1) * this.settings.barsPerChord) return chord;
        const section = this.sectionFormAt(bar, music, fromBar)?.section;
        const interior=this.harmonicDevelopment!==false&&(this.endBar===null||bar<this.endBar-1)
            ?harmonicDestination({section,bar,size:this.settings.barsPerChord,cycleStart:music.cycleStart,scaleSize:(chord.harmonyPcs??chord.scalePcs).length,slot:this.harmonicSlotAt(bar,music)}):null;
        if(interior)chord={...this.buildChord(music,interior.numeral,this.colourFor(bar),this.borrowFor(bar)),cadence:{...interior,previous:chord.name}};
        const cadence = sectionCadence({ section, bar,
            barsPerChord: this.settings.barsPerChord, cycleStart: music.cycleStart,
            scaleSize: (chord.harmonyPcs ?? chord.scalePcs).length });
        if (!cadence) {
            if (this.sectionBridges === false || !section) return chord;
            const size = this.settings.barsPerChord, end = section.start + section.bars;
            const bridgeStart = end - size * 2, cycleEnd = music.cycleStart + PROGRESSIONS[music.progression].length * size;
            const eligible = sectionCadence({ section, bar:end-size, barsPerChord:size,
                cycleStart:music.cycleStart, scaleSize:(chord.harmonyPcs ?? chord.scalePcs).length });
            if (!eligible || eligible.kind !== 'prepare' || section.bars < size * 3
                || bar < bridgeStart || bar >= bridgeStart + size || bridgeStart - size < music.cycleStart
                || end > cycleEnd || (end === cycleEnd && scaleDistance(music, upcoming) > 0)
                || (this.endBar !== null && end >= this.endBar - 1)) return chord;
            // The whole closing chain is in a known key/cycle. Read the original
            // preceding slot rather than recursively depending on realised notes.
            const target = this.buildChord(music, 'V', this.colourFor(end-size), this.borrowFor(end-size));
            const before = this.chordAt(bridgeStart-1, music);
            const candidates = ['II','IV','VI','III'].map(numeral => ({ ...this.buildChord(music, numeral,
                this.colourFor(bridgeStart), this.borrowFor(bridgeStart)), bridgeNumeral:numeral }));
            const selected = commonToneBridge({ before, original:chord, target, candidates });
            if (!selected) return chord;
            const {bridgeNumeral, ...prepared} = selected.chord;
            return { ...prepared, cadence:{kind:'bridge',numeral:bridgeNumeral,arrivalBar:end,previous:chord.name,
                sharedBefore:selected.sharedBefore,sharedAfter:selected.sharedAfter,target:target.name} };
        }
        const prepared = this.buildChord(music, cadence.numeral, this.colourFor(bar), this.borrowFor(bar));
        return { ...prepared, cadence: { ...cadence, previous: chord.name } };
    }

    // Only forecast harmony already decided by this cycle's conductor choice.
    // A key lift's change at `bar` (planBar): 'pivot' in a build's last bar (a seeded chance of
    // settings.keyLift) while unlifted, 'drop' as a breakdown starts while lifted, else null.
    liftEvent(bar, music, keyLift, fromBar = bar) {
        if (!(this.settings.keyLift > 0) || this.avoidTonic(music)) return null;
        const section = this.sectionFormAt(bar, music, fromBar)?.section;
        if (section?.type === 'breakdown' && section.start === bar && keyLift) return 'drop';
        if (section?.type === 'build' && !keyLift && section.bars && bar === section.start + section.bars - 1
            && (this.endBar === null || bar < this.endBar - 2) && seeded(this.settings.seed * 53 + bar)() < this.settings.keyLift * 0.6) return 'pivot';
        return null;
    }

    // `lift`: this bar's key lift ({ keyLift, chord: its pivot chord, if it pivots - a lift's or a
    // smooth home change's }); the forecast stops at a pivot and before any later lift, return or new home.
    melodyHarmony(bar, music, upcoming, count = 4, bpm = music.bpm, lift = null) {
        const size = this.settings.barsPerChord, end = music.cycleStart + PROGRESSIONS[music.progression].length * size;
        const next = this.cycleMusic(upcoming,end,bar), nextEnd = end + PROGRESSIONS[next.progression].length * size;
        const result = [];
        for (let at = bar; at < bar + count; at++) {
            if (this.endBar !== null && at >= this.endBar) break;
            if (at >= nextEnd) break;
            // A bridge in the next cycle's penultimate slot also depends on
            // whether that cycle will change key. Its conductor choice is unknown.
            if (at >= end && at >= nextEnd - size * 2 && this.settings.drift.mode !== 'off'
                && this.sectionCadences !== false && this.sectionBridges !== false
                && this.formDevelopment !== false && this.settings.sections.mode !== 'off') break;
            // The next cycle's final pivot needs a conductor decision we do not have.
            if (at >= end && at >= nextEnd - size && this.settings.drift.mode !== 'off' && this.settings.drift.pivot) break;
            const context = at < end ? music : next;
            if (at === bar && lift?.chord) { result.push({ bar: at, chord: lift.chord, scalePcs: lift.chord.scalePcs, bpm }); break; }
            if (at > bar && (this.liftEvent(at, context, lift?.keyLift ?? 0, bar) || this.pivotBar === at || this.resetMusicAt === at)) break;
            const baseChord = at < end ? this.chordFor(at, music, upcoming) : this.chordAt(at, next);
            const chord = this.endBar !== null && at === this.endBar - 1 ? this.endingChord(context,at,'V')
                : this.sectionChord(at, context, at < end ? upcoming : next, baseChord, bar);
            if (at > bar) bpm = glideTempo(bpm, (at < end ? music : next).bpm);
            result.push({ bar: at, chord, scalePcs: chord.scalePcs, bpm });
        }
        return result;
    }

    // Decides one bar. Event times/lengths are in beats from the bar start.
    planBar(bar) {
        const { barsPerChord, leadActivity, leadDensity, padWeights, bassWeights, pulseWeights, arpWeights, directionWeights, padMotion, thinPadUnderLead, drift, humanize, voices, counter, sections, drums, swing, chordSpread, pedal, leadScale, leadLeaps, leadRepeat, leadEnding } = this.settings;
        const prev = this.plan.get(bar - 1);

        const fresh = !prev || this.resetMusicAt === bar;
        let music = fresh ? this.cycleMusic(this.homeMusic(),bar,bar) : prev.nextMusic;
        // Key lifts (settings.keyLift): a build's last bar may pivot a whole step up for the full
        // sections after it; the next breakdown starts back home. Carried bar to bar as keyLift.
        let keyLift = fresh ? 0 : prev.keyLift ?? 0, liftPivot = false;
        let upcomingShift = 0;
        const liftChange = this.liftEvent(bar, music, keyLift);
        if (liftChange === 'drop') {
            music = transposeMusic(music, -keyLift);
            upcomingShift = -keyLift;
            keyLift = 0;
        } else if (liftChange === 'pivot') {
            liftPivot = true;
            upcomingShift = 2;
        }
        // a smooth home change glides to the new tempo (planHomeChange)
        const gliding = prev && this.homeGlide && bar >= this.homeGlide.from;
        const bpm = gliding ? glideTempo(prev.bpm, this.homeMusic().bpm, this.homeGlide.step) : fresh ? music.bpm : glideTempo(prev.bpm, music.bpm);
        if (gliding && bpm === this.homeMusic().bpm) this.homeGlide = null;

        const cycleBars = PROGRESSIONS[music.progression].length * barsPerChord;
        const inCycle = bar - music.cycleStart;
        // Next cycle's music: decided as this cycle starts, carried through it.
        // (a lift or its return moves the next cycle's music with it)
        const upcoming = inCycle === 0
            ? transposeMusic(nextMusic(music, transposeMusic(this.homeMusic(), keyLift), drift, progressionsOfLength(PROGRESSIONS[this.settings.progression].length).filter(i=>progressionFamily(i)===progressionFamily(this.settings.progression)), this.rng), liftPivot ? 2 : 0)
            : transposeMusic(prev.upcoming, upcomingShift);
        const cycleEnd = inCycle === cycleBars - 1;
        const following = cycleEnd ? this.cycleMusic(upcoming,bar+1,bar) : transposeMusic(music, liftPivot ? 2 : 0);

        if (this.endBar !== null && bar >= this.endBar) {
            this.planEnding(bar, prev, music, bpm);
            return;
        }
        const closing = this.endBar !== null && bar === this.endBar - 1;
        const pivot = !closing && this.pivotBar === bar;
        const chord = closing ? this.endingChord(music,bar,'V') : pivot ? this.pivotChord(music, this.homeMusic()) : liftPivot ? this.pivotChord(music, following)
            : this.sectionChord(bar, music, upcoming, this.chordFor(bar, music, upcoming));
        // The next bar's chord; a new cycle's first chord is never a pivot.
        const nextChord = closing ? this.endingChord(music,bar+1,'I')
            : pivot ? this.chordAt(bar + 1, this.cycleMusic(this.homeMusic(), bar + 1, bar + 1))
            : liftPivot ? this.chordAt(bar + 1, following)
            : this.endBar !== null && bar + 1 === this.endBar - 1 ? this.endingChord(following,bar+1,'V')
                : this.sectionChord(bar + 1, following, cycleEnd ? following : upcoming,
                    cycleEnd ? this.chordAt(bar + 1, following) : this.chordFor(bar + 1, music, upcoming), bar);

        // A chord (re)starts on its boundary, or wherever a re-plan changed it.
        const slot = this.harmonicSlotAt(bar,music);
        const chordStart = bar === slot.start || !prev || prev.chord.name !== chord.name;
        const barsLeftInChord = slot.left;

        const original = this.settings.generation === 'legacy';
        const { events, state } = (original ? arrangeBar : arrangeBarLatest)({
            seed: this.settings.seed,
            coordinate: this.ensembleCoordination !== false,
            developForm: this.formDevelopment !== false,
            sectionDevelopment: this.sectionDevelopment !== false,
            formStrategies:this.formStrategies!==false,sectionCurves:this.sectionCurves!==false,formStrategy:this.formStrategy,
            transitionGestures: this.transitionGestures !== false,
            leadTransitions: this.leadTransitions !== false,
            leadPickups: this.leadPickups !== false,
            endBar: this.endBar,
            developThemes: this.themeDevelopment !== false,
            resolveNotes: this.noteResolution !== false,
            contrastPhrases: this.contrastPhrases !== false,
            duetInteraction: this.duetInteraction !== false,
            rhythmDevelopment: this.rhythmDevelopment !== false,
            rhythmGrammar: this.rhythmGrammar !== false,
            partRhythmGrammar: this.partRhythmGrammar !== false,
            jointCounterpoint: this.jointCounterpoint !== false,
            phraseLength: this.longPhrases === false ? 4 : (this.phraseLength ?? 'auto'),
            harmonyForecast: !original && this.phraseSearch !== false ? this.melodyHarmony(bar, music, upcoming, this.longPhrases === false ? 4 : 8, bpm, { keyLift, chord: liftPivot || pivot ? chord : null }) : null,
            barsPerChord,
            bar,
            meter: this.meter,
            chord,
            nextChord,
            scalePcs: chord.scalePcs,
            chordStart,
            barsLeftInChord,
            formBarsLeftInChord: barsPerChord - inCycle % barsPerChord,
            prev: prev ? prev.state : null,
            settings: { bpm:this.settings.bpm,progression:this.settings.progression,sectionTone:this.settings.sectionTone,leadActivity, leadDensity, padWeights, bassWeights, pulseWeights, arpWeights, directionWeights, padMotion, thinPadUnderLead, voices, counter, sections: this.quickIntro ? { ...sections, quickIntro: true } : sections, chordSpread, pedal:this.settings.tonality.mode==='atonal'?{mode:'off',amount:0}:pedal, leadScale:this.settings.tonality.mode==='atonal'?'full':leadScale, leadLeaps, leadRepeat, leadEnding },
            rng: this.rng,
        });
        const pendingSuspension=prev?.state.composition?.sectionSuspension;
        if(!original&&pendingSuspension?.to.bar===bar&&state.composition){
            const resolved=state.composition.melody?.resolutions?.find(r=>r.kind==='section-suspension'
                &&r.from.bar===pendingSuspension.from.bar&&r.from.midi===pendingSuspension.from.midi);
            state.composition.sectionSuspensionArrival={...pendingSuspension,
                ...(resolved?{to:resolved.to}:{}),status:resolved?'resolved':'cancelled'};
        }
        const section=state.phrase.section;
        if(!original&&this.sectionSuspensions!==false&&this.phraseSearch!==false&&this.noteResolution!==false
            &&section?.form&&section.nextType==='full'&&section.type!=='full'
            &&bar===section.start+section.bars-1&&state.composition?.melody
            &&this.resetMusicAt!==bar+1&&(this.endBar===null||bar+1<this.endBar-1)
            &&PROGRESSIONS[following.progression].length>1&&events.some(e=>e.role==='lead')){
            // A planner-only preview uses the committed current state. Its own RNG
            // and zero timing offsets leave the live conductor and raw attack grid intact.
            const peek=this.planner({sectionSuspensions:false});
            peek.settings.humanize={timing:0,velocity:0,detune:0};peek.settings.swing=0;peek.endBar=this.endBar;
            peek.plan.set(bar,{bar,chord,chordStart,state,events,music,upcoming,nextMusic:following,bpm});
            peek.planBar(bar+1);
            const arrival=peek.plan.get(bar+1);
            if(this.settings.tonality.mode==='bitonal')arrival.events=arrival.events.map(e=>['lead','counter'].includes(e.role)?{...e,midi:e.midi-this.settings.tonality.separation}:e);
            if(arrival.state.phrase.section?.type==='full'){
                const protectedBeats=[...(state.composition.melody.resolutions??[]),...(state.composition.melody.ties??[])]
                    .flatMap(r=>[r.from,r.to]).filter(p=>p.bar===bar).map(p=>p.beat);
                const suspension=prepareSectionSuspension({bar,events,chord,arrival,meter:this.meter,bpm,
                    range:state.ranges.lead,settings:this.settings,protectedBeats});
                if(suspension)commitSectionSuspension(events,state,suspension,bar);
            }
        }
        // Drums: patterns and looseness from streams of their own (the
        // arranger's rng is never touched, so the notes stay the same).
        const boundaries=planBoundaries(state,bar,this.endBar);
        const hits = drums && drums.style !== 'off'
            ? (original ? drumBar : drumBarLatest)({ bar, meter: this.meter, drums, section: state.phrase.section, sectionsMode: sections.mode, sectionBars: state.phrase.section?.bars || sections.phrases * 4, phraseStart: state.phrase.start, phraseBars: state.composition?.phrase?.bars ?? 4, boundaries, seed: this.settings.seed, rhythm: state.composition?.rhythm })
            : [];
        swingEvents(events, this.meter, swing);
        swingEvents(hits, this.meter, swing);
        if (!original && state.composition?.rhythm) {
            const unitSeconds = 60 / unitsPerMinute(this.meter, bpm);
            const phrased = this.phrasePerformance !== false;
            const groove = this.instrumentGroove !== false
                ? (prev?.state.composition?.instrumentGroove?.start === state.composition.phrase.start
                    ? prev.state.composition.instrumentGroove : instrumentGroovePlan(state.composition.phrase.start, this.grooveVoices ?? this.grooveVoiceSnapshot())) : null;
            if (groove) state.composition.instrumentGroove = groove;
            performEnsemble([...events, ...hits], phrased ? { ...humanize, velocity: humanize.velocity * .4 } : humanize,
                unitSeconds, this.settings.seed, bar, this.meter, groove);
            if (phrased) {
                const performance = planPerformance(this.settings.seed, state.composition.phrase);
                state.composition.performance = performance;
                performPhrase([...events, ...hits], { plan: performance, bar, meter: this.meter, unitSeconds, humanize, groove });
            }
        } else {
            this.humanize(events, humanize, bpm, bar);
            (original ? loosenDrums : loosenDrumsLatest)(hits, humanize, 60 / unitsPerMinute(this.meter, bpm), this.settings.seed, bar, this.meter);
        }
        events.push(...hits);
        if(!original&&this.endingDevelopment!==false&&closing){const prepared=prepareEnding(events,this.meter);events.splice(0,events.length,...prepared);state.composition.ending={phase:'prepare',arrival:this.endBar};}
        applyBitonality(events,this.settings.tonality);
        // the long arc: this bar's place in the piece's running time (composition/arc.js)
        const elapsed = prev ? (prev.elapsed ?? 0) + rubatoTime(prev.rubato, 60 / unitsPerMinute(this.meter, prev.bpm), this.meter.units) : 0;
        const energy = arcEnergy(this.settings.arc, elapsed);
        applyArc(events, energy, { bar, seed: this.settings.seed });
        applyDynamics(events, this.settings.dynamics);
        ornamentNotes(events, { amount: this.settings.ornaments, bar, seed: this.settings.seed, voices: this.grooveVoices ?? this.grooveVoiceSnapshot(),
            scalePcs: chord.scalePcs ?? [], unitSeconds: 60 / unitsPerMinute(this.meter, bpm) });
        if (!original && this.noteExpression !== false) expressNotes(events, {
            voices: this.grooveVoices ?? this.grooveVoiceSnapshot(), secondsPerBeat: 60 / unitsPerMinute(this.meter, bpm), units: this.meter.units,
        });
        if (!original && this.heldExpression !== false) expressHeldNotes(events, {
            voices: this.grooveVoices ?? this.grooveVoiceSnapshot(), secondsPerBeat: 60 / unitsPerMinute(this.meter, bpm),
        });
        if (!original && this.noteConnection !== false) connectWindNotes(events, {
            voices: this.grooveVoices ?? this.grooveVoiceSnapshot(), secondsPerBeat: 60 / unitsPerMinute(this.meter, bpm),
            previous: prev?.events ?? [], units: this.meter.units,
        });
        if (!original && (this.gateEnvelopes === true || this.tempoEffects === true)) timeSoundNotes(events, {
            voices: this.grooveVoices ?? this.grooveVoiceSnapshot(), bpm,
            gateEnvelopes:this.gateEnvelopes === true, tempoEffects:this.tempoEffects === true,
        });
        if (!original && (this.noteSlides === true || this.padPitchMotion === true || this.bassPitchMotion === true || this.chordSlides === true)) slideNotes(events, {
            previous:prev?.events ?? [], bar, units:this.meter.units, secondsPerBeat:60/unitsPerMinute(this.meter,bpm),
            noteSlides:this.noteSlides === true,padMotion:this.padPitchMotion === true,bassMotion:this.bassPitchMotion === true,chordSlides:this.chordSlides === true,
        });
        expressDynamics(events, this.settings.dynamics);
        let tone = sectionTone(this.settings, state.phrase.section);
        if (!original && this.settings.sectionTone && state.phrase.section?.form) {
            // Log interpolation gives gradual brightness rather than a label-sized jump.
            const low = sections.mode === 'strong' ? 800 : 1200;
            tone = low * (OPEN_TONE / low) ** state.phrase.section.brightness;
        }
        const rubato = planRubato({ bar, state, meter: this.meter, endBar: this.endBar, amount: this.settings.rubato });
        tone = arcTone(tone, energy);
        const space = sectionSpaceLevel(state.phrase.section, this.settings.sectionSpace) + arcSpace(energy);
        const loudness = planLoudness(events, this.meter.units, this.plan.get(bar - 1)?.loudness?.average, this.settings.evenLoudness);
        this.plan.set(bar, { bar, chord, chordStart, state, events, music, upcoming, nextMusic: following, bpm, tone, boundaries, rubato, loudness, space, elapsed, energy, keyLift: liftPivot ? 2 : keyLift,
            ...(this.rulebookTrace?{ruleTrace:{slot,referenceBarsPerChord:barsPerChord}}:{}) });
    }

    // The final bar of an ending - the key's I, held: the pad voice-led from
    // the bar before, the bass on the root, the lead (if it was playing)
    // settling on the tonic, a soft kick under it - and silent bars after.
    planEnding(bar, prev, music, bpm) {
        const chord = this.endingChord(music,this.endBar,'I');
        const developed=this.settings.generation!=='legacy'&&this.endingDevelopment!==false;
        let state=prev.state;
        if(developed){
            const {melody,joint,sectionSuspension,sectionSuspensionArrival,...memory}=state.composition??{};
            state={...state,phrase:{...state.phrase,section:null},composition:{...memory,
                phrase:{...memory.phrase,start:this.endBar,bars:2,role:'ending'},ending:{phase:bar===this.endBar?(this.avoidTonic(music)?'unresolved':'tonic'):'tail',arrival:this.endBar}}};
        }
        const final = bar === this.endBar;
        const events = [];
        let { padVoicing } = state;
        if (final) {
            const units = this.meter.units;
            const hold = units * 2 * 0.95;
            const nearest = (notes, target) => notes.reduce((best, m) => (Math.abs(m - target) < Math.abs(best - target) ? m : best));
            const [root] = chord.pitchClasses;
            padVoicing = voiceLead(chord.pitchClasses, state.ranges.pad[0], state.ranges.pad[1], state.padVoicing);
            padVoicing.forEach((midi) => events.push({ role: 'pad', midi, beat: 0, length: hold, velocity: 0.55 }));
            events.push({ role: 'bass', midi: nearest(notesInRange([root], ...state.ranges.bass), state.bassMidi), beat: 0, length: hold, velocity: 0.7 });
            const tonics = notesInRange([root], ...state.ranges.lead);
            if (state.phrase.leadActive && tonics.length) {
                events.push({ role: 'lead', midi: nearest(tonics, state.leadMidi), beat: 0, length: units * 1.5, velocity: 0.55 });
            }
            if (this.settings.drums.style !== 'off') events.push({ role: 'perc', midi: this.settings.drums.style==='ambient'?5:0, beat: 0, length: this.settings.drums.style==='ambient'?1.5:.25, velocity: this.settings.drums.style==='ambient'?.2:.5 });
            events.forEach((e) => { e.detune = 0; });
        }
        if (this.settings.generation !== 'legacy' && this.tempoEffects === true) timeSoundNotes(events, {
            voices:this.grooveVoices ?? this.grooveVoiceSnapshot(), bpm, tempoEffects:true,
        });
        applyBitonality(events,this.settings.tonality);
        this.plan.set(bar, {
            bar, chord, chordStart: final, state: { ...state, padVoicing, ...(developed&&final?{leadMidi:events.find(e=>e.role==='lead')?.midi??state.leadMidi,bassMidi:events.find(e=>e.role==='bass')?.midi??state.bassMidi}:{}) }, events,
            ...(developed?{boundaries:planBoundaries(state,bar,this.endBar)}:{}),
            music, upcoming: prev.upcoming, nextMusic: music, bpm, tone: prev.tone, ending: true,
        });
    }

    // Normally distributed looseness, decided at plan time (so the timeline
    // shows it): timing in ms, velocity as a fraction, pitch in cents.
    // Timing may push a note up to half a unit *before* its bar; onBeat
    // books those from the previous bar. Bar 0 has no previous bar.
    humanize(events, { timing, velocity, detune }, bpm, bar) {
        const unitSeconds = 60 / unitsPerMinute(this.meter, bpm);
        const rng = this.settings.generation === 'legacy' ? this.rng : seeded(this.settings.seed ^ Math.imul(bar + 1, 0x3c6ef372));
        events.forEach((e) => {
            const shift = normal(rng, timing / 1000) / unitSeconds;
            e.beat = Math.max(bar === 0 ? 0 : -0.5, e.beat + shift);
            e.velocity = Math.max(0.05, Math.min(1, e.velocity * (1 + normal(rng, velocity))));
            e.detune = normal(rng, detune);
        });
    }

    /**
     * A copy that only plans: the piece Play would start with these
     * settings, bar by bar via planBar (for rendering to a file).
     */
    planner({ heldPadGlides = this.heldPadGlides, heldBassGlides = this.heldBassGlides, padPitchMotion = this.padPitchMotion, bassPitchMotion = this.bassPitchMotion, noteSlides = this.noteSlides, chordSlides = this.chordSlides, tempoEffects = this.tempoEffects, gateEnvelopes = this.gateEnvelopes, noteConnection = this.noteConnection, heldExpression = this.heldExpression, noteExpression = this.noteExpression, ensembleCoordination = this.ensembleCoordination, formDevelopment = this.formDevelopment, phrasePerformance = this.phrasePerformance, themeDevelopment = this.themeDevelopment, phraseSearch = this.phraseSearch, longPhrases = this.longPhrases, phraseLength = this.phraseLength, noteResolution = this.noteResolution, contrastPhrases = this.contrastPhrases, duetInteraction = this.duetInteraction, rhythmDevelopment = this.rhythmDevelopment, rhythmGrammar = this.rhythmGrammar, partRhythmGrammar = this.partRhythmGrammar, instrumentGroove = this.instrumentGroove, jointCounterpoint = this.jointCounterpoint, sectionDevelopment = this.sectionDevelopment, sectionCadences = this.sectionCadences, sectionBridges = this.sectionBridges, harmonicRhythm = this.harmonicRhythm, transitionGestures = this.transitionGestures, leadTransitions = this.leadTransitions, leadPickups = this.leadPickups, sectionSuspensions = this.sectionSuspensions, formStrategies = this.formStrategies, sectionCurves = this.sectionCurves, harmonicDevelopment = this.harmonicDevelopment, formStrategy = this.formStrategy, endingDevelopment = this.endingDevelopment } = {}) {
        const copy = Object.create(Generator.prototype);
        copy.settings = JSON.parse(JSON.stringify(this.settings));
        // Comparison tooling can isolate the previous Latest arrangement.
        copy.ensembleCoordination = ensembleCoordination;
        copy.noteExpression = noteExpression;
        copy.heldExpression = heldExpression;
        copy.noteConnection = noteConnection;
        copy.tempoEffects = tempoEffects;
        copy.gateEnvelopes = gateEnvelopes;
        copy.heldPadGlides = heldPadGlides;
        copy.heldBassGlides = heldBassGlides;
        copy.padPitchMotion = padPitchMotion;
        copy.bassPitchMotion = bassPitchMotion;
        copy.noteSlides = noteSlides;
        copy.chordSlides = chordSlides;
        copy.rulebookTrace=this.rulebookTrace;
        copy.formDevelopment = formDevelopment;
        copy.phrasePerformance = phrasePerformance;
        copy.themeDevelopment = themeDevelopment;
        copy.phraseSearch = phraseSearch;
        copy.longPhrases = longPhrases;
        copy.phraseLength = phraseLength;
        copy.noteResolution = noteResolution;
        copy.contrastPhrases = contrastPhrases;
        copy.duetInteraction = duetInteraction;
        copy.rhythmDevelopment = rhythmDevelopment;
        copy.rhythmGrammar = rhythmGrammar;
        copy.partRhythmGrammar = partRhythmGrammar;
        copy.instrumentGroove = instrumentGroove;
        copy.jointCounterpoint = jointCounterpoint;
        copy.sectionDevelopment = sectionDevelopment;
        copy.sectionCadences = sectionCadences;
        copy.sectionBridges = sectionBridges;
        copy.harmonicRhythm = harmonicRhythm;
        copy.transitionGestures = transitionGestures;
        copy.leadTransitions = leadTransitions;
        copy.leadPickups = leadPickups;
        copy.sectionSuspensions = sectionSuspensions;
        copy.formStrategies=formStrategies;copy.sectionCurves=sectionCurves;copy.harmonicDevelopment=harmonicDevelopment;copy.formStrategy=formStrategy;copy.endingDevelopment=endingDevelopment;
        copy.grooveVoices = JSON.parse(JSON.stringify(this.grooveVoices ?? this.grooveVoiceSnapshot()));
        copy.quickIntro = this.quickIntro;
        copy.rng = seeded(copy.settings.seed);
        copy.plan = new Map();
        copy.currentBar = -1;
        copy.resetMusicAt = 0;
        copy.endBar = null;
        return copy;
    }

    grooveVoiceSnapshot() {
        return Object.fromEntries(['lead', 'counter', 'pad', 'bass'].map(role => {
            const voice = this.roles?.[role], preset = voice?.instrument.preset ?? {};
            return [role, { name: voice?.presetName ?? '', preset: { stringModel: preset.stringModel, gainAttack: preset.gainAttack, gainSustain:preset.gainSustain, vibratoDepth: preset.vibratoDepth } }];
        }));
    }

    // Plans every missing bar from `fromBar` through the look-ahead horizon
    // and forgets bars long past.
    ensurePlanned(fromBar) {
        const horizon = Math.max(this.currentBar, 0) + PLAN_AHEAD_BARS;
        let changed = false;
        for (let bar = Math.max(0, fromBar); bar <= horizon; bar++) {
            if (!this.plan.has(bar)) {
                this.planBar(bar);
                changed = true;
            }
        }
        [...this.plan.keys()].filter((bar) => bar < this.currentBar - HISTORY_BARS).forEach((bar) => this.plan.delete(bar));
        if (changed) this.planListeners.forEach((listener) => listener());
    }

    // Plans on from the last planned bar up to `last` (seeking ahead of the
    // usual horizon).
    planThrough(last) {
        for (let bar = Math.max(-1, ...this.plan.keys()) + 1; bar <= last; bar++) this.planBar(bar);
    }

    // --- stepping and looping -------------------------------------------

    /** The bar playing now, or where Play would start. */
    get hereBar() {
        return Math.floor(this.position() / this.beatsPerBar);
    }

    /** The first bar still kept (how far back is possible). */
    get earliestBar() {
        return Math.min(...this.plan.keys());
    }

    // The progression cycle a bar belongs to: { start, end } (end inclusive).
    cycleOf(bar) {
        this.planThrough(bar);
        const start = this.plan.get(bar).music.cycleStart;
        let end = bar;
        for (let b = bar + 1; b < bar + 64; b++) {
            this.planThrough(b);
            if (this.plan.get(b).music.cycleStart !== start) break;
            end = b;
        }
        return { start, end };
    }

    /**
     * Plays on from `bar` (bars already planned, or played, are kept as they
     * are). While playing, the jump is immediate; paused, Play starts there.
     * A loop moves along to the new place.
     */
    async seek(bar) {
        const target = Math.max(this.earliestBar, bar);
        const wasRunning = this.isRunning;
        if (wasRunning) this.stop();
        this.planThrough(target + 1);
        this.resumeBar = target;
        this.plan.forEach((planned) => {
            if (planned.bar >= target) planned.events.forEach((ev) => { ev.booked = false; });
        });
        this.beatLog = [];
        this.currentBar = target - 1;
        this.ensurePlanned(target);
        if (this.loop) this.setLoop(this.loop.mode, target);
        this.planListeners.forEach((listener) => listener());
        if (wasRunning) await this.start();
        else this.notifyRunning();
    }

    // The chord a bar belongs to: { start, end } (bars, end inclusive) - from
    // the bar where it starts to the bar before the next one does.
    chordOf(bar) {
        this.planThrough(bar + 1);
        let start = bar;
        while (start > 0 && this.plan.has(start - 1) && !this.plan.get(start).chordStart) start--;
        let end = bar;
        for (let b = bar + 1; b < bar + 64; b++) {
            this.planThrough(b);
            if (this.plan.get(b).chordStart) break;
            end = b;
        }
        return { start, end };
    }

    // A chord or a progression cycle around `bar`.
    spanOf(kind, bar) {
        return kind === 'chord' ? this.chordOf(bar) : this.cycleOf(bar);
    }

    /**
     * Steps by a chord or a progression ('chord' | 'progression').
     * Forward keeps the place within it: the second bar of a chord goes to
     * the second bar of the next (or its last, if it is shorter). Back
     * returns to the start of the one playing - and, from right at its
     * start (within a beat), to the start of the one before.
     */
    step(kind, direction) {
        const position = this.position();
        const here = Math.floor(position / this.beatsPerBar);
        const span = this.spanOf(kind, here);
        if (direction > 0) {
            const next = this.spanOf(kind, span.end + 1);
            return this.seek(Math.min(next.start + (here - span.start), next.end));
        }
        const intoSpan = position - span.start * this.beatsPerBar;
        if (intoSpan > 1 || span.start <= this.earliestBar) return this.seek(span.start);
        return this.seek(this.spanOf(kind, span.start - 1).start);
    }

    /**
     * Repeats the chord - or the progression cycle - playing now: 'chord',
     * 'progression' or 'off'. Each pass plays the same notes; after a
     * settings change the looped bars are planned again at the next pass.
     */
    setLoop(mode, at = this.isRunning ? Math.max(this.currentBar, 0) : this.hereBar) {
        if (mode === 'off') {
            this.loop = null;
        } else {
            const region = this.spanOf(mode, at);
            this.planThrough(region.end + 1);
            this.loop = { mode, from: region.start, to: region.end, dirty: false };
        }
        this.planListeners.forEach((listener) => listener());
    }

    // At the end of a loop pass: the looped bars play again (planned anew
    // first if settings changed), so their notes may be booked again.
    loopBack() {
        const { from, to } = this.loop;
        if(this.heldResetBar!==undefined)this.heldResetBar=from;
        if (this.loop.dirty) {
            for (let bar = from; bar <= to; bar++) this.plan.delete(bar);
            for (let bar = from; bar <= to; bar++) this.planBar(bar);
            this.loop.dirty = false;
            this.planListeners.forEach((listener) => listener());
        }
        for (let bar = from; bar <= to; bar++) this.plan.get(bar).events.forEach((ev) => { ev.booked = false; });
        this.transport.rebase((to + 1) * this.transport.beatsPerBar, from * this.meter.units, this.meter.units);
    }

    // Section tone: glides to a bar's cutoff over that bar (at once when
    // starting).
    applyTone(tone, time, barSeconds) {
        if (tone === this.toneNow) return;
        const glide = this.toneNow !== null;
        this.toneNow = tone;
        TONE_ROLES.forEach((role) => {
            for(const node of [this.roles[role].tone,this.roles[role].roomRoute?.tone].filter(Boolean)){
                const freq=node.frequency;freq.cancelScheduledValues(time);
                if(glide)freq.setTargetAtTime(tone,time,barSeconds/3);else freq.setValueAtTime(tone,time);
            }
        });
    }

    queueHeldGlideReset() {
        if(this.heldActiveRoles?.size&&this.isRunning)this.heldResetBar=this.currentBar+1;
    }

    heldGlideBookings(bar) {
        if(this.settings.generation==='legacy'||(!this.heldPadGlides&&!this.heldBassGlides))return new Map();
        const notes=[];let time=0;
        const through=Math.min(bar+4,this.loop?this.loop.to:Infinity,this.endBar===null?Infinity:this.endBar-1);
        for(let b=bar;b<=through;b++){
            const planned=this.plan.get(b);if(!planned)break;
            const unit=60/unitsPerMinute(this.meter,planned.bpm),at=beat=>time+rubatoTime(planned.rubato,unit,beat);
            for(const event of planned.events)if(!event.booked&&['pad','bass'].includes(event.role))notes.push({event,bar:b,role:event.role,midi:event.midi,time:at(event.beat),duration:at(event.beat+event.length)-at(event.beat),expression:event.expression,section:planned.state.phrase.section?.start,ending:planned.ending});
            time+=rubatoTime(planned.rubato,unit,this.meter.units);
        }
        return new Map(joinHeldNotes(notes,{pad:this.heldPadGlides===true,bass:this.heldBassGlides===true,voices:this.grooveVoiceSnapshot()}).filter(n=>n.heldMembers).map(n=>[n.event,n]));
    }

    // Books this beat's slice of the plan at exact audio times.
    onBeat({ bar, beatInBar, time, secondsPerBeat }) {
        // rubato: this beat's own length (the transport adds it after this call)
        const scale = this.plan.get(bar)?.rubato?.[beatInBar] ?? 1;
        if (scale !== this.transport.tempoScale) {
            this.transport.tempoScale = scale;
            secondsPerBeat = this.transport.secondsPerBeat;
        }
        this.beatLog.push({ bar, beatInBar, units: this.transport.beatsPerBar, time, secondsPerBeat });
        if (this.beatLog.length > 16) this.beatLog.shift();

        if (bar !== this.currentBar) {
            this.currentBar = bar;
            this.ensurePlanned(bar);
        }
        if (beatInBar === 0 && this.endBar !== null && bar >= this.endBar + ENDING_RING_BARS) {
            this.finishEnding();
            return;
        }
        if (this.pendingChange && beatInBar === this.transport.beatsPerBar - 1) {
            const next = this.plan.get(bar + 1);
            if (next && next.chordStart) this.runPendingChange();
        }
        if(beatInBar===0&&this.heldResetBar!==undefined&&bar>=this.heldResetBar){
            for(const role of this.heldActiveRoles??[])this.roles[role].instrument.silence(time);
            this.heldActiveRoles=new Set();delete this.heldResetBar;
        this.liveNotes?.clear();
        }
        if (beatInBar === 0 && this.pendingVoices && this.pendingVoices.length) this.flushPendingVoices(bar, secondsPerBeat);
        if (beatInBar === 0) this.applyTone(this.plan.get(bar).tone, time, secondsPerBeat * this.transport.beatsPerBar);
        if (beatInBar === 0) this.applyDrift(bar, secondsPerBeat * this.transport.beatsPerBar);
        if (beatInBar === 0) this.applySpace(this.plan.get(bar).space ?? 0, time, secondsPerBeat * this.transport.beatsPerBar);
        if (beatInBar === 0) this.levelTrim.gain.setTargetAtTime(this.plan.get(bar).loudness?.trim ?? 1, time, secondsPerBeat * this.transport.beatsPerBar * 0.3);
        let held=this.heldGlideBookings(bar);
        const rubato = this.plan.get(bar)?.rubato, unit = rubato && 60 / unitsPerMinute(this.meter, this.plan.get(bar).bpm);
        const seconds = (e) => (rubato ? rubatoTime(rubato, unit, e.beat + e.length) - rubatoTime(rubato, unit, e.beat) : e.length * secondsPerBeat);
        const book = (e, start) => {
            if(e.booked)return;
            const connected=held.get(e);
            if(connected?.heldMembers){
                for(const n of connected.heldMembers)n.event.booked=true;
                (this.heldActiveRoles??=new Set()).add(e.role);
            }
            e.booked = true;
            // For visuals (Backdrop): what was booked, and when it sounds (audio-clock seconds).
            this.noteLog.push({ boundaries:this.plan.get(bar)?.boundaries,role: e.role, midi: e.midi, velocity: e.velocity, time: Math.max(start, this.AC.currentTime), length: connected?.duration??seconds(e) });
            if (this.noteLog.length > 96) this.noteLog.shift();
            this.emitVisualNote({ type: 'on', ...this.noteLog[this.noteLog.length - 1] });
            if (this.settings.ducking > 0 && this.audible(e.role)) {
                const at = Math.max(start, this.AC.currentTime), length = connected?.duration ?? seconds(e);
                for (const [role, by] of Object.entries(DUCKED_BY)) if (by[e.role]) this.roles[role].ducker?.note(at, at + length, duckFloor(role, e.role, this.settings.ducking));
            }
            this.roles[e.role].instrument.scheduleNote(e.midi, Math.max(start, this.AC.currentTime), (connected?.duration??seconds(e)), e.velocity, e.detune, connected?.expression??e.expression);
        };
        const current = this.plan.get(bar).events;
        current
            .filter((e) => !e.booked && e.beat >= beatInBar && e.beat < beatInBar + 1)
            .forEach((e) => book(e, time + (e.beat - beatInBar) * secondsPerBeat));
        // Early (humanized) notes a re-plan created after their slot: now.
        if (beatInBar === 0) current.filter((e) => !e.booked && e.beat < 0).forEach((e) => book(e, time));

        // (the transport's bar length: the old one until a new time signature starts)
        if (beatInBar === this.transport.beatsPerBar - 1) {
            const looping = this.loop && bar === this.loop.to;
            if (looping) {this.loopBack();held=this.heldGlideBookings(this.loop.from);}
            const next = this.plan.get(looping ? this.loop.from : bar + 1);
            if (next) {
                // The next bar's tempo applies from the gap before its downbeat,
                // and its slightly-early notes are booked from here.
                this.transport.setBpm(unitsPerMinute(this.meter, next.bpm));
                const gap = 60 / (unitsPerMinute(this.meter, next.bpm) * this.transport.tempoScale);
                next.events
                    .filter((e) => !e.booked && e.beat < 0)
                    // A boundary reset must run before a replacement held voice attacks.
                    // Its early note is booked by the downbeat fallback a few ms later.
                    .filter(e=>!(this.heldActiveRoles?.has(e.role)&&(this.heldResetBar===next.bar||this.pendingVoices?.some(p=>p.role===e.role))))
                    .forEach((e) => book(e, time + gap * (1 + e.beat)));
            }
        }
    }
}

export default Generator;
