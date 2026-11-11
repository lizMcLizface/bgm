// Summarise the captured database; this script never invokes the generator.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createGunzip } from 'node:zlib';
import { CHAPTERS, RULES, ruleState } from '../src/app/rulebook/model';
import { GROUPS, groupValue } from '../src/app/rulebook/groups';
import { SCENE_CATEGORIES } from '../src/app/scenes';
import { STACKS, stackLevel } from '../src/app/quickControls';
import { unitsPerMinute } from '../src/app/meter';
import { rubatoTime } from '../src/app/composition/rubato';
import PROGRESSIONS from '../src/app/progressions';
import { scaleById } from '../src/app/theory';
import { beatDistance, crossedBoundaries, chordGestures } from './generatorSurveyMetrics';
import { compareChordConversion } from './generatorSurveyChords';
import { describePart, figureOf } from './generatorSurveyParams';
import { newParams, recordPart, slotTracker } from './generatorSurveyParamStats';

const root = path.resolve('reports/survey_generator/data');
const input = path.join(root, 'notes.jsonl.gz');
const output = path.resolve('tools/survey_generator/data/survey.json');
const counts = () => Object.create(null);
const add = (o, key, n = 1) => { key = String(key ?? '(none)'); o[key] = (o[key] ?? 0) + n; };
const get = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);
const valueLabel = value => value === undefined ? '(undefined)' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const roles = ['lead', 'counter', 'pad', 'rhythm', 'bass', 'perc'];
const playback = new Set(['music', 'ambience', 'even-loudness', 'melody-ducking', 'soft-attacks', 'velocity-brightness', 'melodic-slides',
    'held-pad-glides', 'held-bass-glides', 'pad-pitch-motion', 'bass-pitch-motion', 'chord-slides', 'tempo-effects',
    'gate-envelopes', 'note-connection', 'held-expression', 'note-articulation', 'pitch-wander', 'pad-vibrato',
    'timbre-drift', 'section-space', 'section-tone', 'ambient-bed-drift', 'ambient-layer-drift']);
const mixed = new Set(['layer-mix', 'slow-attack-notes', 'energy-arc']);
const performance = new Set(['swing', 'human-timing', 'human-dynamics', 'human-detune', 'dynamic-level',
    'dynamic-range', 'phrase-expression', 'instrument-groove', 'cadence-rubato']);
const effect = id => playback.has(id) ? 'Playback / sound' : mixed.has(id) ? 'Composition and playback'
    : performance.has(id) ? 'Planned performance / timing' : 'Composition';
const summary = {
    metadata: { database: 'notes.jsonl.gz', generator: 'Latest', seed: null, barsPerPreset: null, excludedMusicOff: [],
        categories: Object.fromEntries(SCENE_CATEGORIES.map(c => [c.id, c.label])),
        chapters: Object.fromEntries(CHAPTERS.map(c => [c.id, c.title])) },
    presets: [], rules: RULES.map(rule => ({ id: rule.id, title: rule.title, chapter: rule.chapter, description: rule.description,
        path: rule.path, binary: Boolean(rule.flags) || typeof rule.off === 'boolean', effect: effect(rule.id), parameter: rule.parameter ?? null, values: counts(), statuses: counts(), categories: {} })),
    groups: GROUPS.map(group => ({ id: group.id, title: group.title, role: group.role ?? null, path: group.path, values: counts(), categories: {} })),
    timing: { voices: Object.fromEntries(roles.map(role => [role, { notes: 0, offBeat: 0, offGrid: 0, presets: [] }])),
        stacks: Object.fromEntries(STACKS.map(s => [s.id, counts()])), settings: {}, leadDensityEnabled: counts() },
    harmony: { homeModes: counts(), heardModes: counts(), modeDepartures: { 'Mode departed from home': 0, 'Stayed in home mode': 0 }, homeProgressions: counts(), heardProgressions: counts(),
        homeBarsPerChord: counts(), playedSlotBars: counts(), meter: counts(), tempo: counts(), playedMeter: counts(), playedTempo: counts() },
    evolution: { drift: counts(), wanderMode: counts(), ambienceWanderMode: counts(), enabledWander: 0, enabledDrift: 0, any: 0, mechanisms: counts() },
    chord: { choices: counts(), combinations: counts(), notes: counts(), shapes: counts(), sounds: {}, unclassifiedNotes: 0, gestures: counts(),
        conversion: { outcomes: counts(), byStyle: {}, diagnostics: {}, pitchDifferences: counts(), pitchByStyle: {}, attacksByStyle: {},
            reference: counts(), structures: counts(), capturedHarmony: counts(), chordSizes: {}, structureVsPlayback: {}, examples: {}, untaggedRoleBars: 0, partiallyTaggedRoleBars: 0, excludedAtonal: [] },
        params: newParams() },
    bass: { styles: counts(), shapes: counts(), pedalBars: 0 }, notes: { total: 0, crossings: 0, crossingNotes: 0, crossingBoundaries: 0,
        crossingsByRole: counts(), boundaryCount: 0, ornaments: counts(), expression: counts(), lengths: counts(),
        velocity: counts(), detune: counts(), pitchTargets: counts(), expressionComplexity: counts() },
    limitations: { unresolvedVoices: [], mutedEvents: 0, suppressedMusicEvents: 0 },
};
const settingsPaths = ['swing', 'leadSyncopation', 'humanize.timing', 'humanize.velocity', 'humanize.detune',
    'bassEuclid', 'ornaments', 'rubato', 'padVibrato', 'timbreDrift', 'wander.period', 'wander.pitch',
    'wander.volume', 'wander.filter', 'ambienceWander.period', 'leadDensity'];
