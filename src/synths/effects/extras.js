// The rack's added units, built from Web Audio nodes (and two small worklets in public/rack-fx-processor.js): filter,
// tremolo, bit crusher, ring modulator, pitch shifter, stereo width and limiter. Every stage is stereo in and out. Each is
// wrapped so that switching it off crossfades to a straight through path, and each exposes patch(packet, initial) with the
// unit's slice of the rack packet (see rackPackets in params.js).

const moduleLoads = new WeakMap();
const loadWorklets = (context) => {
    if (!moduleLoads.has(context)) moduleLoads.set(context, context.audioWorklet.addModule(`${import.meta.env.BASE_URL}rack-fx-processor.js?v=1`));
    return moduleLoads.get(context);
};

const smooth = (context, param, value, initial) => (initial ? param.setValueAtTime(value, context.currentTime) : param.setTargetAtTime(value, context.currentTime, 0.02));
const clampHz = (context, hz) => Math.max(10, Math.min(context.sampleRate * 0.45, hz));

const BUILDERS = {
    // low cut and high cut, 12 or 24 dB per octave (two biquads each in 24 dB mode; a neutral frequency makes the second a no-op)
    filter(context) {
        const biquad = (type) => { const f = context.createBiquadFilter(); f.type = type; f.Q.value = 0.707; return f; };
        const input = context.createGain(), hp = [0, 1].map(() => biquad('highpass')), lp = [0, 1].map(() => biquad('lowpass'));
        const chain = [...hp, ...lp];
        input.connect(chain[0]);
        for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
        return {
            input, output: chain[chain.length - 1], nodes: [input, ...chain],
            patch(p, initial) {
                const steep = p.slope >= 0.5;
                smooth(context, hp[0].frequency, clampHz(context, p.low), initial); smooth(context, hp[1].frequency, steep ? clampHz(context, p.low) : 10, initial);
                smooth(context, lp[0].frequency, clampHz(context, p.high), initial); smooth(context, lp[1].frequency, steep ? clampHz(context, p.high) : context.sampleRate * 0.45, initial);
            },
        };
    },
    // amplitude tremolo; with stereo spread the right channel's modulation is delayed, so the sound sweeps between the sides
    tremolo(context) {
        const input = context.createGain(), split = context.createChannelSplitter(2), merge = context.createChannelMerger(2);
        const gains = [context.createGain(), context.createGain()], lfo = context.createOscillator(), depth = [context.createGain(), context.createGain()], offset = context.createDelay(5);
        lfo.frequency.value = 4; lfo.start();
        input.connect(split);
        gains.forEach((g, ch) => { split.connect(g, ch); g.connect(merge, 0, ch); g.gain.value = 1; });
        lfo.connect(depth[0]); depth[0].connect(gains[0].gain);
        lfo.connect(offset); offset.connect(depth[1]); depth[1].connect(gains[1].gain);
        return {
            input, output: merge, nodes: [input, split, merge, ...gains, ...depth, offset], oscillators: [lfo],
            patch(p, initial) {
                smooth(context, lfo.frequency, p.rate, initial);
                gains.forEach((g) => smooth(context, g.gain, 1 - p.depth / 2, initial));
                depth.forEach((d) => smooth(context, d.gain, p.depth / 2, initial));
                smooth(context, offset.delayTime, Math.min(5, (p.spread * 0.5) / Math.max(0.1, p.rate)), initial);
            },
        };
    },
    // ring modulator: the signal times a sine; mix blends it with the dry sound
    ring(context) {
        const input = context.createGain(), ring = context.createGain(), carrier = context.createOscillator(), wet = context.createGain(), dry = context.createGain(), output = context.createGain();
        ring.gain.value = 0; carrier.frequency.value = 300; carrier.connect(ring.gain); carrier.start();
        input.connect(ring); ring.connect(wet); input.connect(dry); wet.connect(output); dry.connect(output);
        return {
            input, output, nodes: [input, ring, wet, dry, output], oscillators: [carrier],
            patch(p, initial) { smooth(context, carrier.frequency, p.freq, initial); smooth(context, wet.gain, p.mix, initial); smooth(context, dry.gain, 1 - p.mix, initial); },
        };
    },
    // stereo width by mid/side: 0 is mono, 1 unchanged, 2 twice as wide. L' = L(1+w)/2 + R(1-w)/2, R' = R(1+w)/2 + L(1-w)/2
    width(context) {
        const input = context.createGain(), split = context.createChannelSplitter(2), merge = context.createChannelMerger(2);
        const same = [context.createGain(), context.createGain()], cross = [context.createGain(), context.createGain()];
        input.connect(split);
        split.connect(same[0], 0); same[0].connect(merge, 0, 0); split.connect(cross[0], 1); cross[0].connect(merge, 0, 0);
        split.connect(same[1], 1); same[1].connect(merge, 0, 1); split.connect(cross[1], 0); cross[1].connect(merge, 0, 1);
        return {
            input, output: merge, nodes: [input, split, merge, ...same, ...cross],
            patch(p, initial) { same.forEach((g) => smooth(context, g.gain, (1 + p.amount) / 2, initial)); cross.forEach((g) => smooth(context, g.gain, (1 - p.amount) / 2, initial)); },
        };
    },
    // a brick-wall-ish limiter: the dynamics compressor at ratio 20 with no knee and a fast attack
    limiter(context) {
        const node = context.createDynamicsCompressor();
        node.knee.value = 0; node.ratio.value = 20; node.attack.value = 0.002; node.release.value = 0.09;
        return { input: node, output: node, nodes: [node], patch(p, initial) { smooth(context, node.threshold, p.ceiling, initial); } };
    },
    async crusher(context) {
        await loadWorklets(context);
        const node = new AudioWorkletNode(context, 'rack-crusher', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [2] });
        const set = (name, v, initial) => smooth(context, node.parameters.get(name), v, initial);
        return { input: node, output: node, nodes: [node], worklets: [node], patch(p, initial) { set('bits', p.bits, true); set('divide', p.divide, true); set('mix', p.mix, initial); } };
    },
    async pitch(context) {
        await loadWorklets(context);
        const node = new AudioWorkletNode(context, 'rack-pitch', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit', outputChannelCount: [2] });
        const set = (name, v, initial) => smooth(context, node.parameters.get(name), v, initial);
        return { input: node, output: node, nodes: [node], worklets: [node], patch(p, initial) { set('semitones', p.semi, true); set('cents', p.fine, true); set('mix', p.mix, initial); } };
    },
};

export const EXTRA_KINDS = Object.keys(BUILDERS);

/** One added unit as a stage: { input, output, patch(packet, initial), dispose() }. A switched-off unit passes the signal straight through. */
export async function createExtraStage(context, kind) {
    const inner = await BUILDERS[kind](context);
    const input = context.createGain(), output = context.createGain(), through = context.createGain(), wet = context.createGain();
    input.connect(inner.input); inner.output.connect(wet); wet.connect(output); input.connect(through); through.connect(output);
    return {
        input, output,
        patch(packet, initial = false) {
            inner.patch(packet, initial);
            smooth(context, wet.gain, packet.on ? 1 : 0, initial); smooth(context, through.gain, packet.on ? 0 : 1, initial);
        },
        dispose() {
            for (const o of inner.oscillators ?? []) { try { o.stop(); } catch { /* not started */ } }
            for (const w of inner.worklets ?? []) w.port.postMessage('stop');
            [input, output, through, wet, ...inner.nodes].forEach((n) => { try { n.disconnect(); } catch { /* already gone */ } });
        },
    };
}
