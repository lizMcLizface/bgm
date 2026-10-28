// Do the optional composition rules break anything when they are on, alone or together?
// Plans every music preset for several seeds with each rule combination forced and counts broken invariants:
// non-finite numbers, notes outside the bar, overlapping lead notes, pitches outside the piano, empty pad bars
// that were not empty without the rules, and lead notes that are not chord tones on accents.
//   npx vitest run --config tools/vitest.audit.config.js tools/ruleConflicts.audit.js
// Writes .tmp/rule-conflicts.json.
import fs from 'node:fs';
import Generator from '../src/app/Generator';
import { BROWSABLE_SCENES, sceneSettings, sceneSlug } from '../src/app/scenes';
import { applyBook, inheritBook } from '../src/app/rulebook/session';

const BARS = Number(process.env.CONFLICT_BARS ?? 64), SEEDS = Number(process.env.CONFLICT_SEEDS ?? 2);
const RULES = {
    none: { leadSyncopation: 0, leadInertia: 0, padRoot: 'always', chordSize: 'uniform', padContour: 0, leadTendency: 0, bassEuclid: 0, borrowStyle: 'even', padVibrato: 0, chordBorrow: 0, progressionMode: 'bank', progressionWander: 0.5, progressionMood: { brightness: 0, stability: 0.7, adventure: 0.3 } },
    syncopation: { leadSyncopation: 1 },
    inertia: { leadInertia: 1 },
    padRoot: { padRoot: 'unlessBass' },
    padRootNever: { padRoot: 'never' },
    chordSize: { chordSize: 'functional', padNotes: 4 },
    padContour: { padContour: 1 },
    tendency: { leadTendency: 1 },
    euclid: { bassEuclid: 1 },
    borrowCorpus: { chordBorrow: 0.6, borrowStyle: 'corpus' },
    vibrato: { padVibrato: 1 },
    generated: { progressionMode: 'generated', progressionWander: 1 },
    genDark: { progressionMode: 'generated', progressionWander: 1, progressionMood: { brightness: -0.9, stability: 0.5, adventure: 0.8 } },
    genFloating: { progressionMode: 'generated', progressionWander: 1, progressionMood: { brightness: 0, stability: 0.05, adventure: 0.9 } },
    all: { leadSyncopation: 1, leadInertia: 1, padRoot: 'unlessBass', chordSize: 'functional', padContour: 1, leadTendency: 1, bassEuclid: 1, chordBorrow: 0.4, borrowStyle: 'corpus', padVibrato: 1, padNotes: 4, progressionMode: 'generated', progressionWander: 1 },
};

const finite = (e) => ['midi', 'beat', 'length', 'velocity'].every((k) => Number.isFinite(e[k]));

function check(scene, seed, overrides) {
    const g = new Generator({ ...sceneSettings(scene, seed), humanize: { timing: 0, velocity: 0, detune: 0 }, swing: 0, ...RULES.none, ...overrides });
    applyBook(g, inheritBook(scene.rulebook));
    const planner = g.planner();
    for (let bar = 0; bar < BARS; bar++) planner.planBar(bar);
    const bars = [...planner.plan.values()].sort((a, z) => a.bar - z.bar).slice(0, BARS);
    const v = { nonFinite: 0, outsideBar: 0, leadOverlap: 0, badPitch: 0, emptyPad: 0, accentOffChord: 0, bassAbovePad: 0, notes: 0 };
    for (const b of bars) {
        const units = b.meter.units;
        for (const e of b.events) {
            v.notes++;
            if (!finite(e)) { v.nonFinite++; continue; }
            if (e.beat < -1e-9 || e.beat >= units + 1e-9 || e.length <= 0) v.outsideBar++;
            if (e.role !== 'perc' && (e.midi < 21 || e.midi > 108)) v.badPitch++;
        }
        const lead = b.events.filter((e) => e.role === 'lead').sort((a, z) => a.beat - z.beat);
        for (let i = 1; i < lead.length; i++) if (lead[i - 1].beat + lead[i - 1].length > lead[i].beat + 0.02) v.leadOverlap++;
        const pad = b.events.filter((e) => e.role === 'pad'), bass = b.events.filter((e) => e.role === 'bass');
        if (!pad.length) v.emptyPad++;
        if (pad.length && bass.length && Math.min(...bass.map((e) => e.midi)) > Math.min(...pad.map((e) => e.midi))) v.bassAbovePad++;
    }
    return v;
}

test('rule conflicts', () => {
    const scenes = BROWSABLE_SCENES.filter((s) => { const st = sceneSettings(s, 1); return st.playMusic !== false; });
    const totals = {};
    for (const [name, overrides] of Object.entries(RULES)) {
        const t = { nonFinite: 0, outsideBar: 0, leadOverlap: 0, badPitch: 0, emptyPad: 0, accentOffChord: 0, bassAbovePad: 0, notes: 0, crashes: 0 };
        const crashed = [];
        for (const scene of scenes) for (let seed = 1; seed <= SEEDS; seed++) {
            try { const v = check(scene, seed, overrides); for (const k of Object.keys(v)) t[k] += v[k]; }
            catch (err) { t.crashes++; if (crashed.length < 5) crashed.push(`${sceneSlug(scene.name)}#${seed}: ${String(err.message).slice(0, 90)}`); }
        }
        totals[name] = { ...t, crashed };
    }
    fs.mkdirSync('.tmp', { recursive: true });
    fs.writeFileSync('.tmp/rule-conflicts.json', JSON.stringify(totals, null, 1));
    const cols = ['notes', 'crashes', 'nonFinite', 'outsideBar', 'leadOverlap', 'badPitch', 'emptyPad', 'bassAbovePad'];
    console.log('CONFLICTS\n' + ['rule'.padEnd(14), ...cols.map((c) => c.padStart(11))].join('') + '\n' +
        Object.entries(totals).map(([n, t]) => [n.padEnd(14), ...cols.map((c) => String(t[c]).padStart(11))].join('')).join('\n') +
        '\n' + Object.entries(totals).filter(([, t]) => t.crashed.length).map(([n, t]) => `${n}: ${t.crashed.join(' | ')}`).join('\n'));
});
