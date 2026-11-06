// The z-plane filter's sections as numbers, for the display (the sound is made by the 'rack-zplane' worklet in
// public/rack-fx-processor.js, which does the same sums; zplane.test.js checks that the two agree).
import {ZPLANE_SHAPES,ZPLANE_CUSTOM} from './zplaneShapes';

const SR = 48000;
const AUDIBLE = [60, 10000];
const shapeAt = (i, rows) => (Math.round(i) >= ZPLANE_CUSTOM && rows ? rows : ZPLANE_SHAPES[Math.max(0, Math.min(ZPLANE_SHAPES.length - 1, Math.round(i)))].sections);

/** The six sections for two shapes (`custom`: { a, b } rows for a side that uses its custom shape), a morph, a shift in octaves and a resonance: frequency, pole bandwidth, boost, and the pole and zero radius and angle. */
export function zplaneSections(a, b, morph, shift, q, sr = SR, custom = {}) {
    const A = shapeAt(a, custom.a), B = shapeAt(b, custom.b);
    const widen = 9 ** (0.5 - q), octave = 2 ** shift, nyquist = 0.45 * sr;
    return A.map(([fa, wa, da], s) => {
        const [fb, wb, db] = B[s];
        const freq = Math.max(20, Math.min(nyquist, Math.exp(Math.log(fa) * (1 - morph) + Math.log(fb) * morph) * octave));
        const bandwidth = Math.max(8, Math.min(8000, Math.exp(Math.log(wa) * (1 - morph) + Math.log(wb) * morph) * widen));
        const boost = Math.max(-30, Math.min(30, da + (db - da) * morph));
        const zeroBandwidth = Math.max(1, Math.min(20000, bandwidth * 10 ** (boost / 20)));
        return { freq, bandwidth, boost, theta: 2 * Math.PI * freq / sr, pole: Math.min(0.9995, Math.exp(-Math.PI * bandwidth / sr)), zero: Math.min(0.9995, Math.exp(-Math.PI * zeroBandwidth / sr)) };
    });
}

const sectionDb = (s, w) => {
    const c = Math.cos(s.theta), cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const b1 = -2 * s.zero * c, b2 = s.zero * s.zero, a1 = -2 * s.pole * c, a2 = s.pole * s.pole;
    const nr = 1 + b1 * cw + b2 * c2, ni = -(b1 * sw + b2 * s2), dr = 1 + a1 * cw + a2 * c2, di = -(a1 * sw + a2 * s2);
    return 10 * Math.log10((nr * nr + ni * ni + 1e-20) / (dr * dr + di * di + 1e-20));
};

/** The response in dB at the given frequencies, with the level compensation the worklet applies (the average dB over the audible range taken out). */
export function zplaneResponse(sections, freqs, sr = SR) {
    const used = sections.filter((s) => Math.abs(s.boost) >= 0.05); // a section with no boost does nothing
    const total = (hz) => used.reduce((db, s) => db + sectionDb(s, 2 * Math.PI * Math.min(hz, 0.45 * sr) / sr), 0);
    const points = 40, mean = Array.from({ length: points }, (_, i) => total(AUDIBLE[0] * (AUDIBLE[1] / AUDIBLE[0]) ** (i / (points - 1)))).reduce((x, y) => x + y, 0) / points;
    return freqs.map((hz) => total(hz) - mean);
}
