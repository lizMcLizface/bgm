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
import Ambience from './engine/ambience';
import { PERFORMANCE } from '../audio/performance';
import { hubFor } from '../nodes/sharedReverb';
import Transport from './engine/transport';
import { RoleWander, instrumentWander } from './engine/wander';
import { scaleById, scaleSemitones, spellScale, romanDegree, diatonicChord, chordSymbol, displayNumeral, noteAtOrAbove, voiceLead } from './theory';
import { arrangeBar, notesInRange } from './arranger';
import { nextMusic, glideTempo, scaleDistance } from './conductor';
import { METERS, unitsPerMinute, swingEvents } from './meter';
import { drumBar, loosenDrums, auditionHits } from './percussion';
import { normal, seeded } from './random';
import { defaultSettings } from './settings';
import { findPreset } from './editor/presetStore';
import { ROLE_PRESETS, ROLE_VOLUMES } from './presets';
import PROGRESSIONS, { progressionsOfLength } from './progressions';

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
const HOME_KEYS = new Set(['tonic', 'mode', 'progression', 'bpm', 'barsPerChord']);
// Settings that don't change what is planned.
const SOUND_KEYS = new Set(['ambience', 'ambienceShape', 'ambienceVolume', 'playMusic', 'playAmbience', 'volumes', 'drumKit', 'muted', 'wander', 'ambienceWander']);

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

// In display order.
export const ROLES = {
    lead: { label: 'Lead', polyphony: 2, preset: ROLE_PRESETS.lead },
    counter: { label: 'Second lead', polyphony: 2, preset: ROLE_PRESETS.counter },
    pad: { label: 'Rhythm / pad', polyphony: 8, preset: ROLE_PRESETS.pad },
    bass: { label: 'Bass / support', polyphony: 2, preset: ROLE_PRESETS.bass },
};

