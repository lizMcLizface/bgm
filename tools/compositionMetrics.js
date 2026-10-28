// Pure measurements over planned bars, for the composition audit
// (tools/compositionAudit.audit.js). Each function takes `bars`: the generator's plan
// entries in bar order ({ bar, events, chord, music, meter, bpm, state }), with timing
// humanisation and swing off so beats are the composed grid. Beats are in meter units.
// Norms they are compared with come from docs/theory-notes/.

const mod12 = (n) => ((n % 12) + 12) % 12;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const round = (x, d = 4) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(d)));

/** Events of one role in time order across bars: { bar, beat, midi, length, velocity }. */
export function stream(bars, role) {
    return bars.flatMap((b) => b.events.filter((e) => e.role === role)
        .map((e) => ({ bar: b.bar, beat: e.beat, midi: e.midi, length: e.length, velocity: e.velocity, units: b.meter.units })))
        .sort((a, z) => a.bar - z.bar || a.beat - z.beat || a.midi - z.midi);
}

/** Melodic line from a stream: the top note where several start together. */
export function line(notes) {
    const out = [];
    for (const n of notes) {
        const last = out[out.length - 1];
        if (last && last.bar === n.bar && Math.abs(last.beat - n.beat) < 1e-6) { if (n.midi > last.midi) out[out.length - 1] = n; } else out.push(n);
    }
    return out;
}

/** Interval statistics (Vos & Troost 1989, Huron 2006 ch. 5, Schellenberg 1997). */
export function intervalStats(notes) {
    const hist = Array(13).fill(0), up = Array(13).fill(0), down = Array(13).fill(0);
    let total = 0, afterDownStep = 0, downThenDown = 0, afterUpStep = 0, upThenUp = 0, afterLeap = 0, leapReversed = 0;
    const moves = [];
    for (let i = 1; i < notes.length; i++) moves.push(notes[i].midi - notes[i - 1].midi);
    moves.forEach((m, i) => {
        const size = Math.min(12, Math.abs(m));
        hist[size]++; total++;
        if (m > 0) up[size]++; else if (m < 0) down[size]++;
        const next = moves[i + 1];
        if (next === undefined || !next) return;
        if (m <= -1 && m >= -2) { afterDownStep++; if (next < 0) downThenDown++; }
        if (m >= 1 && m <= 2) { afterUpStep++; if (next > 0) upThenUp++; }
        if (Math.abs(m) >= 5) { afterLeap++; if (Math.sign(next) !== Math.sign(m)) leapReversed++; }
    });
    const share = (n) => (total ? n / total : null);
    const nonUnison = (size) => up[size] + down[size];
    const ascShare = (sizes) => { const u = sum(sizes.map((s) => up[s])), n = sum(sizes.map(nonUnison)); return n ? u / n : null; };
    return {
        count: total,
        histogram: hist.map((n) => round(share(n))),
        unison: round(share(hist[0])), step: round(share(hist[1] + hist[2])), thirds: round(share(hist[3] + hist[4])),
        leap5plus: round(share(sum(hist.slice(5)))),
        ascendingShare: { small1to2: round(ascShare([1, 2])), mid3to4: round(ascShare([3, 4])), large5plus: round(ascShare([5, 6, 7, 8, 9, 10, 11, 12])) },
        descendAfterDescendingStep: round(afterDownStep ? downThenDown / afterDownStep : null),
        ascendAfterAscendingStep: round(afterUpStep ? upThenUp / afterUpStep : null),
        reverseAfterLeap5plus: round(afterLeap ? leapReversed / afterLeap : null),
    };
}

/** Within-phrase pitch spread (Temperley 2007: variance within a melody ~10.6), per window of `span` bars. */
export function registerStats(notes, span = 4) {
    const windows = new Map();
    notes.forEach((n) => { const k = Math.floor(n.bar / span); if (!windows.has(k)) windows.set(k, []); windows.get(k).push(n.midi); });
    const variances = [...windows.values()].filter((w) => w.length > 2).map((w) => { const m = mean(w); return mean(w.map((x) => (x - m) ** 2)); });
    const all = notes.map((n) => n.midi), m = mean(all);
    return { meanPitch: round(m, 2), varianceAll: round(all.length ? mean(all.map((x) => (x - m) ** 2)) : null, 2), varianceWithinPhrase: round(mean(variances), 2) };
}

