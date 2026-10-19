// A log of gaps in the sound, for finding out why music turns to silence and
// back (the lock screen of a phone, say): every stretch of silence in the
// output while the music was playing, with what the engine looked like at the
// time. Kept in this browser (localStorage) so it survives a reload; the Audio
// menu can copy it as text.

const KEY = 'bgm-silence-log';
const MAX_ENTRIES = 60;

export function readSilenceLog() {
    try {
        const log = JSON.parse(window.localStorage.getItem(KEY) || '[]');
        return Array.isArray(log) ? log : [];
    } catch (e) {
        return [];
    }
}

export function addSilence(entry) {
    try {
        window.localStorage.setItem(KEY, JSON.stringify([...readSilenceLog(), entry].slice(-MAX_ENTRIES)));
    } catch (e) {
        // not stored; the log is a diagnostic
    }
}

export function clearSilenceLog() {
    try {
        window.localStorage.removeItem(KEY);
    } catch (e) {
        // nothing to clear
    }
}

/** The log as text to copy. */
export function formatSilenceLog(log = readSilenceLog()) {
    const lines = log.map((e) => JSON.stringify(e));
    return [`bgm silence log (${log.length} entries) ${window.navigator.userAgent}`, ...lines].join('\n');
}

/**
 * What to record when a silence of `seconds` ended now. null for a silence that
 * is not a gap in the music: it began before Play, or the music is not running.
 * @param {object} generator
 * @param {number} seconds
 */
export function describeSilence(generator, seconds) {
    if (!generator.isRunning || !(generator.startedAt >= 0)) return null;
    const sincePlay = (performance.now() - generator.startedAt) / 1000;
    if (seconds > sincePlay + 0.2) return null;
    const now = generator.AC.currentTime;
    const roles = {};
    Object.entries(generator.roles).forEach(([role, { instrument }]) => {
        const until=instrument.soundUntil??instrument.voice?.native?.soundUntil;
        const ahead=Number.isFinite(until)?`${Math.max(-1,until-now).toFixed(1)} s ahead`:'unavailable';
        roles[role] = instrument.awakeVoices
            ? `${instrument.awakeVoices()}/${instrument.polyphony} voices, chain ${instrument.effectsAwake() ? 'on' : 'off'}, sound booked ${ahead}`
            : `chain ${instrument.effectsAwake() ? 'on' : 'off'}`;
    });
    return {
        at: new Date().toISOString(),
        silentSeconds: Number(seconds.toFixed(2)),
        sincePlaySeconds: Math.round(sincePlay),
        visibility: document.visibilityState,
        context: generator.AC.state,
        lookahead: Number(generator.transport.lookahead.toFixed(1)),
        slowestTickGap: Number((generator.transport.slowestGap || 0).toFixed(2)),
        position: Number(generator.position().toFixed(1)),
        roles,
    };
}
