// How loud a preset plays in a role, measured by rendering a short
// role-typical phrase through a real Instrument offline. Used to bring
// generated sounds (soundGen.js) to the level of the role's default preset;
// the built-in presets were levelled the same way.

import Instrument from './Instrument';
import { findPreset } from '../editor/presetStore';
import { ROLE_PRESETS } from '../presets';

const SR = 48000;
const SECONDS = 3.5;

// [midi, start, duration] per role: a held chord, a bass line, a melody.
const PHRASES = {
    pad: [[57, 0.05, 2.5], [60, 0.05, 2.5], [64, 0.05, 2.5]],
    bass: [[36, 0.05, 0.6], [43, 0.7, 0.6], [41, 1.4, 0.6], [38, 2.1, 0.6]],
    lead: [[72, 0.05, 0.5], [76, 0.6, 0.5], [74, 1.15, 0.5], [79, 1.7, 0.9]],
    counter: [[67, 0.05, 0.5], [71, 0.6, 0.5], [69, 1.15, 0.5], [74, 1.7, 0.9]],
};

const until = async (condition, ms) => {
    const end = Date.now() + ms;
    while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
};

/** RMS level in dB of `preset` playing `role`'s phrase. */
export async function measureLoudness(preset, role) {
    if(preset.classics){
        const [{loadKernel},{createOfflineSynth},{SYNTHS},{builtinWaves}]=await Promise.all([import('../../synths/engine/liveSynth'),import('../../synths/engine/offline'),import('../../synths/models'),import('../../synths/vs/waves')]);
        const spec=preset.classics,synth=SYNTHS[spec.synth],engine=createOfflineSynth(await loadKernel(),{sampleRate:SR,model:synth.model,params:synth.params.toPairs(spec.values),waves:synth.id==='vs'?builtinWaves():null});
        const events=PHRASES[role].flatMap(([midi,start,duration],id)=>[[Math.round(start*SR),true,id+1,midi],[Math.round((start+duration)*SR),false,id+1,midi]]).sort((a,b)=>a[0]-b[0]);
        let frame=0,sum=0;
        for(const [at,on,id,midi]of [...events,[SR*SECONDS,false,0,0]]){
            const channels=engine.render(at-frame);for(const channel of channels)for(const x of channel)sum+=x*x;
            if(on)engine.k.syn_note_on(id,midi,.8);else engine.k.syn_note_off(id);frame=at;
        }
        return 10*Math.log10(sum/(SR*SECONDS*2)+1e-12)+20*Math.log10(preset.masterVolume??1);
    }
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: SR * SECONDS, sampleRate: SR });
    if (preset.diy) {
        // a DIY patch at level 1, its notes scheduled into the offline voice
        const [Wasm, { diySpec }] = await Promise.all([import('./wasmInstrument').then((m) => m.default), import('./diySource')]);
        const notes = PHRASES[role].map(([midi, time, duration]) => ({ role, midi, time, duration, velocity: 0.8, detune: 0 }));
        const inst = await Wasm.create({ context: ctx, preset, polyphony: 8, spec: diySpec({ ...preset.diy, level: 1 }, 8), notes });
        inst.connect(ctx.destination);
        const buffer = await ctx.startRendering();
        inst.dispose();
        let sum = 0;
        for (let c = 0; c < buffer.numberOfChannels; c++) buffer.getChannelData(c).forEach((x) => { sum += x * x; });
        return 10 * Math.log10(sum / (buffer.length * buffer.numberOfChannels) + 1e-12);
    }
    const inst = new Instrument({ polyphony: 8, preset, context: ctx });
    inst.scheduleSleep = () => {}; // no wall-clock timers during the render
    inst.connect(ctx.destination);
    // impulse responses (and noise worklets) load asynchronously
    await until(() => inst.reverb.settled, 3000);
    PHRASES[role].forEach(([midi, start, duration]) => inst.scheduleNote(midi, start, duration, 0.8));
    const buffer = await ctx.startRendering();
    let sum = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) buffer.getChannelData(c).forEach((x) => { sum += x * x; });
    return 10 * Math.log10(sum / (buffer.length * buffer.numberOfChannels) + 1e-12);
}

const references = new Map();
/** The loudness of the role's default preset (measured once). */
export function referenceLoudness(role) {
    if (!references.has(role)) references.set(role, measureLoudness(findPreset(ROLE_PRESETS[role]), role));
    return references.get(role);
}

/** `preset` with masterVolume set so it plays as loud as the role's default. */
export async function levelPreset(preset, role) {
    const [target, measured] = await Promise.all([referenceLoudness(role), measureLoudness(preset, role)]);
    const volume = (preset.masterVolume ?? 0.75) * Math.pow(10, (target - measured) / 20);
    return { ...preset, masterVolume: Math.round(Math.min(1, Math.max(0.05, volume)) * 100) / 100 };
}
