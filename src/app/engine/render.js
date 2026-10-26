import {WasmRoomPool} from '../../synth-lab/roomPool';
import {PERFORMANCE} from '../../audio/performance';
import {createWasmRoomRoute} from './wasmRoomRoute';
import {joinHeldNotes} from '../composition/heldGlides';
// Renders the piece to a WAV file (or, as 16-bit PCM chunks, to anything else), faster than real time: the plan Play
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
import WasmDrumKit from './wasmDrumKit';
import { RoleWander, instrumentWander } from './wander';
import { OPEN_TONE, TONE_ROLES } from '../Generator';
import Ambience from './ambience';
import { WeatherBedOffline } from './weatherBedAudio';
import { WEATHER_SOURCES } from './weatherBedModel';
import { unitsPerMinute } from '../meter';
import { rubatoTime } from '../composition/rubato';
import { automateDuck, DUCKED_BY } from './ducking';
import { SPACE_RACK, SPACE_ROLE, spaceTail } from '../composition/sectionSpace';
import { timbreDrift } from '../composition/timbreDrift';
import { applyFeel } from '../composition/feel';
import { noiseReady } from '../../nodes/noiseGenerator';
import { bitCrusherReady } from '../../nodes/bitcrusher';
import { spaceReady } from '../../nodes/space';
import { busActive, createBusRack, busTail } from './bus';

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

async function renderOrAbort(ctx,signal){
    if(signal?.aborted)throw cancelled();let abort;
    const aborted=new Promise((_,reject)=>{abort=()=>reject(cancelled());signal?.addEventListener('abort',abort,{once:true});});
    try{return await Promise.race([ctx.startRendering(),aborted]);}
    finally{signal?.removeEventListener('abort',abort);}
}

const until = async (condition, ms) => {
    const end = Date.now() + ms;
    while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
};

