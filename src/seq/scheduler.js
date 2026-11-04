import { stepEvents } from './core';

/**
 * A lookahead scheduler on the audio clock: every `interval` ms it books the steps that fall within
 * `lookahead` seconds, so the page's timers may be late without the groove stumbling (the events carry audio
 * times and the engine plays them sample-accurately). It reads the bank each step, so edits are heard at once.
 *
 * bank():    { patterns, lengths, tempos, chain, current } as the drum pages keep it
 * pattern(p, {bank, index}) the core pattern of bank pattern p (default: identity)
 * tempo(), swing(), flam():  the global values
 * emit(events, info):  events for one step; info is { pattern, step, time }
 * now():     the audio clock in seconds
 */
export function createScheduler({ now, bank, pattern = (p) => p, tempo, swing, flam, fill = () => false, emit, onStep, onEnd, lookahead = 0.12, interval = 25, timers = { set: (fn, ms) => setInterval(fn, ms), clear: (id) => clearInterval(id) } }) {
    let timer = null, nextTime = 0, step = 0, slot = 0, current = 0, count = 0, songAt = 0, rep = 0;
    // Song mode: the bank's song is a list of { p: pattern, n: repeats }; it replaces the chain while bank.songOn is set
    const songMode = (b) => !!(b.songOn && b.song?.length);
    const choose = () => { const b = bank(); if (songMode(b)) return b.song[Math.min(songAt, b.song.length - 1)].p; return b.chain.length ? b.chain[slot % b.chain.length] : b.current; };
    const playStep = () => {
        const b = bank(), len = Math.max(1, b.lengths[current] || 16), bpm = b.tempos[current] || tempo(), stepSec = 60 / bpm / 4;
        const events = stepEvents(pattern(b.patterns[current], { bank: b, index: current }), step, { time: nextTime, stepSec, swing: swing(), flam: flam(), count, cycle: slot, fill: fill() });
        const info = { pattern: current, step, time: nextTime, count, song: songMode(b) ? { index: songAt, rep } : null };
        if (events.length) emit(events, info);
        onStep?.(info);
        nextTime += stepSec; count++;
        if (++step >= len) {
            step = 0; slot++;
            const after = bank();
            if (songMode(after)) {
                rep++;
                if (rep >= (after.song[songAt]?.n ?? 1)) {
                    rep = 0; songAt++;
                    if (songAt >= after.song.length) {
                        if (after.songLoop === false) { endSong(); return; }
                        songAt = 0;
                    }
                }
            }
            current = choose();
        }
    };
    // the song ended (loop off): stop booking; the host stops its transport when the last step has sounded
    const endSong = () => { if (timer !== null) { timers.clear(timer); timer = null; } onEnd?.({ time: nextTime }); };
    const tick = () => { const horizon = now() + lookahead; while (timer !== null && nextTime < horizon) playStep(); };
    return {
        get running() { return timer !== null; },
        start(delay = 0.06) {
            if (timer !== null) return;
            nextTime = now() + delay; step = 0; slot = 0; count = 0; songAt = 0; rep = 0; current = choose();
            timer = timers.set(tick, interval);
            tick();
        },
        stop() { if (timer !== null) { timers.clear(timer); timer = null; } },
    };
}
