// Generate the survey's note database without rendering audio.
// Run with: npx vitest run --config tools/vitest.audit.config.js tools/generatorSurvey.audit.js
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import Generator from '../src/app/Generator';
import { BROWSABLE_SCENES, sceneSettings, sceneSlug, sceneVoiceSpec } from '../src/app/scenes';
import { voiceLayers } from '../src/app/arranger';
import { findPreset } from '../src/app/editor/presetStore';
import { applyBook, inheritBook } from '../src/app/rulebook/session';
import { stringPatch } from '../src/app/engine/stringPatches';
import { pianoPatch } from '../src/app/engine/pianoPatches';
import { breathPatch } from '../src/app/engine/breathPatches';

vi.mock('../src/app/engine/ambience', async (importOriginal) => ({ ...await importOriginal(), default: class {
    connect() {} setShape() {} setLevels() {} setWander() {}
} }));

const bars = Number(process.env.SURVEY_BARS ?? 256);
const seed = Number(process.env.SURVEY_SEED ?? 17321);
const out = path.resolve('reports/survey_generator/data');

test('generate the scene note database', () => {
    if (!Number.isInteger(bars) || bars < 1 || !Number.isInteger(seed)) throw new Error('Invalid SURVEY_BARS or SURVEY_SEED');
    fs.mkdirSync(out, { recursive: true });
    const records = [];
    for (const scene of BROWSABLE_SCENES) {
        const generator = new Generator(sceneSettings(scene, seed));
        const voices = {};
        for (const role of ['lead', 'counter', 'pad', 'bass', 'rhythm']) {
            const spec = sceneVoiceSpec(scene, role, voiceLayers(generator.settings));
            const name = typeof spec === 'string' ? spec : spec?.name ?? generator.roles[role].presetName;
            const preset = typeof spec === 'object' && spec?.synth ? spec.synth : findPreset(name);
            const adjusted = preset ? breathPatch(name, pianoPatch(name, stringPatch(name, preset, generator.settings.generation), generator.settings.generation), generator.settings.generation) : {};
            voices[role] = { name, preset: adjusted, resolved: Boolean(preset), ...(spec?.external ? { external: spec.external } : {}) };
        }
        generator.grooveVoices = voices;
        generator.rulebookTrace = true;
        const compiled = applyBook(generator, inheritBook(scene.rulebook));
        const planner = generator.planner();
        for (let bar = 0; bar < bars; bar++) planner.planBar(bar);
        const planned = [...planner.plan.values()].sort((a, b) => a.bar - b.bar).slice(0, bars);
        if (planned.length !== bars) throw new Error(`${scene.name}: expected ${bars} bars, got ${planned.length}`);
        records.push({
            name: scene.name, slug: sceneSlug(scene.name), category: scene.category,
            seed, voices, settings: generator.settings, flags: compiled.flags,
            bars: planned.map(({ bar, events, chord, chordStart, music, meter, bpm, split, ruleTrace, state, rubato }) => ({
                bar, events, chord, chordStart, music, meter, bpm, split, ruleTrace, rubato,
                phrase: state.phrase,
            })),
        });
        console.log(`${records.length}/${BROWSABLE_SCENES.length}: ${scene.name}`);
    }
    const file = path.join(out, 'notes.jsonl.gz');
    fs.writeFileSync(file, gzipSync(records.map(record => JSON.stringify(record)).join('\n') + '\n'));
    expect(records.length).toBe(BROWSABLE_SCENES.length);
    console.log(`Wrote ${file}`);
}, 1800000);
