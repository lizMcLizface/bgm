// Audit of the seeded choices (npm run audit:rng), two parts:
//  1. the seed derivations: every `seeded(<formula of seed and bar>)` shape used in src/, driven over many seeds and bars, and its
//     first draw (what pick() and chance() read) tested for uniformity, for correlation between neighbouring bars and between
//     neighbouring seeds, and for collisions (two (seed, bar) pairs giving one stream);
//  2. the music: melodic direction, the sequencer's walk and stack choices and the lead's note counts over many seeds of the
//     browsable presets, where a bias in the choices shows as a lean the generator never meant.
// Planning only, no audio. Writes .tmp/rng-audit/report.md and prints it.
//   AUDIT_SEEDS=24 AUDIT_BARS=96 npm run audit:rng
import fs from 'node:fs';
import path from 'node:path';
import { seeded } from '../src/app/random';
import Generator from '../src/app/Generator';
import { BROWSABLE_SCENES, sceneSettings, sceneSlug } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';
import { sequencerLanes } from '../src/app/sequencer';
import { METERS } from '../src/app/meter';
import { stream, line } from './compositionMetrics';

const SEEDS = Number(process.env.AUDIT_SEEDS ?? 24), BARS = Number(process.env.AUDIT_BARS ?? 96);
const OUT = path.resolve('.tmp/rng-audit');
const imul = Math.imul;

// The seed shapes in the code. `where` names the call sites; each takes (seed, n) with n a bar, phrase start, cycle or segment.
const SHAPES = [
    { name: 'xor-imul (seed ^ imul(n+1, K))', where: 'arc, duet, ensembleVoices, feel, ornaments, partGrammar, performance, phraseLength, rhythmGrammar, syncopation, themeDevelopment, Generator:1732 (most of composition/)', f: (s, n) => (s ^ imul(n + 1, 0x3c6ef372)) >>> 0 },
    { name: 'LCG mix (imul(seed^salt,1664525) ^ imul(n+1,1013904223))', where: 'additionalDrumStyles, ensembleRhythm, padVariation, arrangerLatest', f: (s, n) => (imul(s ^ 0x5be0cd19, 1664525) ^ imul(n + 1, 1013904223)) >>> 0 },
    { name: 'golden-ratio add (((seed ^ salt) + imul(n+1, K)))', where: 'percussion.js:401', f: (s, n) => (((s ^ 0x1234567) + imul(n + 1, 0x9e3779b1)) >>> 0) },
    { name: 'hashed pair (imul(seed+1,K1) ^ imul(n+1,K2))', where: 'sequencer.js walk and stack (new)', f: (s, n) => (imul(s + 1, 0x9e3779b1) ^ imul(n + 1, 0x85ebca6b)) >>> 0 },
    { name: 'linear (seed*131 + n*7919 + 17)', where: 'sequencer.js:222 (stab variation), timbreDrift.js:30', f: (s, n) => (s * 131 + n * 7919 + 17) >>> 0 },
    { name: 'linear (seed*131 + n*104729 + 3)', where: 'sequencer.js:174 (drum rows)', f: (s, n) => (s * 131 + n * 104729 + 3) >>> 0 },
    { name: 'linear (seed*53 + n)', where: 'Generator.js:1408 (key-lift pivot)', f: (s, n) => (s * 53 + n) >>> 0 },
    { name: 'linear (seed*31 + n)', where: 'Generator.js:1303 (borrowed chords)', f: (s, n) => (s * 31 + n) >>> 0 },
    { name: 'linear (seed*37 + 11 + n)', where: 'Generator.js:1312', f: (s, n) => (s * 37 + 11 + n) >>> 0 },
    { name: 'plain (seed)', single: true, where: 'Generator.js:261, soundGen*', f: (s) => s >>> 0 },
];