/** Pitch-class distribution relative to the tonic of each note's bar (Essen profile comparison). */
export function degreeProfile(notes, tonicOf) {
    const counts = Array(12).fill(0);
    notes.forEach((n) => counts[mod12(n.midi - tonicOf(n.bar))]++);
    const total = sum(counts);
    return counts.map((c) => round(total ? c / total : null));
}

/** Final notes of phrases: the last lead note before a gap of at least `gapBeats` felt beats. Returns relative pcs. */
export function phraseFinals(notes, tonicOf, barBeats, gapBeats = 1) {
    const out = [];
    for (let i = 0; i < notes.length; i++) {
        const n = notes[i], next = notes[i + 1];
        const end = n.bar * barBeats + n.beat + n.length;
        const nextStart = next ? next.bar * barBeats + next.beat : Infinity;
        if (nextStart - end >= gapBeats) out.push(mod12(n.midi - tonicOf(n.bar)));
    }
    const counts = Array(12).fill(0); out.forEach((p) => counts[p]++);
    return { count: out.length, distribution: counts.map((c) => round(out.length ? c / out.length : null)) };
}

/** Share of strong-beat lead notes (beat 0 and group starts) that are chord tones. */
export function strongBeatChordTones(bars, role, groupStarts) {
    let hit = 0, total = 0;
    bars.forEach((b) => {
        const starts = new Set(groupStarts(b.meter));
        b.events.filter((e) => e.role === role && starts.has(Math.round(e.beat * 1000) / 1000)).forEach((e) => {
            total++; if (b.chord.pitchClasses.includes(mod12(e.midi))) hit++;
        });
    });
    return { count: total, chordToneShare: round(total ? hit / total : null) };
}


/** Where lead notes sit against the sounding chord: share on the root, third, fifth, seventh, or outside the chord. */
export function chordRelativeShare(bars, role = 'lead') {
    const c = { root: 0, third: 0, fifth: 0, seventh: 0, nonChord: 0 }; let total = 0;
    bars.forEach((b) => {
        const root = b.chord.pitchClasses[0], pcs = b.chord.pitchClasses.map((pc) => mod12(pc - root));
        b.events.filter((e) => e.role === role).forEach((e) => {
            const rel = mod12(e.midi - root); total++;
            if (!pcs.includes(rel)) c.nonChord++; else if (rel === 0) c.root++; else if (rel === 3 || rel === 4) c.third++; else if (rel === 7 || rel === 6 || rel === 8) c.fifth++; else c.seventh++;
        });
    });
    return { count: total, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, round(total ? v / total : null)])) };
}

/**
 * Last lead note of each phrase of `span` bars (the note a phrase ends on), relative to the tonic of
 * its bar. `parity` 0 / 1 keeps only the first / second phrase of each pair (question / answer).
 */
export function phraseEndNotes(notes, tonicOf, span = 4, parity = null) {
    const last = new Map();
    notes.forEach((n) => { if (n.bar % span === span - 1) last.set(Math.floor(n.bar / span), n); });
    const counts = Array(12).fill(0);
    last.forEach((n, k) => { if (parity === null || k % 2 === parity) counts[mod12(n.midi - tonicOf(n.bar))]++; });
    const total = sum(counts);
    return { count: total, distribution: counts.map((c) => round(total ? c / total : null)) };
}

const floorPow2 = (n) => 2 ** Math.floor(Math.log2(Math.max(1, n)));

/**
 * Keith's syncopation count (Toussaint 2013 ch. 13) for attack patterns: each onset whose start
 * is not a multiple of its own duration (inter-onset interval to the next onset or the bar end,
 * rounded down to a power of two, on a grid of `res` steps per unit) scores 1.
 */
