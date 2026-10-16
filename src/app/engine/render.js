// Renders the piece to a WAV file, faster than real time: the plan Play
// would start with (Generator.planner) booked onto fresh Instruments - the
// current sounds, edits included - and the ambient bed in an
// OfflineAudioContext, mixed as heard (volumes, mute / solo).
//
// Long files render in chunks, so memory stays at one chunk plus the
// finished 16-bit audio. Each chunk starts early by a pre-roll that covers
// every note still sounding at its start and the effects' tails, so it
// begins warmed up exactly where the previous one ended; the two overlap by
// a short cross-fade (modulation effects restart their phase per chunk).

import Instrument from './Instrument';
import DrumKit from './drumKit';
import { RoleWander, instrumentWander } from './wander';
import { OPEN_TONE, TONE_ROLES } from '../Generator';
import Ambience from './ambience';
import { unitsPerMinute } from '../meter';
import { noiseReady } from '../../nodes/noiseGenerator';
import { bitCrusherReady } from '../../nodes/bitcrusher';

const CHUNK_SECONDS = 60;
// The render pauses this often (seconds of audio) to report progress and
// to notice Cancel.
const PROGRESS_STEP = 1;
const MAX_PREROLL = 30;
const CROSSFADE = 0.25;
const END_FADE = 4;
// With an ending, the final chord starts this long (plus its two bars)
// before the file ends, and only its last moments are faded.
const ENDING_TAIL = 4;
const ENDING_FADE = 1.5;

const cancelled = () => new DOMException('Rendering cancelled', 'AbortError');

// Rejects when `signal` aborts (never, without one).
const whenAborted = (signal) => new Promise((resolve, reject) => {
    if (!signal) return;
    if (signal.aborted) reject(cancelled());
    signal.addEventListener('abort', () => reject(cancelled()), { once: true });
});

const until = async (condition, ms) => {
    const end = Date.now() + ms;
    while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
};

// Every audible note from bar 0 until `seconds`, in seconds, and the
// section tone's changes ({ time, tone, glide: seconds of the bar }).
function planNotes(gen, audible, seconds, ending) {
    const planner = gen.planner();
    const notes = [];
    const tones = [];
    let time = 0;
    for (let bar = 0; time < seconds; bar++) {
        // an ending: a V bar, then the final I's two bars and its tail fill the end
        if (ending && planner.endBar === null && bar > 0) {
            const barSeconds = (planner.meter.units * 60) / unitsPerMinute(planner.meter, planner.plan.get(bar - 1).bpm);
            if (time + 3 * barSeconds + ENDING_TAIL >= seconds) planner.endBar = bar + 1;
        }
        planner.planBar(bar);
        const planned = planner.plan.get(bar);
        planner.plan.delete(bar - 2);
        const unit = 60 / unitsPerMinute(planner.meter, planned.bpm);
        if (!tones.length || tones[tones.length - 1].tone !== planned.tone) tones.push({ time, tone: planned.tone, glide: planner.meter.units * unit });
        planned.events.forEach((e) => {
            if (audible[e.role]) {
                notes.push({ role: e.role, midi: e.midi, time: time + e.beat * unit, duration: e.length * unit, velocity: e.velocity, detune: e.detune });
            }
        });
        time += planner.meter.units * unit;
    }
    return { notes: notes.sort((a, b) => a.time - b.time), tones };
}

// The section tone's automation for a chunk starting at `from`: as in
// playback, the first cutoff is set, each change after it glides over a bar.
function automateTone(param, tones, from) {
    const past = tones.filter((t) => t.time <= from);
    let value = OPEN_TONE;
    past.forEach(({ time, tone, glide }, i) => {
        const until = i + 1 < past.length ? past[i + 1].time : from;
        value = i === 0 ? tone : value + (tone - value) * (1 - Math.exp((-3 * (until - time)) / glide));
    });
    param.setValueAtTime(value, 0);
    tones.filter((t) => t.time > from).forEach(({ time, tone, glide }) => param.setTargetAtTime(tone, time - from, glide / 3));
}

// Over 0.9 a soft knee instead of hard clipping.
const soft = (x) => {
    const a = Math.abs(x);
    return a <= 0.9 ? x : Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
};

function pcm16(left, right) {
    const out = new Int16Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
        out[2 * i] = Math.round(soft(left[i]) * 32767);
        out[2 * i + 1] = Math.round(soft(right[i]) * 32767);
    }
    return out;
}

function wavHeader(frames, sampleRate) {
    const view = new DataView(new ArrayBuffer(44));
    const text = (at, s) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
    const bytes = frames * 4;
    text(0, 'RIFF');
    view.setUint32(4, 36 + bytes, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 2, true); // stereo
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, bytes, true);
    return view.buffer;
}

/** Bytes of a WAV file of `seconds` (16-bit stereo). */
export const wavBytes = (seconds, sampleRate) => 44 + Math.round(seconds * sampleRate) * 4;

/**
 * @param {Generator} gen - its settings, sounds and mix are rendered
 * @param {number} seconds
 * @param {object} [options]
 * @param {boolean} [options.ending] - end on the home chord (V, then a held
 *   I) instead of fading out mid-phrase
 * @param {function} [options.onProgress] - called with 0..1
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Blob>} audio/wav
 */
