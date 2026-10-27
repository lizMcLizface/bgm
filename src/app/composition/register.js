// The ear is most sensitive between about 2 and 5 kHz, which is where the partials of a high
// note (and of a bell at any height) pile up, so the top of the lead and counter register jumps
// out of a mix that was levelled at middle pitches. Notes above the comfortable register play a
// little softer, and bell-like voices (pure, ringing partials) start earlier and fall further.
// This is a level on the note's velocity, so it holds for every sound engine.
const ABOVE = 79; // G5
const BELLS = /bell|glass|chime|celesta|music.?box|vibe|tine|mallet|glock|bowl/i;
const DB_PER_SEMITONE = 0.28, BELL_DB_PER_SEMITONE = 0.38, BELL_FROM = 72, FLOOR = 0.5;

export function registerLevel(midi, bell = false) {
    const from = bell ? BELL_FROM : ABOVE, over = midi - from;
    if (over <= 0) return 1;
    return Math.max(FLOOR, 10 ** (-over * (bell ? BELL_DB_PER_SEMITONE : DB_PER_SEMITONE) / 20));
}

export function tameHighRegister(events, { voices = {} } = {}) {
    for (const e of events) {
        if (e.role !== 'lead' && e.role !== 'counter') continue;
        e.velocity *= registerLevel(e.midi, BELLS.test(voices[e.role]?.name ?? ''));
    }
    return events;
}
