// Plans the "Demo: Groove slider" preset at several syncopation amounts with the same seed and writes
// .tmp/groove-demo.json for the groove demo page: the real planned notes, not a mock-up.
//   npx vitest run --config tools/vitest.audit.config.js tools/grooveDemoData.audit.js
import fs from 'node:fs';
import Generator from '../src/app/Generator';
import { SCENES, sceneSettings, sceneSlug } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';
import * as M from './compositionMetrics';

const AMOUNTS = [0, 0.25, 0.5, 0.75, 1], FIRST = 32, BARS = 8, SEED = Number(process.env.DEMO_SEED ?? 3);

test('groove demo data', () => {
    const scene = SCENES.find((s) => sceneSlug(s.name) === 'demo-groove-slider');
    const plans = AMOUNTS.map((amount) => {
        const g = new Generator({ ...sceneSettings(scene, SEED), humanize: { timing: 0, velocity: 0, detune: 0 }, swing: 0, leadSyncopation: amount });
        applyBook(g, inheritBook(scene.rulebook));
        const planner = g.planner();
        for (let bar = 0; bar < FIRST + BARS; bar++) planner.planBar(bar);
        const bars = [...planner.plan.values()].sort((a, z) => a.bar - z.bar).slice(FIRST, FIRST + BARS);
        const score = (roles) => M.syncopationByBar(bars, roles).map((r) => r.score);
        return {
            amount,
            bars: bars.map((b) => ({ chord: b.chord.name, events: b.events.filter((e) => ['lead', 'bass', 'perc', 'pad'].includes(e.role))
                .map((e) => ({ role: e.role, midi: e.midi, beat: e.beat, length: e.length, velocity: e.velocity })) })),
            leadScore: score(['lead']), leadBassScore: score(['lead', 'bass']),
        };
    });
    const first = plans[0].bars[0];
    fs.mkdirSync('.tmp', { recursive: true });
    fs.writeFileSync('.tmp/groove-demo.json', JSON.stringify({ scene: scene.name, seed: SEED, bpm: sceneSettings(scene, SEED).bpm, units: 4, plans }));
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(plans.map((p) => `${p.amount}: lead ${mean(p.leadScore).toFixed(2)}, lead+bass ${mean(p.leadBassScore).toFixed(2)}, notes ${p.bars.flatMap((b) => b.events).filter((e) => e.role === 'lead').length}`).join('\n'), first.chord);
});
