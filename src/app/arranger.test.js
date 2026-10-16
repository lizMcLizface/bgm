import { arrangeBar, notesInRange, styleShares, PAD_RANGE, BASS_RANGE, LEAD_RANGE, PHRASE_BARS, DEFAULT_PAD_WEIGHTS, DEFAULT_BASS_WEIGHTS, DEFAULT_VOICES, OCTAVE_LIMITS, pentatonicOf, openVoicing } from './arranger';
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
        expect(byRole(bar, 'pad')).toHaveLength(4 / bar.state.phrase.padStep);
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

    test('arpeggio plays every step; walking bass every felt beat; pulse by its pattern', () => {
        const fixed = (pad, bass, seed) => run({ seed, meter: id, settings: { ...AUTO, leadActivity: 0, padWeights: pads(pad), bassWeights: basses(bass) } });
        fixed('arpeggio', 'walking').forEach((bar) => {
            const step = bar.state.phrase.padStep;
            expect(byRole(bar, 'pad').map((e) => e.beat)).toEqual([...Array(meter.units / step).keys()].map((i) => i * step));
            expect(byRole(bar, 'bass').map((e) => e.beat)).toEqual(beatStarts(meter));
        });
        const patterns = new Set();
        SEEDS.forEach((seed) => fixed('pulse', 'whole', seed).forEach((bar) => {
            const { padPattern } = bar.state.phrase;
            patterns.add(padPattern);
            const beats = [...new Set(byRole(bar, 'pad').map((e) => e.beat))];
            expect(beats[0]).toBe(0);
            if (padPattern === 'groups') expect(beats).toEqual(groupStarts(meter));
            if (padPattern === 'split') expect(beats).toEqual([...Array(meter.units).keys()]);
            // split: only the lowest note on group starts
            if (padPattern === 'split') groupStarts(meter).forEach((at) => expect(byRole(bar, 'pad').filter((e) => e.beat === at)).toHaveLength(1));
        }));
        expect(patterns.size).toBeGreaterThan(2);
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

test('arpeggio patterns vary by phrase and play chord tones in the register', () => {
    const patterns = new Set();
    SEEDS.forEach((seed) => run({ seed, settings: { ...AUTO, leadActivity: 0, padWeights: pads('arpeggio') } }).forEach((bar) => {
        patterns.add(bar.state.phrase.padPattern);
        byRole(bar, 'pad').forEach((e) => expect(bar.chord.pitchClasses).toContain(pc(e.midi)));
    }));
    expect(patterns).toEqual(new Set(['bounce', 'up', 'down', 'broken']));
});

test("the pad's voicing leans low and high over phrases, staying in its register", () => {
    const tops = new Set();
    const lifts = new Set();
    SEEDS.forEach((seed) => run({ seed, bars: 64, settings: { ...AUTO, padWeights: pads('sustain') } }).forEach((bar) => {
        lifts.add(bar.state.phrase.padLift);
        tops.add(bar.state.padVoicing[bar.state.padVoicing.length - 1]);
        bar.state.padVoicing.forEach((m) => {
            expect(m).toBeGreaterThanOrEqual(PAD_RANGE[0]);
            expect(m).toBeLessThanOrEqual(PAD_RANGE[1]);
        });
    }));
    expect(lifts).toEqual(new Set([-1, 0, 1]));
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThanOrEqual(10);
});

test('pad plays every note of 4- and 5-note chords', () => {
    [4, 5].forEach((chordSize) => run({ chordSize, settings: { ...AUTO, padWeights: pads('sustain') } }).forEach((bar) => {
        expect(bar.state.padVoicing).toHaveLength(chordSize);
        expect(new Set(bar.state.padVoicing.map(pc))).toEqual(new Set(bar.chord.pitchClasses));
    }));
});

describe('second lead', () => {
    const counter = (mode, activity = 0.7) => ({ ...AUTO, leadActivity: 0.5, counter: { mode, activity } });

    test('off adds nothing and leaves the piece as it was', () => {
        const before = run({ seed: 3, settings: { ...AUTO, leadActivity: 0.5 } });
        const off = run({ seed: 3, settings: counter('off') });
        expect(off.map((b) => b.events)).toEqual(before.map((b) => b.events));
    });

    test.each(['answer', 'harmony', 'line'])('%s plays in its register, in the scale', (mode) => {
        const bars = SEEDS.flatMap((seed) => run({ seed, settings: counter(mode) }));
        const notes = bars.flatMap((b) => byRole(b, 'counter'));
        expect(notes.length).toBeGreaterThan(0);
        notes.forEach((e) => {
            expect(e.midi).toBeGreaterThanOrEqual(62);
            expect(e.midi).toBeLessThanOrEqual(84);
            expect([0, 2, 4, 5, 7, 9, 11]).toContain(pc(e.midi));
        });
    });

    test('harmony moves with the lead: same rhythm, only while it plays', () => {
        SEEDS.forEach((seed) => run({ seed, settings: counter('harmony') }).forEach((bar) => {
            expect(byRole(bar, 'counter').map((e) => e.beat)).toEqual(byRole(bar, 'lead').map((e) => e.beat));
        }));
    });

    test('answers fill the bars where the lead holds its last note, or take the melody when it rests', () => {
        SEEDS.forEach((seed) => run({ seed, settings: counter('answer', 1) }).forEach((bar) => {
            const { leadActive } = bar.state.phrase;
            const answers = byRole(bar, 'counter');
            const inPhrase = bar.bar % PHRASE_BARS;
            if (!leadActive) expect(answers.length).toBeGreaterThan(0);
            else if (inPhrase % 2 === 0) expect(answers).toEqual([]);
            else answers.forEach((e) => expect(e.beat).toBeGreaterThan(0));
        }));
    });
});

describe('sections', () => {
    const sections = (mode, phrases = 2) => ({ ...AUTO, leadActivity: 1, counter: { mode: 'line', activity: 0.5 }, sections: { mode, phrases } });

    test('change every few phrases, starting with an intro', () => {
        const bars = run({ bars: 96, settings: sections('strong') });
        const starts = bars.filter((b) => b.state.phrase.section.start === b.bar).map((b) => b.bar);
        expect(starts[0]).toBe(0);
        expect(bars[0].state.phrase.section.type).toBe('intro');
        starts.slice(1).forEach((bar, i) => expect(bar - starts[i]).toBe(2 * PHRASE_BARS));
        expect(new Set(bars.map((b) => b.state.phrase.section.type))).toEqual(new Set(['intro', 'build', 'full', 'breakdown']));
    });

    test('strong: the intro is pad alone, breakdowns drop the bass', () => {
        SEEDS.forEach((seed) => run({ seed, bars: 96, settings: sections('strong') }).forEach((bar) => {
            const type = bar.state.phrase.section.type;
            const roles = new Set(bar.events.map((e) => e.role));
            if (type === 'intro') expect([...roles]).toEqual(['pad']);
            if (type === 'breakdown') expect(roles.has('bass')).toBe(false);
            if (type === 'full') expect(roles.has('bass')).toBe(true);
        }));
    });

    test('never more than two full sections in a row', () => {
        SEEDS.forEach((seed) => {
            const types = run({ seed, bars: 400, settings: sections('gentle', 2) })
                .filter((b) => b.state.phrase.section.start === b.bar).map((b) => b.state.phrase.section.type);
            expect(types.join(' ')).not.toMatch(/full full full/);
        });
    });
});

describe('driving styles', () => {
    const sequence = { ...AUTO, padWeights: pads('sequence') };
    const drive = { ...AUTO, bassWeights: basses('drive') };

    test('the new styles are off in the defaults, so existing pieces are unchanged', () => {
        expect(DEFAULT_PAD_WEIGHTS.sequence).toBe(0);
        expect(DEFAULT_BASS_WEIGHTS.drive).toBe(0);
    });

    test('a sequence runs in eighths or sixteenths, detached, within the pad register', () => {
        SEEDS.forEach((seed) => run({ seed, settings: sequence }).forEach((bar) => {
            const notes = byRole(bar, 'pad');
            expect(notes.length).toBeGreaterThanOrEqual(8);
            const gaps = new Set(notes.map((e) => e.beat).filter((beat, i, all) => i > 0 && beat !== all[i - 1]).map((beat, i, all) => (i ? beat - all[i - 1] : 0.5)));
            [...gaps].forEach((gap) => expect([0.25, 0.5]).toContain(gap));
            notes.forEach((e) => {
                expect(e.midi).toBeGreaterThanOrEqual(PAD_RANGE[0]);
                expect(e.midi).toBeLessThanOrEqual(PAD_RANGE[1]);
                expect(e.length).toBeLessThanOrEqual(0.6);
            });
        }));
    });

    test('a sequence in 6/8 runs in units, in 3/4 in eighths', () => {
        run({ settings: sequence, meter: '6/8', bars: 8 }).forEach((bar) => expect(byRole(bar, 'pad').length).toBeGreaterThanOrEqual(6));
        run({ settings: sequence, meter: '3/4', bars: 8 }).forEach((bar) => expect(byRole(bar, 'pad').length).toBeGreaterThanOrEqual(6));
    });

    test('the driving bass pulses on the chord root every half beat, with an octave or fifth now and then', () => {
        SEEDS.forEach((seed) => {
            const all = run({ seed, settings: drive });
            all.forEach((bar) => {
                const notes = byRole(bar, 'bass');
                expect(notes).toHaveLength(8);
                notes.forEach((e) => expect(e.length).toBeLessThan(0.5));
                notes.forEach((e) => expect(e.midi).toBeGreaterThanOrEqual(BASS_RANGE[0] - 1));
                notes.forEach((e) => expect(e.midi).toBeLessThanOrEqual(BASS_RANGE[1] + 13));
            });
            // mostly the root
            const roots = all.flatMap((bar) => byRole(bar, 'bass').filter((e) => pc(e.midi) === bar.chord.pitchClasses[0]));
            expect(roots.length).toBeGreaterThan(all.length * 4);
        });
    });

    test('they are deterministic for a seed', () => {
        expect(run({ seed: 5, settings: { ...sequence, bassWeights: basses('drive') } })).toEqual(run({ seed: 5, settings: { ...sequence, bassWeights: basses('drive') } }));
    });
});

describe('lead density', () => {
    const leadNotes = (leadDensity) => SEEDS.flatMap((seed) => run({ seed, bars: 64, settings: { ...AUTO, leadActivity: 1, leadDensity } }).flatMap((bar) => byRole(bar, 'lead'))).length;

    test('0 leaves pieces exactly as they were; more makes the lead busier', () => {
        expect(run({ seed: 3, settings: { ...AUTO, leadDensity: 0 } })).toEqual(run({ seed: 3, settings: AUTO }));
        expect(leadNotes(1)).toBeGreaterThan(leadNotes(0) * 1.6);
        expect(leadNotes(0.5)).toBeGreaterThan(leadNotes(0));
    });

    test('busy notes stay in the bar and in the lead register, in every meter', () => {
        Object.keys(METERS).forEach((meter) => SEEDS.forEach((seed) => run({ seed, meter, bars: 24, settings: { ...AUTO, leadActivity: 1, leadDensity: 1 } }).forEach((bar) => {
            byRole(bar, 'lead').forEach((e) => {
                expect(e.beat).toBeGreaterThanOrEqual(0);
                expect(e.beat + e.length).toBeLessThanOrEqual(METERS[meter].units + 1e-9);
                expect(e.midi).toBeGreaterThanOrEqual(LEAD_RANGE[0]);
                expect(e.midi).toBeLessThanOrEqual(LEAD_RANGE[1]);
            });
        })));
    });
});

describe('the colour layer', () => {
    test('pentatonic drops the 4th and 7th of a major scale, the 2nd and 6th of a minor one', () => {
        expect(pentatonicOf([0, 2, 4, 5, 7, 9, 11])).toEqual([0, 2, 4, 7, 9]);
        expect(pentatonicOf([0, 2, 3, 5, 7, 8, 10])).toEqual([0, 3, 5, 7, 10]);
        expect(pentatonicOf([0, 2, 4, 7, 9])).toEqual([0, 2, 4, 7, 9]);
    });
    test('an open voicing drops the second note from the top an octave', () => {
        expect(openVoicing([60, 64, 67], 55)).toEqual([52, 60, 67]);
        expect(openVoicing([60, 67], 55)).toEqual([60, 67]);
    });
});

describe('the colour layer in a piece', () => {
    const lead = { ...AUTO, leadActivity: 1 };
    const withColour = (extra) => ({ ...lead, ...extra });

    test('off, it changes nothing', () => {
        const neutral = { pedal: { mode: 'off', amount: 1 }, leadScale: 'full', leadLeaps: 0.5, leadRepeat: 0, leadEnding: 'settled', chordSpread: 'close' };
        expect(run({ seed: 5, settings: withColour(neutral) })).toEqual(run({ seed: 5, settings: lead }));
    });

    test('a tonic pedal: the bass stays on the key\'s tonic under every chord', () => {
        SEEDS.forEach((seed) => run({ seed, tonic: 2, settings: withColour({ pedal: { mode: 'tonic', amount: 1 } }) })
            .forEach((bar) => byRole(bar, 'bass').forEach((e) => expect(pc(e.midi)).toBe(2))));
    });

    test('a fifth pedal sits on the fifth', () => {
        run({ seed: 3, tonic: 0, settings: withColour({ pedal: { mode: 'fifth', amount: 1 } }) })
            .forEach((bar) => byRole(bar, 'bass').forEach((e) => expect(pc(e.midi)).toBe(7)));
    });

    test('a pentatonic lead avoids the 4th and 7th in major, stepping between chord tones', () => {
        // chord tones may still be anything; steps are the notes a pentatonic lead gives up
        const bars = run({ seed: 4, bars: 64, degrees: [1], settings: withColour({ leadScale: 'pentatonic' }) });
        const leads = bars.flatMap((bar) => byRole(bar, 'lead')).map((e) => pc(e.midi));
        expect(leads.length).toBeGreaterThan(20);
        expect(leads.filter((n) => [5, 11].includes(n)).length).toBeLessThan(leads.length * 0.1);
    });

    test('repeating: with leadRepeat 1, every following phrase replays the first tune', () => {
        const bars = run({ seed: 6, bars: 16, settings: withColour({ leadRepeat: 1 }) });
        const phrases = [0, 1, 2, 3].map((p) => bars[p * PHRASE_BARS].state.phrase);
        phrases.slice(1).forEach((phrase) => expect(phrase.motif).toEqual(phrases[0].motif));
    });

    test('open endings finish on the fifth or the 2nd, not the root or third', () => {
        const bars = run({ seed: 7, bars: 64, degrees: [1], settings: withColour({ leadEnding: 'open' }) });
        const lasts = bars.filter((bar) => bar.bar % PHRASE_BARS === PHRASE_BARS - 1).map((bar) => byRole(bar, 'lead').pop()).filter(Boolean);
        expect(lasts.length).toBeGreaterThan(3);
        lasts.forEach((e) => expect([7, 2]).toContain(pc(e.midi)));
    });

    test('an open pad voicing stays within one octave below and the register above', () => {
        run({ seed: 2, settings: withColour({ chordSpread: 'open', padWeights: pads('sustain') }) })
            .forEach((bar) => byRole(bar, 'pad').forEach((e) => { expect(e.midi).toBeGreaterThanOrEqual(PAD_RANGE[0] - 12); expect(e.midi).toBeLessThanOrEqual(PAD_RANGE[1]); }));
    });
});
