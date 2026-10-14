import { arrangeBar, notesInRange, styleShares, PAD_RANGE, BASS_RANGE, LEAD_RANGE, PHRASE_BARS, DEFAULT_PAD_WEIGHTS, DEFAULT_BASS_WEIGHTS, DEFAULT_VOICES, OCTAVE_LIMITS } from './arranger';
import { scaleById, scaleSemitones, diatonicChord } from './theory';
import { seeded } from './random';
import { METERS, groupStarts, beatStarts } from './meter';

const AUTO = { leadActivity: 0.6, padWeights: DEFAULT_PAD_WEIGHTS, bassWeights: DEFAULT_BASS_WEIGHTS, thinPadUnderLead: true, voices: DEFAULT_VOICES };
const only = (style, weights) => Object.fromEntries(Object.keys(weights).map((k) => [k, k === style ? 1 : 0]));
const pads = (style) => only(style, DEFAULT_PAD_WEIGHTS);
const basses = (style) => only(style, DEFAULT_BASS_WEIGHTS);

// Runs `bars` bars of a looping progression (degrees) in a scale.
function run({ seed = 1, bars = 32, settings = AUTO, scaleId = 'Major-1', tonic = 0, degrees = [1, 5, 6, 4], barsPerChord = 1, meter = '4/4', chordSize = 3 } = {}) {
    const scale = scaleSemitones(scaleById(scaleId).intervals);
    const scalePcs = scale.map((s) => (tonic + s) % 12);
    const chordAt = (bar) => ({
        pitchClasses: diatonicChord(scale, degrees[Math.floor(bar / barsPerChord) % degrees.length], chordSize).map((o) => (tonic + o) % 12),
    });
    const rng = seeded(seed);
    const out = [];
    let prev = null;
    for (let bar = 0; bar < bars; bar++) {
        const chord = chordAt(bar);
        const { events, state } = arrangeBar({
            bar,
            meter: METERS[meter],
            chord,
            nextChord: chordAt(bar + 1),
            scalePcs,
            chordStart: bar % barsPerChord === 0,
            barsLeftInChord: barsPerChord - (bar % barsPerChord),
            prev,
            settings,
            rng,
        });
        out.push({ bar, chord, nextChord: chordAt(bar + 1), events, state });
        prev = state;
    }
    return out;
}

const byRole = (bar, role) => bar.events.filter((e) => e.role === role);
const pc = (m) => ((m % 12) + 12) % 12;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

test('deterministic for a seed', () => {
    expect(run({ seed: 42 })).toEqual(run({ seed: 42 }));
    expect(run({ seed: 42 })).not.toEqual(run({ seed: 43 }));
});

test.each(['Major-1', 'Major-7', 'Harmonic Minor-5', 'Pentatonic-5', 'Hexatonic-7'])('every role stays in its register (%s)', (scaleId) => {
    SEEDS.forEach((seed) => run({ seed, scaleId, tonic: seed % 12 }).forEach((bar) => {
        byRole(bar, 'pad').forEach((e) => expect(e.midi).toBeGreaterThanOrEqual(PAD_RANGE[0]));
        byRole(bar, 'pad').forEach((e) => expect(e.midi).toBeLessThanOrEqual(PAD_RANGE[1]));
        byRole(bar, 'bass').forEach((e) => expect(e.midi).toBeGreaterThanOrEqual(BASS_RANGE[0] - 1));
        byRole(bar, 'bass').forEach((e) => expect(e.midi).toBeLessThanOrEqual(BASS_RANGE[1] + 3));
        byRole(bar, 'lead').forEach((e) => expect(e.midi).toBeGreaterThanOrEqual(LEAD_RANGE[0]));
        byRole(bar, 'lead').forEach((e) => expect(e.midi).toBeLessThanOrEqual(LEAD_RANGE[1]));
    }));
});

test('no event starts before its bar (the transport could never book it)', () => {
    SEEDS.forEach((seed) => run({ seed }).forEach((bar) => bar.events.forEach((e) => expect(e.beat).toBeGreaterThanOrEqual(0))));
});

