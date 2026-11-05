// The bass line (Silverbox, a TB-303-style synth) as a sequencer target: a pattern is sixteen steps of
// { kind: 0 rest | 1 note | 2 tie, note: 0-12 semitones above C2, flags: 1 accent | 2 slide | 4 octave up | 8 octave down },
// and trigger() turns an event into a timed note on or off for the engine. The engine's bass voice treats a note that
// starts while another is held as a slide, and a velocity above 0.85 as an accent (tb303.rs, note_on), so a slide is a
// note that begins before the last one ends, and nothing here needs to know more about the voice than that.

export const BASS_KEY = 700;
const BASE_NOTE = 36; // C2, as the engine's own sequencer plays step 0
const FLAG = { accent: 1, slide: 2, up: 4, down: 8 };
const GATE = 0.6; // of a step, as in the engine's own sequencer
export const ACCENT_VELOCITY = 0.95;
export const PLAIN_VELOCITY = 0.7;

/** The note a step plays, as a MIDI number. */
export const stepNote = (step) => BASE_NOTE + step.note + (step.flags & FLAG.up ? 12 : step.flags & FLAG.down ? -12 : 0);

/** The pattern as the scheduler gives it to bassStepEvents: its steps and how many of them play. */
export const bassPattern = () => (pattern, ctx) => ({ steps: pattern, length: Math.max(1, ctx?.bank?.lengths?.[ctx.index] ?? pattern.length) });

/**
 * The events one step plays: a note on, and when the note ends, a note off. Ties hold the note through the steps that
 * follow; a slide holds it into the next note (which then starts legato); otherwise the gate closes at 60% of a step.
 * `time` is the step's start on the audio clock, `stepSec` its length; swing delays odd steps like the drum machines.
 */
export function bassStepEvents(pattern, step, { time, stepSec, swing = 0.5 }) {
    const { steps, length } = pattern, st = steps[step];
    if (!st || st.kind !== 1) return [];
    const delay = step % 2 === 1 ? (Math.min(0.75, Math.max(0.5, swing)) - 0.5) * 2 * stepSec : 0, at = time + delay;
    // ties that follow the note keep its gate open
    let span = 0;
    while (span < length - 1 && steps[(step + span + 1) % length]?.kind === 2) span++;
    const next = steps[(step + span + 1) % length], slides = !!(st.flags & FLAG.slide);
    const events = [{ type: 'on', time: at, note: stepNote(st), velocity: st.flags & FLAG.accent ? ACCENT_VELOCITY : PLAIN_VELOCITY }];
    if (slides && span === 0 && next?.kind === 1) return events; // the next note starts before this one ends: a slide
    if (slides && span === 0) events.push({ type: 'off', time: time + stepSec });
    else events.push({ type: 'off', time: time + (span + GATE) * stepSec + delay });
    return events;
}

/** @param live () => the live synth engine ({ noteOn(id, note, velocity, time), noteOff(id, time) }) or null */
export function bassTarget(live) {
    return {
        id: 'tb303',
        trigger(event) {
            const engine = live();
            if (!engine) return;
            if (event.type === 'off') engine.noteOff(BASS_KEY, event.time);
            else engine.noteOn(BASS_KEY, event.note, event.velocity, event.time);
        },
    };
}
