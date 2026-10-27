import { renderCalibratedPiano, isCalibratedPiano, preloadCalibratedPiano, CALIBRATED_TYPES } from './calibratedPiano';
import { renderPiano, pianoBuffer } from './piano';
import { magnitudeSpectrum, peakNear } from './pianoModel/dsp';
import { findPreset } from '../editor/presetStore';

const SR = 44100;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const rms = (x, a, b) => { let s = 0; for (let i = Math.round(a * SR); i < Math.min(x.length, Math.round(b * SR)); i++) s += x[i] ** 2; return Math.sqrt(s / ((b - a) * SR)); };
const dB = (a, b) => 20 * Math.log10((a + 1e-12) / (b + 1e-12));
// energy above 1 kHz against below 700 Hz in a window: a bright note is large, a dull one small
const brightness = (x) => {
    const spec = magnitudeSpectrum(x, SR, Math.round(.05 * SR), Math.round(.4 * SR), 2);
    let lo = 0, hi = 0;
    for (let k = 1; k < spec.mag.length; k++) { const f = k * spec.hz; if (f < 700) lo += spec.mag[k] ** 2; else if (f > 1000 && f < 8000) hi += spec.mag[k] ** 2; }
    return 10 * Math.log10(hi / lo);
};

test('the measured piano is a piano type, found by the engine, in the library under the names a share link can carry', () => {
    expect(CALIBRATED_TYPES).toContain('measured');
    expect(isCalibratedPiano('measured')).toBe(true); expect(isCalibratedPiano('grand')).toBe(false); expect(isCalibratedPiano('toString')).toBe(false);
    const preset = findPreset('Studio Concert v2');
    expect(preset.stringModel).toBe('piano'); expect(preset.pianoType).toBe('measured');
});

test('every key plays a finite, bounded note at the pitch the engine asked for, whatever the tuning', () => {
    for (const midi of [21, 33, 48, 60, 72, 84, 100]) for (const cents of [0, -25, 30]) {
        const f = hz(midi) * 2 ** (cents / 1200), x = renderCalibratedPiano(SR, f, { velocity: .7 });
        expect(x.every(Number.isFinite)).toBe(true);
        let peak = 0;
        for (const v of x) peak = Math.max(peak, Math.abs(v));
        expect(peak).toBeLessThanOrEqual(.851);
        const spec = magnitudeSpectrum(x, SR, Math.round(.05 * SR), Math.round(Math.min(.8, x.length / SR - .1) * SR), 8);
        // the lowest strings put almost nothing into their first partial, so there the second stands for the pitch
        const target = midi < 36 ? 2 * f : f, found = peakNear(spec, target, .03).f;
        expect(Math.abs(1200 * Math.log2(found / target)), `midi ${midi} ${cents}c`).toBeLessThan(midi > 96 ? 40 : 15);
    }
});

test('a harder blow is brighter, not just louder, and notes of different strengths have the same low-band weight', () => {
    const soft = renderCalibratedPiano(SR, hz(48), { velocity: .25 }), hard = renderCalibratedPiano(SR, hz(48), { velocity: .95 });
    expect(brightness(hard)).toBeGreaterThan(brightness(soft) + 6);
    expect(Math.abs(dB(rms(soft, .3, .6), rms(hard, .3, .6)))).toBeLessThan(4);
});

test('notes keep the natural loudness curve: the top is quieter than the middle, at one strength', () => {
    const level = (midi) => rms(renderCalibratedPiano(SR, hz(midi), { velocity: .7 }), .05, .5);
    expect(dB(level(60), level(96))).toBeGreaterThan(5);
    expect(dB(level(60), level(96))).toBeLessThan(25);
});

test('the engine path (renderPiano, the cached pianoBuffer) reaches the same notes, deterministically', () => {
    const a = renderPiano(SR, hz(55), { type: 'measured', decay: 2.8, velocity: .6, seed: 11 }), b = renderCalibratedPiano(SR, hz(55), { velocity: .6, seed: 11 });
    expect(a.length).toBe(b.length); expect(a[1000]).toBe(b[1000]);
    expect(renderCalibratedPiano(SR, hz(55), { velocity: .6, seed: 11 })).toEqual(b);
    expect(typeof pianoBuffer).toBe('function');
});

test('decay and unison scale how the note dies and beats', () => {
    const short = renderCalibratedPiano(SR, hz(50), { decay: 1.2, velocity: .7 }), long = renderCalibratedPiano(SR, hz(50), { decay: 4.5, velocity: .7 });
    expect(dB(rms(long, 2, 3), rms(short, 2, 3))).toBeGreaterThan(6);
    const still = renderCalibratedPiano(SR, hz(50), { unison: 0, velocity: .7 }), worn = renderCalibratedPiano(SR, hz(50), { unison: 1, velocity: .7 });
    expect(still.some((v, i) => Math.abs(v - worn[i]) > 1e-4)).toBe(true);
});

test('a measured piano can be made ready ahead of time, whatever it is asked for', () => {
    expect(() => preloadCalibratedPiano()).not.toThrow();
    expect(() => preloadCalibratedPiano('measured')).not.toThrow();
    expect(() => preloadCalibratedPiano(['grand', 'nothing', 'measuredSoft'])).not.toThrow();
});

test('every measured piano plays a finite note from the packed (format 2) table, and its library preset exists', async () => {
    const library = (await import('../../library/voices.json')).default.Pianos;
    for (const type of CALIBRATED_TYPES) {
        const x = renderCalibratedPiano(SR, hz(72), { type, velocity: .6 });
        expect(x.every(Number.isFinite), type).toBe(true);
        expect(x.some((v) => Math.abs(v) > 1e-3), type).toBe(true);
        expect(Object.values(library).some((p) => p.pianoType === type), type).toBe(true);
    }
});
