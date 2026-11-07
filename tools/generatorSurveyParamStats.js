// Tallies of the sequencer-parameter descriptions (generatorSurveyParams.js) for the survey summary.
import { figureVariation, sequencerGaps, writtenChord } from './generatorSurveyParams';

const mod = (n, m) => ((n % m) + m) % m;

const counts = () => Object.create(null);
const add = (object, key, n = 1) => { key = String(key ?? '(none)'); object[key] = (object[key] ?? 0) + n; };
const nested = (object, outer, inner) => { object[outer] ??= counts(); add(object[outer], inner); };
const spanBucket = span => span <= 7 ? '≤ 7 (close)' : span <= 12 ? '8–12 (within an octave)' : span <= 19 ? '13–19 (open)' : '20+ (very wide)';

export function newParams() {
    return {
        instances: 0, excluded: { 'Split bar (more than one chord)': 0 },
        // the chord
        family: counts(), chordFit: counts(),
        // inversion and the lowest tone
        bassTone: counts(), inversion: counts(), bassToneByOmission: {}, inversionByMode: {}, bassToneByFamily: {},
        // left-out tones
        omitted: counts(), omittedByMode: {}, omittedByFamily: {}, omittedByRole: {}, omittedByPreset: counts(), doubled: counts(), doubledByOmission: {},
        spacing: counts(), spacingByMode: {},
        // fit against the sequencer's chord set
        fit: counts(), fitReason: counts(), fitByMode: {}, best: { complexity: counts(), colour: counts(), rootVoicing: counts(), inversion: counts() },
        // the playing
        mode: counts(), modeByStyle: {}, direction: {}, rate: {}, hold: {}, hits: {}, lengthShare: {}, slotBars: counts(), hitPattern: counts(),
        // all of it together
        slotOmitted: counts(), slotOmittedByMode: {}, slotOmittedByRole: {}, slotOmittedByFamily: {}, variation: counts(), variationByDirection: {}, otherFigures: counts(), arpRhythm: counts(), doubledRoles: counts(),
        gaps: counts(), gapCount: counts(), vectors: counts(),
    };
}

export function recordPart(P, { play, voicing }, voiceName, role, style, styleLabel, { chordBar = 0, base = null, figure = null } = {}) {
    P.instances++;
    add(P.family, voicing.family);
    add(P.chordFit, voicing.chordFit ? `${voicing.chordFit.complexity} / ${voicing.chordFit.colour}` : 'No sequencer equivalent');
    const omission = voicing.omitted.length ? `omits ${voicing.omitted.join(' + ')}` : 'complete';
    add(P.bassTone, voicing.bassTone);
    add(P.inversion, voicing.omitted.includes('root') && voicing.inversion > 0 ? `${voicing.inversion} (root omitted)` : voicing.inversion);
    nested(P.bassToneByOmission, omission, voicing.bassTone);
    nested(P.bassToneByFamily, voicing.family, voicing.bassTone);
    nested(P.inversionByMode, play.mode, voicing.bassTone);
    add(P.omitted, omission);
    nested(P.omittedByMode, play.mode, omission);
    nested(P.omittedByFamily, voicing.family, omission);
    nested(P.omittedByRole, role, omission);
    if (voicing.omitted.length) add(P.omittedByPreset, voiceName);
    add(P.doubled, voicing.doubled ? 'Doubled tone' : 'No doubling');
    nested(P.doubledByOmission, omission, voicing.doubled ? 'Doubled tone' : 'No doubling');
    add(P.spacing, spanBucket(voicing.span));
    nested(P.spacingByMode, play.mode, spanBucket(voicing.span));
    add(P.fit, voicing.fit);
    if (voicing.reason) add(P.fitReason, `${voicing.fit}: ${voicing.reason}`);
    nested(P.fitByMode, play.mode, voicing.fit);
    if (voicing.exact) for (const key of Object.keys(P.best)) add(P.best[key], voicing.params[key]);
    add(P.mode, play.mode);
    nested(P.modeByStyle, styleLabel.split(' / ')[0], play.mode);
    if (play.mode === 'arp') add(P.arpRhythm, play.even ? 'Even steps' : 'Syncopated hits');
    if (play.figure && chordBar === 0) add(P.otherFigures, play.figure);
    if (voicing.doubled) add(P.doubledRoles, voicing.doubledRoles.join(' + '));
    if (play.mode === 'arp' && chordBar > 0 && base && figure) {
        const kind = figureVariation(base, figure);
        add(P.variation, kind); nested(P.variationByDirection, play.direction, kind);
    }
    for (const [name, value] of [['direction', chordBar === 0 || play.mode !== 'arp' ? play.direction : null], ['rate', play.rate === null ? null : play.rate === 'syncopated' ? 'syncopated' : `${play.rate} step${play.rate === 1 ? '' : 's'}`], ['hold', play.hold],
        ['hits', play.hits], ['lengthShare', play.lengthShare === null ? null : `${play.lengthShare}%`]]) {
        if (value !== null && value !== undefined) nested(P[name], play.mode, value);
    }
    add(P.slotBars, `${play.slotBars} bar${play.slotBars === 1 ? '' : 's'}`);
    if (play.hitPattern) add(P.hitPattern, `${play.mode}: ${play.hitPattern}`);
    const gaps = sequencerGaps({ play, voicing });
    add(P.gapCount, gaps.length === 0 ? 'Fully expressible' : gaps.length === 1 ? '1 gap' : '2+ gaps');
    for (const gap of gaps) add(P.gaps, gap);
    const vector = [voicing.family, voicing.bassTone === 'root' ? 'root position' : `bass ${voicing.bassTone}`, omission,
        play.mode, play.direction && play.direction !== 'single' ? play.direction : null, play.rate !== null ? `${play.rate}-step` : null].filter(Boolean).join(' · ');
    add(P.vectors, vector);
}

/** Left-out tones over a whole chord slot (every bar of it), which is what a chord's parameters describe; one bar of a figure can be shorter than the chord. */
export function slotTracker(P) {
    const open = {};
    const flush = role => {
        const a = open[role]; delete open[role];
        if (!a) return;
        const written = writtenChord(a.chord), sounded = new Set(a.midis.map(m => mod(m, 12)));
        const omitted = written.pcs.flatMap((pc, i) => sounded.has(pc) ? [] : [written.roles[i]]);
        const label = omitted.length ? `omits ${omitted.join(' + ')}` : 'complete';
        add(P.slotOmitted, label); nested(P.slotOmittedByMode, a.mode, label); nested(P.slotOmittedByRole, role, label); nested(P.slotOmittedByFamily, written.family, label);
    };
    return {
        add(role, { start, chord, mode, midis }) {
            if (open[role] && open[role].start !== start) flush(role);
            open[role] ??= { start, chord, mode, midis: [] };
            open[role].midis.push(...midis);
        },
        flushAll() { Object.keys(open).forEach(flush); },
    };
}
