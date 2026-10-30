// What intensity does to a preset (npm run audit:push): events per second by role, the lead's rests, the tempo and the sequencer's stage, at several levels. Planning only.
//   NAMES='Warehouse Lift|Rainy Cafe' npm run audit:push
import Generator from '../src/app/Generator';
import { SCENES, sceneSettings } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';
import { unitsPerMinute } from '../src/app/meter';

const BARS = 48, LEVELS = [-1, -0.5, 0, 0.5, 1];
test('push feel', () => {
    const out = [];
    for (const name of (process.env.NAMES ?? 'Warehouse Lift|Uplifting Trance Departures|Rainy Cafe|Boss Fight, Politely|Slow House Sunset').split('|')) {
        const scene = SCENES.find((s) => s.name === name);
        if (!scene) { out.push(name + ': not found'); continue; }
        out.push(name);
        for (const level of LEVELS) {
            const settings = { ...sceneSettings(scene, 11), humanize: { timing: 0, velocity: 0, detune: 0 }, swing: 0, push: { level, program: { mode: 'off' } } };
            const g = new Generator(settings); applyBook(g, inheritBook(scene.rulebook));
            const p = g.planner(); for (let b = 0; b < BARS; b++) p.planBar(b);
            const bars = [...p.plan.values()].sort((a, z) => a.bar - z.bar).slice(0, BARS);
            let seconds = 0; const counts = { lead: 0, pad: 0, bass: 0, counter: 0, perc: 0 }; let vel = 0, n = 0;
            bars.forEach((b) => { seconds += (60 / unitsPerMinute(b.meter, b.bpm)) * b.meter.units; b.events.forEach((e) => { counts[e.role] = (counts[e.role] ?? 0) + 1; vel += e.velocity; n++; }); });
            out.push(`  ${String(level).padStart(5)}  bpm ${Math.round(bars.at(-1).bpm)}  /s: lead ${(counts.lead / seconds).toFixed(2)} pad ${(counts.pad / seconds).toFixed(1)} bass ${(counts.bass / seconds).toFixed(2)} perc ${(counts.perc / seconds).toFixed(1)}  vel ${(vel / n).toFixed(2)}  tone ${Math.round(bars.at(-1).tone)}`);
        }
    }
    console.log('\n' + out.join('\n'));
});
