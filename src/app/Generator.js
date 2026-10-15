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
import Ambience from './engine/ambience';
import Transport from './engine/transport';
import { scaleById, scaleSemitones, spellScale, romanDegree, diatonicChord, chordSymbol, displayNumeral, noteAtOrAbove } from './theory';
import { arrangeBar } from './arranger';
import { nextMusic, glideTempo, scaleDistance } from './conductor';
import { METERS, unitsPerMinute } from './meter';
import { normal, seeded } from './random';
import { defaultSettings } from './settings';
import { findPreset } from './editor/presetStore';
import { ROLE_PRESETS } from './presets';
import PROGRESSIONS, { progressionsOfLength } from './progressions';

// Stop fades everything out - reverb and echo tails included - with this
// time constant (-60 dB after ~0.5 s), then drops the tails (STOP_FADE_MS).
const STOP_FADE = 0.07;
const STOP_FADE_MS = 500;

// Bars decided ahead of the playhead, and bars kept behind it for display.
export const PLAN_AHEAD_BARS = 8;
const PLAN_KEEP_BARS = 4;

// Settings that define "home"; changing one resets drift to it.
const HOME_KEYS = new Set(['tonic', 'mode', 'progression', 'bpm', 'barsPerChord']);
// Settings that don't change what is planned.
const SOUND_KEYS = new Set(['ambience', 'ambienceVolume', 'playMusic', 'playAmbience']);

// Ambience volume slider (0..1) to gain: 0.8, the default, is unity.
const ambienceGain = (volume) => Math.pow(volume / 0.8, 2);