test('lead notes on strong beats are chord tones', () => {
    SEEDS.forEach((seed) => run({ seed, settings: { ...AUTO, leadActivity: 1 } }).forEach((bar) => {
        byRole(bar, 'lead')
            .filter((e) => Math.abs(e.beat - Math.round(e.beat)) < 0.05 && Math.round(e.beat) % 2 === 0)
            .forEach((e) => expect(bar.chord.pitchClasses).toContain(pc(e.midi)));
    }));
});

test('lead is legato without overlapping itself', () => {
    SEEDS.forEach((seed) => run({ seed, settings: { ...AUTO, leadActivity: 1 } }).forEach((bar) => {
        const lead = byRole(bar, 'lead');
        lead.slice(0, -1).forEach((e, i) => expect(e.beat + e.length).toBeLessThanOrEqual(lead[i + 1].beat + 0.05));
    }));
});

test('each lead phrase ends on the chord root or third, held to the bar end', () => {
    SEEDS.forEach((seed) => run({ seed, settings: { ...AUTO, leadActivity: 1 } })
        .filter((bar) => bar.bar % PHRASE_BARS === PHRASE_BARS - 1)
        .forEach((bar) => {
            const last = byRole(bar, 'lead').pop();
            expect([bar.chord.pitchClasses[0], bar.chord.pitchClasses[1]]).toContain(pc(last.midi));
            expect(last.beat + last.length).toBeGreaterThan(3.5);
        }));
});

test('lead activity 0 is silent, 1 plays every bar', () => {
    expect(run({ settings: { ...AUTO, leadActivity: 0 } }).every((bar) => byRole(bar, 'lead').length === 0)).toBe(true);
    expect(run({ settings: { ...AUTO, leadActivity: 1 } }).every((bar) => byRole(bar, 'lead').length > 0)).toBe(true);
});

test('bass approaches a changing chord from a step away', () => {
    let approaches = 0;
    SEEDS.forEach((seed) => run({ seed, settings: { ...AUTO, bassWeights: basses('half') } }).forEach((bar) => {
        const last = byRole(bar, 'bass').find((e) => e.beat === 3);
        if (!last) return;
        approaches++;
        const nextRoots = notesInRange([bar.nextChord.pitchClasses[0]], last.midi - 6, last.midi + 6);
        expect(Math.min(...nextRoots.map((n) => Math.abs(n - last.midi)))).toBeLessThanOrEqual(2);
    }));
    expect(approaches).toBeGreaterThan(50);
});

test('bass follows its previous note instead of jumping registers', () => {
    const leaps = [];
    ['Major-1', 'Major-6', 'Harmonic Minor-1'].forEach((scaleId) => SEEDS.forEach((seed) => {
        const bars = run({ seed, scaleId, tonic: seed % 12, settings: { ...AUTO, bassWeights: basses('whole') } });
        bars.slice(1).forEach((bar, i) => leaps.push(Math.abs(byRole(bar, 'bass')[0].midi - bars[i].state.bassMidi)));
    }));
    // never an octave-ish jump; almost always within a fifth (root motion
    // by fourths/fifths is the bass's normal move)
    expect(Math.max(...leaps)).toBeLessThanOrEqual(9);
    expect(leaps.filter((l) => l <= 7).length / leaps.length).toBeGreaterThan(0.9);
});

test('pad thins under the lead: quieter, and never arpeggiates while other styles are allowed', () => {
    SEEDS.forEach((seed) => run({ seed }).forEach((bar) => {
        const { leadActive, padStyle } = bar.state.phrase;
        if (leadActive) {
            expect(padStyle).not.toBe('arpeggio');
            byRole(bar, 'pad').forEach((e) => expect(e.velocity).toBeLessThan(0.55));
        }
    }));
});

test('fixed styles are respected', () => {
    const arp = run({ settings: { ...AUTO, leadActivity: 0, padWeights: pads('arpeggio'), bassWeights: basses('walking') } });
    arp.forEach((bar) => {
        expect(byRole(bar, 'pad')).toHaveLength(4);
        expect(byRole(bar, 'bass')).toHaveLength(4);
    });
});

