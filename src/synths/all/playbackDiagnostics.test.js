// @vitest-environment node
import { it, expect } from 'vitest';
import { playbackSnapshot, playbackDifference } from './playbackDiagnostics.js';
const context = stats => ({ state: 'running', currentTime: 10, sampleRate: 48000, baseLatency: .01, outputLatency: .04, ...stats });
it('normalizes current seconds and older millisecond statistics to the same units', () => {
    const current = playbackSnapshot(context({ playbackStats: { underrunDuration: .02, underrunEvents: 2, totalDuration: 10, averageLatency: .04, maximumLatency: .06 } }));
    const older = playbackSnapshot(context({ playoutStats: { fallbackFramesDuration: 20, fallbackFramesEvents: 2, totalFramesDuration: 10000, averageLatency: 40, maximumLatency: 60 } }));
    expect({ ...current, api: 'same' }).toEqual({ ...older, api: 'same' });
    expect(current.baseLatencySeconds).toBe(.01);
});
it('uses interval deltas rather than historic startup glitches', () => {
    const before = playbackSnapshot(context({ playbackStats: { underrunDuration: 1, underrunEvents: 100, totalDuration: 20 } }));
    expect(playbackDifference(before, { ...before, totalSeconds: 25 })).toMatchObject({ observed: true, underrunEvents: 0, underrunPercent: 0, result: 'no-device-underruns-observed' });
    expect(playbackDifference(before, { ...before, totalSeconds: 25, underrunSeconds: 2, underrunEvents: 110 })).toMatchObject({ observed: true, underrunEvents: 10, underrunPercent: 20, result: 'device-underruns-observed' });
});
it('reports missing, stale, reset and stopped counters as inconclusive', () => {
    const missing = playbackSnapshot(context({})); expect(missing.api).toBe('unavailable');
    expect(playbackDifference(missing, missing).observed).toBe(false);
    const before = playbackSnapshot(context({ playbackStats: { underrunDuration: 1, underrunEvents: 100, totalDuration: 20 } }));
    for (const after of [before, { ...before, totalSeconds: 25, contextState: 'suspended' }, { ...before, totalSeconds: 25, underrunEvents: 1 }]) {
        expect(playbackDifference(before, after).result).toBe('inconclusive');
    }
});
