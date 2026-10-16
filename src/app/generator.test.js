// Generator planning, without audio: the audio layer and Instruments are
// stubbed (jsdom has no Web Audio), and bars are planned by advancing the
// "current bar" by hand, as the Transport would.

import { scaleDistance } from './conductor';

vi.mock('../audio/context', () => ({
    audioContext: {
        currentTime: 0,
        state: 'running',
        resume: () => Promise.resolve(),
        createGain: () => {
            const gain = {
                value: 1,
                setTargetAtTime: (v) => { gain.value = v; },
                setValueAtTime: (v) => { gain.value = v; },
                cancelScheduledValues: () => {},
            };
            return { connect: () => {}, gain };
        },
        createConstantSource: () => ({ connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {}, offset: { value: 0, setTargetAtTime() {} } }),
        createChannelSplitter: () => ({ connect: () => {}, disconnect: () => {} }),
        createChannelMerger: () => ({ connect: () => {}, disconnect: () => {} }),
        createWaveShaper: () => ({ connect: () => {}, disconnect: () => {} }),
        createPeriodicWave: () => ({}),
        createOscillator: () => ({
            connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {}, setPeriodicWave: () => {}, frequency: { value: 0 },
        }),
        createBiquadFilter: () => {
            const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, cancelScheduledValues() {} });
            return { connect: () => {}, frequency: param(), Q: param() };
        },
    },
}));
vi.mock('../audio/bus', () => ({ masterBus: {} }));
// vi.mock factories are hoisted above imports; shared state must be too.
const mockBooked = vi.hoisted(() => []);
vi.mock('./engine/Instrument', () => ({ default: class {
    constructor({ polyphony }) { this.polyphony = polyphony; this.preset = {}; }
    connect() {}
    applyPreset() {}
    scheduleNote(midi, start, duration, velocity, detune) { mockBooked.push({ midi, start, duration, velocity, detune }); }
    silence() {}
    flushTails() {}
} }));

const mockHits = vi.hoisted(() => []);
vi.mock('./engine/drumKit', () => ({ default: class {
    constructor() { this.polyphony = 0; this.preset = {}; }
    setKit() {}
    connect() {}
    scheduleNote(drum, start, duration, velocity) { mockHits.push({ drum, start, velocity }); }
    silence() {}
    flushTails() {}
} }));

import Generator from './Generator';

function play(gen, bars) {
    const out = [];
    for (let bar = 0; bar < bars; bar++) {
        gen.currentBar = bar;
        gen.ensurePlanned(bar);
        out.push(gen.plan.get(bar));
    }
    return out;
}

function generator(seed, drift) {
    const gen = new Generator();
    gen.settings.seed = seed;
    gen.settings.drift = { ...gen.settings.drift, ...drift };
    gen.reset();
    return gen;
}

const HOME = { tonic: 0, mode: 'Major-1' };

