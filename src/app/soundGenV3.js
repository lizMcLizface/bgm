import {generatedColourPlan} from './engine/generatedColour';
// Context is frozen with the sound, rather than inferred again on a link reload.
import { seeded, weighted } from './random';
import { generateSoundV2, generateEnsembleSoundV2, soundFrom as previousSoundFrom, SOUND_KINDS } from './soundGenV2';
import { METERS, unitsPerMinute } from './meter';

export const GENERATOR_V3 = 3;
// Share-code order: append only.
export const SOUND_PROFILES = ['neutral', 'folk', 'keys', 'chip', 'analogue', 'cinematic', 'ambient', 'organ'];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo));
const defaults = { pad: 64, bass: 40, lead: 77, counter: 70 };
const weights = {
    neutral: { pad: { pad: 3, keys: 2, texture: 1 }, bass: { bass: 2, pluck: 1 }, lead: { lead: 2, pluck: 1, bell: 1 } },
    folk: { pad: { keys: 4, pad: 1 }, bass: { pluck: 1 }, lead: { lead: 2, pluck: 3 } },
    keys: { pad: { keys: 1 }, bass: { bass: 2, pluck: 1 }, lead: { pluck: 3, bell: 1 } },
    chip: { pad: { keys: 1 }, bass: { bass: 1 }, lead: { lead: 3, pluck: 1 } },
    analogue: { pad: { pad: 3, keys: 1 }, bass: { bass: 1 }, lead: { lead: 3, pluck: 1 } },
    cinematic: { pad: { pad: 1 }, bass: { bass: 1 }, lead: { lead: 1 } },
    ambient: { pad: { texture: 3, pad: 1 }, bass: { bass: 1 }, lead: { bell: 2, lead: 1 } },
    organ: { pad: { keys: 1 }, bass: { bass: 1 }, lead: { lead: 1 } },
};

export function soundProfile(scene) {
    const classify = value => {
        const text = String(value || '').toLowerCase();
        if (/organ|chapel/.test(text)) return 'organ';
        if (/chip|pixel|8.bit|console/.test(text)) return 'chip';
        if (/folk|guitar|harp|flute|ocarina|turnip|forest|kalimba/.test(text)) return 'folk';
        if (/rhodes|piano|tine|café|cafe|brushes|lo.fi|lofi/.test(text)) return 'keys';
        if (/analogue|analog|neon|outrun|sequence|oxygen|starship/.test(text)) return 'analogue';
        if (/brass|cinema|heroic|fanfare|strings|replicant|lament|boss|film/.test(text)) return 'cinematic';
        if (/ambient|texture|deep|night|haze|void|underwater/.test(text)) return 'ambient';
        return null;
    };
    const title = classify([scene?.name, ...(scene?.tags || [])].join(' '));
    if (title) return title;
    for (const role of ['pad', 'lead', 'bass']) {
        const voice = scene?.voices?.[role];
        const profile = classify(typeof voice === 'string' ? voice : voice?.name);
        if (profile) return profile;
    }
    return classify(scene?.category) || 'neutral';
}

export function normalizeSoundContext(info = {}) {
    return { profile: SOUND_PROFILES.includes(info.profile) ? info.profile : 'neutral',
        bpm: Math.round(clamp(Number(info.bpm ?? 90), 30, 300)),
        gate: Math.round(clamp(Number(info.gate ?? .6), .05, 12.75) * 20) / 20,
        register: Math.round(clamp(Number(info.register ?? defaults[info.role] ?? 72), 0, 127)) };
}

export function soundContext(settings, scene, role) {
    const meter = METERS[settings.meter] || METERS['4/4'];
    const unit = 60 / unitsPerMinute(meter, settings.bpm), beat = unit * meter.unitsPerBeat;
    const average = (mix, lengths, fallback) => {
        const entries = Object.entries(mix || {}).filter(([key]) => lengths[key] !== undefined), total = entries.reduce((sum, [, w]) => sum + w, 0);
        return total > 0 ? entries.reduce((sum, [key, w]) => sum + w * lengths[key], 0) / total : fallback;
    };
    const gate = role === 'pad' ? average(settings.padWeights, { sustain: meter.units * unit * .9, pulse: beat * .65, arpeggio: beat * .4, sequence: beat * .4, rolled: beat * 1.5, stacked: beat * 1.5 }, beat)
        : role === 'bass' ? average(settings.bassWeights, { whole: meter.units * unit * .9, half: meter.units * unit * .4, walking: beat * .8, drive: beat * .4 }, beat)
            : beat * (1 - .65 * (settings.leadDensity ?? 0));
    return normalizeSoundContext({ role, profile: soundProfile(scene), bpm: settings.bpm, gate,
        register: defaults[role] + (settings.voices?.[role]?.octave ?? 0) * 12 });
}