test('sustained pad only strikes when the chord starts', () => {
    const bars = run({ settings: { ...AUTO, leadActivity: 0, padWeights: pads('sustain'), bassWeights: basses('whole') }, barsPerChord: 2 });
    bars.forEach((bar) => expect(byRole(bar, 'pad').length > 0).toBe(bar.bar % 2 === 0));
});

test("style weights set each style's share of phrases", () => {
    const settings = { ...AUTO, leadActivity: 0, padWeights: { sustain: 70, pulse: 0, arpeggio: 30 } };
    const phrases = [];
    for (let seed = 1; seed <= 60; seed++) {
        run({ seed, bars: 16, settings }).filter((b) => b.bar % PHRASE_BARS === 0).forEach((b) => phrases.push(b.state.phrase.padStyle));
    }
    expect(phrases).not.toContain('pulse');
    expect(phrases.filter((st) => st === 'arpeggio').length / phrases.length).toBeCloseTo(0.3, 1);
});

test('"always arpeggio" holds even under the lead; thinning can be switched off', () => {
    run({ settings: { ...AUTO, leadActivity: 1, padWeights: pads('arpeggio') } })
        .forEach((bar) => expect(bar.state.phrase.padStyle).toBe('arpeggio'));
    const unthinned = run({ settings: { ...AUTO, leadActivity: 1, thinPadUnderLead: false, padWeights: { sustain: 1, pulse: 0, arpeggio: 1 } } });
    expect(unthinned.some((bar) => bar.state.phrase.padStyle === 'arpeggio')).toBe(true);
    // full level on the downbeat (thinned pads strike at ~0.48)
    unthinned.forEach((bar) => byRole(bar, 'pad').filter((e) => e.beat < 0.05).forEach((e) => expect(e.velocity).toBeGreaterThan(0.55)));
});

test('styleShares normalises, and all-zero means equal shares', () => {
    expect(styleShares({ a: 30, b: 10 })).toEqual({ a: 0.75, b: 0.25 });
    expect(styleShares({ a: 0, b: 0 })).toEqual({ a: 0.5, b: 0.5 });
    const styles = run({ settings: { ...AUTO, padWeights: { sustain: 0, pulse: 0, arpeggio: 0 } } }).map((b) => b.state.phrase.padStyle);
    expect(new Set(styles).size).toBeGreaterThan(1);
});

describe.each(Object.keys(METERS))('meter %s', (id) => {
    const meter = METERS[id];
    const lead = { ...AUTO, leadActivity: 1 };

    test('every event starts inside the bar', () => {
        SEEDS.forEach((seed) => run({ seed, meter: id, settings: lead }).forEach((bar) => bar.events.forEach((e) => {
            expect(e.beat).toBeGreaterThanOrEqual(0);
            expect(e.beat).toBeLessThan(meter.units);
        })));
    });

    test('lead notes on beat-group starts are chord tones; phrases resolve', () => {
        const starts = groupStarts(meter);
        SEEDS.forEach((seed) => run({ seed, meter: id, settings: lead }).forEach((bar) => {
            byRole(bar, 'lead').filter((e) => starts.includes(e.beat)).forEach((e) => expect(bar.chord.pitchClasses).toContain(pc(e.midi)));
            if (bar.bar % PHRASE_BARS === PHRASE_BARS - 1) {
                const last = byRole(bar, 'lead').pop();
                expect([bar.chord.pitchClasses[0], bar.chord.pitchClasses[1]]).toContain(pc(last.midi));
            }
        }));
    });

    test('arpeggio plays every unit; walking bass every felt beat; pulse every group', () => {
        const fixed = (pad, bass) => run({ meter: id, settings: { ...AUTO, leadActivity: 0, padWeights: pads(pad), bassWeights: basses(bass) } });
        fixed('arpeggio', 'walking').forEach((bar) => {
            expect(byRole(bar, 'pad').map((e) => e.beat)).toEqual([...Array(meter.units).keys()]);
            expect(byRole(bar, 'bass').map((e) => e.beat)).toEqual(beatStarts(meter));
        });
        fixed('pulse', 'whole').forEach((bar) => {
            expect([...new Set(byRole(bar, 'pad').map((e) => e.beat))]).toEqual(groupStarts(meter));
        });
    });

    test('bass notes never overlap each other', () => {
        SEEDS.forEach((seed) => run({ seed, meter: id }).forEach((bar) => {
            const bass = byRole(bar, 'bass');
            bass.slice(0, -1).forEach((e, i) => expect(e.beat + e.length).toBeLessThanOrEqual(bass[i + 1].beat));
            const last = bass[bass.length - 1];
            expect(last.beat + last.length).toBeLessThanOrEqual(meter.units);
        }));
    });
});

