// Cost of one Web Audio node of each kind the engine uses (docs/DESIGN.md
// §5): N copies in parallel off one source, rendered offline;
// (time - baseline) / N / audio duration = share of one core per node.

const SR = 48000;
const SECONDS = 4;
const N = 16;
const BASE = import.meta.env.BASE_URL;

async function time(build) {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: SR * SECONDS, sampleRate: SR });
    const source = ctx.createOscillator();
    source.type = 'sawtooth';
    source.start();
    const sum = ctx.createGain();
    sum.gain.value = 1 / N;
    sum.connect(ctx.destination);
    await build(ctx, source, sum);
    const start = performance.now();
    await ctx.startRendering();
    return performance.now() - start;
}

const lfoTo = (ctx, param, depth) => {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = depth;
    lfo.connect(gain).connect(param);
    lfo.start();
};

// N copies of a node between the source and the sum.
const each = (make) => (ctx, source, sum) => {
    for (let i = 0; i < N; i++) {
        const node = make(ctx);
        source.connect(node);
        node.connect(sum);
    }
};
// N oscillators straight into the sum.
const oscillators = (setup) => (ctx, source, sum) => {
    for (let i = 0; i < N; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        setup(ctx, osc);
        osc.start();
        osc.connect(sum);
    }
};
const withRate = (param, rate) => {
    param.automationRate = rate;
    return param;
};

const CASES = {
    gain: each((ctx) => ctx.createGain()),
    oscillator: oscillators(() => {}),
    'oscillator, LFO on detune (a-rate)': oscillators((ctx, o) => lfoTo(ctx, withRate(o.detune, 'a-rate'), 10)),
    'oscillator, LFO on detune (k-rate)': oscillators((ctx, o) => lfoTo(ctx, withRate(o.detune, 'k-rate'), 10)),
    stereoPanner: each((ctx) => new StereoPannerNode(ctx, { pan: 0.3 })),
    'biquad, static': each((ctx) => new BiquadFilterNode(ctx, { frequency: 2000 })),
    'biquad, envelope (a-rate)': each((ctx) => {
        const f = new BiquadFilterNode(ctx);
        f.detune.setTargetAtTime(1200, 0, 30);
        return f;
    }),
    'biquad, envelope (k-rate)': each((ctx) => {
        const f = new BiquadFilterNode(ctx);
        withRate(f.detune, 'k-rate').setTargetAtTime(1200, 0, 30);
        return f;
    }),
    'biquad, LFO (phaser stage)': each((ctx) => {
        const f = new BiquadFilterNode(ctx, { type: 'allpass' });
        lfoTo(ctx, f.frequency, 800);
        return f;
    }),
    'delay, static': each((ctx) => new DelayNode(ctx, { maxDelayTime: 1, delayTime: 0.3 })),
    'delay, LFO (chorus voice)': each((ctx) => {
        const d = new DelayNode(ctx, { maxDelayTime: 0.03, delayTime: 0.008 });
        lfoTo(ctx, d.delayTime, 0.002);
        return d;
    }),
    compressor: each((ctx) => ctx.createDynamicsCompressor()),
};

const out = document.getElementById('out');
const print = (line) => { out.textContent += `${line}\n`; };

async function main() {
    const impulses = await Promise.all(['reverb1', 'reverb2', 'reverb3', 'reverb4', 'reverb5', 'reverb6'].map(async (type) => {
        const data = await (await fetch(`${BASE}reverb/${type}.flac`)).arrayBuffer();
        return [type, await new OfflineAudioContext(2, SR, SR).decodeAudioData(data)];
    }));
    const cases = { ...CASES };
    impulses.forEach(([type, buffer]) => {
        cases[`convolver, ${type} (${buffer.duration.toFixed(1)} s)`] = each((ctx) => new ConvolverNode(ctx, { buffer }));
    });
    // A convolver with nothing connected is free; one fed silence is not.
    const [, reverb4] = impulses[3];
    cases['convolver, reverb4, silent input'] = (ctx) => {
        for (let i = 0; i < N; i++) {
            const c = new ConvolverNode(ctx, { buffer: reverb4 });
            const osc = ctx.createOscillator();
            osc.connect(new GainNode(ctx, { gain: 0 })).connect(c);
            osc.start();
            c.connect(ctx.destination);
        }
    };
    cases['convolver, reverb4, unconnected'] = (ctx) => {
        for (let i = 0; i < N; i++) new ConvolverNode(ctx, { buffer: reverb4 }).connect(ctx.destination);
    };

    const baseline = Math.min(await time(() => {}), await time(() => {}));
    const rows = [];
    for (const [name, build] of Object.entries(cases)) {
        const perNode = (await time(build) - baseline) / N / (SECONDS * 1000);
        rows.push({ name, perNode });
        print(`${name.padEnd(40)} ${(perNode * 100).toFixed(3).padStart(7)}% of a core`);
    }
    window.__results = rows;
}

main().catch((e) => {
    window.__error = String(e.stack || e);
    print(window.__error);
});