class Generator {
    /** @param {object} [settings] - complete, valid settings (settings.js) */
    constructor(settings = defaultSettings()) {
        this.AC = audioContext;
        this.output = this.AC.createGain();
        this.output.connect(masterBus);

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
            const instrument = new Instrument({ polyphony, preset: findPreset(preset), deferReverb: role === 'counter', reverbHub: this.reverbHub });
            const gain = this.AC.createGain();
            gain.gain.value = volume;
            // section tone: open (and inaudible) unless settings.sectionTone
            const tone = this.AC.createBiquadFilter();
            tone.frequency.value = OPEN_TONE;
            tone.Q.value = 0.5;
            instrument.connect(tone);
            tone.connect(gain);
            const wander = new RoleWander(this.AC, role);
            gain.connect(wander.input);
            wander.output.connect(this.output);
            this.roles[role] = { instrument, gain, tone, wander, presetName: preset, edited: false, volume, mute: false, solo: false };
        });
        {
            const volume = (this.settings.volumes && this.settings.volumes.perc) ?? ROLE_VOLUMES.perc;
            const instrument = new DrumKit({ context: this.AC, reverbHub: this.reverbHub });
            const gain = this.AC.createGain();
            gain.gain.value = volume;
            instrument.connect(gain);
            const wander = new RoleWander(this.AC, 'perc');
            gain.connect(wander.input);
            wander.output.connect(this.output);
            instrument.setKit(this.settings.drumKit);
            this.roles.perc = { instrument, gain, wander, presetName: null, edited: false, volume, mute: false, solo: false, drums: true };
        }
        if (this.reverbHub) this.reverbHub.connect(this.output);
        // mutes are settings (they persist and travel in links); solo is not
        Object.entries(this.roles).forEach(([role, r]) => { r.mute = Boolean(this.settings.muted && this.settings.muted[role]); });
        this.applyMix();
        this.applyWander();
        this.toneNow = null;

        this.transport = new Transport({
            bpm: unitsPerMinute(this.meter, this.settings.bpm),
            beatsPerBar: this.meter.units,
        });
        this.transport.onBeat((event) => this.onBeat(event));
        this.planListeners = new Set();
        this.runningListeners = new Set();
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
        this.settings[key] = value;
        if (key === 'counter' || key === 'drums') this.warmRoles();
        if (key === 'ambience') this.ambience.setLevels(value);
        if (key === 'ambienceShape') this.ambience.setShape(value);
        if (key === 'ambienceWander') this.ambience.setWander(value);
        if (key === 'ambienceVolume') this.setAmbienceVolume(value);
        if (key === 'volumes') this.applyVolumes();
        if (key === 'drumKit') this.roles.perc.instrument.setKit(value);
        if (key === 'muted') this.applyMutes();
        if (key === 'wander') this.applyWander();
        if (SOUND_KEYS.has(key)) return;
        this.replan([key]);
    }

    // After a settings change: while playing or paused, everything after
    // the bar now playing (or from the resume point) is planned again -
    // from home, if a home setting changed - and the piece carries on. A
    // new time signature starts at that bar too. Otherwise (at the start)
    // the preview is planned afresh. Only rewind() goes back to the start.
    replan(keys, meterChanged = keys.includes('meter')) {
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
            if (keys.some((key) => HOME_KEYS.has(key))) this.resetMusicAt = from;
            this.ensurePlanned(from);
        } else {
            this.reset();
        }
    }

    /**
     * Several settings at once with a single re-plan (loading shared
     * settings, "keep this"). A meter change restarts playback as in set().
     */
    setMany(patch) {
        const meterChanged = 'meter' in patch && patch.meter !== this.settings.meter;
        Object.assign(this.settings, patch);
        this.warmRoles();
        if ('ambienceShape' in patch) this.ambience.setShape(this.settings.ambienceShape);
        if ('ambience' in patch) this.ambience.setLevels(this.settings.ambience);
        if ('ambienceWander' in patch) this.ambience.setWander(this.settings.ambienceWander);
        if ('ambienceVolume' in patch) this.setAmbienceVolume(this.settings.ambienceVolume);
        if ('volumes' in patch) this.applyVolumes();
        if ('drumKit' in patch) this.roles.perc.instrument.setKit(this.settings.drumKit);
        if ('muted' in patch) this.applyMutes();
        if ('wander' in patch) this.applyWander();
        if (Object.keys(patch).every((key) => SOUND_KEYS.has(key))) return;
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

    homeMusic() {
        const { tonic, mode, progression, bpm } = this.settings;
        return { tonic, mode, progression, bpm };
    }

    /** Loads a preset onto a role; `preset` defaults to looking `name` up. */
    loadRolePreset(role, name, preset = findPreset(name), morphSeconds = 0) {
        if (!preset) return false;
        if (this.pendingVoices) this.pendingVoices = this.pendingVoices.filter((p) => p.role !== role || p.preset === preset);
        const r = this.roles[role];
        if (morphSeconds > 0) r.instrument.morphTo(preset, morphSeconds);
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

    /**
     * Plays the role's part of the chord under the playhead right now, so
     * edits can be heard while stopped (while playing they are heard live).
     */
    async audition(role) {
        if (this.AC.state !== 'running') await this.AC.resume();
        this.endStopFade();
        const bar = Math.floor(this.position() / this.beatsPerBar);
        const planned = this.plan.get(bar) || this.getPlan()[0];
        const { instrument } = this.roles[role];
        const time = this.AC.currentTime + 0.05;
        if (role === 'perc') {
            const beat = 60 / unitsPerMinute(this.meter, planned.bpm);
            auditionHits().forEach((e) => instrument.scheduleNote(e.midi, time + e.beat * beat, 0.1, e.velocity));
            return;
        }
        const notes = {
            bass: [noteAtOrAbove(planned.chord.pitchClasses[0], planned.state.ranges.bass[0] + 5)],
            pad: planned.state.padVoicing,
            lead: [planned.state.leadMidi],
            counter: [planned.state.counterMidi || 72],
        }[role];
        notes.forEach((midi) => instrument.scheduleNote(midi, time, 1.5, 0.7));
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
    applyMix() {
        const anySolo = Object.values(this.roles).some((r) => r.solo);
        Object.values(this.roles).forEach((r) => {
            const audible = anySolo ? r.solo : !r.mute;
            r.gain.gain.setTargetAtTime(audible ? r.volume : 0, this.AC.currentTime, 0.02);
            if (r.instrument.reverb && r.instrument.reverb.setLevel) r.instrument.reverb.setLevel(audible ? r.volume : 0);
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
            return null;
        }
        return this.roles[role].instrument.startNote(midi, velocity);
    }

    liveNoteOff(role, id) {
        if (role === 'perc') return;
        this.roles[role].instrument.stopNote(id);
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
        const degree = romanDegree(numeral);
        const minorHome = scale.length === 7 && scale[2] === 3;
        const majorHome = scale.length === 7 && scale[2] === 4;
        const borrowed = borrow && ((minorHome && [4, 5].includes(degree)) || (majorHome && [4, 6, 7].includes(degree)));
        const chordScale = borrowed ? scaleSemitones(scaleById(minorHome ? 'Major-1' : 'Major-6').intervals) : scale;
        const names = spellScale(tonic, chordScale);
        const offsets = diatonicChord(chordScale, degree, this.settings.padNotes, colour);
        return {
            numeral: displayNumeral(numeral, offsets),
            pitchClasses: offsets.map((o) => (tonic + o) % 12),
            scalePcs: scale.map((st) => (tonic + st) % 12),
            root: names[(degree - 1) % scale.length],
            name: names[(degree - 1) % scale.length] + chordSymbol(offsets),
            keyName: `${names[0]} ${scaleById(mode).name}`,
        };
    }

    // The chord at `bar` under `music` (progressions restart each cycle).
    chordAt(bar, music) {
        const numerals = PROGRESSIONS[music.progression];
        const slot = Math.floor((bar - music.cycleStart) / this.settings.barsPerChord);
        return this.buildChord(music, numerals[slot % numerals.length], this.colourFor(bar), this.borrowFor(bar));
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
        return { ...dominant, numeral: `${dominant.numeral}/${this.buildChord(to, 'I').root}`, keyName: this.buildChord(from, 'I').keyName };
    }

    // The chord at `bar`: the progression's, or - in the last chord slot of
    // a cycle that changes key, with pivots on - the new key's dominant.
    chordFor(bar, music, upcoming) {
        const { barsPerChord, drift } = this.settings;
        const cycleBars = PROGRESSIONS[music.progression].length * barsPerChord;
        const inLastSlot = bar - music.cycleStart >= cycleBars - barsPerChord;
        if (inLastSlot && drift.pivot && scaleDistance(music, upcoming) > 0) return this.pivotChord(music, upcoming);
        return this.chordAt(bar, music);
    }

    // Decides one bar. Event times/lengths are in beats from the bar start.
    planBar(bar) {
        const { barsPerChord, leadActivity, leadDensity, padWeights, bassWeights, pulseWeights, arpWeights, directionWeights, padMotion, thinPadUnderLead, drift, humanize, voices, counter, sections, drums, swing, chordSpread, pedal, leadScale, leadLeaps, leadRepeat, leadEnding } = this.settings;
        const prev = this.plan.get(bar - 1);

        const fresh = !prev || this.resetMusicAt === bar;
        const music = fresh ? { ...this.homeMusic(), cycleStart: bar } : prev.nextMusic;
        const bpm = fresh ? music.bpm : glideTempo(prev.bpm, music.bpm);

        const cycleBars = PROGRESSIONS[music.progression].length * barsPerChord;
        const inCycle = bar - music.cycleStart;
        // Next cycle's music: decided as this cycle starts, carried through it.
        const upcoming = inCycle === 0
            ? nextMusic(music, this.homeMusic(), drift, progressionsOfLength(PROGRESSIONS[this.settings.progression].length), this.rng)
            : prev.upcoming;
        const cycleEnd = inCycle === cycleBars - 1;
        const following = cycleEnd ? { ...upcoming, cycleStart: bar + 1 } : music;

        if (this.endBar !== null && bar >= this.endBar) {
            this.planEnding(bar, prev, music, bpm);
            return;
        }
        const closing = this.endBar !== null && bar === this.endBar - 1;
        const chord = closing ? this.buildChord(music, 'V') : this.chordFor(bar, music, upcoming);
        // The next bar's chord; a new cycle's first chord is never a pivot.
        const nextChord = closing ? this.buildChord(music, 'I')
            : cycleEnd ? this.chordAt(bar + 1, following) : this.chordFor(bar + 1, music, upcoming);

        // A chord (re)starts on its boundary, or wherever a re-plan changed it.
        const inChord = inCycle % barsPerChord;
        const chordStart = inChord === 0 || !prev || prev.chord.name !== chord.name;
        const barsLeftInChord = barsPerChord - inChord;

        const { events, state } = arrangeBar({
            bar,
            meter: this.meter,
            chord,
            nextChord,
            scalePcs: chord.scalePcs,
            chordStart,
            barsLeftInChord,
            prev: prev ? prev.state : null,
            settings: { leadActivity, leadDensity, padWeights, bassWeights, pulseWeights, arpWeights, directionWeights, padMotion, thinPadUnderLead, voices, counter, sections: this.quickIntro ? { ...sections, quickIntro: true } : sections, chordSpread, pedal, leadScale, leadLeaps, leadRepeat, leadEnding },
            rng: this.rng,
        });
        // Drums: patterns and looseness from streams of their own (the
        // arranger's rng is never touched, so the notes stay the same).
        const hits = drums && drums.style !== 'off'
            ? drumBar({ bar, meter: this.meter, drums, section: state.phrase.section, sectionsMode: sections.mode, sectionBars: sections.phrases * 4, phraseStart: state.phrase.start, seed: this.settings.seed })
            : [];
        swingEvents(events, this.meter, swing);
        swingEvents(hits, this.meter, swing);
        this.humanize(events, humanize, bpm, bar);
        loosenDrums(hits, humanize, 60 / unitsPerMinute(this.meter, bpm), this.settings.seed, bar);
        events.push(...hits);
        const tone = sectionTone(this.settings, state.phrase.section);
        this.plan.set(bar, { bar, chord, chordStart, state, events, music, upcoming, nextMusic: following, bpm, tone });
    }

    // The final bar of an ending - the key's I, held: the pad voice-led from
    // the bar before, the bass on the root, the lead (if it was playing)
    // settling on the tonic, a soft kick under it - and silent bars after.
    planEnding(bar, prev, music, bpm) {
        const chord = this.buildChord(music, 'I');
        const { state } = prev;
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
            if (this.settings.drums.style !== 'off') events.push({ role: 'perc', midi: 0, beat: 0, length: 0.25, velocity: 0.5 });
            events.forEach((e) => { e.detune = 0; });
        }
        this.plan.set(bar, {
            bar, chord, chordStart: final, state: { ...state, padVoicing }, events,
            music, upcoming: prev.upcoming, nextMusic: music, bpm, tone: prev.tone, ending: true,
        });
    }

    // Normally distributed looseness, decided at plan time (so the timeline
    // shows it): timing in ms, velocity as a fraction, pitch in cents.
    // Timing may push a note up to half a unit *before* its bar; onBeat
    // books those from the previous bar. Bar 0 has no previous bar.
    humanize(events, { timing, velocity, detune }, bpm, bar) {
        const unitSeconds = 60 / unitsPerMinute(this.meter, bpm);
        events.forEach((e) => {
            const shift = normal(this.rng, timing / 1000) / unitSeconds;
            e.beat = Math.max(bar === 0 ? 0 : -0.5, e.beat + shift);
            e.velocity = Math.max(0.05, Math.min(1, e.velocity * (1 + normal(this.rng, velocity))));
            e.detune = normal(this.rng, detune);
        });
    }

    /**
     * A copy that only plans: the piece Play would start with these
     * settings, bar by bar via planBar (for rendering to a file).
     */
    planner() {
        const copy = Object.create(Generator.prototype);
        copy.settings = JSON.parse(JSON.stringify(this.settings));
        copy.rng = seeded(copy.settings.seed);
        copy.plan = new Map();
        copy.currentBar = -1;
        copy.resetMusicAt = 0;
        copy.endBar = null;
        return copy;
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
            const freq = this.roles[role].tone.frequency;
            freq.cancelScheduledValues(time);
            if (glide) freq.setTargetAtTime(tone, time, barSeconds / 3);
            else freq.setValueAtTime(tone, time);
        });
    }

    // Books this beat's slice of the plan at exact audio times.
    onBeat({ bar, beatInBar, time, secondsPerBeat }) {
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
        if (beatInBar === 0 && this.pendingVoices && this.pendingVoices.length) this.flushPendingVoices(bar, secondsPerBeat);
        if (beatInBar === 0) this.applyTone(this.plan.get(bar).tone, time, secondsPerBeat * this.transport.beatsPerBar);
        const book = (e, start) => {
            e.booked = true;
            // For visuals (Backdrop): what was booked, and when it sounds (audio-clock seconds).
            this.noteLog.push({ role: e.role, midi: e.midi, velocity: e.velocity, time: Math.max(start, this.AC.currentTime), length: e.length * secondsPerBeat });
            if (this.noteLog.length > 96) this.noteLog.shift();
            this.roles[e.role].instrument.scheduleNote(e.midi, Math.max(start, this.AC.currentTime), e.length * secondsPerBeat, e.velocity, e.detune);
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
            if (looping) this.loopBack();
            const next = this.plan.get(looping ? this.loop.from : bar + 1);
            if (next) {
                // The next bar's tempo applies from the gap before its downbeat,
                // and its slightly-early notes are booked from here.
                this.transport.setBpm(unitsPerMinute(this.meter, next.bpm));
                const gap = 60 / unitsPerMinute(this.meter, next.bpm);
                next.events
                    .filter((e) => !e.booked && e.beat < 0)
                    .forEach((e) => book(e, time + gap * (1 + e.beat)));
            }
        }
    }
}

export default Generator;
