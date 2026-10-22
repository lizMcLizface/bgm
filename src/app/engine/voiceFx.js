// The calmbgm synth's later effects - tape, compressor, tremolo / auto-pan, shimmer, freeze - as
// one table both engines build from: the Instrument (the Web Audio voices) makes them stages of
// its chain; a Wasm voice (labs/voice.js) runs them as a VoiceFx between its inserts and its room.
// Each stage is routed around while it does nothing, as Instrument.updateChain does.
import Tape from '../../nodes/tape';
import VoiceCompressor from '../../nodes/voiceCompressor';
import Motion from '../../nodes/motion';
import { Shimmer, Freeze } from '../../nodes/space';
import PRESET_DEFAULTS from './presetDefaults';

export const FX_STAGES = {
    tape: {
        create: (AC) => new Tape(AC),
        active: (p) => p.tapeWow > 0 || p.tapeFlutter > 0 || p.tapeDrive > 0,
        setters: { tapeWow: (n, v) => n.setWow(v), tapeWowRate: (n, v) => n.setWowRate(v), tapeFlutter: (n, v) => n.setFlutter(v), tapeDrive: (n, v) => n.setDrive(v), tapeTone: (n, v) => n.setTone(v) },
    },
    motion: {
        create: (AC) => new Motion(AC),
        active: (p) => p.tremoloDepth > 0 || p.autoPanDepth > 0,
        setters: { tremoloRate: (n, v) => n.setTremoloRate(v), tremoloDepth: (n, v) => n.setTremoloDepth(v), autoPanRate: (n, v) => n.setAutoPanRate(v), autoPanDepth: (n, v) => n.setAutoPanDepth(v) },
    },
    compressor: {
        create: (AC) => new VoiceCompressor(AC),
        active: (p) => p.compAmount > 0,
        setters: { compAmount: (n, v) => n.setAmount(v), compRatio: (n, v) => n.setRatio(v), compAttack: (n, v) => n.setAttack(v), compRelease: (n, v) => n.setRelease(v), compOutput: (n, v) => n.setTrim(v) },
    },
    shimmer: {
        create: (AC) => new Shimmer(AC),
        active: (p) => p.shimmerMix > 0,
        setters: { shimmerDecay: (n, v) => n.setDecay(v), shimmerInterval: (n, v) => n.setShift(v), shimmerClimb: (n, v) => n.setClimb(v), shimmerTone: (n, v) => n.setTone(v), shimmerMix: (n, v) => n.setMix(v) },
    },
    freeze: {
        create: (AC) => new Freeze(AC),
        active: (p) => p.freezeMix > 0,
        setters: { freezeLength: (n, v) => n.setLength(v), freezeFade: (n, v) => n.setFade(v), freezeHold: (n, v) => n.setHold(v), freezeMix: (n, v) => n.setMix(v) },
    },
};
export const FX_KEYS = new Set(Object.values(FX_STAGES).flatMap((s) => Object.keys(s.setters)));

/** Seconds these effects ring on after the voices stop (a held freeze: as long as renders allow). */
export function fxTail(preset) {
    const p = { ...PRESET_DEFAULTS, ...preset };
    const shimmer = p.shimmerMix > 0 ? Math.min(30, p.shimmerDecay * (1 + p.shimmerClimb * 3)) : 0;
    const freeze = p.freezeMix > 0 ? (p.freezeHold ? 60 : p.freezeFade + 0.5) : 0;
    return Math.max(shimmer, freeze);
}

/** The effects as one block: input -> active stages -> output. */
export class VoiceFx {
    constructor(AC, preset, order = ['tape', 'motion', 'compressor', 'shimmer', 'freeze']) {
        this.AC = AC;
        this.input = AC.createGain();
        this.output = AC.createGain();
        this.stages = order.map((key) => ({ key, ...FX_STAGES[key], node: null, values: {} }));
        this.signature = null;
        this.set(preset);
    }

    set(preset) {
        const p = { ...PRESET_DEFAULTS, ...preset };
        for (const stage of this.stages) {
            if (!stage.node && !stage.active(p)) continue;
            stage.node ??= stage.create(this.AC);
            for (const [key, setter] of Object.entries(stage.setters)) {
                if (stage.values[key] !== p[key]) setter(stage.node, p[key]);
                stage.values[key] = p[key];
            }
        }
        const active = this.stages.filter((stage) => stage.active(p));
        const signature = active.map((stage) => stage.key).join();
        if (signature === this.signature) return;
        this.signature = signature;
        this.input.disconnect();
        this.stages.forEach((stage) => stage.node && stage.output?.disconnect());
        let previous = this.input;
        for (const stage of active) {
            if (!stage.output) {
                stage.output = this.AC.createGain();
                stage.node.connect(stage.output);
            }
            [].concat(stage.node.getNode()).forEach((node) => previous.connect(node));
            previous = stage.output;
        }
        previous.connect(this.output);
    }

    clear() {
        for (const stage of this.stages) stage.node?.clear?.();
    }

    dispose() {
        this.input.disconnect();
        for (const stage of this.stages) {
            stage.output?.disconnect();
            stage.node?.dispose?.();
        }
        this.output.disconnect();
    }
}
