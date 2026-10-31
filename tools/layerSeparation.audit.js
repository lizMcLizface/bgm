// Layer separation (docs/SPLIT_LAYERS_PLAN.md stage 2): every browsable preset forced onto layers 'split', planned with the
// separation rules off and on, against its 'combined' form. Writes .tmp/composition-audit/layers.md.
//   AUDIT_BARS=64 AUDIT_SEEDS=2 npx vitest run --config tools/vitest.audit.config.js tools/layerSeparation.audit.js
import fs from 'node:fs';
import path from 'node:path';
import Generator from '../src/app/Generator';
import { BROWSABLE_SCENES, sceneSettings, sceneSlug } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';
import { LAYER_RULES } from '../src/app/arranger';
import * as M from './compositionMetrics';

const BARS = Number(process.env.AUDIT_BARS ?? 64), SEEDS = Number(process.env.AUDIT_SEEDS ?? 2);
const OFF = Object.fromEntries(Object.keys(LAYER_RULES).map((k) => [k, false]));
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, z) => a - z); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const mean = (xs) => { const s = xs.filter(Number.isFinite); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };

function plan(scene, seed, extra) {
    const g = new Generator({ ...sceneSettings(scene, seed), humanize: { timing: 0, velocity: 0, detune: 0 }, swing: 0, ...extra });
    applyBook(g, inheritBook(scene.rulebook));
    const p = g.planner();
    for (let bar = 0; bar < BARS; bar++) p.planBar(bar);
    return [...p.plan.values()].sort((a, z) => a.bar - z.bar).slice(0, BARS);
}

test('layer separation', () => {
    const scenes = BROWSABLE_SCENES.filter((s) => s.settings.playMusic !== false && s.settings.sequencer?.on !== true);
    const modes = { 'split, rules off': { layers: 'split', layerRules: OFF }, 'split, rules on': { layers: 'split' }, combined: { layers: 'combined' } };
    // AUDIT_ABLATE=1: also each rule alone switched off
    if (process.env.AUDIT_ABLATE) for (const k of Object.keys(LAYER_RULES)) modes[`split, only ${k} off`] = { layers: 'split', layerRules: { ...Object.fromEntries(Object.keys(LAYER_RULES).map((r) => [r, true])), [k]: false } };
    const rows = Object.fromEntries(Object.keys(modes).map((k) => [k, []]));
    for (const scene of scenes) for (let k = 0; k < SEEDS; k++) {
        const seed = 1000 + 7919 * k + scene.name.length;
        for (const [name, extra] of Object.entries(modes)) {
            const bars = plan(scene, seed, extra);
            rows[name].push({ sep: M.layerSeparation(bars), spacing: M.lowRegisterSpacing(bars), rhythmMidi: mean(bars.flatMap((b) => b.events.filter((e) => e.role === 'rhythm').map((e) => e.midi))), rhythmMax: Math.max(0, ...bars.flatMap((b) => b.events.filter((e) => e.role === 'rhythm').map((e) => e.midi))), padMidi: mean(bars.flatMap((b) => b.events.filter((e) => e.role === 'pad').map((e) => e.midi))), rhythmBars: bars.filter((b) => b.events.some((e) => e.role === 'rhythm')).length, bars: bars.length });
        }
    }
    const L = ['# Layer separation', '', `${scenes.length} presets x ${SEEDS} seeds x ${BARS} bars. Means across runs. Rhythm attacks only count where a pad note is sounding.`, '',
        '| mode | rhythm bars | attacks | within a step of the pad | under a fourth over it | on a pad attack | unison | mean gap (semitones) | on the lead notes | bar-start close low pairs | mean pad / rhythm note | highest rhythm note |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
    const f = (x, d = 3) => (x === null || x === undefined ? '-' : x.toFixed(d));
    for (const [name, list] of Object.entries(rows)) {
        const s = list.map((r) => r.sep).filter(Boolean);
        L.push(`| ${name} | ${f(mean(list.map((r) => r.rhythmBars / r.bars)), 2)} | ${f(mean(s.map((x) => x.attacks)), 0)} | ${f(mean(s.map((x) => x.closeShare)))} | ${f(mean(s.map((x) => x.belowFourth)))} | ${f(mean(s.map((x) => x.coincident)))} | ${f(mean(s.map((x) => x.unison)))} | ${f(mean(s.map((x) => x.meanGap)), 1)} | ${f(mean(s.map((x) => x.nearLead)))} | ${f(mean(list.map((r) => r.spacing.closeLowPairShare)))} | ${f(mean(list.map((r) => r.padMidi)), 0)} / ${f(mean(list.map((r) => r.rhythmMidi)), 0)} | ${f(Math.max(...list.map((r) => r.rhythmMax)), 0)} |`);
    }
    fs.mkdirSync('.tmp/composition-audit', { recursive: true });
    fs.writeFileSync(path.resolve('.tmp/composition-audit/layers.md'), L.join('\n') + '\n');
    console.log(L.join('\n'));
    expect(rows.combined.length).toBeGreaterThan(0);
});
