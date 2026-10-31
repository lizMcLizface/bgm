// What the mood slider does to a preset's chords (npm run audit:mood): the chord names over 16 bars at several levels. Planning only.
//   NAMES='Rainy Cafe|Warehouse Lift' npm run audit:mood
import Generator from '../src/app/Generator';
import { SCENES, sceneSettings } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';

const BARS = 32, LEVELS = [-1, -0.6, -0.3, 0, 0.3, 0.6, 1];
test('mood chords', () => {
    const out = [];
    for (const name of (process.env.NAMES ?? 'Rainy Cafe|Warehouse Lift|Slow House Sunset').split('|')) {
        const scene = SCENES.find((s) => s.name === name);
        if (!scene) { out.push(name + ': not found'); continue; }
        out.push(name);
        for (const level of LEVELS) {
            const settings = { ...sceneSettings(scene, 11), mood: { level } };
            const g = new Generator(settings); applyBook(g, inheritBook(scene.rulebook));
            const p = g.planner(); for (let b = 0; b < BARS; b++) p.planBar(b);
            const bars = [...p.plan.values()].sort((a, z) => a.bar - z.bar).slice(0, BARS);
            const names = [...new Set(bars.map((b) => b.chord.name))];
            out.push(`  ${String(level).padStart(5)}  tone ${Math.round(bars.at(-1).tone)}  ${names.join(' ')}  | most notes in a chord: ${Math.max(...bars.map((b) => b.chord.pitchClasses.length))}`);
        }
    }
    console.log('\n' + out.join('\n'));
});