test('drift off: the home progression loops in the home key at home tempo', () => {
    const bars = play(generator(1, { mode: 'off' }), 32);
    expect(bars.map((b) => b.chord.name).slice(0, 8)).toEqual(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']);
    bars.forEach((b) => {
        expect(b.chord.keyName).toBe('C Ionian');
        expect(b.bpm).toBe(72);
    });
});

test('centered drift: changes happen only at cycle starts and stay near home', () => {
    const drift = { mode: 'centered', keyChance: 0.6, modeChance: 0.3, progressionChance: 0.5, tempoChance: 0.6 };
    [1, 2, 3].forEach((seed) => {
        const bars = play(generator(seed, drift), 200);
        bars.slice(1).forEach((b, i) => {
            const prev = bars[i];
            const changed = ['tonic', 'mode', 'progression'].some((k) => b.music[k] !== prev.music[k]);
            if (changed) expect(b.music.cycleStart).toBe(b.bar);
            expect(scaleDistance(b.music, HOME)).toBeLessThanOrEqual(2);
        });
        expect(new Set(bars.map((b) => b.chord.keyName)).size).toBeGreaterThan(1);
    });
});

test('a key change is prepared by the new key\'s V chord in the last chord slot', () => {
    const drift = { mode: 'centered', keyChance: 1, modeChance: 0, progressionChance: 0, tempoChance: 0, pivot: true };
    const bars = play(generator(5, drift), 64);
    let pivots = 0;
    bars.slice(0, -1).forEach((b, i) => {
        const next = bars[i + 1];
        if (scaleDistance(b.music, next.music) === 0 || next.music.cycleStart !== next.bar) return;
        pivots++;
        // V of the new key: its root is a fifth above the new tonic
        expect(b.chord.numeral).toMatch(/\//);
        expect(b.chord.pitchClasses[0]).toBe((next.music.tonic + 7) % 12);
        expect(b.chordStart).toBe(true);
    });
    expect(pivots).toBeGreaterThan(3);
});

test('pivots off: the last slot keeps the progression chord', () => {
    const drift = { mode: 'centered', keyChance: 1, modeChance: 0, progressionChance: 0, tempoChance: 0, pivot: false };
    play(generator(5, drift), 64).forEach((b) => expect(b.chord.numeral).not.toMatch(/\//));
});

test('two bars per chord: the pivot fills the whole last slot', () => {
    const drift = { mode: 'centered', keyChance: 1, modeChance: 0, progressionChance: 0, tempoChance: 0, pivot: true };
    const gen = generator(7, drift);
    gen.settings.barsPerChord = 2;
    gen.reset();
    const bars = play(gen, 96);
    bars.filter((b) => b.chord.numeral.includes('/')).forEach((b) => {
        const slotStart = (b.bar - b.music.cycleStart) % 2 === 0;
        const partner = bars.find((o) => o.bar === (slotStart ? b.bar + 1 : b.bar - 1));
        if (partner) expect(partner.chord.name).toBe(b.chord.name);
    });
});

test('tempo glides at most 2 BPM per bar and stays in range', () => {
    const drift = { mode: 'centered', keyChance: 0, modeChance: 0, progressionChance: 0, tempoChance: 1, tempoRange: 10 };
    const bars = play(generator(3, drift), 200);
    bars.slice(1).forEach((b, i) => expect(Math.abs(b.bpm - bars[i].bpm)).toBeLessThanOrEqual(2));
    bars.forEach((b) => {
        expect(b.bpm).toBeGreaterThanOrEqual(62);
        expect(b.bpm).toBeLessThanOrEqual(82);
    });
    expect(new Set(bars.map((b) => b.bpm)).size).toBeGreaterThan(3);
});

test('changing a home setting while playing brings the music home from the next bar', () => {
    const drift = { mode: 'wandering', keyChance: 1, modeChance: 1, progressionChance: 1, tempoChance: 1 };
    const gen = generator(9, drift);
    play(gen, 40);
    gen.transport.timer = 1; // pretend it is running
    gen.set('tonic', 2);
    const next = gen.plan.get(40);
    expect(next.music).toMatchObject({ tonic: 2, mode: 'Major-1', progression: 0, bpm: 72, cycleStart: 40 });
    expect(next.chord.keyName).toBe('D Ionian');
    gen.transport.timer = null;
});

// Drives onBeat like the Transport would (tempo from the plan), returning
// every booked note.
function perform(gen, bars) {
    mockBooked.length = 0;
    gen.transport.beatsPerBar = gen.beatsPerBar;
    let time = 1;
    const downbeats = [];
    for (let beat = 0; beat < bars * gen.beatsPerBar; beat++) {
        const bar = Math.floor(beat / gen.beatsPerBar);
        const beatInBar = beat % gen.beatsPerBar;
        if (beatInBar === 0) downbeats[bar] = time;
        const secondsPerBeat = gen.transport.secondsPerBeat;
        gen.onBeat({ beat, bar, beatInBar, time, secondsPerBeat });
        time += gen.transport.secondsPerBeat;
    }
    return { booked: [...mockBooked], downbeats };
}

test('humanize 0 is exact: no detune, notes on the arranger grid', () => {
    const gen = generator(2, { mode: 'off' });
    gen.settings.humanize = { timing: 0, velocity: 0, detune: 0 };
    gen.reset();
    play(gen, 16).forEach((b) => b.events.forEach((e) => {
        expect(e.detune).toBe(0);
        expect(e.beat * 2).toBe(Math.round(e.beat * 2));
    }));
});

test('humanized timing: some notes early, never before bar 0, at most half a unit', () => {
    const gen = generator(2, { mode: 'off' });
    gen.settings.humanize = { timing: 30, velocity: 0.1, detune: 5 };
    gen.reset();
    const bars = play(gen, 40);
    bars[0].events.forEach((e) => expect(e.beat).toBeGreaterThanOrEqual(0));
    const all = bars.flatMap((b) => b.events);
    expect(all.some((e) => e.beat < 0)).toBe(true);
    all.forEach((e) => expect(e.beat).toBeGreaterThanOrEqual(-0.5));
    expect(new Set(all.map((e) => e.detune)).size).toBeGreaterThan(10);
});

test('every planned note is booked exactly once; early ones before their downbeat', () => {
    const gen = generator(4, { mode: 'centered', tempoChance: 1, tempoRange: 10 });
    gen.settings.humanize = { timing: 30, velocity: 0.1, detune: 5 };
    gen.reset();
    const { booked, downbeats } = perform(gen, 24);
    const planned = [];
    for (let bar = 0; bar < 23; bar++) {
        const entry = gen.plan.get(bar);
        if (entry) entry.events.forEach((e) => planned.push({ bar, e }));
    }
    planned.forEach(({ e }) => expect(e.booked).toBe(true));
    const early = planned.filter(({ e }) => e.beat < 0);
    expect(early.length).toBeGreaterThan(0);
    early.forEach(({ bar, e }) => {
        const hit = booked.find((n) => n.midi === e.midi && n.detune === e.detune && n.velocity === e.velocity);
        expect(hit.start).toBeLessThan(downbeats[bar]);
        expect(hit.start).toBeGreaterThan(downbeats[bar - 1]);
    });
});

test('6/8: units of eighths, felt tempo in dotted quarters', () => {
    const gen = generator(1, { mode: 'off' });
    gen.set('meter', '6/8');
    expect(gen.beatsPerBar).toBe(6);
    expect(gen.transport.beatsPerBar).toBe(6);
    play(gen, 8).forEach((b) => b.events.forEach((e) => expect(e.beat).toBeLessThan(6)));
    const { downbeats } = perform(gen, 3);
    // 72 dotted quarters per minute = 2 per bar -> 60/72*2 s per bar
    expect(downbeats[2] - downbeats[1]).toBeCloseTo((60 / 72) * 2, 5);
});

test('keepCurrent makes the drifted music the new home, without a jump', () => {
    const gen = generator(11, { mode: 'wandering', keyChance: 1, modeChance: 0.5, progressionChance: 1, tempoChance: 1 });
    play(gen, 30);
    gen.position = () => 29 * gen.beatsPerBar; // audible bar 29
    const now = gen.nowPlaying();
    expect(now.keyName).toBe(gen.plan.get(29).chord.keyName);
    gen.transport.timer = 1;
    gen.keepCurrent();
    expect(gen.settings).toMatchObject({ tonic: now.tonic, mode: now.mode, progression: now.progression, bpm: now.bpm });
    expect(gen.plan.get(30).music).toMatchObject({ tonic: now.tonic, mode: now.mode, progression: now.progression });
    gen.transport.timer = null;
});

test('same settings + seed = the same piece; another seed = another piece', () => {
    const notes = (seed) => play(generator(seed, { mode: 'centered', keyChance: 0.5 }), 24)
        .map((b) => b.events.map((e) => [e.role, e.midi, e.beat.toFixed(4)].join()).join('|'));
    expect(notes(21)).toEqual(notes(21));
    expect(notes(21)).not.toEqual(notes(22));
});

test('stop/replay starts the same piece again', () => {
    const gen = generator(5, { mode: 'off' });
    const first = play(gen, 8).map((b) => b.events.map((e) => e.midi).join());
    gen.reset();
    expect(play(gen, 8).map((b) => b.events.map((e) => e.midi).join())).toEqual(first);
});

test('mute and solo: any solo silences the rest; mute silences only its role', () => {
    const gen = generator(1, { mode: 'off' });
    const levels = () => Object.fromEntries(Object.entries(gen.roles).map(([role, r]) => [role, r.gain.gain.value]));
    gen.setRoleMix('bass', { mute: true });
    expect(levels()).toEqual({ pad: 0.8, bass: 0, lead: 0.7, counter: 0.6, perc: 0.7 });
    gen.setRoleMix('lead', { solo: true });
    expect(levels()).toEqual({ pad: 0, bass: 0, lead: 0.7, counter: 0, perc: 0 });
    gen.setRoleMix('bass', { solo: true }); // solo beats mute
    expect(levels()).toEqual({ pad: 0, bass: 0.8, lead: 0.7, counter: 0, perc: 0 });
    gen.setRoleMix('lead', { solo: false });
    gen.setRoleMix('bass', { solo: false });
    gen.setRoleVolume('pad', 0.5);
    expect(levels()).toEqual({ pad: 0.5, bass: 0, lead: 0.7, counter: 0.6, perc: 0.7 });
});

test('stop pauses: Play picks up at the next bar, settings changes keep the place, rewind goes back', () => {
    const gen = generator(4, { mode: 'off' });
    play(gen, 12);
    const notes = (bar) => gen.plan.get(bar).events.map((e) => e.midi).join();
    const bar11 = notes(11);
    gen.pause(10 * gen.beatsPerBar + 1.5); // heard: bar 10
    expect(gen.paused).toBe(true);
    expect(gen.resumeBar).toBe(11);
    expect(gen.position()).toBe(11 * gen.beatsPerBar);
    expect(notes(11)).toBe(bar11);
    expect(gen.plan.get(11).events.every((e) => !e.booked)).toBe(true);
    gen.set('leadActivity', 0.2);
    expect(gen.resumeBar).toBe(11);
    expect(gen.plan.has(10)).toBe(true);
    gen.rewind();
    expect(gen.paused).toBe(false);
    expect(gen.position()).toBe(0);
});

test('a phrase is a piece: same phrase and settings, same notes from the start - also after edits and a rewind', async () => {
    const { phraseToSeed } = await import('./phrase');
    const notes = (gen) => play(gen, 48).map((b) => b.events.map((e) => `${e.role}${e.midi}@${e.beat.toFixed(3)}`).join()).join('|');
    const make = () => {
        const gen = new Generator();
        gen.setMany({ seed: phraseToSeed('rainy sunday'), sections: { mode: 'strong', phrases: 2 }, counter: { mode: 'answer', activity: 0.6 } });
        return gen;
    };
    const first = notes(make());
    expect(notes(make())).toBe(first);
    const edited = make();
    play(edited, 6);
    edited.pause(5 * edited.beatsPerBar);
    edited.set('leadActivity', 0.1);
    expect(edited.editedSinceStart).toBe(true);
    edited.set('leadActivity', 0.6);
    edited.rewind();
    expect(edited.editedSinceStart).toBe(false);
    expect(notes(edited)).toBe(first);
});

test('stepping: by chord and by progression; forward keeps the place, back goes to the start first', () => {
    const gen = generator(6, { mode: 'off' });
    gen.set('barsPerChord', 2); // 4 chords of 2 bars: cycles of 8 bars
    play(gen, 40);
    const notes = (bar) => gen.plan.get(bar).events.map((e) => e.midi).join();
    const bar5 = notes(5);
    gen.pause(20 * gen.beatsPerBar);
    gen.seek(5);
    expect(gen.hereBar).toBe(5);
    expect(notes(5)).toBe(bar5); // back plays what was planned
    gen.step('progression', 1); // bar 5 of cycle 0..7 -> bar 5 of 8..15
    expect(gen.hereBar).toBe(13);
    gen.step('chord', 1); // second bar of chord 12..13 -> second bar of 14..15
    expect(gen.hereBar).toBe(15);
    gen.step('chord', -1); // inside a chord: its start
    expect(gen.hereBar).toBe(14);
    gen.step('chord', -1); // at its start: the chord before
    expect(gen.hereBar).toBe(12);
    gen.step('progression', -1); // inside a cycle: its start
    expect(gen.hereBar).toBe(8);
    gen.step('progression', -1); // at its start: the one before
    expect(gen.hereBar).toBe(0);
    gen.seek(-3);
    expect(gen.hereBar).toBe(0);
});

test('looping: a bar or a progression; a settings change re-plans the loop at its next pass', () => {
    const gen = generator(6, { mode: 'off' });
    play(gen, 10);
    gen.pause(5 * gen.beatsPerBar);
    gen.setLoop('progression');
    expect(gen.loop).toMatchObject({ from: 4, to: 7 });
    gen.setLoop('chord');
    expect(gen.loop).toMatchObject({ from: 6, to: 6 });
    gen.plan.get(6).events.forEach((e) => { e.booked = true; });
    const before = gen.plan.get(6).events.map((e) => e.midi).join();
    gen.loopBack();
    expect(gen.plan.get(6).events.every((e) => !e.booked)).toBe(true);
    expect(gen.plan.get(6).events.map((e) => e.midi).join()).toBe(before);
    gen.set('padNotes', 4);
    gen.loopBack();
    expect(gen.plan.get(6).events.filter((e) => e.role === 'pad').length).toBeGreaterThan(0);
    expect(gen.plan.get(6).state.padVoicing.length).toBe(4);
    gen.setLoop('off');
    expect(gen.loop).toBeNull();
});

describe('drums, swing and section tone', () => {
    const notes = (bars) => bars.flatMap((b) => b.events.filter((e) => e.role !== 'perc').map(({ role, midi, beat, velocity }) => ({ bar: b.bar, role, midi, beat, velocity })));
    const withSettings = (patch) => {
        const gen = generator(31, { mode: 'centered' });
        Object.assign(gen.settings, patch);
        gen.reset();
        return play(gen, 24);
    };

    test('turning drums on adds hits and leaves every note as it was', () => {
        const plain = withSettings({});
        ['heartbeat', 'brushes', 'lofi', 'shaker', 'downtempo'].forEach((style) => {
            const drummed = withSettings({ drums: { style, activity: 0.8 } });
            expect(notes(drummed)).toEqual(notes(plain));
            const hits = drummed.flatMap((b) => b.events.filter((e) => e.role === 'perc'));
            expect(hits.length).toBeGreaterThan(0);
            hits.forEach((e) => {
                expect(e.beat).toBeGreaterThanOrEqual(0);
                expect(e.beat).toBeLessThan(4.1);
                expect(e.midi).toBeGreaterThanOrEqual(0);
                expect(e.midi).toBeLessThan(9);
            });
        });
        expect(plain.flatMap((b) => b.events).some((e) => e.role === 'perc')).toBe(false);
    });

    test('sections thin the drums out: a strong intro has none', () => {
        const bars = withSettings({ drums: { style: 'lofi', activity: 0.5 }, sections: { mode: 'strong', phrases: 2 } });
        bars.filter((b) => b.state.phrase.section.type === 'intro').forEach((b) => expect(b.events.some((e) => e.role === 'perc')).toBe(false));
        expect(bars.some((b) => b.state.phrase.section.type === 'full' && b.events.some((e) => e.role === 'perc'))).toBe(true);
    });

    test('swing delays only off-beat halves, toward the triplet', () => {
        const straight = withSettings({ humanize: { timing: 0, velocity: 0, detune: 0 }, drums: { style: 'lofi', activity: 0.5 } });
        const swung = withSettings({ humanize: { timing: 0, velocity: 0, detune: 0 }, drums: { style: 'lofi', activity: 0.5 }, swing: 0.6 });
        straight.forEach((b, i) => b.events.forEach((e, j) => {
            const s = swung[i].events[j];
            const offBeat = Math.abs(e.beat - Math.floor(e.beat) - 0.5) < 1e-9;
            expect(s.beat).toBeCloseTo(offBeat ? e.beat + 0.1 : e.beat, 9);
        }));
    });

    test('section tone: darker in intros, open in full; open when off', () => {
        const bars = withSettings({ sectionTone: true, sections: { mode: 'gentle', phrases: 2 } });
        bars.forEach((b) => {
            if (b.state.phrase.section.type === 'full') expect(b.tone).toBe(20000);
            if (b.state.phrase.section.type === 'intro') expect(b.tone).toBeLessThan(5000);
        });
        withSettings({ sections: { mode: 'gentle', phrases: 2 } }).forEach((b) => expect(b.tone).toBe(20000));
    });
});

test('an ending: V, then a held I, then silence; Stop before the end carries on instead', () => {
    const gen = generator(12, { mode: 'off' });
    gen.settings.drums = { style: 'brushes', activity: 0.5 };
    play(gen, 10);
    gen.transport.timer = 1;
    gen.endSoon();
    const v = gen.plan.get(10);
    const final = gen.plan.get(11);
    expect(v.chord.numeral).toMatch(/^V/);
    expect(final.chord.numeral).toMatch(/^I/);
    expect(final.chord.keyName).toBe('C Ionian');
    const pad = final.events.filter((e) => e.role === 'pad');
    expect(pad.length).toBe(3);
    pad.forEach((e) => expect(e.length).toBeGreaterThan(gen.beatsPerBar));
    expect(final.events.filter((e) => e.role === 'bass').length).toBe(1);
    expect(final.events.filter((e) => e.role === 'perc').length).toBe(1);
    gen.ensurePlanned(12);
    expect(gen.plan.get(12).events).toEqual([]);
    expect(gen.ending).toBe(true);
    gen.stop();
    expect(gen.ending).toBe(false);
    expect([...gen.plan.values()].some((planned) => planned.ending)).toBe(false);
});

describe('library presets as the generator plays them', () => {
    // imported late: the module mocks above have to be in place first
    test('every music preset plans a long stretch: notes in every voice that plays, finite times, the tempo it names', async () => {
        const { SCENES, sceneSettings, sceneGroup } = await import('./scenes');
        SCENES.filter((scene) => sceneGroup(scene) !== 'ambience').forEach((scene) => {
            const gen = new Generator();
            // (the ambience engine isn't stubbed here)
            const { ambience, ambienceShape, ambienceVolume, playAmbience, ...music } = sceneSettings(scene, 11);
            gen.setMany(music);
            gen.reset();
            const bars = play(gen, 40);
            bars.forEach((b) => {
                expect(b.bpm).toBe(scene.settings.bpm ?? 72);
                b.events.forEach((e) => {
                    expect(Number.isFinite(e.beat) && Number.isFinite(e.length) && Number.isFinite(e.midi) && Number.isFinite(e.velocity)).toBe(true);
                });
            });
            expect(bars.flatMap((b) => b.events).filter((e) => e.role === 'bass').length).toBeGreaterThan(20);
            expect(bars.flatMap((b) => b.events).filter((e) => e.role === 'pad').length).toBeGreaterThan(20);
        });
    });
});

describe('sounds that change with a preset', () => {
    test('while playing, a new sound waits for the next bar line; stopped, it is loaded at once', () => {
        const gen = new Generator();
        gen.reset();
        const loaded = [];
        gen.roles.pad.instrument.applyPreset = (preset) => loaded.push(preset.tag);
        // stopped: at once
        let applied = 0;
        gen.loadRolePresetAtBar('pad', 'A', { tag: 'A' }, () => applied++);
        expect(loaded).toEqual(['A']);
        expect(applied).toBe(1);
        // playing: waits for a first beat
        gen.transport.timer = 1;
        gen.loadRolePresetAtBar('pad', 'B', { tag: 'B' }, () => applied++);
        gen.loadRolePresetAtBar('pad', 'C', { tag: 'C' }, () => applied++);
        expect(loaded).toEqual(['A']);
        gen.onBeat({ bar: 1, beatInBar: 2, time: 0, secondsPerBeat: 0.5 });
        expect(loaded).toEqual(['A']);
        gen.onBeat({ bar: 2, beatInBar: 0, time: 1, secondsPerBeat: 0.5 });
        expect(loaded).toEqual(['A', 'C']);
        expect(gen.roles.pad.presetName).toBe('C');
        expect(applied).toBe(2);
        gen.transport.timer = null;
    });

    test('a sound loaded directly replaces one that was waiting, and stopping loads what waits', () => {
        const gen = new Generator();
        gen.reset();
        const loaded = [];
        gen.roles.bass.instrument.applyPreset = (preset) => loaded.push(preset.tag);
        gen.transport.timer = 1;
        gen.loadRolePresetAtBar('bass', 'B', { tag: 'B' });
        gen.loadRolePreset('bass', 'D', { tag: 'D' });
        gen.flushPendingVoices();
        expect(loaded).toEqual(['D']);
        gen.loadRolePresetAtBar('bass', 'E', { tag: 'E' });
        gen.flushPendingVoices();
        expect(loaded).toEqual(['D', 'E']);
        gen.transport.timer = null;
    });
});

describe('the audio clock behind the playhead', () => {
    test('steps of a big output buffer do not make it jump: it advances evenly, close to the true time', () => {
        const gen = new Generator();
        const wall = vi.spyOn(performance, 'now');
        const BUFFER = 0.2;
        const readings = [];
        for (let frame = 0; frame < 300; frame++) {
            const t = 10 + frame * 0.016; // a 60 fps page
            wall.mockReturnValue(t * 1000);
            gen.AC.currentTime = Math.floor(t / BUFFER) * BUFFER; // the audio clock moves in whole buffers
            readings.push({ t, clock: gen.audioClock() });
        }
        wall.mockRestore();
        const settled = readings.slice(30);
        settled.slice(1).forEach(({ clock }, i) => {
            const step = clock - settled[i].clock;
            expect(step).toBeGreaterThanOrEqual(0);
            expect(step).toBeLessThan(0.03); // never a buffer-sized jump
        });
        // and not drifting away from the real time
        settled.forEach(({ t, clock }) => expect(Math.abs(clock - t)).toBeLessThan(BUFFER + 0.01));
    });

    test('a jump of the audio clock (a seek, a suspended context) starts it over', () => {
        const gen = new Generator();
        const wall = vi.spyOn(performance, 'now');
        wall.mockReturnValue(5000);
        gen.AC.currentTime = 5;
        gen.audioClock();
        wall.mockReturnValue(5016);
        gen.AC.currentTime = 20;
        expect(gen.audioClock()).toBe(20);
        wall.mockRestore();
    });
});

describe('chord colour and borrowed chords', () => {
    const chordsOf = (patch) => {
        const gen = generator(31, { mode: 'centered' });
        Object.assign(gen.settings, { tonic: 9, mode: 'Major-6', progression: 8, barsPerChord: 1 }, patch);
        gen.reset();
        return play(gen, 8).map((b) => gen.plan.get(b.bar).chord.name);
    };

    test('plain by default; always-floating chords are all suspended', () => {
        expect(chordsOf({}).every((name) => !name.includes('sus'))).toBe(true);
        expect(chordsOf({ chordColour: { mode: 'floating', amount: 1 } }).every((name) => name.includes('sus'))).toBe(true);
    });

    test('a share of chords is coloured, the same ones every time', () => {
        const half = chordsOf({ chordColour: { mode: 'sus2', amount: 0.5 } });
        expect(half).toEqual(chordsOf({ chordColour: { mode: 'sus2', amount: 0.5 } }));
        expect(half.filter((name) => name.includes('sus2')).length).toBeGreaterThan(0);
        expect(half.filter((name) => !name.includes('sus2')).length).toBeGreaterThan(0);
    });

    test('borrowing in a minor key swaps in the major IV (i - iv - VI - v: Dm becomes D)', () => {
        const plain = chordsOf({});
        const borrowed = chordsOf({ chordBorrow: 1 });
        expect(plain.slice(0, 4)).toEqual(['Am', 'Dm', 'F', 'Em']);
        expect(borrowed.slice(0, 4)).toEqual(['Am', 'D', 'F', 'E']);
    });
});