export function keithSyncopation(onsetBeats, units, res = 4) {
    const steps = [...new Set(onsetBeats.map((b) => Math.round(b * res)))].filter((s) => s >= 0 && s < units * res).sort((a, z) => a - z);
    let score = 0;
    steps.forEach((s, i) => {
        const nextStart = i + 1 < steps.length ? steps[i + 1] : units * res;
        if (s % floorPow2(nextStart - s) !== 0) score++;
    });
    return score;
}

/** Per-bar syncopation of the combined onset grid of the named roles (percussion hits quieter than `minPerc` ignored). */
export function syncopationByBar(bars, roles = ['lead', 'bass', 'perc', 'counter'], { minPerc = 0.3 } = {}) {
    return bars.map((b) => {
        if (b.meter.unitsPerBeat !== 1) return { bar: b.bar, score: null, onsets: 0 };
        const onsets = b.events.filter((e) => roles.includes(e.role) && (e.role !== 'perc' || e.velocity >= minPerc)).map((e) => e.beat);
        return { bar: b.bar, score: keithSyncopation(onsets, b.meter.units), onsets: new Set(onsets.map((o) => Math.round(o * 4))).size };
    });
}

/**
 * Longuet-Higgins & Lee (1984) syncopation of one bar of onsets (beats from the bar start, felt-beat units). Every grid
 * position has a weight by metrical level (bar 0, group starts -1, beats, half-beats, quarter-beats, each one lighter);
 * a note followed by a rest or tie on a heavier position is a syncopation of strength weight(rest) - weight(note), and
 * the heaviest silent position before the next onset counts. Simple metres only (the unit is the felt beat).
 */
export function lhlSyncopation(onsets, units, groups = [units], grid = 4) {
    const slots = units * grid, starts = new Set(), lone = groups.length === 1;
    let at = 0; groups.forEach((g) => { starts.add(at); at += g; });
    const weight = (slot) => {
        if (slot === 0) return 0;
        const pos = slot / grid;
        if (starts.has(pos)) return -1;
        let depth = lone ? 1 : 2; // a beat sits below the bar (and below the groups when there are several)
        if (Number.isInteger(pos)) return -depth;
        if (Number.isInteger(pos * 2)) return -(depth + 1);
        return -(depth + 2);
    };
    const hit = new Set(onsets.map((o) => Math.round(o * grid)).filter((slot) => slot >= 0 && slot < slots));
    const marks = [...hit].sort((a, b) => a - b);
    let total = 0;
    marks.forEach((slot, i) => {
        const next = i + 1 < marks.length ? marks[i + 1] : slots;
        let heaviest = -Infinity;
        for (let j = slot + 1; j < next; j++) heaviest = Math.max(heaviest, weight(j));
        if (heaviest > weight(slot)) total += heaviest - weight(slot);
    });
    return total;
}

/** lhlSyncopation for each bar, from the onsets of the given roles. */
export function lhlByBar(bars, roles = ['lead']) {
    return bars.map((b) => {
        if (b.meter.unitsPerBeat !== 1) return { bar: b.bar, score: null, onsets: 0 };
        const onsets = b.events.filter((e) => roles.includes(e.role)).map((e) => e.beat);
        return { bar: b.bar, score: lhlSyncopation(onsets, b.meter.units, b.meter.groups), onsets: new Set(onsets.map((o) => Math.round(o * 4))).size };
    });
}

/**
 * Smoothness of the seams where the section changes (Medina-Gray 2019: meter, timbre, pitch-class, dynamics and tempo
 * continuity). Each aspect is 0..1; `smooth` is their mean. Pitch-class continuity is the share of pitch classes in the
 * first `ahead` seconds after the seam that were already sounding in the `back` seconds before it (>= .5 is mildly smooth).
 */
