// A troubleshooting benchmark: runs a few checks in the page - the device, the
// audio output, how fast the engine renders the current music (in an
// OfflineAudioContext, the cost of playing it, with no sound out), what each
// voice costs on its own, and whether the echoes are as the presets say - and
// compiles them into a text report to paste into a chat. Opened from the Audio
// menu (AudioStatus.jsx).

import { renderPcm } from './engine/render';
import { audioContext } from '../audio/context';
import { readPerformance } from '../audio/performance';
import { readSilenceLog } from '../audio/silenceLog';

const FULL_SECONDS = 20;
const ROLE_SECONDS = 10;

const round = (n, digits = 2) => (Number.isFinite(n) ? Number(n.toFixed(digits)) : null);
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A fixed chunk of arithmetic, timed: a rough speed of one core, comparable across devices (millions of steps per second). */
function cpuScore() {
    const run = () => {
        const start = performance.now();
        let x = 0.5;
        for (let i = 0; i < 4e6; i++) x = Math.sin(x * 1.0001 + i * 1e-7) * 0.5 + 0.5;
        return { ms: performance.now() - start, x };
    };
    run();
    const best = Math.min(run().ms, run().ms, run().ms);
    return round(4 / (best / 1000), 1);
}

/** How late the page's timers and frames run while `work` does (ms), as a sign the main thread is starved. */
async function withLag(work) {
    let worst = 0;
    let total = 0;
    let ticks = 0;
    let last = performance.now();
    const timer = setInterval(() => {
        const now = performance.now();
        const late = Math.max(0, now - last - 20);
        worst = Math.max(worst, late);
        total += late;
        ticks++;
        last = now;
    }, 20);
    const value = await work();
    clearInterval(timer);
    return { value, worstLagMs: Math.round(worst), meanLagMs: round(ticks ? total / ticks : 0, 1) };
}

/** The device and the audio output. */
export function describeDevice() {
    const nav = window.navigator;
    const AC = audioContext;
    return {
        userAgent: nav.userAgent,
        cores: nav.hardwareConcurrency || null,
        memoryGB: nav.deviceMemory || null,
        screen: `${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x`,
        online: nav.onLine,
        sampleRate: AC.sampleRate,
        baseLatencyMs: round((AC.baseLatency || 0) * 1000, 1),
        outputLatencyMs: round((AC.outputLatency || 0) * 1000, 1),
        audioState: AC.state,
        performance: readPerformance(),
        cpuMSteps: cpuScore(),
    };
}

/**
 * Every delay's real feedback against its preset's, per voice: a mismatch (or
 * a feedback near 1, which never dies away) is the signature of a stuck echo.
 */
export function echoCheck(gen) {
    const rows = [];
    Object.entries(gen.roles).forEach(([role, { instrument: inst }]) => {
        if (!inst.pingPong || !inst.preset) return;
        // a sleeping chain is not rendered, so its parameters read their defaults (1)
        if (!inst.effectsAwake()) {
            rows.push({ role, effect: 'all', asleep: true });
            return;
        }
        const inChain = new Set(inst.activeEffects());
        const wrong = inst.auditEchoes();
        [['pingPong', inst.pingPong.getFeedback(), inst.preset.pingPongFeedback || 0], ['delay', inst.delay.getFeedback(), inst.preset.delayFeedback || 0]]
            .filter(([name]) => inChain.has(name))
            .forEach(([name, actual, wanted]) => {
                const mismatch = wrong.some((w) => w.effect === name);
                const problem = mismatch ? 'differs from the preset' : actual >= 0.9 && wanted < 0.9 ? 'near 1: never dies away' : null;
                if (problem || wanted > 0) rows.push({ role, effect: name, actual: round(actual), preset: round(wanted), problem });
            });
    });
    return rows;
}

/** What each voice is doing now. */
function describeRoles(gen) {
    const now = gen.AC.currentTime;
    return Object.fromEntries(Object.entries(gen.roles).map(([role, r]) => {
        const inst = r.instrument;
        return [role, {
            volume: round(r.volume),
            muted: !!r.mute,
            solo: !!r.solo,
            polyphony: inst.polyphony,
            effects: inst.activeEffects ? inst.activeEffects().join('+') || 'none' : undefined,
            awakeVoices: inst.awakeVoices ? inst.awakeVoices() : undefined,
            bookedAheadS: inst.soundUntil ? round(Math.max(0, inst.soundUntil - now), 1) : undefined,
        }];
    }));
}

/** Renders `seconds` of the music offline and times it: { speed, ms } - speed is seconds of music per second of work. */
async function timedRender(gen, seconds) {
    const start = performance.now();
    await renderPcm(gen, seconds, { onChunk: () => {} });
    const ms = performance.now() - start;
    return { speed: round(seconds / (ms / 1000), 1), ms: Math.round(ms) };
}