describe('octaves', () => {
    const voices = (role, voice) => ({ ...DEFAULT_VOICES, [role]: { ...DEFAULT_VOICES[role], ...voice } });
    const shifted = ([lo, hi], o) => [lo + 12 * o, hi + 12 * o];
    const RANGES = { pad: PAD_RANGE, bass: BASS_RANGE, lead: LEAD_RANGE };

    test.each([['pad', -1], ['bass', 1], ['lead', -1]])('%s at a fixed octave %i plays in the shifted register', (role, octave) => {
        const [lo, hi] = shifted(RANGES[role], octave);
        run({ settings: { ...AUTO, leadActivity: 1, voices: voices(role, { octave }) } }).slice(2).forEach((bar) => {
            byRole(bar, role).forEach((e) => {
                expect(e.midi).toBeGreaterThanOrEqual(lo - (role === 'bass' ? 1 : 0));
                expect(e.midi).toBeLessThanOrEqual(hi + (role === 'bass' ? 3 : 0));
            });
        });
    });

    test.each(['pad', 'bass', 'lead'])('centered wander (%s): one octave at a time, at phrase starts, within home ± 1', (role) => {
        let moves = 0;
        SEEDS.forEach((seed) => {
            const bars = run({ seed, bars: 160, settings: { ...AUTO, leadActivity: 1, voices: voices(role, { octave: 0, wander: 'centered', chance: 0.8 }) } });
            bars.slice(1).forEach((bar, i) => {
                const now = bar.state.phrase.octaves[role];
                const before = bars[i].state.phrase.octaves[role];
                expect(Math.abs(now - before)).toBeLessThanOrEqual(1);
                if (now !== before) {
                    moves++;
                    expect(bar.bar % PHRASE_BARS).toBe(0);
                }
                expect(Math.abs(now)).toBeLessThanOrEqual(1);
            });
        });
        expect(moves).toBeGreaterThan(5);
    });

    test.each(['pad', 'bass', 'lead'])('free wander (%s) stays within the role limits', (role) => {
        SEEDS.forEach((seed) => run({ seed, bars: 160, settings: { ...AUTO, voices: voices(role, { wander: 'wandering', chance: 1 }) } })
            .forEach((bar) => {
                const o = bar.state.phrase.octaves[role];
                expect(o).toBeGreaterThanOrEqual(OCTAVE_LIMITS[role][0]);
                expect(o).toBeLessThanOrEqual(OCTAVE_LIMITS[role][1]);
            }));
    });

    test('pad register changes are voice-led (small total movement)', () => {
        const bars = run({ seed: 3, bars: 120, settings: { ...AUTO, padWeights: pads('sustain'), voices: voices('pad', { wander: 'centered', chance: 1 }) } });
        bars.slice(1).forEach((bar, i) => {
            if (bar.state.phrase.octaves.pad === bars[i].state.phrase.octaves.pad) return;
            const moved = bar.state.padVoicing.map((m, v) => Math.abs(m - bars[i].state.padVoicing[v]));
            // an octave, plus at most a whole step when the chord also changes
            expect(Math.max(...moved)).toBeLessThanOrEqual(14);
        });
    });
});

test('pad plays every note of 4- and 5-note chords', () => {
    [4, 5].forEach((chordSize) => run({ chordSize, settings: { ...AUTO, padWeights: pads('sustain') } }).forEach((bar) => {
        expect(bar.state.padVoicing).toHaveLength(chordSize);
        expect(new Set(bar.state.padVoicing.map(pc))).toEqual(new Set(bar.chord.pitchClasses));
    }));
});