export function seamScores(bars, unitsPerMinute, { back = 5, ahead = 1, sectionOf = (b) => b.state?.phrase?.section?.type ?? 'none' } = {}) {
    const seconds = (b) => b.meter.units * 60 / unitsPerMinute(b.meter, b.bpm);
    const roles = (b) => new Set(b.events.filter((e) => e.role !== 'perc').map((e) => e.role));
    const level = (b) => mean(b.events.filter((e) => e.role !== 'perc').map((e) => e.velocity));
    const sameMeter = (a, b) => a.meter.units === b.meter.units && a.meter.unitsPerBeat === b.meter.unitsPerBeat && a.meter.groups.join() === b.meter.groups.join();
    const seams = [];
    for (let i = 1; i < bars.length; i++) {
        const before = bars[i - 1], after = bars[i];
        if (sectionOf(before) === sectionOf(after)) continue;
        // the pitch classes of the last `back` seconds, and of the first `ahead` seconds after the seam
        const prior = new Set(); let t = 0;
        for (let k = i - 1; k >= 0 && t < back; k--) { b_pcs(bars[k]).forEach((pc) => prior.add(pc)); t += seconds(bars[k]); }
        const secUnit = 60 / unitsPerMinute(after.meter, after.bpm);
        const next = after.events.filter((e) => e.role !== 'perc' && e.beat * secUnit < ahead).map((e) => e.midi % 12);
        const incoming = [...new Set(next)];
        const rb = roles(before), ra = roles(after), union = new Set([...rb, ...ra]);
        const shared = [...union].filter((r) => rb.has(r) && ra.has(r)).length;
        const lb = level(before), la = level(after);
        const aspects = {
            meter: sameMeter(before, after) ? 1 : 0,
            timbre: union.size ? shared / union.size : 1,
            pitch: incoming.length ? incoming.filter((pc) => prior.has(pc)).length / incoming.length : 1,
            dynamics: Number.isFinite(lb) && Number.isFinite(la) ? 1 - Math.min(1, Math.abs(la - lb) / 0.25) : 1,
            tempo: 1 - Math.min(1, Math.abs(after.bpm / before.bpm - 1) / 0.1),
        };
        seams.push({ bar: after.bar, from: sectionOf(before), to: sectionOf(after), ...Object.fromEntries(Object.entries(aspects).map(([k, v]) => [k, round(v, 3)])),
            smooth: round(mean(Object.values(aspects)), 3) });
    }
    return seams;
}
const b_pcs = (b) => b.events.filter((e) => e.role !== 'perc').map((e) => e.midi % 12);

/**
 * How often a leading tone (7) goes up to the tonic and a fourth (4) steps down to a third, among held or repeated-context
 * notes of the lead line (consecutive notes within one bar). `notes` come from `line`; `tonicOf(bar)` is the key's tonic pc.
 */
export function tendencyResolution(notes, tonicOf, minLength = 0) {
    let leading = 0, leadingUp = 0, fourth = 0, fourthDown = 0;
    for (let i = 0; i + 1 < notes.length; i++) {
        const n = notes[i], next = notes[i + 1];
        if (n.bar !== next.bar || n.length < minLength) continue;
        const pc = mod12(n.midi - tonicOf(n.bar));
        if (pc === 11) { leading++; if (next.midi - n.midi === 1) leadingUp++; }
        else if (pc === 5) { fourth++; if (next.midi < n.midi && n.midi - next.midi <= 2) fourthDown++; }
    }
    return { leading, leadingToTonic: round(leading ? leadingUp / leading : null, 3), fourth, fourthToThird: round(fourth ? fourthDown / fourth : null, 3) };
}

/**
 * Share of bars with at least `minOnsets` onsets from `roles` whose onsets form a maximally even set (a rotation of a
 * Euclidean rhythm) on the bar's eighth-note grid. Simple metres only.
 */
export function euclideanShare(bars, roles = ['bass'], minOnsets = 3) {
    let counted = 0, even = 0;
    bars.forEach((b) => {
        if (b.meter.unitsPerBeat !== 1) return;
        const n = b.meter.units * 2, steps = [...new Set(b.events.filter((e) => roles.includes(e.role) && Math.abs(e.beat * 2 - Math.round(e.beat * 2)) < 1e-6).map((e) => Math.round(e.beat * 2)))].sort((a, z) => a - z);
        if (steps.length < minOnsets || steps.length >= n) return;
        counted++;
        const gaps = steps.map((x, i) => (steps[(i + 1) % steps.length] - x + n) % n || n);
        if (Math.max(...gaps) - Math.min(...gaps) <= 1) even++;
    });
    return { bars: counted, share: round(counted ? even / counted : null, 3) };
}

