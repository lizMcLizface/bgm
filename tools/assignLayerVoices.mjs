// Gives every preset a second voice for the layers (docs/SPLIT_LAYERS_PLAN.md stage 5): `layerVoices` in src/library/scenes.json,
// used when settings.layers is 'pad', 'rhythm' or 'split' (the preset's own voices are for the default, one voice playing everything).
//   node tools/assignLayerVoices.mjs          writes scenes.json and .tmp/layer-voices.md
//   node tools/assignLayerVoices.mjs --dry    only the report
//
// A preset's "pad" voice is either a pad kind of sound (pads, strings, choir, organ, wind, brass, texture) or a keys / pluck / lead
// kind that plays everything. Pad kinds get a short, bright partner for the rhythm part; the others keep their voice as the rhythm
// part and get a pad under it. Each pick is by category from a short list, chosen by a hash of the preset's name (the same every run),
// skipping any voice the preset already uses. Piano presets, ambience-only, feel demos, hidden and "previous" copies are left alone. Re-running replaces the earlier picks.
import fs from 'node:fs';
import { soundFamily } from '../src/app/editor/soundFamilies.js';

const FILE = 'src/library/scenes.json', DRY = process.argv.includes('--dry');

const RHYTHM_POOL = {
    cozy: ['Kalimba Pluck', 'Felt Keys', 'Music Box', 'Soft Harp', 'Nylon Guitar', 'Soft Marimba', 'Tine Keys'],
    night: ['Celesta', 'Music Box', 'Glass Mallet', 'Harp Pluck', 'Kalimba Pluck'],
    focus: ['Soft Marimba', 'Kalimba Pluck', 'Glass Mallet', 'Felt Keys', 'Music Box'],
    starship: ['Arp Pluck', 'Galaxy Arp', 'Progressive Pluck', 'Starmap Arp', 'Pluck Chord'],
    classics: ['Pixel Piano', 'Arp Pluck', 'Music Box', 'Celesta', 'Soft Marimba'],
    sandbox: ['Nylon Guitar', 'Soft Harp', 'Harp Pluck', 'Kalimba Pluck', 'Soft Marimba'],
    podcast: ['Soft Marimba', 'Kalimba Pluck', 'Felt Keys', 'Music Box'],
    cinema: ['Harp Pluck', 'Celesta', 'Arp Pluck', 'Pluck Chord', 'Soft Harp'],
    unsettling: ['Haunted Celesta', 'Music Box', 'Glass Mallet', 'Celesta', 'Measured Cello Pizzicato'],
    electronic: ['Progressive Pluck', 'Arp Pluck', 'Galaxy Arp', 'Pluck Chord', 'Techno Stab'],
    wasm: ['Wasm Tine Keys', 'Wasm Glass Bells', 'Harp Pluck', 'Soft Marimba'],
};
const PAD_POOL = {
    cozy: ['Soft Pad', 'Velvet Pad', 'Lo-fi Tape Pad', 'Breathing Pad', 'Warm Strings'],
    night: ['Breathing Pad', 'Hollow Air', 'Void Pad', 'Slow Sweep', 'Morning Haze'],
    focus: ['Soft Pad', 'Glass Pad', 'Morning Haze', 'Velvet Pad', 'Hollow Air'],
    starship: ['Starlight Pad', 'Night Glass', 'Swelling Analog', 'Neon Saw Pad', 'Slow Sweep'],
    classics: ['Warm Organ', 'Soft Pad', 'Heroic Strings', 'Warm Strings', 'Swelling Analog'],
    sandbox: ['Warm Strings', 'Soft Pad', 'Warm Organ', 'Velvet Pad'],
    podcast: ['Soft Pad', 'Morning Haze', 'Velvet Pad', 'Hollow Air'],
    cinema: ['Neon Saw Pad', 'Warm Strings', 'Starlight Pad', 'Swelling Analog', 'Choir Ah'],
    unsettling: ['Spore Haze', 'Void Pad', 'Hollow Tremolo', 'Starmap Void', 'Haunted Viola'],
    electronic: ['Neon Saw Pad', 'Starlight Pad', 'Swelling Analog', 'Night Glass', 'Slow Sweep'],
    wasm: ['Wasm Rosin Silk', 'Wasm DCO Foundation', 'Wasm Air Choir'],
};
// A preset whose own voice is a keys / pluck / lead kind and whose chord styles are (almost) all running ones starts on the rhythm layer
// alone, with that voice as the rhythm part and a pad ready under it: switching to both then adds a pad and swaps nothing under notes
// that are still sounding. Mixed presets (some held phrases) keep one voice, as they were made. Sequencer lane presets always start there.
const RUNNING = ['pulse', 'arpeggio', 'sequence'], RUNNING_BASE = 0.9;
const PAD_KINDS = new Set(['pad', 'texture', 'choir', 'strings', 'brass', 'organ', 'wind']);
const SKIP_CATEGORIES = new Set(['ambience', 'demo']);

