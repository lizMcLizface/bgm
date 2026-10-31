// Presets that start on the rhythm layer alone (tools/assignLayerVoices.mjs) against how they played as one voice: the chord voice's
// notes per bar and where they sit, both planned over the same seeds. Writes .tmp/composition-audit/layer-start.md
import fs from 'node:fs';
import Generator from '../src/app/Generator';
import { BROWSABLE_SCENES, sceneSettings, sceneSlug } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';

const BARS = 48, mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function chordVoice(scene, seed, layers) {
    const g = new Generator({ ...sceneSettings(scene, seed), humanize: { timing: 0, velocity: 0, detune: 0 }, swing: 0, layers });
    applyBook(g, inheritBook(scene.rulebook));
    const p = g.planner();
    for (let bar = 0; bar < BARS; bar++) p.planBar(bar);
    const events = [...p.plan.values()].flatMap((b) => b.events.filter((e) => e.role === 'pad' || e.role === 'rhythm'));
    return { attacks: events.length, midi: mean(events.map((e) => e.midi)), vel: mean(events.map((e) => e.velocity)) };
}
test('layer start', () => {
    const rows = [];
    for (const scene of BROWSABLE_SCENES.filter((s) => s.settings.layers === 'rhythm' && s.layerVoices)) {
        for (const seed of [1, 7]) {
            const now = chordVoice(scene, seed, 'rhythm'), before = chordVoice(scene, seed, 'combined');
            rows.push({ name: scene.name, seed, notes: now.attacks / before.attacks, midi: now.midi - before.midi, vel: now.vel / before.vel });
        }
    }
    const f = (x, d = 2) => x.toFixed(d);
    const L = ['# Presets starting on the rhythm layer, against one voice', '', '| preset | seed | notes (now / before) | mean pitch change | velocity (now / before) |', '| --- | --- | --- | --- | --- |',
        ...rows.map((r) => `| ${r.name} | ${r.seed} | ${f(r.notes)} | ${f(r.midi, 1)} | ${f(r.vel)} |`)];
    fs.mkdirSync('.tmp/composition-audit', { recursive: true });
    fs.writeFileSync('.tmp/composition-audit/layer-start.md', L.join('\n') + '\n');
    const off = rows.filter((r) => r.notes < 0.8 || r.notes > 1.25 || Math.abs(r.midi) > 3 || r.vel < 0.9 || r.vel > 1.1);
    console.log(`${rows.length} runs; outside the usual: ${off.map((r) => `${r.name}#${r.seed} notes ${f(r.notes)} pitch ${f(r.midi, 1)} vel ${f(r.vel)}`).join('; ') || 'none'}`);
    expect(rows.length).toBeGreaterThan(0);
});
