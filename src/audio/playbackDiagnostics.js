// User-requested local snapshot; no automatic uploads or extra audio taps.
import {perfEnabled} from './perfMode';
import {readWasmPerformance} from './wasmPerformance';
import {mediaSessionDiagnostics} from '../app/mediaSession';
import {readOutputPlatform} from './loadMeter';

export function playbackDiagnostics(g, status = {}) {
    const c = g.AC;
    return {
        version: 3, at: new Date().toISOString(), url: location.href,
        seed: g.settings?.seed, generation: g.settings?.generation,
        perf: perfEnabled(), sourceQuality: readWasmPerformance(),
        browser: navigator.userAgent, visibility: document.visibilityState,
        secureContext: globalThis.isSecureContext, audioWorkletAvailable: !!c.audioWorklet,
        context: { state: c.state, sampleRate: c.sampleRate, time: c.currentTime,
            baseLatency: c.baseLatency, outputLatency: c.outputLatency, ...readOutputPlatform(c) },
        mediaSession: mediaSessionDiagnostics(), playing: g.isRunning, ambience: g.ambienceRunning,
        engine: g.audioEngine, percussionEngine: g.percussionEngine ?? 'native', gain: { master: status.masterGain, generator: g.output?.gain?.value },
        meter: { load: status.load, reason: status.loadReason, state: status.state, dropouts: status.dropouts,
            output: status.output, history: status.outputHistory, events: status.outputEvents },
        lookahead: g.transport.lookahead, slowestTickGap: g.transport.slowestGap,
        transport: g.transport.diagnostics, rooms: g.wasmRoomPool?.rooms.size,
        roomDetails: g.wasmRoomPool?.diagnostics,
        roles: Object.fromEntries(Object.entries(g.roles).map(([role, r]) => {
            const i = r.instrument, v = i.voice;
            return [role, { preset: r.presetName, loading: !!i.loading, kind: v?.spec?.kind ?? i.kind,
                stats: v?.stats ?? i.stats ?? null, error: i.error?.message,
                inserts: v?.insert ? { stats: v.insert.stats ?? null, error: v.insert.error?.message } : null,
                room: v?.room?.stats ? { stats: v.room.stats, error: v.room.error?.message } : null,
                native: v?.native ? { active: v.native.awakeVoices?.(), chain: v.native.effectsAwake?.(),
                    soundUntil: Number.isFinite(v.native.soundUntil) ? v.native.soundUntil : null }
                    : typeof i.sources?.size === 'number' ? {sources:i.sources.size,chain:i.effectsAwake?.(),soundUntil:Number.isFinite(i.soundUntil)?i.soundUntil:null} : null }];
        })),
    };
}

const limited = (value, length = 100) => typeof value === 'string' ? value.slice(0, length) : value;
const fields = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
const sourceCounters = value => fields(value, ['active','queued','peakActive','steals','dropped','late','resyncs','skippedFrames','frame','reportedAt','peak','memory']);
const platformCounters = value => {
    const stats = value?.playbackStats ?? value?.playoutStats;
    return stats ? fields(stats, ['underrunEvents','underrunDuration','fallbackFramesEvents','fallbackFramesDuration','totalDuration','averageLatency','maximumLatency']) : null;
};
const numeric = values => values.filter(Number.isFinite);
const range = values => {const a = numeric(values); return a.length ? [Math.min(...a), Math.max(...a)] : null;};
const maximum = values => {const a = numeric(values); return a.length ? Math.max(...a) : null;};
const roundedJSON = value => JSON.stringify(value, (_, v) => typeof v === 'number' ? Number.isFinite(v) ? Math.abs(v) < 1e9 ? Math.round(v * 10000) / 10000 : v : null : v);

/** A bounded, readable text report for a phone chat. Core source/transport
 * counters come before optional history, and the full report stays available.
 * All work happens on explicit copy; no new graph nodes, polling or telemetry.
 */
