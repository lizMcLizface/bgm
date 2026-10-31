// Mood (settings.mood): a harmonic colour slider, suspended and hazy on the left, lush and bright on the right.
//   level: -1 (suspended: sus2/sus4 chords that never settle into major or minor, sevenths on them, minor
//          borrowing in a major key, a closed tone) .. +1 (lush: added sixths and ninths, then sevenths, ninth and
//          thirteenth chords on most chords, major borrowing in a minor key, a brighter touch); 0 is the preset as made.
// Unlike intensity it leaves the rhythm and the tempo alone; it changes which notes the chords have.
// applyMood puts the level over the settings for one bar's planning (as applyPush does); the chord colour per
// chord comes from moodColour, which Generator.colourFor asks with a seeded roll per chord, so a bar plans
// the same each time and a rising level only ever colours more chords. The tone is moodTone, from planBar.
import { scaleById, scaleSemitones } from '../theory';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export const defaultMood = () => ({ level: 0 });
export const moodActive = (mood) => !!mood && mood.level !== 0;

/** How fast a manual change of the level moves, per second of music: a full swing (2) takes 20 seconds. */
export const MOOD_RATE = 0.1;
/** The level a bar plays at: a step from the bar before's toward the slider, so the chords turn over gradually. */
export function glideMood(previous, target, seconds) {
    if (!Number.isFinite(previous)) return target;
    const step = MOOD_RATE * Math.max(0, seconds);
    return previous + Math.max(-step, Math.min(step, target - previous));
}

export const MOOD_LABELS = [[-0.8, 'Suspended'], [-0.45, 'Hazy'], [-0.1, 'Open'], [0.1, 'As made'], [0.45, 'Warm'], [0.8, 'Lush'], [Infinity, 'Radiant']];
export const moodLabel = (level) => MOOD_LABELS.find(([limit]) => level < limit)[1];

const pick = (table, u) => {
    const total = table.reduce((a, [, w]) => a + w, 0);
    let at = u * total;
    for (const [colour, w] of table) { if (at < w) return colour; at -= w; }
    return table.at(-1)[0];
};

/**
 * The colour of one chord at `level`, or null for the chord as the preset has it. `roll` is the chord's
 * seeded 0..1: the share of chords coloured is a function of the level, and which colour of them comes from
 * the roll too. Colours are diatonicChord's: 'floating' (a sus2 over a major chord, a sus4 over a minor),
 * '+7', '+9' and '+13' make the chord a seventh, a ninth or a thirteenth chord, 'flat2' adds the clashing minor ninth.
 */
export function moodColour(level, roll) {
    const up = Math.max(0, level), down = Math.max(0, -level), share = up ? clamp(up * 1.6) : clamp(down * 1.5);
    if (!share || roll >= share) return null;
    const u = roll / share;
    if (up) return pick([['add6', 0.35 * (1 - up)], ['add9', 1 - up], ['plain+7', 0.6 * (1 - up * up)], ['plain+9', up * up], ['plain+13', 1.6 * up * up]], u);
    return pick([['floating', 1], ['floating+7', 1.2 * down], ['flat2', 3 * Math.max(0, down - 0.8)]], u);
}

// minor (a flat third) or major home: borrowing in a major key brings the dark chords (iv, bVI, bVII), in a minor key the bright ones (IV, V)
function minorHome(mode) {
    try {
        const scale = scaleSemitones(scaleById(mode).intervals);
        return scale.length === 7 ? scale[2] === 3 : null;
    } catch { return null; }
}

export function applyMood(settings, level) {
    const L = clamp(level, -1, 1);
    if (!L) return settings;
    const up = Math.max(0, L), down = Math.max(0, -L);
    const s = { ...settings, moodLevel: L };
    const minor = minorHome(settings.mode);
    if (minor !== null) {
        const darkens = !minor, share = settings.chordBorrow ?? 0;
        s.chordBorrow = (L < 0) === darkens ? clamp(Math.max(share, 0.4 * Math.abs(L))) : clamp(share * (1 - Math.abs(L)));
    }
    if (s.progressionMode === 'generated' && s.progressionMood) s.progressionMood = { ...s.progressionMood, brightness: clamp((s.progressionMood.brightness ?? 0) + 0.8 * L, -1, 1) };
    const d = s.dynamics ?? { level: 1, range: 1, attack: 0, brightness: 0 };
    s.dynamics = { ...d, brightness: clamp(d.brightness + 0.4 * up), attack: clamp(d.attack - 0.3 * up + 0.3 * down) };
    s.sectionSpace = clamp((s.sectionSpace ?? 0) + 0.25 * down - 0.1 * up);
    return s;
}

/** Suspended and hazy close the tone: a low-pass at about 7 kHz at the far left (on top of the arc's, the feel pad's and intensity's). */
export const moodTone = (tone, level) => (level < 0 ? Math.min(tone, 20000 * 2 ** (level * 1.5)) : tone);