// a small fixed hash for "random-looking" seeds, as phraseToSeed gives for typed phrases (any 32-bit value)
const mix = (i) => { let h = (i + 1) * 0x9e3779b1 >>> 0; h ^= h >>> 15; h = imul(h, 0x85ebca6b); h ^= h >>> 13; h = imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
const corr = (a, b) => { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let c = 0, va = 0, vb = 0; for (let i = 0; i < n; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return va && vb ? c / Math.sqrt(va * vb) : 0; };
const chi = (values, bins) => { const c = Array(bins).fill(0); values.forEach((u) => c[Math.min(bins - 1, Math.floor(u * bins))]++); const e = values.length / bins; return c.reduce((s, x) => s + (x - e) ** 2 / e, 0); };
// critical values of chi-square at p = 0.001 for df 3, 7, 15
const CRIT = { 4: 16.27, 8: 24.32, 16: 37.7 };

function auditShape(shape) {
    const rows = {};
    for (const [label, seeds] of [['random seeds', Array.from({ length: 64 }, (_, i) => mix(i))], ['small seeds 0..63', Array.from({ length: 64 }, (_, i) => i)]]) {
        const first = [], lag = [], across = [];
        const streams = new Map();
        let collisions = 0;
        seeds.forEach((s) => { const u = []; for (let n = 0; n < (shape.single ? 1 : 256); n++) { const state = shape.f(s, n); if (streams.has(state) && streams.get(state) !== s + ':' + n) collisions++; streams.set(state, s + ':' + n); u.push(seeded(state)()); } first.push(...u); lag.push(corr(u.slice(0, -1), u.slice(1))); });
        // neighbouring seeds at the same bar (seed s and s+1)
        for (let n = 0; n < (shape.single ? 1 : 256); n += 8) { const a = [], b = []; for (let s = 0; s < 255; s++) { a.push(seeded(shape.f(s, n))()); b.push(seeded(shape.f(s + 1, n))()); } across.push(corr(a, b)); }
        const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;
        rows[label] = { chi4: chi(first, 4), chi8: chi(first, 8), chi16: chi(first, 16), lag: mean(lag), across: mean(across), collisions };
    }
    return rows;
}

function seedStats() {
    const lines = ['## 1. Seed derivations', '', 'First draw of `seeded(state)` over 64 seeds x 256 bars. chi-square on 4/8/16 equal bins (flag above 16.3 / 24.3 / 37.7, p = 0.001), lag-1 correlation between consecutive bars and between consecutive seeds (flag above 0.03 / 0.05), and (seed, bar) pairs that give one stream.', '', '| shape | seeds | chi4 | chi8 | chi16 | bar-to-bar r | seed-to-seed r | collisions | flags |', '|---|---|---|---|---|---|---|---|---|'];
    const flagged = [];
    for (const shape of SHAPES) {
        const rows = auditShape(shape);
        for (const [label, r] of Object.entries(rows)) {
            const flags = [r.chi4 > CRIT[4] && 'chi4', r.chi8 > CRIT[8] && 'chi8', r.chi16 > CRIT[16] && 'chi16', Math.abs(r.lag) > 0.03 && 'bar-corr', Math.abs(r.across) > 0.05 && 'seed-corr', r.collisions > 0 && 'collide'].filter(Boolean);
            lines.push(`| ${shape.name} | ${label} | ${r.chi4.toFixed(1)} | ${r.chi8.toFixed(1)} | ${r.chi16.toFixed(1)} | ${r.lag.toFixed(3)} | ${r.across.toFixed(3)} | ${r.collisions} | ${flags.join(', ') || '-'} |`);
            if (flags.length) flagged.push(`${shape.name} (${label}): ${flags.join(', ')}; used in ${shape.where}`);
        }
    }
    lines.push('', flagged.length ? '**Flagged:**\n' + flagged.map((f) => `- ${f}`).join('\n') : 'Nothing flagged.');
    return lines.join('\n');
}

function musicStats() {
    const lines = ['', '## 2. The music', ''];
    // sequencer lane choices over many bars and seeds
    const chord = { pitchClasses: [9, 0, 4, 7] };
    const walks = { up: 0, down: 0, flat: 0 }, firstTone = {};
    for (let seed = 0; seed < 200; seed++) for (let bar = 0; bar < 32; bar++) {
        const play = (pad) => sequencerLanes({ meter: METERS['4/4'], seq: { on: true, arrangement: 'warehouse-shift', lanes: true, variation: 0, gate: 0.45, slots: [1], edits: { 1: { pad } } }, chord, bar, seed }).filter((e) => e.role === 'pad');
        const a = play('a.a.a.a.').map((e) => e.midi); walks[Math.sign(a[1] - a[0]) > 0 ? 'up' : Math.sign(a[1] - a[0]) < 0 ? 'down' : 'flat']++;
        const t = play('s.s.s.s.')[0].midi % 12; firstTone[t] = (firstTone[t] ?? 0) + 1;
    }
    lines.push(`Sequencer arpeggio first step over 200 seeds x 32 bars: ${JSON.stringify(walks)}`, `Sequencer stack first tone (pitch class; C is the lowest tone, A the highest, E and G inner): ${JSON.stringify(firstTone)}`, '');
    lines.push('Melodic direction of the lead per browsable preset (share of rising intervals; 0.5 is level, Huron expects a little under), and lead onsets per bar, over the seeds:', '', '| preset | rising | onsets/bar | empty-lead bars |', '|---|---|---|---|');
    const results = [];
    for (const scene of BROWSABLE_SCENES) {
        let up = 0, total = 0, onsets = 0, empty = 0, bars = 0;
        for (let seed = 1; seed <= SEEDS; seed++) {
            const settings = { ...sceneSettings(scene, mix(seed)), humanize: { timing: 0, velocity: 0, detune: 0 }, swing: 0 };
            if (settings.playMusic === false) continue;
            const g = new Generator(settings); applyBook(g, inheritBook(scene.rulebook));
            const p = g.planner(); for (let b = 0; b < BARS; b++) p.planBar(b);
            const planned = [...p.plan.values()].sort((a, z) => a.bar - z.bar).slice(0, BARS);
            const lead = line(stream(planned, 'lead'));
            for (let i = 1; i < lead.length; i++) if (lead[i].midi !== lead[i - 1].midi) { total++; if (lead[i].midi > lead[i - 1].midi) up++; }
            planned.forEach((b) => { const n = new Set(b.events.filter((e) => e.role === 'lead').map((e) => e.beat)).size; onsets += n; if (!n) empty++; bars++; });
        }
        if (total > 40) results.push({ name: sceneSlug(scene.name), rising: up / total, onsets: onsets / Math.max(1, bars), empty: empty / Math.max(1, bars) });
    }
    results.sort((a, z) => z.rising - a.rising);
    results.forEach((r) => lines.push(`| ${r.name} | ${r.rising.toFixed(3)} | ${r.onsets.toFixed(2)} | ${r.empty.toFixed(2)} |`));
    const rs = results.map((r) => r.rising), mean = rs.reduce((x, y) => x + y, 0) / rs.length;
    lines.push('', `Mean rising share ${mean.toFixed(3)} over ${rs.length} presets; range ${Math.min(...rs).toFixed(3)} to ${Math.max(...rs).toFixed(3)}.`);
    return lines.join('\n');
}

test('rng audit', () => {
    const report = '# RNG audit\n\n' + seedStats() + '\n' + musicStats() + '\n';
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'report.md'), report);
    console.log('\n' + report);
});
