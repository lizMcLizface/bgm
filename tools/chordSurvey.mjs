// Per-knob distributions of the proposed sequencer chord-track pages, for pad and rhythm separately.
// Reads the captured note database (npm run survey:generate) and writes tools/survey_chords/data/chords.json.
// Run with: npm run survey:chords
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createGunzip } from 'node:zlib';
import { describePart, figureOf, figureVariation } from './generatorSurveyParams';
import { KNOBS, knobValues } from './chordSurveyKnobs';

const root = path.resolve('reports/survey_generator/data');
const outDir = path.resolve('tools/survey_chords/data');
const ROLES = ['pad', 'rhythm'];
const counts = () => Object.create(null);
const add = (object, key, n = 1) => { key = String(key); object[key] = (object[key] ?? 0) + n; };

const roles = Object.fromEntries(ROLES.map(role => [role, {
    parts: 0, splitBars: 0, knobs: Object.fromEntries(KNOBS.map(k => [k.id, counts()])),
    line: { reasons: counts(), ifSyncopatedToo: 0, byPreset: counts(), figures: counts(), chordToneOnly: counts() },
    variation: counts(), presets: new Set(),
}]));
const meta = { seed: null, bars: null, presets: 0, excluded: [] };

const stream = readline.createInterface({ input: fs.createReadStream(path.join(root, 'notes.jsonl.gz')).pipe(createGunzip()), crlfDelay: Infinity });
for await (const text of stream) {
    if (!text) continue;
    const r = JSON.parse(text), s = r.settings;
    if (s.playMusic === false) { meta.excluded.push(`${r.name} (music off)`); continue; }
    if (s.tonality?.mode === 'atonal') { meta.excluded.push(`${r.name} (atonal)`); continue; }
    meta.seed ??= r.seed; meta.bars ??= r.bars.length; meta.presets++;
    const open = {};
    const flush = role => {
        const slot = open[role]; delete open[role];
        if (!slot) return;
        const R = roles[role];
        const { values, line, sensitivity } = knobValues({ ...slot.statement, slotMidis: slot.midis });
        R.parts++; R.presets.add(r.name);
        for (const knob of KNOBS) if (values[knob.id] !== null && values[knob.id] !== undefined) add(R.knobs[knob.id], values[knob.id]);
        if (line) {
            add(R.line.reasons, line); add(R.line.byPreset, r.name);
            if (slot.statement.figure) add(R.line.figures, slot.statement.figure);
            add(R.line.chordToneOnly, slot.statement.part.voicing.outside === 0 ? 'every note is a chord tone' : 'has non-chord notes');
        } else if (sensitivity) R.line.ifSyncopatedToo++;
    };
    for (const b of r.bars) {
        for (const role of ROLES) {
            const R = roles[role];
            const events = b.events.filter(e => e.role === role && !s.muted?.[role] && e.chordSource && Number.isInteger(e.chordSource.root));
            if (!events.length) continue;
            if (b.split) { R.splitBars++; continue; }
            const slotStart = b.ruleTrace?.slot?.start ?? b.bar;
            if (open[role] && open[role].start !== slotStart) flush(role);
            if (!open[role]) {
                const slotBars = b.ruleTrace?.slot?.bars ?? 1;
                const part = describePart(events, { chord: b.chord, mode: b.music.mode, tonic: b.music.tonic, units: b.meter.units, slotBars });
                open[role] = { start: slotStart, midis: [], figure: figureOf(events),
                    statement: { part, events, chord: b.chord, mode: b.music.mode, tonic: b.music.tonic, units: b.meter.units, slotBars, figure: part.play.figure } };
            } else if (open[role].statement.part.play.mode === 'arp') {
                const figure = figureOf(events);
                if (figure && open[role].figure) add(R.variation, figureVariation(open[role].figure, figure));
            }
            open[role].midis.push(...events.map(e => e.midi));
        }
    }
    for (const role of ROLES) flush(role);
}
if (!meta.presets) throw new Error('Empty note database');
for (const role of ROLES) { roles[role].presets = roles[role].presets.size; }
fs.mkdirSync(outDir, { recursive: true });
const knobs = KNOBS.map(({ support, ...k }) => ({ ...k, support: Object.fromEntries([...new Set(ROLES.flatMap(role => Object.keys(roles[role].knobs[k.id])))].map(v => [v, support(v)])) }));
fs.writeFileSync(path.join(outDir, 'chords.json'), JSON.stringify({ meta, roles, knobs }));
console.log(`Wrote chords.json: ${meta.presets} presets, ${ROLES.map(role => `${roles[role].parts} ${role} parts`).join(', ')}`);