// In display order.
export const ROLES = {
    lead: { label: 'Lead', polyphony: 2, preset: ROLE_PRESETS.lead, volume: 0.7 },
    counter: { label: 'Second lead', polyphony: 2, preset: ROLE_PRESETS.counter, volume: 0.6 },
    pad: { label: 'Rhythm / pad', polyphony: 8, preset: ROLE_PRESETS.pad, volume: 0.8 },
    bass: { label: 'Bass / support', polyphony: 2, preset: ROLE_PRESETS.bass, volume: 0.8 },
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
        Object.entries(ROLES).forEach(([role, { polyphony, preset, volume }]) => {
            const instrument = new Instrument({ polyphony, preset: findPreset(preset) });
            const gain = this.AC.createGain();
            gain.gain.value = volume;
            instrument.connect(gain);
            gain.connect(this.output);
            this.roles[role] = { instrument, gain, presetName: preset, edited: false, volume, mute: false, solo: false };
        });

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
        this.ambience.setLevels(this.settings.ambience);

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
    // the preview of what Play will start with.
    reset() {
        this.rng = seeded(this.settings.seed);
        this.transport.beatsPerBar = this.meter.units;
        this.plan = new Map();
        this.beatLog = [];
        this.currentBar = -1;
        this.resetMusicAt = 0;
        this.ensurePlanned(0);
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
        this.transport.setBpm(unitsPerMinute(this.meter, this.plan.get(0).bpm));
        this.transport.start();
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
    }

    /**
     * Fades everything out over `seconds`, then stops (the sleep timer).
     * Stop in the meantime cancels the fade.
     */
    fadeOut(seconds) {
        if (!this.anyRunning) return;
        const now = this.AC.currentTime;
        if (this.isRunning) {
            const gain = this.output.gain;
            gain.cancelScheduledValues(now);
            gain.setValueAtTime(gain.value, now);
            // -60 dB at the end
            gain.setTargetAtTime(0, now, seconds / 7);
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
        const gain = this.output.gain;
        gain.cancelScheduledValues(this.AC.currentTime);
        gain.setValueAtTime(gain.value, this.AC.currentTime);
        gain.setTargetAtTime(1, this.AC.currentTime, 0.3);
        if (this.fadeAmbience) {
            this.fadeAmbience = false;
            this.ambience.start(this.AC.currentTime + 0.05);
        }
    }

    // Stops the music (the ambience plays on). With quickStop (the default), Stop doesn't wait for long reverbs and
    // echoes: the output fades out, then the effects' tails are dropped and
    // the output is restored (for auditions and live play). Without it the
    // voices fade and the tails ring out.
    stop() {
        this.transport.stop();
        const wasFading = Boolean(this.fadeTimer);
        clearTimeout(this.fadeTimer);
        this.fadeTimer = null;
        Object.values(this.roles).forEach(({ instrument }) => instrument.silence());
        if (!this.quickStop) {
            // a sleep fade cut short: back to full level for the tails
            if (wasFading) this.output.gain.setTargetAtTime(1, this.AC.currentTime, 0.05);
            this.reset();
            this.notifyRunning();
            return;
        }
        const gain = this.output.gain;
        gain.cancelScheduledValues(this.AC.currentTime);
        gain.setTargetAtTime(0, this.AC.currentTime, STOP_FADE);
        clearTimeout(this.stopFade);
        this.stopFade = setTimeout(() => this.endStopFade(), STOP_FADE_MS);
        this.reset();
        this.notifyRunning();
    }

    endStopFade() {
        if (!this.stopFade) return;
        clearTimeout(this.stopFade);
        this.stopFade = null;
        Object.values(this.roles).forEach(({ instrument }) => instrument.flushTails());
        this.output.gain.cancelScheduledValues(this.AC.currentTime);
        this.output.gain.setValueAtTime(1, this.AC.currentTime);
    }

    /**
     * Musical settings re-plan everything after the bar now playing. Home
     * settings also bring the music back to them from that bar.
     */
    set(key, value) {
        this.settings[key] = value;
        if (key === 'ambience') this.ambience.setLevels(value);
        if (key === 'ambienceVolume') this.setAmbienceVolume(value);
        if (SOUND_KEYS.has(key)) return;
        // Bar numbering and the timeline are per meter: start over in it.
        if (key === 'meter' && this.isRunning) {
            this.stop();
            this.start();
            return;
        }
        if (this.isRunning) {
            [...this.plan.keys()].filter((bar) => bar > this.currentBar).forEach((bar) => this.plan.delete(bar));
            if (HOME_KEYS.has(key)) this.resetMusicAt = this.currentBar + 1;
            this.ensurePlanned(this.currentBar + 1);
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
        if ('ambience' in patch) this.ambience.setLevels(this.settings.ambience);
        if ('ambienceVolume' in patch) this.setAmbienceVolume(this.settings.ambienceVolume);
        if (Object.keys(patch).every((key) => SOUND_KEYS.has(key))) return;
        if (this.isRunning && meterChanged) {
            this.stop();
            this.start();
        } else if (this.isRunning) {
            [...this.plan.keys()].filter((bar) => bar > this.currentBar).forEach((bar) => this.plan.delete(bar));
            if (Object.keys(patch).some((key) => HOME_KEYS.has(key))) this.resetMusicAt = this.currentBar + 1;
            this.ensurePlanned(this.currentBar + 1);
        } else {
            this.reset();
        }
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
    loadRolePreset(role, name, preset = findPreset(name)) {
        if (!preset) return false;
        const r = this.roles[role];
        r.instrument.applyPreset(preset);
        r.presetName = name;
        r.edited = false;
        return true;
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
        this.applyMix();
    }

    /** Mute / solo, as on a mixer: any solo silences every role not soloed. */
    setRoleMix(role, { mute, solo }) {
        const r = this.roles[role];
        if (mute !== undefined) r.mute = mute;
        if (solo !== undefined) r.solo = solo;
        this.applyMix();
    }

    // Generated notes keep being booked for silent roles, so unmuting is
    // instant and in time.
    applyMix() {
        const anySolo = Object.values(this.roles).some((r) => r.solo);
        Object.values(this.roles).forEach((r) => {
            const audible = anySolo ? r.solo : !r.mute;
            r.gain.gain.setTargetAtTime(audible ? r.volume : 0, this.AC.currentTime, 0.02);
        });
    }

    /** Plays a held note on a role (keyboard / MIDI); returns an id for liveNoteOff. */
    liveNoteOn(role, midi, velocity = 0.8) {
        if (this.AC.state !== 'running') this.AC.resume();
        this.endStopFade();
        return this.roles[role].instrument.startNote(midi, velocity);
    }

    liveNoteOff(role, id) {
        this.roles[role].instrument.stopNote(id);
    }

    /** @param {function} callback - called whenever planned bars change */
    onPlanChange(callback) {
        this.planListeners.add(callback);
        return () => this.planListeners.delete(callback);
    }

    /** Planned bars, ascending: { bar, chord, chordStart, events, music, bpm } */
    getPlan() {
        return [...this.plan.values()].sort((a, b) => a.bar - b.bar);
    }

    /**
     * Where the *audible* playhead is, in beats (fractional). Derived from
     * the audio clock minus output latency, against the times beats were
     * actually booked at, so it stays right across tempo changes.
     */
    position() {
        if (!this.isRunning || !this.beatLog.length) return 0;
        const now = this.AC.currentTime - (this.AC.outputLatency || this.AC.baseLatency || 0);
        let entry = this.beatLog[0];
        for (const e of this.beatLog) {
            if (e.time <= now) entry = e;
        }
        return Math.max(0, entry.beat + (now - entry.time) / entry.secondsPerBeat);
    }

    // A chord on a scale degree of `music`'s key, with display names.
    buildChord(music, numeral) {
        const { tonic, mode } = music;
        const scale = scaleSemitones(scaleById(mode).intervals);
        const names = spellScale(tonic, scale);
        const degree = romanDegree(numeral);
        const offsets = diatonicChord(scale, degree, this.settings.padNotes);
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
        const index = Math.floor((bar - music.cycleStart) / this.settings.barsPerChord) % numerals.length;
        return this.buildChord(music, numerals[index]);
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
        const { barsPerChord, leadActivity, padWeights, bassWeights, thinPadUnderLead, drift, humanize, voices, counter, sections } = this.settings;
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

        const chord = this.chordFor(bar, music, upcoming);
        // The next bar's chord; a new cycle's first chord is never a pivot.
        const nextChord = cycleEnd ? this.chordAt(bar + 1, following) : this.chordFor(bar + 1, music, upcoming);

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
            settings: { leadActivity, padWeights, bassWeights, thinPadUnderLead, voices, counter, sections },
            rng: this.rng,
        });
        this.humanize(events, humanize, bpm, bar);
        this.plan.set(bar, { bar, chord, chordStart, state, events, music, upcoming, nextMusic: following, bpm });
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
        [...this.plan.keys()].filter((bar) => bar < this.currentBar - PLAN_KEEP_BARS).forEach((bar) => this.plan.delete(bar));
        if (changed) this.planListeners.forEach((listener) => listener());
    }

    // Books this beat's slice of the plan at exact audio times.
    onBeat({ beat, bar, beatInBar, time, secondsPerBeat }) {
        this.beatLog.push({ beat, time, secondsPerBeat });
        if (this.beatLog.length > 16) this.beatLog.shift();

        if (bar !== this.currentBar) {
            this.currentBar = bar;
            this.ensurePlanned(bar);
        }
        const book = (e, start) => {
            e.booked = true;
            this.roles[e.role].instrument.scheduleNote(e.midi, Math.max(start, this.AC.currentTime), e.length * secondsPerBeat, e.velocity, e.detune);
        };
        const current = this.plan.get(bar).events;
        current
            .filter((e) => !e.booked && e.beat >= beatInBar && e.beat < beatInBar + 1)
            .forEach((e) => book(e, time + (e.beat - beatInBar) * secondsPerBeat));
        // Early (humanized) notes a re-plan created after their slot: now.
        if (beatInBar === 0) current.filter((e) => !e.booked && e.beat < 0).forEach((e) => book(e, time));

        if (beatInBar === this.beatsPerBar - 1) {
            const next = this.plan.get(bar + 1);
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