/**
 * Runs the benchmark and returns the report text.
 * @param {object} generator
 * @param {object} [live] - what the Audio menu already knows: { load, dropouts }
 * @param {function} [onStep] - (label) as it goes
 */
export async function runBenchmark(generator, live = {}, onStep = () => {}) {
    const report = { at: new Date().toISOString(), page: window.location.href };

    onStep('Device');
    await nextFrame();
    report.device = describeDevice();

    onStep('Live playback');
    report.live = {
        playing: !!generator.isRunning,
        audioLoadPercent: live.load === null || live.load === undefined ? null : Math.round(live.load * 100),
        dropouts: live.dropouts ?? null,
        silencesLogged: readSilenceLog().length,
    };
    report.roles = describeRoles(generator);
    report.echoes = echoCheck(generator);

    // Each voice alone, then everything: the render is the engine's work for
    // playing, so a speed under 1 means this device cannot keep up in real time.
    const roles = Object.keys(generator.roles);
    const saved = Object.fromEntries(roles.map((role) => [role, generator.roles[role].solo]));
    report.render = { perRole: {} };
    try {
        for (const role of roles) {
            onStep(`Rendering ${role} alone (${ROLE_SECONDS} s of music)`);
            await nextFrame();
            roles.forEach((other) => { generator.roles[other].solo = other === role; });
            // eslint-disable-next-line no-await-in-loop
            report.render.perRole[role] = (await timedRender(generator, ROLE_SECONDS)).speed;
        }
    } catch (error) {
        report.render.error = String(error && error.message ? error.message : error);
    } finally {
        roles.forEach((role) => { generator.roles[role].solo = saved[role]; });
    }

    try {
        onStep(`Rendering everything (${FULL_SECONDS} s of music)`);
        await nextFrame();
        const { value, worstLagMs, meanLagMs } = await withLag(() => timedRender(generator, FULL_SECONDS));
        report.render.full = value;
        report.render.pageLagMs = { worst: worstLagMs, mean: meanLagMs };
    } catch (error) {
        report.render.error = String(error && error.message ? error.message : error);
    }

    return formatReport(report);
}

const verdict = (speed) => {
    if (speed === null || speed === undefined) return '';
    if (speed < 1) return ' - TOO SLOW to play in real time';
    if (speed < 2) return ' - tight: little headroom';
    if (speed < 4) return ' - ok';
    return ' - plenty of headroom';
};

/** The report as text. */
export function formatReport(r) {
    const { device: d, live, render } = r;
    const lines = [
        `bgm benchmark ${r.at}`,
        `page: ${r.page}`,
        '',
        '## Device',
        `agent: ${d.userAgent}`,
        `cores: ${d.cores}, memory: ${d.memoryGB ?? '?'} GB, screen: ${d.screen}`,
        `cpu score: ${d.cpuMSteps} (million steps/s of a fixed loop; a recent desktop is roughly 60-120, a mid phone 15-40)`,
        `audio: ${d.sampleRate} Hz, ${d.audioState}, base latency ${d.baseLatencyMs} ms, output latency ${d.outputLatencyMs} ms`,
        `performance options: reverb ${d.performance.reverb}, shared reverb ${d.performance.sharedReverb}`,
        '',
        '## Live',
        `playing: ${live.playing}, audio load: ${live.audioLoadPercent ?? '?'}%, dropouts: ${live.dropouts ?? 'not reported'}, gaps logged: ${live.silencesLogged}`,
        ...Object.entries(r.roles).map(([role, v]) => `${role}: vol ${v.volume}${v.muted ? ' muted' : ''}${v.solo ? ' solo' : ''}, ${v.polyphony} voices (${v.awakeVoices ?? '?'} awake), effects ${v.effects}`),
        '',
        '## Echoes (actual feedback vs preset)',
        ...(r.echoes.length ? r.echoes.map((e) => (e.asleep ? `${e.role}: effects asleep, not measurable (play, then run again)` : `${e.role} ${e.effect}: ${e.actual} (preset ${e.preset})${e.problem ? ` <-- ${e.problem}` : ''}`)) : ['no delays in use']),
        '',
        '## Render speed (seconds of music made per second of work; needs well over 1 to play smoothly)',
        ...Object.entries(render.perRole).map(([role, speed]) => `${role} alone: ${speed}x${verdict(speed)}`),
        render.full ? `everything: ${render.full.speed}x in ${render.full.ms} ms${verdict(render.full.speed)}` : 'everything: not measured',
        render.pageLagMs ? `page lag while rendering: worst ${render.pageLagMs.worst} ms, mean ${render.pageLagMs.mean} ms` : '',
        render.error ? `error: ${render.error}` : '',
    ];
    return lines.filter((line, i) => line !== '' || lines[i - 1] !== '').join('\n').trim();
}
