// Writes a hash of the planned notes of every preset that carries none of the optional composition settings, so two
// checkouts can be compared: with the rules off, the plan must be identical to the one before they existed.
//   PLAN_OUT=path npx vitest run --config tools/vitest.audit.config.js tools/planDump.audit.js
import fs from 'node:fs';
import crypto from 'node:crypto';
import Generator from '../src/app/Generator';
import { BROWSABLE_SCENES, sceneSettings, sceneSlug } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';

const NEW_KEYS = ['leadSyncopation', 'leadInertia', 'padRoot', 'chordSize', 'padContour', 'leadTendency', 'bassEuclid', 'borrowStyle', 'padVibrato'];
test('plan dump', () => {
    const out = {};
    for (const scene of BROWSABLE_SCENES) {
        if (NEW_KEYS.some((k) => scene.settings?.[k] !== undefined)) continue;
        for (const seed of [1, 7]) {
            const g = new Generator({ ...sceneSettings(scene, seed), humanize: { timing: 0, velocity: 0, detune: 0 }, swing: 0 });
            applyBook(g, inheritBook(scene.rulebook));
            const planner = g.planner();
            for (let bar = 0; bar < 48; bar++) planner.planBar(bar);
            const bars = [...planner.plan.values()].sort((a, z) => a.bar - z.bar).map((b) => [b.bar, b.chord.name, b.events.map((e) => [e.role, e.midi, +e.beat.toFixed(4), +e.length.toFixed(4), +e.velocity.toFixed(3)])]);
            out[`${sceneSlug(scene.name)}#${seed}`] = crypto.createHash('sha1').update(JSON.stringify(bars)).digest('hex');
        }
    }
    fs.writeFileSync(process.env.PLAN_OUT ?? '.tmp/plan-dump.json', JSON.stringify(out, null, 1));
    console.log('DUMPED', Object.keys(out).length);
});
