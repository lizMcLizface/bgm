// Portamento (settings.portamento, per role 0..1): a note glides from the pitch of the one before it.
// Performance only - the written notes stay as they are. It uses the slide every engine already plays
// (expression.slideFromMidi / slideSeconds, engine/Instrument.js and labs/noteEvents.js).
const ROLES = ['lead', 'counter', 'bass'];
const MAX_SECONDS = 0.3, MAX_STEP = { lead: 9, counter: 9, bass: 12 };

/**
 * Notes that follow another of their role closely get a slide from it. \`previous\` is the bar before
 * (its events), so a glide can cross the bar line. A chord (notes at one moment) glides from nothing:
 * the line is the lowest note of each moment for the bass, the highest for the lead and second lead.
 */
export function glideNotes(events, { previous = [], units = 4, secondsPerBeat = 1, amounts = {} } = {}) {
    for (const role of ROLES) {
        const amount = amounts[role] ?? 0;
        if (!(amount > 0)) continue;
        const pick = (list) => {
            const moments = [];
            for (const e of [...list].sort((a, b) => a.beat - b.beat || a.midi - b.midi)) {
                const last = moments.at(-1);
                if (last && Math.abs(last[0].beat - e.beat) < 1e-5) last.push(e); else moments.push([e]);
            }
            return moments.map((m) => (role === 'bass' ? m[0] : m.at(-1)));
        };
        const line = pick([...previous.filter((e) => e.role === role).map((e) => ({ ...e, beat: e.beat - units, old: true })), ...events.filter((e) => e.role === role)]);
        for (let i = 1; i < line.length; i++) {
            const note = line[i], before = line[i - 1];
            if (note.old) continue;
            const step = Math.abs(note.midi - before.midi), gap = (note.beat - before.beat - before.length) * secondsPerBeat;
            const seconds = note.length * secondsPerBeat;
            if (step < 1 || step > MAX_STEP[role] || gap > 0.12 + 0.2 * amount || seconds < 0.08) continue;
            if (note.expression?.slideFromMidi !== undefined && note.expression.slideFromMidi !== null) continue;
            note.expression = { ...note.expression, slideFromMidi: before.midi, slideSeconds: Math.max(0.02, Math.min(amount * MAX_SECONDS, seconds * 0.8)) };
        }
    }
    return events;
}