const hash = (text) => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const nameOf = (v) => (typeof v === 'string' ? v : v?.name);

const library = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const report = [];
for (const scene of library.scenes) {
    // (what an earlier run did)
    if (scene.layerVoices && scene.settings?.layers === 'rhythm') delete scene.settings.layers;
    delete scene.layerVoices;
    const pad = scene.voices?.pad;
    const skip = scene.hidden || scene.comparisonOf || SKIP_CATEGORIES.has(scene.category) || scene.settings?.playMusic === false
        || typeof pad !== 'string' || !RHYTHM_POOL[scene.category];
    if (skip) continue;
    const family = soundFamily(pad);
    if (family === 'piano') continue;
    const taken = new Set(Object.values(scene.voices).map(nameOf));
    const pick = (pool, salt) => {
        const free = pool.filter((n) => !taken.has(n));
        return (free.length ? free : pool)[hash(`${scene.name}/${salt}`) % (free.length ? free.length : pool.length)];
    };
    // a sequencer preset with lanes plays its chord voice as stabs: that voice is the rhythm part whatever it is, and a pad goes under it
    const lanes = scene.settings?.sequencer?.on && scene.settings.sequencer.lanes;
    const layerVoices = PAD_KINDS.has(family) && !lanes
        ? { rhythm: pick(RHYTHM_POOL[scene.category], 'rhythm') }
        : { pad: pick(PAD_POOL[scene.category], 'pad'), rhythm: pad };
    scene.layerVoices = layerVoices;
    const weights = scene.settings.padWeights ?? {}, total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    const running = RUNNING.reduce((sum, k) => sum + (weights[k] ?? 0), 0) / total;
    const startsOnRhythm = layerVoices.pad && (lanes || running >= RUNNING_BASE);
    if (startsOnRhythm) {
        scene.settings.layers = 'rhythm';
        // its register is the rhythm part's now
        if (scene.settings.voices?.pad) scene.settings.voices = { ...scene.settings.voices, rhythm: scene.settings.voices.pad };
    }
    scene.settings.volumes = { ...scene.settings.volumes, rhythm: Math.min(1, scene.settings.volumes?.pad ?? 0.8) };
    report.push({ name: scene.name, category: scene.category, family, pad, startsOnRhythm: !!startsOnRhythm, rhythmPart: layerVoices.rhythm === pad ? 'its own voice' : layerVoices.rhythm, padPart: layerVoices.pad ?? 'its own voice' });
}

// A hidden revision copy of a preset (comparisonOf) that is the same as it carries the same layer voices, so the pair still match.
for (const scene of library.scenes) {
    const target = scene.comparisonOf && library.scenes.find((s) => s.name === scene.comparisonOf);
    if (!target?.layerVoices || JSON.stringify(scene.voices) !== JSON.stringify(target.voices)) continue;
    scene.layerVoices = structuredClone(target.layerVoices);
    if (target.settings.layers) scene.settings.layers = target.settings.layers; else delete scene.settings.layers;
    scene.settings.volumes = { ...scene.settings.volumes, rhythm: target.settings.volumes.rhythm };
}
const lines = ['# Layer voices', '', `${report.length} of ${library.scenes.length} presets.`, '', '| preset | category | its voice | rhythm part | pad | starts on |', '| --- | --- | --- | --- | --- | --- |',
    ...report.map((r) => `| ${r.name} | ${r.category} | ${r.pad} (${r.family}) | ${r.rhythmPart} | ${r.padPart} | ${r.startsOnRhythm ? 'Rhythm' : 'One voice'} |`)];
if (!DRY) fs.writeFileSync(FILE, JSON.stringify(library, null, 2) + '\n');
fs.mkdirSync('.tmp', { recursive: true });
fs.writeFileSync('.tmp/layer-voices.md', lines.join('\n') + '\n');
console.log(`${report.length} presets given layer voices${DRY ? ' (dry run)' : ''}`);
