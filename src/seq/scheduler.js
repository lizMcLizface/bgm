import { stepEvents } from './core';

/**
 * A lookahead scheduler on the audio clock: every `interval` ms it books the steps that fall within
 * `lookahead` seconds, so the page's timers may be late without the groove stumbling (the events carry audio
 * times and the engine plays them sample-accurately). It reads the bank each step, so edits are heard at once.
 *
 * bank():    { patterns, lengths, tempos, chain, current, ... } as the drum pages keep it. Besides the pattern being edited it may carry a song
 *            (song, songOn, songLoop, loopIn, loopOut), `linear` (go on to the next pattern with notes instead of repeating this one) and
 *            `holdBlock` (stay on the song's current block).
 * pattern(p, {bank, index}) the core pattern of bank pattern p (default: identity)
 * events(pattern, step, ctx) the events a step plays (default: the core's stepEvents, for rows of hits; the bass line brings its own)
 * tempo(), swing(), flam():  the global values
 * emit(events, info):  events for one step; info is { pattern, step, time }
 * now():     the audio clock in seconds
 * clock:     optional global clock (clock.js): every booked step is recorded there, so followers read the position from one place
 *
 * Scope: the arranger plays the song ('song': the song when it is on, else the chain) and the sequencer plays the pattern being edited alone ('pattern': a
 * song is ignored, the pattern repeats or, with `linear`, goes on through the patterns). The song's place is kept while the pattern alone is played and through
 * stop(false); stop() rewinds it.
 *
 * Transport: start() begins at the first step; pause() and resume() stop and continue where it was; stop() forgets the place. While it is not running,
 * stepBy(1) plays the next step and stepBy(-1) the one before the last played, so a pattern can be walked a step at a time; while it runs they move
 * the place. gotoPattern(i) and gotoBlock(i) move the place to the start of a pattern or song block.
 */
const hasNotes = (p) => { const rows = Array.isArray(p) ? p : p?.rows; return !Array.isArray(rows) || rows.some((r) => !Array.isArray(r) || r.some(Boolean)); };

export function createScheduler({ now, bank, pattern = (p) => p, events: makeEvents = stepEvents, tempo, swing, flam, fill = () => false, emit, onStep, clock = null, onEnd, lookahead = 0.12, interval = 25, timers = { set: (fn, ms) => setInterval(fn, ms), clear: (id) => clearInterval(id) } }) {
    let timer = null, nextTime = 0, step = 0, slot = 0, current = 0, count = 0, songAt = 0, rep = 0, primed = false, paused = false, scope = 'song', songValid = false;
    // Song mode: the bank's song is a list of { p: pattern, n: repeats }; it replaces the chain while bank.songOn is set
    const songMode = (b) => scope === 'song' && !!(b.songOn && b.song?.length);
    // the blocks the song plays between: all of them, or the loop region the bank names (loopIn..loopOut)
    const firstBlock = (b) => Math.min(b.loopIn ?? 0, b.song.length - 1);
    const lastBlock = (b) => Math.min(b.loopOut ?? b.song.length - 1, b.song.length - 1);
    // the next pattern with notes after `from`, going on through the bank and round again; the same one when it is the only one
    const nextUsed = (b, from) => { for (let i = 1; i <= b.patterns.length; i++) { const k = (from + i) % b.patterns.length; if (hasNotes(b.patterns[k])) return k; } return from; };
    const choose = (first = false) => {
        const b = bank();
        if (songMode(b)) return b.song[Math.min(songAt, b.song.length - 1)].p;
        if (scope === 'song' && b.chain.length) return b.chain[slot % b.chain.length];
        return b.linear && !first ? nextUsed(b, current) : b.current;
    };
    // the end of a pattern: on to the next repeat, block or pattern. False when a song that does not loop has ended.
    const wrap = () => {
        step = 0; slot++;
        const after = bank();
        if (songMode(after)) {
            rep++;
            if (rep >= (after.song[Math.min(songAt, after.song.length - 1)]?.n ?? 1)) {
                rep = 0;
                if (!after.holdBlock) {
                    songAt++;
                    if (songAt > lastBlock(after)) {
                        if (after.songLoop === false) { endSong(); return false; }
                        songAt = firstBlock(after);
                    }
                }
            }
        }
        current = choose();
        return true;
    };
    const lengthOf = () => Math.max(1, bank().lengths[current] || 16);
    const playStep = () => {
        const b = bank(), len = lengthOf(), bpm = b.tempos[current] || tempo(), stepSec = 60 / bpm / 4;
        const events = makeEvents(pattern(b.patterns[current], { bank: b, index: current }), step, { time: nextTime, stepSec, swing: swing(), flam: flam(), count, cycle: slot, fill: fill(), length: len, free: !!b.freeRun });
        clock?.record({ count, time: nextTime, stepSec, pattern: current, step, length: len });
        const info = { pattern: current, step, time: nextTime, count, song: songMode(b) ? { index: songAt, rep } : null };
        if (events.length) emit(events, info);
        onStep?.(info);
        nextTime += stepSec; count++;
        if (++step >= len) wrap();
    };
    // the song ended (loop off): stop booking; the host stops its transport when the last step has sounded
    const endSong = () => { if (timer !== null) { timers.clear(timer); timer = null; } primed = false; paused = false; songValid = false; clock?.halt(now(), { forget: true }); onEnd?.({ time: nextTime }); };
    const tick = () => { const horizon = now() + lookahead; while (timer !== null && nextTime < horizon) playStep(); };
    const prime = () => {
        step = 0; slot = 0; count = 0; clock?.reset();
        const first = bank();
        // the song's place is kept while the pattern alone is played and through a stop from the sequencer; a stop from the arranger rewinds it
        if (!songValid) { rep = 0; songAt = first.song?.length ? firstBlock(first) : 0; songValid = true; }
        current = choose(true); primed = true;
    };
    const run = (delay) => { nextTime = now() + delay; timer = timers.set(tick, interval); tick(); };
    return {
        get running() { return timer !== null; },
        get scope() { return scope; },
        setScope(next) { scope = next === 'pattern' ? 'pattern' : 'song'; },
        get paused() { return primed && timer === null && paused; },
        /** Where the next step will be played: { pattern, step, block, rep }. */
        get position() { return { pattern: current, step, block: songAt, rep }; },
        start(delay = 0.06, startScope = 'song') {
            if (timer !== null) return;
            scope = startScope === 'pattern' ? 'pattern' : 'song';
            prime(); paused = false; run(delay);
        },
        pause() { if (timer === null) return; timers.clear(timer); timer = null; paused = true; clock?.halt(now()); },
        resume(delay = 0.06) { if (timer !== null || !primed) return; paused = false; run(delay); },
        stop(rewindSong = true) { if (timer !== null) { timers.clear(timer); timer = null; } clock?.halt(now(), { forget: true }); primed = false; paused = false; if (rewindSong) songValid = false; },
        stepBy(delta) {
            const running = timer !== null;
            if (!primed) prime();
            const len = lengthOf();
            if (running) {
                if (delta > 0) { step++; if (step >= len) wrap(); } else step = (step - 1 + len) % len;
                return;
            }
            // not running: walk the pattern, playing each step reached
            if (delta < 0) step = (step - 2 + 2 * len) % len;
            paused = true;
            nextTime = now() + 0.03; playStep();
        },
        gotoBlock(i) {
            const b = bank();
            if (!primed || !songMode(b)) return;
            songAt = Math.max(0, Math.min(i, b.song.length - 1)); rep = 0; step = 0; current = choose();
        },
        gotoPattern(p) { if (primed) { step = 0; current = p; } },
    };
}