export async function renderWav(gen, seconds, { ending = false, onProgress = () => {}, signal } = {}) {
    const sampleRate = gen.AC.sampleRate;
    const anySolo = Object.values(gen.roles).some((r) => r.solo);
    const audible = Object.fromEntries(Object.entries(gen.roles).map(([role, r]) => [role, (anySolo ? r.solo : !r.mute) && r.volume > 0]));
    const roles = Object.keys(gen.roles).filter((role) => audible[role]);
    const presets = Object.fromEntries(roles.filter((role) => role !== 'perc').map((role) => [role, gen.getRolePreset(role)]));
    const { notes, tones } = planNotes(gen, audible, seconds, ending);
    const ambience = { ...gen.settings.ambience };

    const parts = [];
    let frames = 0;
    let carry = null; // the previous chunk's cross-fade overlap
    let first = 0; // index of the first note not yet past
    let tail = 0; // longest release + effects tail of the sounds (from the first chunk)
    for (let start = 0; start < seconds; start += CHUNK_SECONDS) {
        if (signal && signal.aborted) throw cancelled();
        const end = Math.min(seconds, start + CHUNK_SECONDS);
        const last = end >= seconds;

        // the chunk's instruments: their tails decide the minimum pre-roll
        const length = (from) => Math.ceil((end - from + (last ? 0 : CROSSFADE)) * sampleRate);
        const build = (from) => {
            const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: length(from), sampleRate });
            const instruments = Object.fromEntries(roles.map((role) => {
                const inst = role === 'perc'
                    ? new DrumKit({ context: ctx })
                    : new Instrument({ polyphony: gen.getRolePolyphony(role), preset: presets[role], context: ctx });
                if (role === 'perc') inst.setKit(gen.settings.drumKit);
                inst.scheduleSleep = () => {}; // no wall-clock timers during the render
                const gain = ctx.createGain();
                gain.gain.value = gen.roles[role].volume;
                if (TONE_ROLES.includes(role)) {
                    const tone = ctx.createBiquadFilter();
                    tone.Q.value = 0.5;
                    automateTone(tone.frequency, tones, from);
                    inst.connect(tone);
                    tone.connect(gain);
                } else {
                    inst.connect(gain);
                }
                // slow pan / volume wander after the mixer, filter and pitch on the sound
                // (wander.js); the render starts `from` seconds into the piece
                const wander = new RoleWander(ctx, role, { offset: from, smooth: false });
                wander.apply(gen.settings.wander);
                if (inst.setWander) inst.setWander({ ...instrumentWander(gen.settings.wander, role, from), immediate: true });
                gain.connect(wander.input);
                wander.output.connect(ctx.destination);
                return [role, inst];
            }));
            return { ctx, instruments };
        };
        let preroll = 0;
        if (start > 0) {
            while (first < notes.length && notes[first].time + notes[first].duration + tail < start - MAX_PREROLL) first++;
            const sounding = notes.slice(first).filter((n) => n.time < start && n.time + n.duration + tail > start);
            preroll = Math.min(MAX_PREROLL, Math.max(tail, ...sounding.map((n) => start - n.time)));
        }
        const from = start - preroll;
        const { ctx, instruments } = build(from);

        await Promise.all([noiseReady(ctx), bitCrusherReady(ctx)]);
        await until(() => Object.values(instruments).every((inst) => inst.reverb.settled), 5000);
        if (start === 0) tail = Math.max(1, ...Object.values(instruments).map((inst) => inst.tailSeconds() + inst.preset.gainRelease));
        const to = end + (last ? 0 : CROSSFADE);
        for (let i = first; i < notes.length && notes[i].time < to; i++) {
            const n = notes[i];
            if (n.time >= from) instruments[n.role].scheduleNote(n.midi, n.time - from, n.duration, n.velocity, n.detune);
        }
        if (Object.values(ambience).some((level) => level > 0)) {
            const bed = new Ambience({ context: ctx, seed: 1 });
            bed.setShape(gen.settings.ambienceShape);
            bed.setLevels(ambience);
            await bed.prepare();
            const volume = ctx.createGain();
            volume.gain.value = gen.ambienceGain;
            volume.connect(ctx.destination);
            bed.connect(volume);
            bed.start(0, from);
        }

        // Progress as the render goes. On Cancel the context is left
        // suspended (and dropped) instead of resumed.
        const duration = ctx.length / sampleRate;
        for (let t = PROGRESS_STEP; t < duration - 0.01; t += PROGRESS_STEP) {
            ctx.suspend(t).then(() => {
                if (signal && signal.aborted) return;
                onProgress(Math.min(1, Math.max(0, from + t) / seconds));
                ctx.resume();
            });
        }
        const buffer = await Promise.race([ctx.startRendering(), whenAborted(signal)]);
        const skip = Math.round(preroll * sampleRate);
        const left = buffer.getChannelData(0).subarray(skip);
        const right = buffer.getChannelData(1).subarray(skip);
        if (carry) {
            const n = carry.left.length;
            for (let i = 0; i < n; i++) {
                const t = i / n;
                left[i] = left[i] * t + carry.left[i] * (1 - t);
                right[i] = right[i] * t + carry.right[i] * (1 - t);
            }
        }
        const keep = last ? left.length : left.length - Math.round(CROSSFADE * sampleRate);
        carry = last ? null : { left: left.slice(keep), right: right.slice(keep) };
        if (last) {
            // a gentle fade over the file's last seconds
            const fade = Math.min(keep, Math.round((ending ? ENDING_FADE : END_FADE) * sampleRate));
            for (let i = keep - fade; i < keep; i++) {
                const g = (keep - i) / fade;
                left[i] *= g * g;
                right[i] *= g * g;
            }
        }
        parts.push(pcm16(left.subarray(0, keep), right.subarray(0, keep)));
        frames += keep;
        onProgress(end / seconds);
    }
    return new Blob([wavHeader(frames, sampleRate), ...parts], { type: 'audio/wav' });
}
