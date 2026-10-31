// How playable are the pad's planned chords? For every preset, the notes the pad strikes together (3 or more starting
// at the same moment) are measured against one hand's reach and a guitar neck's fingering.
//   VOICING_OUT=path npx vitest run --config tools/vitest.audit.config.js tools/voicingReach.audit.js
import fs from 'node:fs';
import Generator from '../src/app/Generator';
import { BROWSABLE_SCENES, sceneSettings, sceneSlug } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';
import { NECKS, foldIntoNeck, shapesFor } from '../src/app/heroFingering';

const HAND_NOTES = 5;
// Fits in two hands: some split point leaves each side within one hand's notes and reach.
const handsFit = (notes, reach) => {
    const oneHand = (n) => n.length <= HAND_NOTES && (n.length < 2 || n.at(-1) - n[0] <= reach);
    if (oneHand(notes)) return 1;
    for (let cut = 1; cut < notes.length; cut++) if (oneHand(notes.slice(0, cut)) && oneHand(notes.slice(cut))) return 2;
    return 0;
};

test('voicing reach', () => {
    const rows = [];
    for (const scene of BROWSABLE_SCENES) {
        if (!scene.voices?.pad) continue;
        const total = { strikes: 0, size: {}, spanOver9: 0, spanOver12: 0, over5: 0, oneHand12: 0, twoHands12: 0, neither12: 0, oneHand9: 0, twoHands9: 0, neither9: 0, soundMoments: 0, sounding6: 0, soundingSpan12: 0, soundingSpan17: 0, soundingMaxNotes: 0, guitarOk: 0, guitarDropped: 0, guitarStretch: 0, maxSpan: 0 };
        for (const seed of [1, 7]) {
            const g = new Generator({ ...sceneSettings(scene, seed), humanize: { timing: 0, velocity: 0, detune: 0 }, swing: 0 });
            applyBook(g, inheritBook(scene.rulebook));
            const planner = g.planner();
            for (let bar = 0; bar < 48; bar++) planner.planBar(bar);
            const padNotes = [];
            for (const b of [...planner.plan.values()]) {
                for (const e of b.events) if (e.role === 'pad') padNotes.push({ start: b.bar * b.meter.units + e.beat, end: b.bar * b.meter.units + e.beat + e.length, midi: e.midi });
                const byStart = new Map();
                for (const e of b.events) if (e.role === 'pad') {
                    const key = +e.beat.toFixed(3);
                    byStart.set(key, [...(byStart.get(key) ?? []), e.midi]);
                }
                for (const midis of byStart.values()) {
                    const notes = [...new Set(midis)].sort((a, z) => a - z);
                    if (notes.length < 3) continue;
                    const span = notes.at(-1) - notes[0];
                    total.strikes++;
                    total.size[notes.length] = (total.size[notes.length] ?? 0) + 1;
                    if (span > 9) total.spanOver9++;
                    if (span > 12) total.spanOver12++;
                    if (notes.length > HAND_NOTES) total.over5++;
                    total.maxSpan = Math.max(total.maxSpan, span);
                    for (const [reach, tag] of [[12, '12'], [9, '9']]) {
                        const hands = handsFit(notes, reach);
                        total[hands === 1 ? `oneHand${tag}` : hands === 2 ? `twoHands${tag}` : `neither${tag}`]++;
                    }
                    const folded = [...new Set(notes.map((m) => foldIntoNeck(m, NECKS.guitar)))].sort((a, z) => a - z);
                    const best = shapesFor(folded, NECKS.guitar)[0];
                    if (!best) continue;
                    if (best.shape.length < folded.length) total.guitarDropped++;
                    else if (best.cost >= 20) total.guitarStretch++;
                    else total.guitarOk++;
                }
            }
            for (const at of new Set(padNotes.map((n) => +n.start.toFixed(3)))) {
                const live = [...new Set(padNotes.filter((n) => n.start <= at + 1e-6 && n.end > at + 1e-6).map((n) => n.midi))].sort((a, z) => a - z);
                if (live.length < 3) continue;
                total.soundMoments++;
                if (live.length > HAND_NOTES) total.sounding6++;
                if (live.at(-1) - live[0] > 12) total.soundingSpan12++;
                if (live.at(-1) - live[0] > 17) total.soundingSpan17++;
                total.soundingMaxNotes = Math.max(total.soundingMaxNotes, live.length);
            }
        }
        const w = scene.settings.padWeights ?? {};
        const sum = Object.values(w).reduce((a, c) => a + c, 0) || 1;
        const held = ((w.sustain ?? 0) + (w.rolled ?? 0) + (w.stacked ?? 0)) / sum;
        rows.push({ name: scene.name, voice: scene.voices.pad, held: +held.toFixed(2), padRoot: scene.settings.padRoot ?? 'always', chordSize: scene.settings.chordSize ?? '', ...total });
    }
    fs.writeFileSync(process.env.VOICING_OUT ?? '.tmp/voicing-reach.json', JSON.stringify(rows, null, 1));
    console.log('MEASURED', rows.length);
});