function kindFor(info) {
    if (SOUND_KINDS[info.role]?.[info.kind]) return info.kind;
    const profile = normalizeSoundContext(info).profile;
    return weighted(seeded((info.ensemble ?? info.seed) ^ Math.imul(Object.keys(defaults).indexOf(info.role) + 1, 0x9e3779b9)), weights[profile][info.role === 'counter' ? 'lead' : info.role]);
}

/** v1/v2 remain frozen. A v3 Original render uses the unmodified v2 recipe. */
export function soundFrom(info, generation = 'latest', {voiceColour=true,stringResonance=true,pianoResonance=true} = {}) {
    if (info.version !== GENERATOR_V3) return previousSoundFrom(info);
    const context = normalizeSoundContext(info), role = info.role;
    const ownSeed = info.ensemble === undefined ? info.seed : (Math.imul(info.ensemble ^ 0x85ebca6b, 2246822507) + (Object.keys(defaults).indexOf(role) + 1) * 0x27d4eb2f) >>> 8;
    const kind = kindFor(info);
    const base = info.ensemble !== undefined && generation === 'legacy' ? generateEnsembleSoundV2(role, info.ensemble) : generateSoundV2(role, ownSeed, kind);
    const p = { ...base.preset }, rng = seeded(ownSeed ^ 0x13198a2e), bass = role === 'bass', background = role === 'pad', counter = role === 'counter';
    if (generation !== 'legacy') {
        const { profile, gate, bpm, register } = context;
        if (profile === 'folk') {
            Object.assign(p, { vcoType: kind === 'lead' ? 'hollow' : 'triangle', osc2Type: 'sine', osc2Amount: kind === 'lead' ? .08 : .18,
                gainAttack: kind === 'lead' ? .025 : .003, gainSustain: kind === 'lead' ? .72 : bass ? .12 : .05,
                filterType: 'lowpass', filterFreq: bass ? 850 : 3200, filterQ: .6, filterEnvAmount: kind === 'lead' ? 400 : 1800,
                filterDecay: .16, filterKeyTrack: .45, filterVelocity: bass ? 600 : 1400, fmIndex: 0, fmEnvAmount: 0, noiseMix: 0 });
        } else if (profile === 'keys') {
            Object.assign(p, { vcoType: 'sine', fmRatio: bass ? 1 : 2, fmIndex: bass ? .15 : .25,
                fmEnvAmount: bass ? 1 : 2.5 + rng() * 2, fmDecay: .35, gainAttack: .003,
                gainSustain: bass ? .32 : .08, gainDecay: bass ? .55 : 1.3, filterType: 'lowpass', filterFreq: bass ? 950 : 5000,
                filterQ: .5, filterKeyTrack: .5, filterVelocity: bass ? 500 : 2200, pitchEnvAmount: 0, noiseMix: 0 });
        } else if (profile === 'chip') {
            Object.assign(p, { vcoType: bass ? 'triangle' : 'square_dc', vcoDutyCycle: rng() < .5 ? .25 : .5,
                voiceCount: 1, osc2Amount: 0, gainAttack: .002, gainDecay: .12, gainSustain: kind === 'pluck' ? .12 : .65,
                gainRelease: .04, filterType: 'lowpass', filterFreq: bass ? 1300 : 8000, filterQ: .5,
                fmIndex: 0, fmEnvAmount: 0, noiseMix: 0, pitchEnvAmount: 0, vibratoDepth: 0 });
        } else if (profile === 'analogue' || profile === 'cinematic') {
            Object.assign(p, { vcoType: bass ? 'sawtooth' : profile === 'cinematic' ? 'sawtooth' : 'triangle',
                voiceCount: bass ? 1 : 2, detuneSpread: bass ? 0 : profile === 'cinematic' ? 7 : 4,
                gainAttack: bass ? .006 : background ? .3 : .035, gainSustain: bass ? .65 : .72,
                filterType: 'lowpass', filterFreq: bass ? 750 : background ? 2200 : 3600, filterQ: bass ? 1.2 : .7,
                filterEnvAmount: bass ? 1700 : profile === 'cinematic' ? 2400 : 1200, filterDecay: .28,
                filterKeyTrack: .35, filterVelocity: 1200, fmIndex: 0, fmEnvAmount: 0, noiseMix: 0, pitchEnvAmount: 0 });
        } else if (profile === 'ambient') {
            Object.assign(p, { vcoType: bass ? 'sine' : kind === 'bell' ? 'sine' : 'hollow', filterType: 'lowpass',
                filterFreq: bass ? 700 : 2400, filterQ: .6, gainAttack: kind === 'bell' ? .005 : background ? .8 : .08,
                gainSustain: kind === 'bell' ? .05 : .75, noiseMix: 0, filterLfoDepth: background ? 350 : 0,
                fmRatio: kind === 'bell' ? 2 : 1, fmIndex: kind === 'bell' ? .2 : 0, fmEnvAmount: kind === 'bell' ? 2 : 0 });
        } else if (profile === 'organ') {
            Object.assign(p, { vcoType: bass ? 'sine' : 'organ', voiceCount: 1, osc2Amount: 0, gainAttack: .012,
                gainDecay: .15, gainSustain: .85, filterType: 'lowpass', filterFreq: bass ? 1100 : 6000, filterQ: .5,
                fmIndex: 0, fmEnvAmount: 0, filterEnvAmount: 0, noiseMix: 0, pitchEnvAmount: 0 });
        }
        // Limit articulation by the intended gate; a fast pad must speak before note-off.
        p.gainAttack = Math.min(p.gainAttack ?? .01, gate * (background ? .3 : .15));
        p.gainDecay = Math.min(p.gainDecay ?? .4, Math.max(.08, gate * (kind === 'pluck' || kind === 'keys' ? 1.8 : 1)));
        p.gainRelease = Math.min(p.gainRelease ?? .4, gate * (background ? .9 : bass ? .3 : .65), background ? 2 : bass ? .25 : .8);
        if (profile === 'chip') p.gainRelease = Math.min(.06, p.gainRelease);
        p.filterFreq = Math.round(clamp(p.filterFreq * 2 ** ((72 - register) / 48), bass ? 400 : 800, bass ? 1400 : 9000));
        // One room; role-specific depth and width keep a foreground and a focused bass.
        Object.assign(p, { stereoSpread: bass ? 0 : background ? 70 : counter ? 30 : 15,
            reverbType: profile === 'ambient' || profile === 'cinematic' ? 'reverb4' : 'reverb3',
            reverbAmount: bass ? .035 : profile === 'chip' ? .08 : background ? .28 : counter ? .16 : .2,
            chorusAmount: bass || profile === 'chip' || profile === 'folk' || profile === 'keys' || profile === 'organ' ? 0 : background ? .16 : .05,
            flangerAmount: 0, phaserAmount: 0, bitCrushAmount: 0, autoPanDepth: background && profile === 'ambient' ? .18 : 0,
            filterLfoDepth: background && profile === 'ambient' ? 350 : background && profile === 'analogue' ? 150 : 0,
            tremoloDepth: profile === 'organ' && !bass ? .08 : 0, vibratoDepth: profile === 'folk' && kind === 'lead' ? 3 : 0,
            vibratoRate: 4.5, delayAmount: 0, pingPongAmount: 0 });
        if (!bass && !background && !['chip', 'organ', 'folk'].includes(profile)) Object.assign(p, {
            delayTime: Math.round(60 / bpm * .75 * 1000) / 1000, delayFeedback: .2, delayAmount: counter ? .07 : .12 });
        // Asymmetric pulse waves contain DC; remove it without touching v1/v2.
        Object.assign(p, { masterFilterType: 'highpass', masterFilterFreq: 20, masterFilterQ: .5 });
        if (profile === 'folk' && kind !== 'lead') Object.assign(p, {
            stringModel: 'plucked', stringDecay: bass ? 1.5 : background ? 2.4 : 1.8,
            stringDamping: bass ? .7 : .4 + rng() * .25, stringPosition: .12 + rng() * .17,
            stringBody: bass ? .45 : .25, stringSeed: ownSeed & 65535,
            gainAttack: .003, gainDecay: .12, gainSustain: .78,
        });
        if (profile === 'keys' && !bass) Object.assign(p, {
            stringModel: 'piano', pianoSustain: background ? .32 : .16, pianoType: rng() < .55 ? 'felt' : 'electric', pianoDecay: Math.min(3.5, Math.max(1.5, gate * 2.5)),
            pianoBrightness: background ? .4 : .6, pianoHammer: .25, pianoUnison: background ? .3 : .15, pianoSeed: ownSeed & 65535,
            gainAttack: .003, gainDecay: .12, gainSustain: .8,
        });
        if(pianoResonance&&p.stringModel==='piano')p.pianoResonance=p.pianoType==='electric'?.55:.45;
        if(stringResonance&&p.stringModel==='plucked')Object.assign(p,{stringResonance:.6,stringBodyType:bass?'bass':'guitar'});
        p.masterVolume = .6;
    }
    const colour=generation!=='legacy'&&voiceColour?generatedColourPlan({...info,...context},kind):null;
    if(colour)Object.assign(p,colour.parameters);
    const id = JSON.stringify(context).split('').reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) >>> 0;
    return { name: `${generation === 'legacy' ? 'Original ' : ''}${context.profile[0].toUpperCase() + context.profile.slice(1)} ${base.name}.${id.toString(16).slice(0, 4)}`,
        preset: p, kind: base.kind, context, ...(colour?{sourceFamily:colour.family}:{}) };
}
