// A synth as a sequencer target (docs/SEQUENCER_SYSTEM_PLAN.md): a note event becomes a timed note-on and note-off on the live synth engine (synths/engine/liveSynth.js).
// Every note gets an id of its own, so a note that is played again before the last one ends cannot cut it short.
const FIRST_ID = 4000, IDS = 4096;

/** @param live () => the live engine ({ noteOn(id, note, velocity, time), noteOff(id, time) }) or null */
export function synthTarget(live, { firstId = FIRST_ID } = {}) {
    let next = 0;
    return {
        id: 'synth',
        trigger(event) {
            const engine = live();
            if (!engine || event.type === 'off' || !Number.isFinite(event.note)) return;
            const id = firstId + (next++ % IDS);
            engine.noteOn(id, event.note, event.velocity, event.time);
            engine.noteOff(id, event.time + event.duration);
        },
        /** Lets everything go now (the transport stopped). */
        release() { live()?.panic?.(); },
    };
}
