// Offline composition audit (npm run audit:composition): plans every browsable preset for
// BARS bars under several seeds, with humanisation and swing off so beats are the composed
// grid, measures the plan (tools/compositionMetrics.js) and writes
//   .tmp/composition-audit/report.json   per-preset values
//   .tmp/composition-audit/summary.md    cross-preset medians against the published norms
// in docs/theory-notes/ (docs/MUSIC_THEORY_GROUNDING.md §4). Planning only: no audio, so this
// shows what to try, not how it sounds.
//
//   AUDIT_BARS=128 AUDIT_SEEDS=2 npm run audit:composition
//   AUDIT_ONLY=boss-fight-politely,rainy-cafe npm run audit:composition

import fs from 'node:fs';
import path from 'node:path';
import Generator from '../src/app/Generator';
import { SCENES, BROWSABLE_SCENES, sceneSettings, sceneSlug } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';
import { groupStarts, unitsPerMinute } from '../src/app/meter';
import { scaleById, scaleSemitones } from '../src/app/theory';
import * as M from './compositionMetrics';

const BARS = Number(process.env.AUDIT_BARS ?? 128), SEEDS = Number(process.env.AUDIT_SEEDS ?? 2);
const ONLY = process.env.AUDIT_ONLY ? new Set(process.env.AUDIT_ONLY.split(',')) : null;
const OUT = path.resolve('.tmp/composition-audit');

const thirdOf = (modeId) => scaleSemitones(scaleById(modeId).intervals)[2];

