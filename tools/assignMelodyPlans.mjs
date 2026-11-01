// Gives the presets that carry a tune a song of their own by default (composition/melodicStyle.js): melodyPlan 'change' and a
// melodyStyle in src/library/scenes.json. The style is written out rather than left on auto, so moving a slider cannot change it.
//   node tools/assignMelodyPlans.mjs          writes scenes.json and .tmp/melody-plans.md
//   node tools/assignMelodyPlans.mjs --dry    only the report
//   node tools/assignMelodyPlans.mjs --off    takes every assigned plan out again (the demos keep theirs)
//
// Left on Noodle: ambience without music, background for speech (podcast, or a lead that hardly plays: a tune would draw the ear
// from the speaker), unsettling presets (not settling is what they are for), the demos, hidden older versions kept for comparison,
// and presets tagged 'melody', whose plan and style were chosen by hand.
import fs from 'node:fs';
import { suitedStyle } from '../src/app/composition/suitedStyle.js';

const FILE = 'src/library/scenes.json', DRY = process.argv.includes('--dry'), OFF = process.argv.includes('--off');
const library = JSON.parse(fs.readFileSync(FILE, 'utf8'));

export function leftAlone(scene) {
    const s = scene.settings ?? {};
    if (scene.category === 'demo') return 'demo';
    if (scene.tags?.includes('melody')) return 'style set by hand';
    if (scene.hidden === true && !scene.comparisonOf) return 'hidden older version'; // (a revision copy stays the same as the preset it was accepted into)
    if (s.playMusic === false) return 'no music';
    if (scene.category === 'podcast' || (s.leadActivity ?? 0) <= 0.2) return 'background for speech';
    if (scene.category === 'unsettling' || (s.tonality?.mode ?? 'tonal') !== 'tonal') return 'unsettling';
    return null;
}

// By what the preset is for where the category says; else what its settings suit.
export function styleFor(scene) {
    const s = scene.settings ?? {}, density = s.leadDensity ?? 0;
    if (scene.category === 'electronic') return density >= 0.5 ? 'riff' : 'hook';
    if (scene.category === 'classics') return density >= 0.3 ? 'game' : 'song';
    if (scene.category === 'cinema' || scene.category === 'starship') return 'cinema';
    return suitedStyle(s);
}

const report = { styled: {}, left: {} };
for (const scene of library.scenes) {
    const reason = leftAlone(scene);
    if (reason) { (report.left[reason] ??= []).push(scene.name); continue; }
    if (OFF) { delete scene.settings.melodyPlan; delete scene.settings.melodyStyle; continue; }
    scene.settings.melodyPlan = 'change';
    scene.settings.melodyStyle = styleFor(scene);
    (report.styled[scene.settings.melodyStyle] ??= []).push(scene.name);
}
if (!DRY) fs.writeFileSync(FILE, JSON.stringify(library, null, 2) + '\n');
const list = (title, groups) => [`## ${title}`, ...Object.entries(groups).map(([k, names]) => `- **${k}** (${names.length}): ${names.join(', ')}`)].join('\n');
fs.mkdirSync('.tmp', { recursive: true });
fs.writeFileSync('.tmp/melody-plans.md', `${OFF ? '' : `${list('A song by default', report.styled)}\n\n`}${list('Left on Noodle', report.left)}\n`);
const count = (groups) => Object.values(groups).reduce((sum, names) => sum + names.length, 0);
console.log(OFF ? 'Plans taken out.' : `${count(report.styled)} presets get a song, ${count(report.left)} stay on Noodle${DRY ? ' (dry run)' : ''}.`);
for (const [k, names] of Object.entries(OFF ? {} : report.styled)) console.log(`  ${k}: ${names.length}`);
for (const [k, names] of Object.entries(report.left)) console.log(`  left, ${k}: ${names.length}`);
