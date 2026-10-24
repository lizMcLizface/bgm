// Browser side of tools/measurePreset.mjs: plays a reference timeline's notes through the app's own
// Instrument in an OfflineAudioContext and hands the mono result back as base64 float32.
import Instrument from '../src/app/engine/Instrument';
import { noiseReady } from '../src/nodes/noiseGenerator';
import { bitCrusherReady } from '../src/nodes/bitcrusher';

const DRY = { reverbAmount: 0, delayAmount: 0, pingPongAmount: 0, chorusAmount: 0, flangerAmount: 0, distortionAmount: 0 };

const ready = async (inst) => {
    const deadline = Date.now() + 7000;
    while (!inst.reverb.settled && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
};

/** events: [{pitch, velocity (MIDI 0-127), start, release}] in seconds. */
export async function renderTake(preset, events, seconds, sampleRate = 48000, { dry = true } = {}) {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * sampleRate), sampleRate });
    const inst = new Instrument({ polyphony: 4, preset: dry ? { ...preset, ...DRY } : preset, context: ctx });
    inst.scheduleSleep = () => {};
    const gain = ctx.createGain(); gain.gain.value = 1; gain.connect(ctx.destination); inst.connect(gain);
    await Promise.all([noiseReady(ctx), bitCrusherReady(ctx), ready(inst)]);
    for (const e of events) inst.scheduleNote(e.pitch, e.start, e.release - e.start, e.velocity / 127);
    const buffer = await ctx.startRendering();
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1), mono = new Float32Array(left.length);
    for (let i = 0; i < mono.length; i++) mono[i] = (left[i] + right[i]) / 2;
    const bytes = new Uint8Array(mono.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { sampleRate, base64: btoa(binary) };
}

/** The live key path (startNote / stopNote) in an offline render: pause at each key event, as a player would. */
export async function renderLive(preset, events, seconds, sampleRate = 48000, { dry = true } = {}) {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(seconds * sampleRate), sampleRate });
    const inst = new Instrument({ polyphony: 10, preset: dry ? { ...preset, ...DRY } : preset, context: ctx });
    inst.scheduleSleep = () => {};
    const gain = ctx.createGain(); gain.gain.value = 1; gain.connect(ctx.destination); inst.connect(gain);
    await Promise.all([noiseReady(ctx), bitCrusherReady(ctx), ready(inst)]);
    const quantum = 128 / sampleRate, snap = (t) => Math.max(quantum, Math.round(t / quantum) * quantum);
    const ids = new Map(), steps = [];
    for (const e of events) { steps.push({ t: snap(e.start), run: () => ids.set(e, inst.startNote(e.pitch, e.velocity / 127)) }, { t: snap(e.release), run: () => inst.stopNote(ids.get(e)) }); }
    steps.sort((a, b) => a.t - b.t);
    let last = -1;
    for (const step of steps) {
        const t = step.t <= last ? last + quantum : step.t; last = t;
        ctx.suspend(t).then(() => { step.run(); ctx.resume(); });
    }
    const buffer = await ctx.startRendering();
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1), mono = new Float32Array(left.length);
    for (let i = 0; i < mono.length; i++) mono[i] = (left[i] + right[i]) / 2;
    const bytes = new Uint8Array(mono.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { sampleRate, base64: btoa(binary) };
}
