import { separateLayers, ATTACKS_PER_BEAT, RHYTHM_LEVEL } from './layerRules';

const NONE = { register: false, ownership: false, attacks: false, density: false, clear: false, entrances: false, mix: false };
const meter = { units: 4, unitsPerBeat: 1, groups: [2, 2] };
const ev = (role, beat, midi = 60, velocity = 0.5) => ({ role, midi, beat, length: 1, velocity });
const at = (events, role) => events.filter((e) => e.role === role).map((e) => e.beat);

test('with every rule off the bar is left alone', () => {
    const events = [ev('pad', 0), ev('rhythm', 0), ev('rhythm', 1)];
    expect(separateLayers(events, { rules: NONE, meter })).toEqual(events);
});

test('a bar without a rhythm layer is returned as it came', () => {
    const events = [ev('pad', 0), ev('bass', 0)];
    expect(separateLayers(events, { rules: { ...NONE, attacks: true }, meter })).toBe(events);
});

test('entrances: the rhythm layer sits out intros and breakdowns, and plays in builds and full sections', () => {
    const events = [ev('pad', 0), ev('rhythm', 1)];
    const rules = { ...NONE, entrances: true };
    for (const type of ['intro', 'breakdown']) expect(at(separateLayers(events, { rules, meter, section: { type } }), 'rhythm')).toEqual([]);
    for (const type of ['build', 'full']) expect(at(separateLayers(events, { rules, meter, section: { type } }), 'rhythm')).toEqual([1]);
    expect(at(separateLayers(events, { rules, meter, section: null }), 'rhythm')).toEqual([1]);
    expect(at(separateLayers(events, { rules, meter, section: { type: 'intro' } }), 'pad')).toEqual([0]);
});

test('attacks: the rhythm layer keeps the downbeat but stays off the pad\'s later entries', () => {
    const events = [ev('pad', 0), ev('pad', 2), ev('rhythm', 0), ev('rhythm', 1), ev('rhythm', 2), ev('rhythm', 2.5), ev('rhythm', 3)];
    expect(at(separateLayers(events, { rules: { ...NONE, attacks: true }, meter }), 'rhythm')).toEqual([0, 1, 2.5, 3]);
});

test('density: rhythm attacks give way to the lead and second lead up to the ceiling per beat', () => {
    const sixteenths = [0, 0.25, 0.5, 0.75].map((b) => ev('rhythm', b));
    const rules = { ...NONE, density: true };
    expect(separateLayers(sixteenths, { rules, meter })).toHaveLength(ATTACKS_PER_BEAT);
    const lead = [ev('lead', 0), ev('lead', 0.5)];
    expect(at(separateLayers(sixteenths, { rules, meter, lead }), 'rhythm')).toEqual([0, 0.25]);
    const both = separateLayers([...sixteenths, ev('counter', 0.75)], { rules, meter, lead });
    expect(at(both, 'rhythm')).toEqual([0]);
    // notes struck together are one attack; another beat is counted on its own
    expect(separateLayers([ev('rhythm', 0, 60), ev('rhythm', 0, 64), ev('rhythm', 1)], { rules, meter, lead: [ev('lead', 0), ev('lead', 0.5), ev('lead', 0.75)] })
        .filter((e) => e.role === 'rhythm')).toHaveLength(3);
});

test('mix: the rhythm layer is brought forward (never past full), the others do not move', () => {
    const out = separateLayers([ev('pad', 0, 60, 0.6), ev('rhythm', 1, 72, 0.5), ev('rhythm', 2, 72, 0.95)], { rules: { ...NONE, mix: true }, meter });
    expect(out.filter((e) => e.role === 'rhythm').map((e) => e.velocity)).toEqual([0.5 * RHYTHM_LEVEL, 1]);
    expect(RHYTHM_LEVEL).toBeGreaterThan(1);
    expect(out.find((e) => e.role === 'pad').velocity).toBe(0.6);
});

test('clear: the rhythm layer leaves the sounding lead note, its octaves and its near neighbours alone', () => {
    const rules = { ...NONE, clear: true };
    const lead = [{ ...ev('lead', 0, 79), length: 2 }];
    const rhythm = [ev('rhythm', 0, 79), ev('rhythm', 0.5, 67), ev('rhythm', 1, 81), ev('rhythm', 1.5, 83), ev('rhythm', 2, 79), ev('rhythm', 3, 91)];
    // 79 (unison), 67 (an octave under), 81 (a whole step over) go while the lead holds its note; 83 stays; from beat 2 the lead is done
    expect(separateLayers(rhythm, { rules, meter, lead }).map((e) => e.beat)).toEqual([1.5, 2, 3]);
    expect(separateLayers(rhythm, { rules, meter, lead: [] })).toHaveLength(6);
});
