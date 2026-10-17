import { createMusicForces, envelopeAt } from './musicForces';

function setup() {
    let send;
    const off = vi.fn();
    const generator = { roles: { pad: { volume: 1 }, bass: { volume: 1 }, lead: { volume: 1 }, perc: { volume: 1 } },
        onVisualNote(fn) { send = fn; return off; } };
    const music = createMusicForces(generator);
    const note = { type: 'on', role: 'pad', midi: 60, velocity: 0.8, time: 1, length: 4,
        env: { attack: 1, decay: 0.2, sustain: 0.6, release: 1 }, preset: { filterFreq: 1500 } };
    const options = { hue: 200, colour: () => [0.2, 0.4, 0.8], size: 1, speed: 1, intensity: 0.5, trails: true };
    return { generator, music, send: (e) => send(e), note, sample: (t) => music.sample(t, options), off };
}

test('envelope interpolation respects onset and release', () => {
    const points = [[0, 0], [1, 1], [2, 0]];
    expect(envelopeAt(points, -1)).toBe(0);
    expect(envelopeAt(points, 0.5)).toBe(0.5);
    expect(envelopeAt(points, 3)).toBe(0);
});

test('all chord notes survive and held emitters move until release', () => {
    const t = setup();
    for (let i = 0; i < 9; i++) t.send({ ...t.note, midi: 48 + i * 2 });
    expect(t.sample(0.9)).toHaveLength(0);
    expect(t.sample(2)).toHaveLength(9);
    const atTwo = t.sample(2)[0].x; expect(t.sample(3)[0].x).not.toBe(atTwo);
    expect(t.sample(6.2)).toHaveLength(0);
});

test('mix changes immediately suppress injection', () => {
    const t = setup(); t.send(t.note);
    t.generator.roles.pad.mute = true; expect(t.sample(2)).toHaveLength(0);
    t.generator.roles.pad.mute = false; t.generator.roles.lead.solo = true; expect(t.sample(2)).toHaveLength(0);
    t.generator.roles.pad.solo = true; expect(t.sample(2)).toHaveLength(1);
    t.generator.roles.pad.volume = 0; expect(t.sample(2)).toHaveLength(0);
});

test('live release and transport clear cancel emitters', () => {
    const t = setup(); t.send({ ...t.note, length: undefined, liveId: 7 });
    expect(t.sample(5)).toHaveLength(1);
    t.send({ type: 'off', role: 'pad', liveId: 7, time: 5 });
    expect(t.sample(5.5)).toHaveLength(1); expect(t.sample(6.1)).toHaveLength(0);
    t.send({ ...t.note, time: 20 }); t.send({ type: 'clear' }); expect(t.sample(21)).toHaveLength(0);
    t.music.dispose(); expect(t.off).toHaveBeenCalledOnce();
});

test('drum indices have distinct positions and finite forces', () => {
    const t = setup(); t.send({ ...t.note, role: 'perc', midi: 0 }); t.send({ ...t.note, role: 'perc', midi: 13 });
    const samples = t.sample(2);
    expect(samples[0].x).not.toBe(samples[1].x);
    samples.forEach(e => ['x', 'y', 'vx', 'vy', 'radius', 'strength'].forEach(k => expect(Number.isFinite(e[k])).toBe(true)));
});

test('a voice shares one source across pitches and successive note onsets', () => {
    const t = setup();
    for (const midi of [36, 48, 60, 72, 84]) t.send({ ...t.note, midi });
    const first = t.sample(2);
    expect(new Set(first.map(e => e.sourceX)).size).toBe(1);
    expect(new Set(first.map(e => e.sourceY)).size).toBe(1);
    first.forEach(e => expect(Math.hypot(e.x-e.sourceX, e.y-e.sourceY)).toBeLessThan(0.05));
    t.send({ ...t.note, midi: 81, time: 2.01 });
    const next = t.sample(2.02);
    next.forEach(e => expect(Math.hypot(e.sourceX-first[0].sourceX, e.sourceY-first[0].sourceY)).toBeLessThan(0.01));
});

test('short notes create smaller faster jets than long notes, at the same pitch and velocity', () => {
    const compare = (length) => {
        const t = setup(); t.send({ ...t.note, length });
        return t.sample(1.05)[0];
    };
    const short = compare(0.12), long = compare(8);
    expect(short.radius).toBeLessThan(long.radius / 5);
    expect(Math.hypot(short.vx, short.vy)).toBeGreaterThan(Math.hypot(long.vx, long.vy) * 5);
    expect(short.dyeGain).toBeGreaterThan(long.dyeGain);
});

test('live keys grow broader and slower while held, then preserve their release tail', () => {
    const t = setup();
    t.generator.roles.pad.instrument = { held: new Map([[1, { index: 0, voiceId: 3 }]]), voices: [{ voiceId: 3 }] };
    t.send({ ...t.note, length: undefined, liveId: 1 });
    const attack = t.sample(1.1)[0], held = t.sample(7)[0];
    expect(attack.radius).toBeLessThan(held.radius);
    expect(Math.hypot(attack.vx, attack.vy)).toBeGreaterThan(Math.hypot(held.vx, held.vy));
    t.generator.roles.pad.instrument.held.delete(1);
    t.send({ type: 'off', role: 'pad', liveId: 1, time: 7 });
    expect(t.sample(7.4)).toHaveLength(1);
    expect(t.sample(8.1)).toHaveLength(0);
});

test('exhaust reverses the jet without moving the source or changing its size', () => {
    const t = setup(); t.send(t.note);
    const options = { hue: 200, colour: () => [1,1,1], size: 1, speed: 1, intensity: 0.5, trails: true };
    const forward = t.music.sample(2, { ...options, jetDirection: 'forward' })[0];
    const exhaust = t.music.sample(2, { ...options, jetDirection: 'exhaust' })[0];
    expect(exhaust.x).toBe(forward.x); expect(exhaust.y).toBe(forward.y);
    expect(exhaust.radius).toBe(forward.radius);
    expect(exhaust.vx).toBeCloseTo(-forward.vx); expect(exhaust.vy).toBeCloseTo(-forward.vy);
});

test('motion balance freezes the source at zero and removes the jet at one without teleporting', () => {
    const t = setup(); t.send(t.note);
    const options = { hue: 200, colour: () => [1,1,1], size: 1, speed: 1, intensity: 0.5, trails: true, balanceDrift: 1 };
    const first = t.music.sample(2, { ...options, motionBalance: 0 })[0];
    const still = t.music.sample(2.2, { ...options, motionBalance: 0 })[0];
    expect(still.x).toBe(first.x); expect(still.y).toBe(first.y);
    const switched = t.music.sample(2.2, { ...options, motionBalance: 1 })[0];
    expect(switched.x).toBe(still.x); expect(switched.y).toBe(still.y);
    const moving = t.music.sample(2.4, { ...options, motionBalance: 1 })[0];
    expect(moving.sourceX).not.toBe(still.sourceX);
    expect(moving.vx).toBeCloseTo(0); expect(moving.vy).toBeCloseTo(0);
});