export function formatPlaybackSummary(snapshot, silences = []) {
    const d = snapshot, meter = d.meter ?? {}, history = meter.history ?? [], events = meter.events ?? [];
    const roles = d.roles ?? {}, preferred = ['perc','pad','bass','lead','counter'];
    const names = [...preferred.filter(name => roles[name]), ...Object.keys(roles).filter(name => !preferred.includes(name))].slice(0, 5);
    const sources = Object.fromEntries(names.map(name => {
        const r = roles[name];
        return [name.slice(0, 20), {preset:limited(r.preset, 44),kind:limited(r.kind, 20),loading:r.loading,error:limited(r.error),
            stats:r.stats ? sourceCounters(r.stats) : null,native:r.native ? fields(r.native,['active','sources','chain','soundUntil']) : null,
            inserts:r.inserts ? {stats:fields(r.inserts.stats,['peak','sleeping','nonFinite','memory','reportedAt']),error:limited(r.inserts.error)} : undefined}];
    }));
    const current = meter.output;
    const platformHistory = history.map(row => platformCounters(row.platform)).filter(Boolean);
    const transitions = events.filter(e => e.type === 'visibility');
    const intervals = [];let hidden;
    for (const event of transitions) {
        if (event.state === 'hidden') hidden = event;
        else if (event.state === 'visible' && hidden) {
            const wallSeconds = (event.wallTime - hidden.wallTime) / 1000, audioSeconds = event.audioTime - hidden.audioTime;
            intervals.push({wallSeconds,audioSeconds,rate:wallSeconds > 0 ? audioSeconds / wallSeconds : null});hidden = null;
        }
    }
    // Do not imply that frozen rolling platform statistics cover the full run.
    const core = {
        session:{at:d.at,seed:d.seed,engine:d.engine,percussion:d.percussionEngine,quality:d.sourceQuality,perf:d.perf,playing:d.playing,ambience:d.ambience,visibility:d.visibility},
        context:{...fields(d.context,['state','sampleRate','time','baseLatency','outputLatency']),timestamp:fields(d.context?.timestamp,['contextTime','performanceTime']),platform:platformCounters(d.context)},
        transport:{...fields(d.transport,['running','targetAhead','nextBeatInSeconds','maxTickGap','maxTickMs','budgetHits','recoveries']),slowestTickGap:d.slowestTickGap},
        sources,
        output:{load:meter.load,method:meter.reason,dropouts:meter.dropouts,gain:d.gain,
            latest:fields(current,['audioTime','wallTime','peak','rms','nonFinite','maxCallbackGapMs']),
            windows:history.length,audioRange:range(history.map(row => row.audioTime)),rmsRange:range(history.map(row => row.rms)),
            maxCallbackGapMs:maximum(history.map(row => row.maxCallbackGapMs)),maxNonFinite:maximum(history.map(row => row.nonFinite)),
            maxReportedEvents:maximum(platformHistory.map(s => s.underrunEvents ?? s.fallbackFramesEvents)),
            maxReportedGapSeconds:maximum(platformHistory.map(s => s.underrunDuration ?? s.fallbackFramesDuration)),
            platformDurationRange:range(platformHistory.map(s => s.totalDuration))},
    };
    const extra = {
        background:{intervals:intervals.slice(-2),transitions:transitions.slice(-4).map(e => ({state:e.state,audioTime:e.audioTime,wallTime:e.wallTime,platform:platformCounters(e.platform)})),
            callbackGaps:events.filter(e => e.type === 'callback-gap').slice(-2).map(e => fields(e,['audioTime','wallTime','ms']))},
        helper:{state:d.mediaSession?.state,enabled:d.mediaSession?.helperEnabled,error:limited(d.mediaSession?.playError),...fields(d.mediaSession?.helper,['paused','time','readyState','error'])},
        rooms:{count:d.rooms,details:(d.roomDetails ?? []).slice(0, 3).map(r => ({clients:r.clients,ready:r.ready,
            settings:fields(r.settings,['decay','quality','reverb','dry','reverbReturn']),stats:fields(r.stats,['peak','sleeping','reverbActive','reverbFrames','reportedAt']),error:limited(r.error)}))},
        recentTransport:(d.transport?.recent ?? []).slice(-3).map(e => fields(e,['type','audioTime','hidden','gap','ahead','target','ms','lateSeconds'])),
        silence:{stored:silences.length,recent:silences.slice(-2).map(s => fields(s,['at','silentSeconds','sincePlaySeconds','visibility','context']))},
        page:{url:limited(d.url, 450),browser:limited(d.browser, 180),secure:d.secureContext,worklet:d.audioWorkletAvailable},
    };
    let text = 'CalmBGM playback summary v1\n';
    for (const [key, value] of Object.entries(core)) text += key + ': ' + roundedJSON(value) + '\n';
    const omitted = [];
    for (const [key, value] of Object.entries(extra)) {
        const line = key + ': ' + roundedJSON(value) + '\n';
        if (text.length + line.length <= 5700) text += line; else omitted.push(key);
    }
    if (omitted.length) text += 'Extra details omitted: ' + omitted.join(', ') + '. Use Save full report.\n';
    return text + 'Platform counters may freeze while hidden; duration is their reported coverage, not the whole run.\n';
}
