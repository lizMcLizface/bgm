// How the pad's chords are voiced against the bass. PAD_ROOT=unlessBass CHORD_SIZE=functional force the settings on every preset (npx vitest run --config tools/vitest.audit.config.js tools/padAudit.audit.js)
import Generator from '../src/app/Generator';
import { BROWSABLE_SCENES, sceneSettings, sceneSlug } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

test('pad voicing audit', () => {
    const rows = [];
    for (const scene of BROWSABLE_SCENES) {
        const s0 = sceneSettings(scene, 1);
        if (s0.playMusic === false) continue;
        const g = new Generator({ ...s0, humanize: { timing: 0, velocity: 0, detune: 0 }, swing: 0,
            ...(process.env.PAD_ROOT ? { padRoot: process.env.PAD_ROOT } : {}), ...(process.env.CHORD_SIZE ? { chordSize: process.env.CHORD_SIZE } : {}), ...(process.env.PAD_CONTOUR ? { padContour: Number(process.env.PAD_CONTOUR) } : {}) });
        applyBook(g, inheritBook(scene.rulebook));
        const pl = g.planner();
        for (let b = 0; b < 96; b++) pl.planBar(b);
        const bars = [...pl.plan.values()].sort((a, z) => a.bar - z.bar);
        let prev = null, prevBass = null, contraryCount = 0, contraryTotal = 0, arc = [], chords = 0, rootInPad = 0, rootOctaveDouble = 0, bassBarsWithRoot = 0, spans = [], moves = [], lows = [], sevenths = 0, sizes = new Set(), padBars = 0;
        for (const b of bars) {
            const pad = b.events.filter((e) => e.role === 'pad'), bass = b.events.filter((e) => e.role === 'bass');
            if (!pad.length) continue;
            padBars++;
            const root = b.chord.pitchClasses[0], notes = [...new Set(pad.map((e) => e.midi))].sort((a, z) => a - z);
            sizes.add(b.chord.pitchClasses.length);
            if (b.chord.pitchClasses.length >= 4) sevenths++;
            if (notes.some((m) => m % 12 === root)) rootInPad++;
            if (bass.some((e) => e.midi % 12 === root) && notes.some((m) => m % 12 === root)) bassBarsWithRoot++;
            if (bass.some((e) => notes.some((m) => m % 12 === e.midi % 12 && m > e.midi && (m - e.midi) % 12 === 0))) rootOctaveDouble++;
            spans.push(notes.at(-1) - notes[0]); lows.push(notes[0]);
            const bassLow = bass.length ? Math.min(...bass.map((e) => e.midi)) : null;
            if (prev && b.chord.name !== prev.name && bassLow !== null && prevBass !== null && bassLow !== prevBass && notes.at(-1) !== prev.notes.at(-1)) { contraryTotal++; if (Math.sign(bassLow - prevBass) !== Math.sign(notes.at(-1) - prev.notes.at(-1))) contraryCount++; }
            if (bassLow !== null) prevBass = bassLow;
            { const len = b.state?.composition?.phrase?.bars ?? 4, at = (b.bar - (b.state?.phrase?.start ?? 0) + 0.5) / len; arc.push({ pos: at, centre: mean(notes) }); }
            if (prev && prev.length === notes.length && b.chord.name !== prev.name) moves.push(mean(notes.map((m, i) => Math.abs(m - prev.notes[i]))));
            prev = { notes, length: notes.length, name: b.chord.name };
            chords++;
        }
        if (chords > 8) rows.push({ name: scene.name, size: [...sizes].join('/'), seventh: sevenths / chords, rootInPad: rootInPad / chords, rootAndBass: bassBarsWithRoot / chords, span: mean(spans), low: mean(lows), move: moves.length ? mean(moves) : null, contrary: contraryTotal ? contraryCount / contraryTotal : null, arcRise: mean(arc.filter((a) => a.pos > 0.25 && a.pos < 0.75).map((a) => a.centre)) - mean(arc.filter((a) => a.pos <= 0.25 || a.pos >= 0.75).map((a) => a.centre)), moveCount: moves.length });
    }
    const f = (xs) => `${mean(xs).toFixed(2)} (p10 ${q(xs, .1).toFixed(2)}, p90 ${q(xs, .9).toFixed(2)})`;
    console.log('PRESETS', rows.length,
        '\nchord size 3:', rows.filter((r) => r.size === '3').length, ' 4:', rows.filter((r) => r.size === '4').length, ' 5:', rows.filter((r) => r.size === '5').length, ' mixed:', rows.filter((r) => r.size.includes('/')).length,
        '\nroot pitch class in the pad:', f(rows.map((r) => r.rootInPad)),
        '\nroot in pad AND in bass the same bar:', f(rows.map((r) => r.rootAndBass)),
        '\npad span semitones:', f(rows.map((r) => r.span)),
        '\npad lowest note (mean MIDI):', f(rows.map((r) => r.low)),
        '\npad top against the bass at a chord change:', f(rows.filter((r) => r.contrary !== null).map((r) => r.contrary)),
        '\nmiddle bars of a phrase minus end bars, pad centre (semitones):', f(rows.map((r) => r.arcRise)),
        '\nmean semitones each voice moves at a chord change:', f(rows.filter((r) => r.move !== null).map((r) => r.move)));
});
