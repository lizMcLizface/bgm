import { notesInRange } from '../arranger';

// The band joins a styled song (melodicStyle.js, settings.melodyParts): the bass plays the theme's rhythm and shape on
// chord tones, and a rhythmic chord part makes an ostinato of its opening bars. Both come from the theme itself, so they
// follow it when it changes. A walking bass and held chords keep their own idiom.
export const SONG_RHYTHM_STYLES = ['pulse', 'arpeggio', 'sequence'];
const BASS_NOTES = { whole: 2, half: 3 };
const EPS = 0.01;

/** Whether a preset has a part the switch can change: a bass that is not only walking; rhythmic chords, unless programmed sequencer lanes play them. */
export function songPartCan(settings, part) {
    const sum = (weights, keys) => keys.reduce((total, key) => total + (weights?.[key] ?? 0), 0);
    if (part === 'bass') return sum(settings.bassWeights, ['whole', 'half', 'drive']) > 0;
    if (settings.sequencer?.on && settings.sequencer.arrangement && settings.sequencer.lanes) return false;
    return ['rhythm', 'split'].includes(settings.layers) || sum(settings.padWeights, SONG_RHYTHM_STYLES) > 0;
}

const nearest = (notes, target) => notes.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best), notes[0]);

/** Which notes of a theme bar the bass takes: the downbeat, then the accented and long ones, not too close together. */
export function bassOnsets(notes, { meter, cap = 4 }) {
    const gap = meter.unitsPerBeat * 0.5, chosen = [0];
    const ranked = [...notes].filter((n) => n.beat > EPS).sort((a, z) => (z.accent ? 1 : 0) - (a.accent ? 1 : 0) || z.length - a.length || a.beat - z.beat);
    for (const note of ranked) {
        if (chosen.length >= cap) break;
        if (chosen.every((at) => Math.abs(at - note.beat) >= gap)) chosen.push(note.beat);
    }
    return chosen.sort((a, z) => a - z);
}

/** The chord tone for a place in the tune: its height above or below where the bar began, in scale degrees. */
function bassTone(rise, { root, chord, range }) {
    const [, third, fifth] = chord.pitchClasses;
    // The way the tune goes if that is at most a fifth away, else the nearer one: a bass line should not fall a sixth for a third.
    const near = (pc) => {
        const notes = notesInRange([pc], range[0], range[1]);
        if (!notes.length) return root;
        const way = notes.filter((n) => Math.sign(n - root) === Math.sign(rise) && Math.abs(n - root) <= 7);
        return nearest(way.length ? way : notes, root);
    };
    if (rise === 0) return root;
    if (rise >= 4 && root + 12 <= range[1]) return root + 12;
    if (Math.abs(rise) === 1 && third !== undefined) return near(third);
    return fifth === undefined ? root : near(fifth);
}

/** The bass of one bar in the song. `drive` keeps its pulse and only colours the notes that fall with the tune's. */
export function songBass(events, { notes, style, chord, range, meter }) {
    if (!events.length || !notes?.length || !chord?.pitchClasses?.length) return events;
    const pc = chord.pitchClasses[0], inRange = notesInRange([pc], range[0], range[1]);
    const root = inRange.length ? nearest(inRange, events[0].midi) : events[0].midi;
    const heightAt = (beat) => (notes.find((n) => Math.abs(n.beat - beat) < EPS)?.degree ?? notes[0].degree) - notes[0].degree;
    const tone = (beat) => bassTone(heightAt(beat), { root, chord, range });
    if (style === 'drive') return events.map((e) => (e.beat > EPS && notes.some((n) => Math.abs(n.beat - e.beat) < EPS) ? { ...e, midi: tone(e.beat) } : e));
    const velocity = events[0].velocity, onsets = bassOnsets(notes, { meter, cap: BASS_NOTES[style] ?? 4 });
    return onsets.map((beat, i) => ({ ...events[0], beat, midi: i ? tone(beat) : root, velocity: i ? velocity * 0.85 : velocity,
        length: ((onsets[i + 1] ?? meter.units) - beat) * 0.92 }));
}

/** Whether a part runs on even steps of at least two a beat: that steady motion is its character, whatever the tune does. */
export function isRunning(events, meter) {
    const beats = [...new Set(events.map((e) => Math.round(e.beat * 1000) / 1000))].sort((a, z) => a - z);
    if (beats.length < 2 * meter.units / meter.unitsPerBeat) return false;
    const step = beats[1] - beats[0];
    return beats.every((at, i) => !i || Math.abs(at - beats[i - 1] - step) < EPS);
}

/**
 * A rhythmic chord part in the song, at about its own busyness. A running part keeps every attack, and the tune shows as accents
 * and, when single notes, as its shape. Any other becomes an ostinato on the theme's rhythm, its chord tones following the tune.
 */
export function songRhythm(events, { notes, style, meter }) {
    if (!events.length || !notes?.length) return events;
    const tones = [...new Set(events.map((e) => e.midi))].sort((a, z) => a - z);
    if (isRunning(events, meter)) {
        const beats = [...new Set(events.map((e) => e.beat))].sort((a, z) => a - z), step = beats[1] - beats[0];
        const low = Math.min(...notes.map((n) => n.degree)), span = Math.max(...notes.map((n) => n.degree)) - low;
        const landing = (beat) => notes.find((n) => Math.abs(n.beat - beat) <= step / 2 + EPS && n.beat - beat > -step / 2 - EPS);
        return events.map((e) => {
            const note = landing(e.beat);
            if (!note) return { ...e, velocity: e.velocity * 0.78 };
            return { ...e, ...(style === 'pulse' || !span ? {} : { midi: tones[Math.round((note.degree - low) / span * (tones.length - 1))] }) };
        });
    }
    const before = new Set(events.map((e) => Math.round(e.beat * 1000))).size;
    const grid = meter.unitsPerBeat === 3 ? 1 : 0.25, snap = (at) => Math.round(at / grid) * grid;
    // The cell repeats within the bar until the part is about as busy as it was: a sparse tune must not take its drive away.
    const repeats = notes.length >= before * 0.7 ? 1 : notes.length * 2 >= before * 0.7 ? 2 : 4;
    const cell = Array.from({ length: repeats }, (_, r) => notes.map((n) => ({ ...n, turn: r, beat: snap((n.beat + r * meter.units) / repeats) }))).flat();
    const onsets = cell.filter((n, i) => n.beat < meter.units && !cell.slice(0, i).some((o) => Math.abs(o.beat - n.beat) < EPS));
    const degrees = notes.map((n) => n.degree), low = Math.min(...degrees), span = Math.max(...degrees) - low;
    const lengths = events.map((e) => e.length).sort((a, z) => a - z), usual = lengths[lengths.length >> 1];
    const velocity = events.reduce((sum, e) => sum + e.velocity, 0) / events.length;
    const stacked = style === 'pulse';
    return onsets.flatMap((note, i) => {
        const room = (onsets[i + 1]?.beat ?? meter.units) - note.beat, length = Math.min(usual, room * 0.95), level = velocity * (note.accent ? 1 : 0.85);
        // (each repeat of the cell starts a chord tone higher, and a tune that stays on one note walks up the chord: an arpeggio must not become one repeated note)
        const height = span ? Math.round((note.degree - low) / span * (tones.length - 1)) + (note.turn ?? 0) : i;
        const midis = stacked ? tones : [tones[height % tones.length]];
        return midis.map((midi) => ({ ...events[0], beat: note.beat, midi, length, velocity: level }));
    });
}
