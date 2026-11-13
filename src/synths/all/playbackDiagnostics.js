// Device output statistics, separate from signal presence and owner readiness.
// Web Audio AudioPlaybackStats uses seconds; the older playoutStats uses ms.
export function playbackSnapshot(context) {
    const current = context.playbackStats, legacy = current ? null : context.playoutStats;
    const stats = current ?? legacy;
    const seconds = value => typeof value === 'number' && Number.isFinite(value) ? value / (current ? 1 : 1000) : null;
    return {
        api: current ? 'playbackStats' : legacy ? 'playoutStats' : 'unavailable',
        contextState: context.state, contextSeconds: context.currentTime,
        sampleRate: context.sampleRate, baseLatencySeconds: context.baseLatency ?? null,
        outputLatencySeconds: context.outputLatency ?? null,
        underrunSeconds: seconds(current?.underrunDuration ?? legacy?.fallbackFramesDuration),
        underrunEvents: stats ? current?.underrunEvents ?? legacy?.fallbackFramesEvents : null,
        totalSeconds: seconds(current?.totalDuration ?? legacy?.totalFramesDuration),
        averageLatencySeconds: seconds(stats?.averageLatency),
        maximumLatencySeconds: seconds(stats?.maximumLatency),
    };
}

export function playbackDifference(before, after) {
    const comparable = before.api !== 'unavailable' && before.api === after.api;
    const subtract = key => comparable && before[key] !== null && after[key] !== null ? after[key] - before[key] : null;
    const underrunSeconds = subtract('underrunSeconds'), underrunEvents = subtract('underrunEvents'), totalSeconds = subtract('totalSeconds');
    const observed = totalSeconds > 0 && underrunSeconds >= 0 && underrunEvents >= 0 && before.contextState === 'running' && after.contextState === 'running';
    return { observed, underrunSeconds, underrunEvents, totalSeconds,
        underrunPercent: observed ? 100 * underrunSeconds / totalSeconds : null,
        result: !observed ? 'inconclusive' : underrunEvents > 0 || underrunSeconds > 0 ? 'device-underruns-observed' : 'no-device-underruns-observed',
    };
}

export async function measurePlayback(host, durationMs = 5000) {
    await host.wake();
    const before = playbackSnapshot(host.context), start = performance.now();
    await new Promise(resolve => setTimeout(resolve, durationMs));
    const after = playbackSnapshot(host.context);
    return { before, after, ...playbackDifference(before, after), elapsedWallMs: performance.now() - start,
        visibility: document.visibilityState,
        scope: 'Output-device underruns during this interval; not a DSP waveform or listening-quality verdict' };
}
