import IowaPlayer from './iowaModel/player';

const DEFAULT_ROOM = .25;

/** The generator's instrument contract for a voice measured from recordings (preset.iowa, docs/IOWA_INSTRUMENTS.md), on the role's output like a classic synth. */
export default class IowaInstrument {
    static async create({ context, preset, polyphony = 8 }) {
        const instrument = new IowaInstrument(context, preset, polyphony);
        try {
            await instrument.player.ready;
            await instrument.player.load(preset.iowa);
            return instrument;
        } catch (error) { instrument.dispose(); throw error; }
    }
    constructor(context, preset, polyphony) {
        this.AC = context; this.preset = preset; this.polyphony = polyphony;
        this.output = context.createGain(); this.output.gain.value = preset.masterVolume ?? 1;
        this.player = new IowaPlayer(context).connect(this.output);
        this.player.setRoom(preset.reverbAmount ?? DEFAULT_ROOM);
        this.player.setVibrato(preset.vibrato ?? 1);
        this.reverb = { settled: true }; this.held = new Map(); this.lastUntil = 0;
        this.disposed=false;this.sourceInputs=0;
    }
    connect(node) { this.output.connect(node); }
    scheduleNote(midi, start, duration, velocity = .7, detune = 0, expression) {
        const until = start + duration * (expression?.gateScale ?? 1), tune = 2 ** ((detune + (this.preset.tune ?? 0) + 100 * (expression?.bend ?? 0)) / 1200);
        this.lastUntil = Math.max(this.lastUntil, until);
        // portamento and the other slides (composition/portamento.js); a struck note cannot bend, so its voice ignores this
        const from = expression?.slideFromMidi, cents = Number.isFinite(from) ? Math.max(-2400, Math.min(2400, 100 * (from - Math.round(midi)))) : 0;
        const slide = cents ? { cents, seconds: Math.max(.005, Math.min(expression.slideSeconds ?? .2, duration * .8)) } : undefined;
        return this.player.start(this.preset.iowa, Math.round(midi), velocity, { at: start, until, tune, slide })?.id ?? null;
    }
    startNote(midi, velocity = .7) {
        const handle = this.player.start(this.preset.iowa, Math.round(midi), velocity, { tune: 2 ** ((this.preset.tune ?? 0) / 1200) });
        if (!handle) return null;
        this.held.set(handle.id, handle);
        return handle.id;
    }
    stopNote(id) { this.player.stop(this.held.get(id)); this.held.delete(id); }
    /** The voice is the preset's whole sound, so only its level and room can change in place: the generator swaps the instrument for another voice. */
    set(key, value) {
        this.preset = { ...this.preset, [key]: value };
        if (key === 'masterVolume') this.output.gain.value = value;
        if (key === 'reverbAmount') this.player.setRoom(value);
        if (key === 'vibrato') this.player.setVibrato(value);
    }
    applyPreset(preset) {
        if (preset.iowa !== this.preset.iowa) return;
        this.preset = preset;
        this.output.gain.value = preset.masterVolume ?? 1;
        this.player.setRoom(preset.reverbAmount ?? DEFAULT_ROOM);
        this.player.setVibrato(preset.vibrato ?? 1);
    }
    morphTo(preset) { this.applyPreset(preset); }
    prepareOffline() { this.player.prepareOffline(); }
    silence() { this.held.clear(); this.lastUntil = 0; this.player.panic(); }
    stopAll() { this.silence(); }
    flushTails() { this.silence(); }
    setKit() {}
    setVoicePreset() {}
    futureBookings() { return []; }
    tailSeconds() { return 4; }
    awakeVoices() { return this.AC.currentTime < this.lastUntil + this.tailSeconds() ? 1 : 0; }
    effectsAwake() { return this.sourceInputs>0||this.awakeVoices() > 0; }
    holdSourceInput(){if(this.disposed)throw Error('Disposed Iowa instrument');this.sourceInputs++;let released=false;return()=>{if(released)return;released=true;this.sourceInputs=Math.max(0,this.sourceInputs-1);};}
    activeEffects() { return ['Measured voice', 'Room']; }
    dispose() { if(this.disposed)return;this.disposed=true;this.sourceInputs=0;this.player.dispose(); this.output.disconnect(); }
}