// (With `bars`, each bar's chord, tempo, section and events too, for drawing the plan.)
// Every audible note from bar 0 until `seconds`, in seconds, and the
// section tone's changes ({ time, tone, glide: seconds of the bar }).
export function planNotes(gen, audible, seconds, ending, bars = null) {
    const planner = gen.planner();
    const notes = [];
    const tones = [];
    const levels = []; // the bars' loudness trims (composition/loudness.js)
    const spaces = []; // the section space's send (composition/sectionSpace.js)
    const barStarts = []; // when each bar starts (timbre drift is set per chunk from its middle bar)
    let time = 0;
    for (let bar = 0; time < seconds; bar++) {
        // an ending: a V bar, then the final I's two bars and its tail fill the end
        if (ending && planner.endBar === null && bar > 0) {
            const last = planner.plan.get(bar - 1), lastMeter = last.meter ?? planner.meter;
            const barSeconds = (lastMeter.units * 60) / unitsPerMinute(lastMeter, last.bpm);
            if (time + 3 * barSeconds + ENDING_TAIL >= seconds) planner.endBar = bar + 1;
        }
        planner.planBar(bar);
        const planned = planner.plan.get(bar);
        planner.plan.delete(bar - 2);
        const meter = planned.meter ?? planner.meter, unit = 60 / unitsPerMinute(meter, planned.bpm);
        if (!tones.length || tones[tones.length - 1].tone !== planned.tone) tones.push({ time, tone: planned.tone, glide: meter.units * unit });
        barStarts.push(time);
        const trim = planned.loudness?.trim ?? 1;
        if (levels.length ? levels[levels.length - 1].trim !== trim : trim !== 1) levels.push({ time, trim, glide: meter.units * unit * 0.9 });
        const space = planned.space ?? 0;
        if (spaces.length ? spaces[spaces.length - 1].trim !== space : space > 0) spaces.push({ time, trim: space, glide: meter.units * unit * 2.1 });
        if (bars) {
            const section = planned.state.phrase.section;
            bars.push({
                bar,
                start: time,
                seconds: rubatoTime(planned.rubato, unit, meter.units),
                units: meter.units,
                chord: { name: planned.chord.name, numeral: planned.chord.numeral, keyName: planned.chord.keyName },
                chordStart: Boolean(planned.chordStart),
                bpm: planned.bpm,
                section: section ? { type: section.type, start: section.start, bars:section.bars } : null,
                boundaries:planned.boundaries,
                events: planned.events.map((e) => ({ role: e.role, midi: e.midi, beat: e.beat, length: e.length })),
            });
        }
        planned.events.forEach((e) => {
            if (audible[e.role]) {
                const at = (beat) => time + rubatoTime(planned.rubato, unit, beat);
                notes.push({ bar,section:planned.state.phrase.section?.start,ending:planned.ending,role: e.role, midi: e.midi, time: at(e.beat), duration: at(e.beat + e.length) - at(e.beat), velocity: e.velocity, detune: e.detune, expression: e.expression });
            }
        });
        time += rubatoTime(planned.rubato, unit, meter.units);
    }
    return { notes: joinHeldNotes(notes,{pad:gen.heldPadGlides===true,bass:gen.heldBassGlides===true,voices:Object.fromEntries(Object.keys(gen.roles).map(role=>[role,gen.roles[role].instrument?.preset])),legacy:gen.settings.generation==='legacy'}).sort((a,b)=>a.time-b.time), tones, levels, spaces, barStarts };
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

// The loudness trims for a chunk starting at `from`, glided as in playback (a third of a bar).
function automateLevel(param, levels, from, initial = 1) {
    let value = initial, previous = null;
    for (const point of levels.filter((l) => l.time <= from)) {
        if (previous) value += (previous.trim - value) * (1 - Math.exp((-3 * (point.time - previous.time)) / previous.glide));
        previous = point;
    }
    if (previous) value += (previous.trim - value) * (1 - Math.exp((-3 * (from - previous.time)) / previous.glide));
    param.setValueAtTime(value, 0);
    levels.filter((l) => l.time > from).forEach(({ time, trim, glide }) => param.setTargetAtTime(trim, time - from, glide / 3));
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

/**
 * The plan the render plays, bar by bar, as plain data (every voice, muted
 * or not) - what the video of a render draws.
 * @returns {object[]} { bar, start, seconds, units, chord, chordStart, bpm, section, events } per bar
 */
export function planTimeline(gen, seconds, { ending = false } = {}) {
    const bars = [];
    planNotes(gen, Object.fromEntries(Object.keys(gen.roles).map((role) => [role, false])), seconds, ending, bars);
    return bars;
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
export async function renderWav(gen, seconds, options = {}) {
    const parts = [];
    const { frames, sampleRate } = await renderPcm(gen, seconds, { ...options, onChunk: (pcm) => { parts.push(pcm); } });
    return new Blob([wavHeader(frames, sampleRate), ...parts], { type: 'audio/wav' });
}

/**
 * The same render as PCM: `onChunk` gets each stretch (about a minute) of
 * interleaved 16-bit stereo samples in order - awaited, so a consumer
 * that streams it somewhere (an encoder) sets the pace and memory stays at one chunk.
 * Same options as renderWav, plus onChunk(Int16Array).
 * @returns {Promise<{ frames: number, sampleRate: number }>}
 */
export async function renderPcm(gen, seconds, { ending = false, onProgress = () => {}, signal, onChunk } = {}) {
    if(gen.audioEngineReady)await gen.audioEngineReady;
    if(gen.percussionReady)await gen.percussionReady;
    const audioEngine=Object.values(gen.roles).some(r=>r.instrument.preset?.wasmVoice)?'wasm':gen.audioEngine;
    const sampleRate = gen.AC.sampleRate;
    const anySolo = Object.values(gen.roles).some((r) => r.solo);
    // an ambience-only setup (playMusic off) renders just the bed
    const musicOn = gen.settings.playMusic !== false;
    const audible = Object.fromEntries(Object.entries(gen.roles).map(([role, r]) => [role, musicOn && (anySolo ? r.solo : !r.mute) && r.volume > 0]));
    const roles = Object.keys(gen.roles).filter((role) => audible[role]);
    const presets = Object.fromEntries(roles.filter((role) => role !== 'perc').map((role) => [role, gen.getRolePreset(role)]));
    const { notes, tones, levels, spaces, barStarts } = planNotes(gen, audible, seconds, ending);
    const ambience = Object.fromEntries(Object.entries(gen.settings.ambience).map(([id, value]) => [id, gen.settings.playAmbience ? value : 0]));

    let frames = 0;
    let carry = null; // the previous chunk's cross-fade overlap
    let first = 0; // index of the first note not yet past
    let tail = 0; // longest release + effects tail of the sounds (from the first chunk)
    const weather = WEATHER_SOURCES.some(id => ambience[id] > 0)
        ? new WeatherBedOffline(sampleRate, gen.settings.ambienceShape, ambience, 1) : null;
    const cancelWeather = () => weather?.dispose(); signal?.addEventListener('abort', cancelWeather, { once: true });
    try {
    for (let start = 0; start < seconds; start += CHUNK_SECONDS) {
        if (signal && signal.aborted) throw cancelled();
        const end = Math.min(seconds, start + CHUNK_SECONDS);
        const last = end >= seconds;

        // the chunk's instruments: their tails decide the minimum pre-roll
        const length = (from) => Math.ceil((end - from + (last ? 0 : CROSSFADE)) * sampleRate);
        const build = async (from) => {
            const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: length(from), sampleRate });
            const Wasm=audioEngine==='wasm'?(await import('./wasmInstrument')).default:null;
            // the music, through the bars' loudness trims
            const out=ctx.createGain();out.connect(ctx.destination);automateLevel(out.gain,levels,from);
            const instruments={},cleanup=[()=>out.disconnect()],roomPool=Wasm&&PERFORMANCE.sharedReverb?new WasmRoomPool(ctx,out):null;
            if(roomPool)cleanup.push(()=>roomPool.dispose());
            // the shared effects bus, as the generator builds it (engine/bus.js)
            const bus=busActive(gen.settings.bus)?await createBusRack(ctx,gen.settings.bus.rack,out):null;
            if(bus)cleanup.push(()=>bus.dispose());
            const space=spaces.length?await createBusRack(ctx,SPACE_RACK,out):null;
            if(space)cleanup.push(()=>space.dispose());
            try{for(const role of roles){
                const inst = role === 'perc' && gen.roles.perc.machine
                    ? await (await import('./classicsInstrument')).default.create({ context: ctx, preset: gen.roles.perc.instrument.preset, polyphony: 16 })
                    : role === 'perc'
                    ? new (gen.percussionEngine && gen.percussionEngine !== 'native' ? WasmDrumKit : DrumKit)({ context: ctx, model:gen.percussionEngine })
                    : presets[role]?.classics?await (await import('./classicsInstrument')).default.create({context:ctx,preset:presets[role],polyphony:gen.getRolePolyphony(role)})
                    : presets[role]?.diy?await (await import('./wasmInstrument')).default.create({polyphony:gen.getRolePolyphony(role),preset:presets[role],spec:(await import('./diySource')).diySpec(presets[role].diy,gen.getRolePolyphony(role)),context:ctx,roomPool,notes:notes.filter(n=>n.role===role&&n.time>=from&&n.time<end+(last?0:CROSSFADE)).map(n=>({...n,time:n.time-from}))})
                    : Wasm?await Wasm.create({polyphony:gen.getRolePolyphony(role),preset:presets[role],context:ctx,roomPool,dynamics:applyFeel(gen.settings).dynamics,notes:notes.filter(n=>n.role===role&&n.time>=from&&n.time<end+(last?0:CROSSFADE)).map(n=>({...n,time:n.time-from}))})
                    : new Instrument({ polyphony: gen.getRolePolyphony(role), preset: presets[role], context: ctx });
                instruments[role]=inst;cleanup.push(()=>inst.dispose());
                if (role === 'perc') {inst.setKit(gen.settings.drumKit);inst.setVoicePreset(gen.settings.drums.kit);if(inst.ready)await inst.ready;inst.reverb?.hear?.(); /* a room in the Wasm kernel must be built before the render starts */}
                inst.scheduleSleep = () => {}; // no wall-clock timers during the render
                if (gen.settings.timbreDrift > 0 && inst.setDrift) {
                    const middle = (from + end) / 2, bar = Math.max(0, barStarts.findLastIndex((t) => t <= middle));
                    const values = timbreDrift(presets[role], role, bar, gen.settings.timbreDrift, gen.settings.seed);
                    if (values) inst.setDrift(values, 0);
                }
                const gain = ctx.createGain();
                cleanup.push(()=>gain.disconnect());
                gain.gain.value = gen.roles[role].volume;
                if (TONE_ROLES.includes(role)) {
                    const tone = ctx.createBiquadFilter();
                    cleanup.push(()=>tone.disconnect());
                    tone.Q.value = 0.5;
                    automateTone(tone.frequency, tones, from);
                    inst.connect(tone);
                    tone.connect(gain);
                } else {
                    inst.connect(gain);
                }
                inst.tempoTailReserve = gen.tempoEffects === true && gen.settings.generation !== 'legacy';
                // slow pan / volume wander after the mixer, filter and pitch on the sound
                // (wander.js); the render starts `from` seconds into the piece
                const wander = new RoleWander(ctx, role, { offset: from, smooth: false });
                cleanup.push(()=>wander.dispose());
                wander.apply(gen.settings.wander);
                if (inst.setWander) inst.setWander({ ...instrumentWander(gen.settings.wander, role, from), immediate: true });
                if (gen.settings.ducking > 0 && DUCKED_BY[role]) {
                    const duck = ctx.createGain();
                    cleanup.push(() => duck.disconnect());
                    automateDuck(duck.gain, role, notes, gen.settings.ducking, from);
                    gain.connect(duck);
                    duck.connect(wander.input);
                } else gain.connect(wander.input);
                wander.output.connect(out);
                if(space){const send=ctx.createGain();automateLevel(send.gain,spaces.map(s=>({...s,trim:s.trim*(SPACE_ROLE[role]??1)})),from,0);wander.output.connect(send);send.connect(space.input);cleanup.push(()=>send.disconnect());}
                if(bus&&gen.settings.bus.sends[role]>0){const send=ctx.createGain();send.gain.value=gen.settings.bus.sends[role];wander.output.connect(send);send.connect(bus.input);cleanup.push(()=>send.disconnect());}
                if(roomPool&&role!=='perc'){
                    const route=createWasmRoomRoute(ctx,inst,{roleWander:wander,volume:gen.roles[role].volume,tone:TONE_ROLES.includes(role)});
                    if(route.tone)automateTone(route.tone.frequency,tones,from);cleanup.push(()=>route.dispose());
                }
            }
            return { ctx, instruments, cleanup };
            }catch(error){cleanup.reverse().forEach(f=>f());throw error;}
        };
        let preroll = 0;
        if (start > 0) {
            while (first < notes.length && notes[first].time + notes[first].duration + tail < start - MAX_PREROLL) first++;
            const sounding = notes.slice(first).filter((n) => n.time < start && n.time + n.duration + tail > start);
            preroll = Math.min(MAX_PREROLL, Math.max(tail, ...sounding.map((n) => start - n.time)));
        }
        const from = start - preroll;
        const { ctx, instruments, cleanup } = await build(from);
        try{
        if(signal?.aborted)throw cancelled();
        await Promise.all([noiseReady(ctx), bitCrusherReady(ctx), spaceReady(ctx)]);
        await until(() => Object.values(instruments).every((inst) => inst.reverb.settled), 5000);
        if (start === 0) tail = Math.max(1, busTail(gen.settings.bus), spaces.length ? spaceTail() : 0, ...Object.values(instruments).map((inst) => inst.tailSeconds() + inst.preset.gainRelease));
        const to = end + (last ? 0 : CROSSFADE);
        for (let i = first; i < notes.length && notes[i].time < to; i++) {
            const n = notes[i];
            if (n.time >= from&&!instruments[n.role].preScheduled) instruments[n.role].scheduleNote(n.midi, n.time - from, n.duration, n.velocity, n.detune, n.expression);
        }
        Object.values(instruments).forEach(inst => inst.prepareOffline?.());
        if (Object.values(ambience).some((level) => level > 0)) {
            const weatherBuffers = weather ? await weather.render(from, ctx.length) : null;
            const bed = new Ambience({ context: ctx, seed: 1, offset: from, weatherBuffers });
            cleanup.push(()=>bed.stop(ctx.currentTime,0));
            bed.setShape(gen.settings.ambienceShape);
            bed.setLevels(ambience);
            bed.setWander(gen.settings.ambienceWander);
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
        for (let t = PROGRESS_STEP; typeof ctx.suspend==='function' && typeof ctx.resume==='function' && t < duration - 0.01; t += PROGRESS_STEP) {
            ctx.suspend(t).then(() => {
                if (signal && signal.aborted) return;
                onProgress(Math.min(1, Math.max(0, from + t) / seconds));
                ctx.resume();
            });
        }
        const buffer = await renderOrAbort(ctx,signal);
        const failure=Object.values(instruments).find(inst=>inst.error)?.error;if(failure)throw failure;
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
        await onChunk(pcm16(left.subarray(0, keep), right.subarray(0, keep)));
        frames += keep;
        onProgress(end / seconds);
        }finally{cleanup.reverse().forEach(f=>f());}
    }
    return { frames, sampleRate };
    } finally { signal?.removeEventListener('abort', cancelWeather); weather?.dispose(); }
}