/** Mean syncopation for bars in each position of a 4-bar phrase, to see whether cadence bars are plainer. */
export function syncopationByPhrasePosition(rows, span = 4) {
    const buckets = Array.from({ length: span }, () => []);
    rows.forEach((r) => { if (r.score !== null) buckets[r.bar % span].push(r.score); });
    return buckets.map((b) => round(mean(b), 3));
}

/** Mean lead + counter onsets per bar by position in a 4-bar phrase (sentence continuation should rise). */
export function densityByPhrasePosition(bars, roles = ['lead'], span = 4) {
    const buckets = Array.from({ length: span }, () => []);
    bars.forEach((b) => buckets[b.bar % span].push(b.events.filter((e) => roles.includes(e.role)).length));
    return buckets.map((x) => round(mean(x), 3));
}

const ROMAN = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
/** Distinct consecutive chord roots relative to the tonic, as in de Clercq & Temperley (2011): same-root repeats collapse. */
export function chordRoots(bars, tonicOf) {
    const roots = [];
    bars.forEach((b) => {
        const root = mod12(b.chord.pitchClasses[0] - tonicOf(b.bar));
        if (!roots.length || roots[roots.length - 1].root !== root) roots.push({ root, bar: b.bar, seventh: b.chord.pitchClasses.some((pc) => [10, 11].includes(mod12(pc - b.chord.pitchClasses[0]))) });
    });
    const counts = Array(12).fill(0); roots.forEach((r) => counts[r.root]++);
    const motion = new Map();
    for (let i = 1; i < roots.length; i++) {
        // circle-of-fifths distance of the root motion (0 = unison excluded)
        const interval = mod12(roots[i].root - roots[i - 1].root), fifths = Math.min((interval * 7) % 12, 12 - ((interval * 7) % 12));
        motion.set(fifths, (motion.get(fifths) || 0) + 1);
    }
    const total = roots.length;
    return {
        chords: total,
        rootShare: Object.fromEntries(ROMAN.map((name, pc) => [name, round(total ? counts[pc] / total : null)])),
        fifthsDistanceShare: Object.fromEntries([...motion.entries()].sort((a, z) => a[0] - z[0]).map(([d, n]) => [d, round(n / Math.max(1, total - 1))])),
        seventhShare: round(total ? roots.filter((r) => r.seventh).length / total : null),
        roots,
    };
}

/** Share of arrivals on the tonic (root pc 0) from a dominant (7) that are preceded by a seventh chord. */
export function dominantSeventhAtCadence(roots) {
    let arrivals = 0, withSeventh = 0;
    for (let i = 1; i < roots.length; i++) if (roots[i].root === 0 && roots[i - 1].root === 7) { arrivals++; if (roots[i - 1].seventh) withSeventh++; }
    return { arrivals, withSeventh, share: round(arrivals ? withSeventh / arrivals : null) };
}

/** Tymoczko (2011) pitch-class circulation: mean distinct pitch classes in windows of N consecutive note attacks. */
export function pitchClassCirculation(bars, windows = [2, 4, 8, 16, 32, 64, 100], roles = ['lead', 'counter', 'pad', 'bass']) {
    const attacks = bars.flatMap((b) => b.events.filter((e) => roles.includes(e.role)).sort((a, z) => a.beat - z.beat || a.midi - z.midi).map((e) => mod12(e.midi)));
    const out = {};
    windows.forEach((n) => {
        if (attacks.length < n * 2) { out[n] = null; return; }
        let total = 0, count = 0;
        for (let i = 0; i + n <= attacks.length; i += Math.max(1, Math.floor(n / 4))) { total += new Set(attacks.slice(i, i + n)).size; count++; }
        out[n] = round(total / count, 2);
    });
    return out;
}

