import { applyMood, glideMood, moodColour, moodTone, moodLabel, MOOD_RATE } from './mood';
import { diatonicChord, scaleSemitones, scaleById } from '../theory';
import { defaultSettings, sanitizeSettings } from '../settings';

const major = scaleSemitones(scaleById('Major-1').intervals);

test('mood colours nothing at 0, more chords as the level grows, and the sus side and the lush side differ', () => {
    const rolls = Array.from({ length: 200 }, (_, i) => (i + 0.5) / 200);
    const coloured = (level) => rolls.filter((r) => moodColour(level, r)).length;
    expect(coloured(0)).toBe(0);
    expect(coloured(0.3)).toBeLessThan(coloured(0.6));
    expect(coloured(-0.3)).toBeLessThan(coloured(-0.6));
    expect(coloured(1)).toBe(200);
    expect(coloured(-1)).toBe(200);
    // a chord coloured at a level stays coloured at a stronger one
    for (const r of rolls) if (moodColour(0.4, r)) expect(moodColour(0.7, r)).not.toBeNull();
    const left = new Set(rolls.map((r) => moodColour(-1, r))), right = new Set(rolls.map((r) => moodColour(1, r)));
    expect([...left].every((c) => /floating|flat2/.test(c))).toBe(true);
    expect(right.has('plain+13')).toBe(true);
    expect([...right].some((c) => /floating/.test(c))).toBe(false);
});

test('the colours make the chords: sus on the left, sevenths and ninths on the right', () => {
    expect(diatonicChord(major, 1, 3, 'floating')).toEqual([0, 2, 7]);          // Csus2
    expect(diatonicChord(major, 2, 3, 'floating')).toEqual([2, 7, 9]);          // Dsus4
    expect(diatonicChord(major, 2, 3, 'floating+7')).toEqual([2, 7, 9, 12]);     // D7sus4
    expect(diatonicChord(major, 1, 3, 'plain+7')).toEqual([0, 4, 7, 11]);        // Cmaj7
    expect(diatonicChord(major, 1, 3, 'plain+9')).toEqual([0, 4, 7, 11, 14]);    // Cmaj9
    expect(diatonicChord(major, 1, 3, 'plain+13')).toEqual([0, 4, 7, 11, 14, 21]); // C13 without the eleventh
    expect(diatonicChord(major, 1, 3, 'add9')).toEqual([0, 4, 7, 14]);
});

test('applyMood leaves 0 alone, never mutates, and moves the borrowing and the touch the way the level goes', () => {
    const settings = { ...defaultSettings(), mode: 'Major-1', chordBorrow: 0 };
    const before = structuredClone(settings);
    expect(applyMood(settings, 0)).toBe(settings);
    const dark = applyMood(settings, -1), bright = applyMood(settings, 1);
    expect(settings).toEqual(before);
    expect(dark.chordBorrow).toBeGreaterThan(0);   // the minor iv / bVI of a major key
    expect(bright.chordBorrow).toBe(0);            // would darken a major key
    expect(bright.dynamics.brightness).toBeGreaterThan(settings.dynamics.brightness);
    expect(dark.moodLevel).toBe(-1);
    const minor = applyMood({ ...settings, mode: 'Major-6' }, 1);
    expect(minor.chordBorrow).toBeGreaterThan(0);  // the major IV / V of a minor key
});

test('the level glides, the tone closes only on the left, the labels run suspended to radiant', () => {
    expect(glideMood(undefined, 0.7, 2)).toBe(0.7);
    expect(glideMood(0, 1, 1)).toBeCloseTo(MOOD_RATE, 9);
    expect(glideMood(0.5, -1, 100)).toBe(-1);
    expect(moodTone(15000, 0.8)).toBe(15000);
    expect(moodTone(15000, -1)).toBeLessThan(8000);
    expect([-1, -0.5, 0, 0.5, 0.9].map(moodLabel)).toEqual(['Suspended', 'Hazy', 'As made', 'Lush', 'Radiant']);
});

test('the setting is sanitised to -1..1', () => {
    expect(sanitizeSettings({ mood: { level: 5 } }).mood.level).toBe(1);
    expect(defaultSettings().mood.level).toBe(0);
});
