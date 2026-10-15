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
    expect(levels()).toEqual({ pad: 0.8, bass: 0, lead: 0.7 });
    gen.setRoleMix('lead', { solo: true });
    expect(levels()).toEqual({ pad: 0, bass: 0, lead: 0.7 });
    gen.setRoleMix('bass', { solo: true }); // solo beats mute
    expect(levels()).toEqual({ pad: 0, bass: 0.8, lead: 0.7 });
    gen.setRoleMix('lead', { solo: false });
    gen.setRoleMix('bass', { solo: false });
    gen.setRoleVolume('pad', 0.5);
    expect(levels()).toEqual({ pad: 0.5, bass: 0, lead: 0.7 });
});