/** Hunt (2020): share of bars that exactly repeat an earlier bar (identical notes, onsets, lengths). */
export function exactRepeatRatio(bars, { withPerc = true, roles = null } = {}) {
    const seen = new Set(); let repeats = 0, counted = 0;
    bars.forEach((b) => {
        const events = b.events.filter((e) => (roles ? roles.includes(e.role) : withPerc || e.role !== 'perc'));
        if (roles && !events.length) return;
        counted++;
        const k = JSON.stringify(events.map((e) => [e.role, e.midi, Math.round(e.beat * 1000), Math.round(e.length * 100)]).sort());
        if (seen.has(k)) repeats++; else seen.add(k);
    });
    return round(counted ? repeats / counted : null);
}

/** The same, per layer, to show which parts vary from bar to bar. */
export function exactRepeatByRole(bars, roles = ['lead', 'counter', 'pad', 'bass', 'perc']) {
    return Object.fromEntries(roles.map((r) => [r, exactRepeatRatio(bars, { roles: [r] })]));
}

/** Plomp & Levelt roughness of a sonority via the Sethares fit (constants recalled, see the note): sum over partial pairs. */
export function roughness(midis, { harmonics = 6 } = {}) {
    const partials = midis.flatMap((m) => Array.from({ length: harmonics }, (_, k) => ({ f: 440 * 2 ** ((m - 69) / 12) * (k + 1), a: 1 / (k + 1) })));
    let total = 0;
    for (let i = 0; i < partials.length; i++) for (let j = i + 1; j < partials.length; j++) {
        const [p, q] = partials[i].f <= partials[j].f ? [partials[i], partials[j]] : [partials[j], partials[i]];
        const s = 0.24 / (0.0207 * p.f + 18.96), d = q.f - p.f;
        total += p.a * q.a * (Math.exp(-3.5 * s * d) - Math.exp(-5.75 * s * d));
    }
    return total;
}

/** Sonorities at the first beat of each bar (pad, bass, lead, counter notes starting within the first beat). */
export function lowRegisterSpacing(bars, { closeSemitones = 3, below = 60 } = {}) {
    let sonorities = 0, close = 0, rough = [], lowRough = [];
    bars.forEach((b) => {
        const notes = b.events.filter((e) => e.role !== 'perc' && e.beat >= -0.01 && e.beat < 1).map((e) => e.midi).sort((a, z) => a - z);
        const uniq = [...new Set(notes)];
        if (uniq.length < 2) return;
        sonorities++;
        let isClose = false;
        for (let i = 0; i + 1 < uniq.length; i++) if (uniq[i] < below && uniq[i + 1] - uniq[i] <= closeSemitones) isClose = true;
        if (isClose) close++;
        const r = roughness(uniq.slice(0, 6)); rough.push(r); if (uniq[0] < below) lowRough.push(r);
    });
    return { sonorities, closeLowPairShare: round(sonorities ? close / sonorities : null), meanRoughness: round(mean(rough), 3), meanRoughnessLowBass: round(mean(lowRough), 3) };
}

/** Mood cue vector (Eerola et al. 2013): notes per second (all pitched voices), lead register, articulation, mean velocity. */
export function moodCues(bars, unitsPerMinute) {
    let attacks = 0, seconds = 0; const lead = [], art = [], vel = [];
    bars.forEach((b) => {
        const secondsPerUnit = 60 / unitsPerMinute(b.meter, b.bpm);
        const onsets = new Set(b.events.filter((e) => e.role !== 'perc').map((e) => Math.round(e.beat * 100)));
        attacks += onsets.size; seconds += b.meter.units * secondsPerUnit;
        const ls = b.events.filter((e) => e.role === 'lead').sort((a, z) => a.beat - z.beat);
        ls.forEach((e, i) => { lead.push(e.midi); vel.push(e.velocity); const next = ls[i + 1]; if (next && next.beat > e.beat) art.push(Math.min(1.5, e.length / (next.beat - e.beat))); });
    });
    return { notesPerSecond: round(seconds ? attacks / seconds : null, 2), leadMeanMidi: round(mean(lead), 1), leadArticulation: round(mean(art), 2), leadMeanVelocity: round(mean(vel), 3) };
}