for (const p of settingsPaths) summary.timing.settings[p] = counts();
const addMember = (object, category, key, name) => {
    object[category] ??= {};
    object[category][key] ??= [];
    object[category][key].push(name);
};
const progression = music => (music.numerals ?? PROGRESSIONS[music.progression] ?? []).join(' – ');
const stream = readline.createInterface({ input: fs.createReadStream(input).pipe(createGunzip()), crlfDelay: Infinity });
for await (const line of stream) {
    if (!line) continue;
    const r = JSON.parse(line), s = r.settings;
    if (summary.metadata.seed === null) { summary.metadata.seed = r.seed; summary.metadata.barsPerPreset = r.bars.length; }
    if (r.seed !== summary.metadata.seed || r.bars.length !== summary.metadata.barsPerPreset) throw new Error(`Inconsistent sample: ${r.name}`);
    if (s.playMusic === false) { summary.metadata.excludedMusicOff.push(r.name); continue; }
    if (s.tonality?.mode === 'atonal') summary.chord.conversion.excludedAtonal.push(r.name);
    const compiled = { settings: s, flags: r.flags, choices: {} };
    for (const [i, rule] of RULES.entries()) {
        const state = ruleState(rule, compiled), result = summary.rules[i];
        const value = rule.path ? get(s, rule.path) : state.enabled;
        const key = valueLabel(value);
        if (state.enabled) add(result.values, key);
        add(result.statuses, state.status);
        addMember(result.categories, r.category, `${state.status} | ${key}`, r.name);
    }
    for (const [i, group] of GROUPS.entries()) {
        const key = valueLabel(groupValue(s, group.path));
        add(summary.groups[i].values, key);
        addMember(summary.groups[i].categories, r.category, key, r.name);
    }
    for (const p of settingsPaths) {
        const rule = RULES.find(r => r.path === p);
        if (!rule || ruleState(rule, compiled).enabled) add(summary.timing.settings[p], valueLabel(get(s, p)));
    }
    if (s.leadDensity !== 0) add(summary.timing.leadDensityEnabled, `${Number((s.leadDensity * 100).toFixed(2))}%`);
    for (const stack of STACKS) { const level = stackLevel(s, stack); if (level !== 0) add(summary.timing.stacks[stack.id], level < 0 ? 'Custom' : ['Off', 'Low', 'Med', 'High'][level]); }
    add(summary.harmony.homeModes, `${s.mode} (${scaleById(s.mode).name ?? s.mode})`);
    add(summary.harmony.homeProgressions, `${PROGRESSIONS[s.progression].length} | ${PROGRESSIONS[s.progression].join(' – ')}${s.progressionMode === 'generated' ? ' [template for generated]' : ''}`);
    add(summary.harmony.homeBarsPerChord, s.barsPerChord);
    add(summary.harmony.meter, s.meter); add(summary.harmony.tempo, s.bpm);
    add(summary.evolution.drift, s.drift.mode);
    if (s.drift.mode !== 'off') summary.evolution.enabledDrift++;
    add(summary.evolution.wanderMode, s.wander.mode);
    add(summary.evolution.ambienceWanderMode, s.ambienceWander.mode);
    const wander = Object.values(s.wander.voices).some(Boolean) && (s.wander.pan.min !== s.wander.pan.max || s.wander.volume > 0 || s.wander.filter > 0 || s.wander.pitch > 0);
    if (wander) summary.evolution.enabledWander++;
    const evolving = {
        'Conductor drift': s.drift.mode !== 'off',
        'Sections': s.sections.mode !== 'off',
        'Layer flow': s.layerFlow.mode !== 'off',
        'Long energy arc': s.arc.shape !== 'off',
        'Changing generated progression': s.progressionMode === 'generated' && s.progressionWander > 0,
        'Changing song': s.melodyPlan === 'change',
        'Key lift': s.keyLift > 0,
        'Pad shimmer': s.padVibrato > 0,
        'Timbre drift': s.timbreDrift > 0,
    };
    if (Object.values(evolving).some(Boolean)) summary.evolution.any++;
    for (const [name, enabled] of Object.entries(evolving)) if (enabled) add(summary.evolution.mechanisms, name);
    for (const [role, voice] of Object.entries(r.voices)) if (!voice.resolved || voice.external) summary.limitations.unresolvedVoices.push(`${r.name} / ${role}: ${voice.name}${voice.external ? ' (external)' : ''}`);
    const active = s.playMusic !== false;
    if (active) add(summary.harmony.modeDepartures, r.bars.some(b => b.music.mode !== s.mode) ? 'Mode departed from home' : 'Stayed in home mode');
    const times = [0];
    for (const b of r.bars) times.push(times.at(-1) + rubatoTime(b.rubato, 60 / unitsPerMinute(b.meter, b.bpm), b.meter.units));
    const boundaries = r.bars.filter(b => b.bar > 0 && b.music.cycleStart === b.bar).map(b => ({ bar: b.bar, time: times[b.bar] }));
    if (active) summary.notes.boundaryCount += boundaries.length;
    const crossed = new Set(), roleCounts = Object.fromEntries(roles.map(role => [role, { notes: 0, offBeat: 0, offGrid: 0 }]));
    const chordEvents = { pad: [], rhythm: [] }, figures = {}, slotParts = slotTracker(summary.chord.params);
    const localStyles = counts(), localCrossings = counts();
    for (const b of r.bars) {
        if (active) { add(summary.harmony.playedMeter, b.meter.label); add(summary.harmony.playedTempo, b.bpm); }
        if (active && b.music.cycleStart === b.bar) {
            add(summary.harmony.heardModes, b.music.mode);
            add(summary.harmony.heardProgressions, `${progression(b.music).split(' – ').length} | ${progression(b.music)}`);
        }
        if (active && b.ruleTrace?.slot?.start === b.bar) add(summary.harmony.playedSlotBars, b.ruleTrace.slot.bars);
        if (active && b.phrase.start === b.bar) {
            const layers = b.phrase.layers ?? 'combined';
            if (layers !== 'rhythm') add(summary.chord.choices, `pad: ${b.phrase.padStyle} / ${b.phrase.padPattern ?? 'none'} / step ${b.phrase.padStep}`);
            if (layers === 'rhythm' || layers === 'split') add(summary.chord.choices, `rhythm: ${b.phrase.rhythmStyle} / ${b.phrase.rhythmPattern ?? 'none'} / step ${b.phrase.rhythmStep}`);
        }
        const audible = b.events.filter(e => active && !s.muted?.[e.role]);
        summary.limitations.suppressedMusicEvents += active ? 0 : b.events.length;
        summary.limitations.mutedEvents += active ? b.events.length - audible.length : 0;
        if (active && audible.some(e => e.role === 'bass')) {
            add(summary.bass.styles, b.phrase.pedal ? 'pedal (whole)' : b.phrase.bassStyle);
            if (b.phrase.pedal) summary.bass.pedalBars++;
            const root = b.chord.pitchClasses[0];
            const shape = audible.filter(e => e.role === 'bass').sort((a, z) => a.beat - z.beat)
                .map(e => `${Math.round(e.beat * 4) / 4}:${((e.midi - root) % 12 + 12) % 12}`).join(', ');
            add(summary.bass.shapes, shape);
        }
        for (const role of ['pad', 'rhythm']) {
            const events = audible.filter(e => e.role === role);
            const sourced = events.filter(e => e.chordSource);
            summary.chord.unclassifiedNotes += events.length - sourced.length;
            const convertible = events.filter(e => e.chordSource && Number.isInteger(e.chordSource.root));
            const tonal = s.tonality?.mode !== 'atonal';
            if (tonal && events.length && !convertible.length) summary.chord.conversion.untaggedRoleBars++;
            if (tonal && convertible.length && convertible.length < events.length) summary.chord.conversion.partiallyTaggedRoleBars++;
            const comparison = tonal ? compareChordConversion({ ...b, events: convertible }, role) : null;
            if (comparison) {
                const outcome = comparison.matches ? 'Matching attacks and pitches' : 'Different attacks or pitches';
                add(summary.chord.conversion.outcomes, outcome);
                add(summary.chord.conversion.reference, comparison.reference.reference);
                if (comparison.reference.structure) {
                    add(summary.chord.conversion.structures, comparison.reference.structure);
                    add(summary.chord.conversion.capturedHarmony, comparison.reference.captured);
                    const size = `${new Set(b.chord.pitchClasses).size} pitch classes`;
                    summary.chord.conversion.chordSizes[size] ??= counts();
                    add(summary.chord.conversion.chordSizes[size], comparison.reference.structure);
                    summary.chord.conversion.structureVsPlayback[comparison.reference.structure] ??= counts();
                    add(summary.chord.conversion.structureVsPlayback[comparison.reference.structure], comparison.samePitchClasses ? 'Same captured and emitted pitch classes' : 'Different captured and emitted pitch classes');
                }
                add(summary.chord.conversion.pitchDifferences, comparison.pitchDifference);
                summary.chord.conversion.byStyle[comparison.style] ??= counts();
                add(summary.chord.conversion.byStyle[comparison.style], outcome);
                summary.chord.conversion.pitchByStyle[comparison.style] ??= counts();
                summary.chord.conversion.attacksByStyle[comparison.style] ??= counts();
                add(summary.chord.conversion.pitchByStyle[comparison.style], comparison.samePitches ? 'Same pitches' : 'Different pitches');
                add(summary.chord.conversion.attacksByStyle[comparison.style], comparison.sameAttackSteps ? 'Same attack positions' : 'Different attack positions');
                if (!comparison.matches && !summary.chord.conversion.examples[comparison.style]) {
                    summary.chord.conversion.examples[comparison.style] = { preset: r.name, bar: b.bar, role, chord: b.chord.name,
                        expected: comparison.expected, actual: comparison.actual };
                }
                for (const [label, matches] of Object.entries({
                    'Raw captured notes': comparison.captureMatches,
                    'Default chord: pitch classes': comparison.samePitchClasses,
                    'Default chord: exact pitches': comparison.samePitches,
                    'Default chord: attack positions': comparison.sameAttackSteps,
                    'Default chord: pitch and attack pairs': comparison.matches,
                })) {
                    summary.chord.conversion.diagnostics[label] ??= counts();
                    add(summary.chord.conversion.diagnostics[label], matches ? 'Matches' : 'Differs');
                }
            }
            const part = tonal && !b.split && convertible.length ? describePart(convertible, { chord: b.chord, mode: b.music.mode, tonic: b.music.tonic,
                units: b.meter.units, slotBars: b.ruleTrace?.slot?.bars ?? 1 }) : null;
            if (tonal && b.split && convertible.length) summary.chord.params.excluded['Split bar (more than one chord)']++;
            if (part) {
                const labels = [...new Set(convertible.map(e => e.chordSource.style))];
                const slot = b.ruleTrace?.slot, chordBar = slot ? b.bar - slot.start : 0, figure = figureOf(convertible);
                if (part.play.mode === 'arp' && chordBar === 0 && figure) figures[role] = { start: slot?.start, figure };
                const base = figures[role]?.start === slot?.start ? figures[role].figure : null;
                recordPart(summary.chord.params, part, r.voices[role].name, role, labels.length === 1 ? labels[0] : 'mixed',
                    labels.length === 1 ? `${labels[0]} / ${convertible[0].chordSource.pattern ?? 'none'}` : 'mixed', { chordBar, base, figure });
                slotParts.add(role, { start: slot?.start ?? b.bar, chord: b.chord, mode: part.play.mode, midis: convertible.map(e => e.midi) });
            }
            const combinations = new Set(sourced.map(e => `${e.chordSource.style} / ${e.chordSource.pattern ?? 'none'} / step ${e.chordSource.step}`));
            for (const combo of combinations) {
                add(summary.chord.combinations, combo); add(localStyles, combo);
                const sound = `${r.voices[role].name} (${role})`;
                summary.chord.sounds[sound] ??= counts(); add(summary.chord.sounds[sound], combo.split(' / ')[0]);
            }
            const slots = counts();
            for (const e of sourced) {
                add(summary.chord.notes, `${e.chordSource.style} / ${e.chordSource.pattern ?? 'none'}`);
            }
            for (const e of events) add(slots, Math.round(e.beat * 4) / 4);
            if (events.length) add(summary.chord.shapes, `${role}: ${Object.entries(slots).sort((a, b) => Number(a[0]) - Number(b[0])).map(([at, n]) => `${at}=${n}`).join(', ')}`);
        }
        const unit = 60 / unitsPerMinute(b.meter, b.bpm);
        for (const e of audible) {
            const stats = roleCounts[e.role];
            if (!stats) throw new Error(`Unknown role ${e.role} in ${r.name}`);
            stats.notes++; summary.notes.total++;
            if (beatDistance(e.beat, b.meter) > 0.02) stats.offBeat++;
            if (Math.abs(e.beat * 4 - Math.round(e.beat * 4)) / 4 > 0.02) stats.offGrid++;
            const start = times[b.bar] + rubatoTime(b.rubato, unit, e.beat);
            const end = times[b.bar] + rubatoTime(b.rubato, unit, e.beat + e.length);
            if (chordEvents[e.role]) chordEvents[e.role].push({ start, end, midi: e.midi });
            const crossings = crossedBoundaries(start, end, boundaries);
            if (crossings.length) summary.notes.crossingNotes++;
            for (const boundary of crossings) {
                summary.notes.crossings++; add(summary.notes.crossingsByRole, e.role); add(localCrossings, e.role); crossed.add(boundary.bar);
            }
            if (e.ornament) add(summary.notes.ornaments, e.ornament);
            if (e.expression) for (const key of Object.keys(e.expression)) add(summary.notes.expression, key);
            add(summary.notes.expressionComplexity, Object.keys(e.expression ?? {}).length);
            if (e.expression?.pitchTargets) add(summary.notes.pitchTargets, e.expression.pitchTargets.length);
            add(summary.notes.lengths, e.length < .25 ? '<0.25' : e.length < .5 ? '0.25–<0.5' : e.length < 1 ? '0.5–<1' : e.length < 2 ? '1–<2' : e.length < 4 ? '2–<4' : '4+');
            add(summary.notes.velocity, Math.min(9, Math.floor(e.velocity * 10)) / 10);
            if (Number.isFinite(e.detune)) add(summary.notes.detune, Math.round(e.detune));
        }
    }
    slotParts.flushAll();
    for (const [role, events] of Object.entries(chordEvents)) {
        const gestures = chordGestures(events);
        add(summary.chord.gestures, `${role}: held single into chord`, gestures.heldSingleIntoChord);
        add(summary.chord.gestures, `${role}: chord, pause, chord`, gestures.chordPauseChord);
        add(summary.chord.gestures, `${role}: same chord, pause, same chord`, gestures.sameChordPauseSameChord);
    }
    summary.notes.crossingBoundaries += crossed.size;
    for (const role of roles) {
        const row = summary.timing.voices[role], measured = roleCounts[role];
        row.notes += measured.notes; row.offBeat += measured.offBeat; row.offGrid += measured.offGrid;
        if (measured.offBeat) row.presets.push(r.name);
    }
    summary.presets.push({ name: r.name, category: r.category, slug: r.slug, playMusic: active, meter: s.meter, bpm: s.bpm,
        mode: s.mode, progression: progression({ progression: s.progression }), barsPerChord: s.barsPerChord,
        voices: Object.fromEntries(Object.entries(r.voices).map(([role, voice]) => [role, voice.name])),
        drift: s.drift.mode, wander: s.wander.mode, styles: localStyles, crossings: localCrossings, roles: roleCounts });
}
if (!summary.presets.length) throw new Error('Empty note database');
const total = object => Object.values(object).reduce((sum, value) => sum + value, 0);
if (summary.rules.some(rule => total(rule.statuses) !== summary.presets.length || total(rule.values) !== summary.presets.length - (rule.statuses.Off ?? 0)))
    throw new Error('Rule distributions do not cover every preset');
if (total(summary.notes.lengths) !== summary.notes.total || total(summary.notes.velocity) !== summary.notes.total
    || total(summary.notes.expressionComplexity) !== summary.notes.total
    || Object.values(summary.timing.voices).reduce((sum, role) => sum + role.notes, 0) !== summary.notes.total)
    throw new Error('Note distributions do not sum to the event total');
if (Object.values(summary.chord.gestures).some(count => count > summary.notes.total)) throw new Error('Chord gesture count exceeds total events');
fs.writeFileSync(output, JSON.stringify(summary));
console.log(`Wrote ${output}: ${summary.presets.length} presets, ${summary.notes.total} unmuted planned events`);