function auditScene(scene, seed) {
    const settings = { ...sceneSettings(scene, seed), humanize: { timing: 0, velocity: 0, detune: 0 }, swing: 0 };
    const g = new Generator(settings);
    applyBook(g, inheritBook(scene.rulebook));
    const planner = g.planner();
    for (let bar = 0; bar < BARS; bar++) planner.planBar(bar);
    const bars = [...planner.plan.values()].sort((a, z) => a.bar - z.bar).slice(0, BARS);
    const meter = planner.meter, beatsPerBar = meter.units;
    const tonicOf = (bar) => planner.plan.get(bar)?.music?.tonic ?? 0;
    const tonal = (g.settings.tonality?.mode ?? 'tonal') === 'tonal' && g.settings.playMusic !== false;
    const mode = g.settings.mode, third = tonal ? thirdOf(mode) : null;
    const leadAll = M.stream(bars, 'lead'), lead = M.line(leadAll);
    const syncRows = M.syncopationByBar(bars);
    const roots = M.chordRoots(bars, tonicOf);
    const rows = {
        slug: sceneSlug(scene.name), name: scene.name, seed, leadEnding: g.settings.leadEnding, bars: bars.length, meter: meter.label, mode, tonal,
        modeFamily: third === 4 ? 'major-like' : third === 3 ? 'minor-like' : 'other', bpm: bars[0]?.bpm,
        leadNotes: lead.length,
        intervals: lead.length > 20 ? M.intervalStats(lead) : null,
        register: lead.length > 20 ? M.registerStats(lead) : null,
        degrees: tonal && lead.length > 20 ? M.degreeProfile(lead, tonicOf) : null,
        finals: tonal && lead.length > 20 ? M.phraseFinals(lead, tonicOf, beatsPerBar) : null,
        strongBeat: M.strongBeatChordTones(bars, 'lead', groupStarts),
        leadVsChord: M.chordRelativeShare(bars, 'lead'),
        phraseEnds: tonal && lead.length > 20 ? { all: M.phraseEndNotes(lead, tonicOf), first: M.phraseEndNotes(lead, tonicOf, 4, 0), second: M.phraseEndNotes(lead, tonicOf, 4, 1), call: M.phraseEndNotes(lead, tonicOf, 2, 0), response: M.phraseEndNotes(lead, tonicOf, 2, 1) } : null,
        syncopation: { meanPerBar: Number((M.syncopationByBar(bars).filter((r) => r.score !== null).reduce((a, r) => a + r.score, 0) / Math.max(1, syncRows.filter((r) => r.score !== null).length)).toFixed(3)), byPhrasePosition: M.syncopationByPhrasePosition(syncRows) },
        leadDensityByPhrasePosition: M.densityByPhrasePosition(bars, ['lead']),
        harmony: tonal ? { chords: roots.chords, dominantArrivals: M.dominantSeventhAtCadence(roots.roots), rootShare: roots.rootShare, fifthsDistanceShare: roots.fifthsDistanceShare, seventhShare: roots.seventhShare, } : null,
        circulation: M.pitchClassCirculation(bars),
        exactRepeat: M.exactRepeatRatio(bars), exactRepeatByRole: M.exactRepeatByRole(bars),
        spacing: M.lowRegisterSpacing(bars),
        mood: M.moodCues(bars, unitsPerMinute),
    };
    return rows;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const wmean = (items, value, weight) => { const w = sum(items.map(weight)); return w ? sum(items.map((r) => (value(r) ?? 0) * weight(r))) / w : null; };
const finite = (xs) => xs.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((a, z) => a - z);
const q = (xs, p) => { const s = finite(xs); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const fmt = (x, d = 3) => (x === null || x === undefined ? '–' : Number(x).toFixed(d));
const dist = (xs, d = 3) => `${fmt(q(xs, 0.5), d)} (${fmt(q(xs, 0.1), d)}–${fmt(q(xs, 0.9), d)})`;

function summarise(results) {
    const L = [];
    const some = (f) => results.map(f);
    const withLead = results.filter((r) => r.intervals);
    L.push('# Composition audit summary', '', `${results.length} runs (${new Set(results.map((r) => r.slug)).size} presets × ${SEEDS} seeds × ${BARS} bars). Values are the median across runs with the 10th–90th percentile range. Norms are from docs/theory-notes/.`, '');
    const iv = (f) => withLead.map((r) => f(r.intervals));
    const pooled = (f) => fmt(wmean(withLead, (r) => f(r.intervals), (r) => r.intervals.count));
    const row = (label, f, norm, source) => L.push(`| ${label} | ${pooled(f)} | ${dist(iv(f))} | ${norm} | ${source} |`);
    L.push('## Lead melody intervals', '', 'Pooled = all runs weighted by number of intervals; median is across runs.', '', '| measure | pooled | median (p10–p90) | published | source |', '| --- | --- | --- | --- | --- |');
    row('unison share', (i) => i.unison, 'composers .12, folk .18', 'Vos & Troost');
    row('step share (1–2 semitones)', (i) => i.step, 'composers .53, folk .55', 'Vos & Troost');
    row('thirds (3–4)', (i) => i.thirds, 'composers .18, folk .20', 'Vos & Troost');
    row('leaps ≥ 5 semitones', (i) => i.leap5plus, 'composers ≈ .19, folk ≈ .10', 'Vos & Troost');
    row('ascending share, steps (1–2)', (i) => i.ascendingShare.small1to2, 'composers ≈ .45, folk ≈ .41', 'Vos & Troost');
    row('ascending share, leaps ≥ 5', (i) => i.ascendingShare.large5plus, 'composers ≈ .55, folk ≈ .66', 'Vos & Troost');
    row('descend after a descending step', (i) => i.descendAfterDescendingStep, '≈ .70', 'Huron 2006');
    row('ascend after an ascending step', (i) => i.ascendAfterAscendingStep, '≈ .51', 'Huron 2006');
    row('direction reverses after a leap ≥ 5', (i) => i.reverseAfterLeap5plus, 'rises with size, ≈ .5–.7', 'Huron 2006 (Watt)');
    L.push('', '## Lead register', '', '| measure | ours | published | source |', '| --- | --- | --- | --- |');
    const rg = results.filter((r) => r.register);
    L.push(`| mean lead pitch (MIDI) | ${dist(rg.map((r) => r.register.meanPitch), 1)} | Essen central pitch ≈ 68 (voice range) | Temperley |`);
    L.push(`| pitch variance within a 4-bar window | ${dist(rg.map((r) => r.register.varianceWithinPhrase), 1)} | within one melody ≈ 10.6 | Temperley |`);
    L.push(`| strong-beat lead notes that are chord tones | ${dist(results.map((r) => r.strongBeat.chordToneShare))} | – (our own rule) | |`);

    const profile = (family, norm) => {
        const rs = results.filter((r) => r.degrees && r.modeFamily === family);
        if (!rs.length) return '';
        const names = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];
        const row = (label, vals) => `| ${label} | ${vals.map((v) => fmt(v)).join(' | ')} |`;
        const pooledDegrees = names.map((_, i) => wmean(rs, (r) => r.degrees[i], (r) => r.leadNotes));
        return ['', `### Degree profile, ${family} presets (${rs.length} runs), proportion of lead notes (pooled, weighted by lead notes)`, '', `| | ${names.join(' | ')} |`, `| --- | ${names.map(() => '---').join(' | ')} |`, row('ours', pooledDegrees), row('Essen ' + (family === 'major-like' ? 'major' : 'minor'), norm)].join('\n');
    };
    L.push(profile('major-like', [0.184, 0.001, 0.155, 0.003, 0.191, 0.109, 0.005, 0.214, 0.001, 0.078, 0.004, 0.055]));
    L.push(profile('minor-like', [0.192, 0.005, 0.149, 0.179, 0.002, 0.144, 0.002, 0.201, 0.038, 0.012, 0.053, 0.022]));
    const fin = results.filter((r) => r.finals && r.finals.count > 5 && r.modeFamily === 'major-like');
    const names7 = ['1', '2', '3', '4', '5', '6', '7'], pcs7 = [0, 2, 4, 5, 7, 9, 11];
    if (fin.length) {
        L.push('', `### Notes before a rest of a beat or more, major-like presets (${fin.length} runs): share by degree (pooled)`, '', `| | ${names7.join(' | ')} |`, `| --- | ${names7.map(() => '---').join(' | ')} |`,
            `| ours | ${pcs7.map((pc) => fmt(wmean(fin, (r) => r.finals.distribution[pc], (r) => r.finals.count))).join(' | ')} |`,
            '| Huron Table 9.2 (rest column, diatonic) | .332 | .137 | .213 | .049 | .206 | .037 | .025 |');
    }
    const pend = results.filter((r) => r.phraseEnds && r.phraseEnds.all.count > 5 && r.modeFamily === 'major-like');
    if (pend.length) {
        const rowOf = (key, label) => `| ${label} | ${pcs7.map((pc) => fmt(wmean(pend, (r) => r.phraseEnds[key].distribution[pc], (r) => r.phraseEnds[key].count))).join(' | ')} |`;
        L.push('', `### Last lead note of each 4-bar phrase, major-like presets (${pend.length} runs): share by degree (pooled)`, '', `| | ${names7.join(' | ')} |`, `| --- | ${names7.map(() => '---').join(' | ')} |`,
            rowOf('all', 'all 4-bar phrases'), rowOf('first', '4-bar phrase, first of a pair'), rowOf('second', '4-bar phrase, second of a pair'), rowOf('call', 'end of the 2-bar call (bar 2 of 4)'), rowOf('response', 'end of the 2-bar response (bar 4 of 4)'));
        const triad = (key) => wmean(pend, (r) => [0, 4, 7].reduce((a, pc) => a + (r.phraseEnds[key].distribution[pc] ?? 0), 0), (r) => r.phraseEnds[key].count);
        for (const mode of ['settled', 'open']) {
            const sub = pend.filter((r) => r.leadEnding === mode);
            if (sub.length) L.push('', `Lead-ending setting "${mode}" (${sub.length} runs): tonic-triad share at the end of the call ${fmt(wmean(sub, (r) => [0, 4, 7].reduce((a, pc) => a + (r.phraseEnds.call.distribution[pc] ?? 0), 0), (r) => r.phraseEnds.call.count))}, at the end of the 4-bar response ${fmt(wmean(sub, (r) => [0, 4, 7].reduce((a, pc) => a + (r.phraseEnds.response.distribution[pc] ?? 0), 0), (r) => r.phraseEnds.response.count))}.`);
        }
        L.push('', `Share ending on a tonic-triad degree (1, 3, 5): 4-bar pairs ${fmt(triad('first'))} then ${fmt(triad('second'))}; call ${fmt(triad('call'))}, response ${fmt(triad('response'))}.`);
    }

    L.push('', '## Rhythm', '', '| measure | ours | note |', '| --- | --- | --- |');
    L.push(`| Keith syncopation per bar (merged lead/bass/perc/counter onsets) | ${dist(results.map((r) => r.syncopation.meanPerBar), 2)} | no published target; Witek: medium is best for groove |`);
    const pos = (i) => dist(results.map((r) => r.syncopation.byPhrasePosition[i]), 2);
    L.push(`| syncopation by bar of a 4-bar phrase: 1 / 2 / 3 / 4 | ${[0, 1, 2, 3].map(pos).join(' / ')} | GTTM: cadence bar (4) should be plainer |`);
    const dens = (i) => dist(results.map((r) => r.leadDensityByPhrasePosition[i]), 2);
    L.push(`| lead notes per bar by phrase position 1 / 2 / 3 / 4 | ${[0, 1, 2, 3].map(dens).join(' / ')} | sentence form: density should rise in bars 3–4 |`);

    L.push('', '## Harmony (tonal presets)', '');
    const hs = results.filter((r) => r.harmony && r.harmony.chords > 8);
    const pool = (get) => { const w = sum(hs.map((r) => r.harmony.chords)); return w ? sum(hs.map((r) => (get(r.harmony) ?? 0) * r.harmony.chords)) / w : null; };
    const roman = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
    const corpus = { I: 0.328, bII: 0.005, II: 0.036, bIII: 0.026, III: 0.019, IV: 0.226, '#IV': 0.003, V: 0.163, bVI: 0.04, VI: 0.072, bVII: 0.081, VII: 0.004 };
    L.push(`Pooled over ${hs.length} runs (chords weighted equally across presets; each preset's bank has only a few distinct chords, so per-preset medians are not meaningful).`, '', '| measure | ours | published | source |', '| --- | --- | --- | --- |');
    roman.forEach((n) => L.push(`| root ${n} share | ${fmt(pool((h) => h.rootShare[n]))} | ${corpus[n]} | de Clercq & Temperley Table 2 |`));
    const fifths = { 1: 0.49, 2: 0.303, 3: 0.094, 4: 0.081, 5: 0.03, 6: 0.002 };
    [1, 2, 3, 4, 5, 6].forEach((d) => L.push(`| root motion, ${d} step(s) on the circle of fifths | ${fmt(pool((h) => h.fifthsDistanceShare[d] ?? 0))} | ${fifths[d]} | de Clercq & Temperley Tables 5–6 |`));
    L.push(`| share of chords with a seventh | ${fmt(pool((h) => h.seventhShare))} | – | |`);
    const arrivals = sum(hs.map((r) => r.harmony.dominantArrivals.arrivals)), withSeventh = sum(hs.map((r) => r.harmony.dominantArrivals.withSeventh));
    L.push(`| V→I arrivals preceded by a seventh chord (${arrivals} arrivals) | ${fmt(arrivals ? withSeventh / arrivals : null)} | final cadences in major-key sonatas: .76–.88 with V7 | Temperley |`);
    const lc = (k) => dist(results.map((r) => r.leadVsChord[k]));
    L.push('', '### Lead notes against the sounding chord (all lead notes)', '', '| root | third | fifth | seventh | outside the chord |', '| --- | --- | --- | --- | --- |', `| ${['root', 'third', 'fifth', 'seventh', 'nonChord'].map(lc).join(' | ')} |`, '');

    L.push('', '## Macroharmony (Tymoczko pitch-class circulation: mean distinct pitch classes per N note attacks)', '', '| N | ours | note |', '| --- | --- | --- |');
    [2, 4, 8, 16, 32, 64, 100].forEach((n) => L.push(`| ${n} | ${dist(results.map((r) => r.circulation[n]), 2)} | ${n === 100 ? 'diatonic ≈ 7, pentatonic ≈ 5, chromatic → 12' : ''} |`));

    L.push('', '## Repetition and texture', '', '| measure | ours | published | source |', '| --- | --- | --- | --- |');
    L.push(`| bars that exactly repeat an earlier bar (all tracks) | ${dist(results.map((r) => r.exactRepeat))} | .628 (SD .035 across consoles) | Hunt 2020 |`);
    ['lead', 'counter', 'pad', 'bass', 'perc'].forEach((role) => L.push(`| same, ${role} layer alone (bars where it plays) | ${dist(results.map((r) => r.exactRepeatByRole[role]))} | – | |`));
    L.push(`| bars whose lowest simultaneous pair is within a minor third below C4 | ${dist(results.map((r) => r.spacing.closeLowPairShare))} | – (Huron: avoid) | Huron 2016 |`);
    L.push(`| mean roughness of bar-start sonorities | ${dist(results.map((r) => r.spacing.meanRoughness))} | – (Sethares fit of Plomp & Levelt; constants recalled) | |`);
    L.push('', '## Mood cues', '', '| measure | ours | reference scale | source |', '| --- | --- | --- | --- |');
    L.push(`| notes per second (pitched voices) | ${dist(results.map((r) => r.mood.notesPerSecond), 2)} | 1.2 / 2 / 2.8 / 4.4 / 6 | Eerola et al. |`);
    L.push(`| lead mean MIDI | ${dist(results.map((r) => r.mood.leadMeanMidi), 1)} | F3 (53) … B5 (83) | Eerola et al. |`);
    L.push(`| lead articulation (length / gap to next) | ${dist(results.map((r) => r.mood.leadArticulation), 2)} | 1 legato … 0.25 | Eerola et al. |`);
    const byPreset = new Map(); results.forEach((r) => { if (!byPreset.has(r.slug)) byPreset.set(r.slug, []); byPreset.get(r.slug).push(r); });
    const rank = (title, key, d = 2, n = 8, asc = false) => {
        const rows = [...byPreset.values()].map((rs) => [rs[0].name, mean(rs.map(key).filter((x) => x !== null && x !== undefined))]).filter(([, v]) => v !== null && Number.isFinite(v));
        rows.sort((a, z) => (asc ? a[1] - z[1] : z[1] - a[1]));
        L.push('', `### ${title}`, '', rows.slice(0, n).map(([name, v]) => `${name} ${fmt(v, d)}`).join(' · '));
    };
    L.push('', '## Presets at the extremes (mean over seeds)');
    rank('Most syncopated (Keith, per bar)', (r) => r.syncopation.meanPerBar);
    rank('Fewest leaps of 5+ semitones in the lead (min. 40 lead notes)', (r) => (r.leadNotes >= 40 ? r.intervals?.leap5plus : null), 3, 8, true);
    rank('Most exact bar repeats (all tracks)', (r) => r.exactRepeat, 3);
    rank('Fewest exact bar repeats', (r) => r.exactRepeat, 3, 8, true);
    rank('Most bars with a close low pair (Huron: avoid)', (r) => r.spacing.closeLowPairShare, 3);
    rank('Highest pitch-class circulation at N=100 (chromatic or drifting)', (r) => r.circulation[100], 2);
    return L.join('\n') + '\n';
}

test('audit', () => {
    const scenes = (ONLY ? SCENES.filter((s) => ONLY.has(sceneSlug(s.name))) : BROWSABLE_SCENES).filter((s) => s.settings.playMusic !== false);
    const results = [], failures = [], started = Date.now();
    for (const scene of scenes) for (let k = 0; k < SEEDS; k++) {
        try { results.push(auditScene(scene, 1000 + 7919 * k + scene.name.length)); }
        catch (error) { failures.push({ scene: scene.name, seed: k, error: String(error?.stack ?? error).slice(0, 400) }); }
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ created: new Date().toISOString(), bars: BARS, seeds: SEEDS, failures, results }, null, 1));
    fs.writeFileSync(path.join(OUT, 'summary.md'), summarise(results));
    console.log(`audited ${results.length} runs of ${scenes.length} presets in ${((Date.now() - started) / 1000).toFixed(1)} s; ${failures.length} failures`);
    if (failures.length) console.log(JSON.stringify(failures.slice(0, 5), null, 1));
    expect(results.length).toBeGreaterThan(0);
});
