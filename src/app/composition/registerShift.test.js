import { rangedRoles, octaveShift, foldIntoRange, planRegisterShift, applyRegisterShift } from './registerShift';

const CROTALES = [84, 108], MUTED = [46, 69];
const note = (role, midi, beat = 0) => ({ role, midi, beat, length: 1, velocity: .7 });

test('only a voice with a usable range takes part', () => {
    expect(rangedRoles({ lead: { preset: { range: CROTALES } }, pad: { preset: {} }, bass: {}, counter: { preset: { range: [70, 60] } }, rhythm: { preset: { range: 'wide' } } })).toEqual({ lead: CROTALES });
    expect(rangedRoles()).toEqual({});
});

test('a shift takes the middle of what was written to the middle of the range, in whole octaves', () => {
    expect(octaveShift([72, 79, 84], CROTALES)).toBe(12);
    expect(octaveShift([72, 79, 84], MUTED)).toBe(-24);
    expect(octaveShift([96], CROTALES)).toBe(0);
    expect(octaveShift([], CROTALES)).toBe(0);
});

test('a shift that still works stays, so a stray note does not move the whole part an octave', () => {
    const mostly = Array.from({ length: 19 }, () => 74);
    expect(octaveShift([...mostly, 60], CROTALES, 12)).toBe(12);
    expect(octaveShift(Array.from({ length: 20 }, () => 60), CROTALES, 12)).toBe(36);
});

test('a note folds to the nearest octave inside', () => {
    expect(foldIntoRange(70, CROTALES)).toBe(94);
    expect(foldIntoRange(120, CROTALES)).toBe(108);
    expect(foldIntoRange(90, CROTALES)).toBe(90);
    expect(foldIntoRange(84, CROTALES)).toBe(84);
});

test('every note of a phrase moves by the same interval, so the line keeps its shape', () => {
    const roles = { lead: CROTALES }, plan = planRegisterShift(0, roles, null, { lead: [67, 91] }), line = [76, 79, 83, 79, 77];
    const events = line.map((midi, beat) => note('lead', midi, beat));
    applyRegisterShift(events, plan, roles);
    const moved = [...events].sort((a, b) => a.beat - b.beat).map((e) => e.midi);
    expect(moved.map((midi, i) => midi - line[i])).toEqual(line.map(() => plan.shifts.lead));
    moved.forEach((midi) => { expect(midi).toBeGreaterThanOrEqual(84); expect(midi).toBeLessThanOrEqual(108); });
});

test('other roles are left exactly as they were', () => {
    const roles = { lead: CROTALES }, events = [note('lead', 72), note('pad', 60), note('bass', 36), { role: 'perc', midi: 0, beat: 0 }], before = structuredClone(events.slice(1));
    applyRegisterShift(events, planRegisterShift(0, roles, null, { lead: [67, 91] }), roles);
    expect(events.slice(1)).toEqual(before);
});

test('the next phrase goes by what the last one really played', () => {
    const roles = { lead: CROTALES };
    let plan = planRegisterShift(0, roles, null, { lead: [84, 96] });
    expect(plan.shifts.lead).toBe(0);
    plan = applyRegisterShift([note('lead', 60), note('lead', 62, 1), note('lead', 64, 2)], plan, roles);
    expect([...plan.heard.lead].sort()).toEqual([60, 62, 64]);
    const next = planRegisterShift(8, roles, plan, { lead: [84, 96] });
    expect(next.start).toBe(8);
    expect(next.shifts.lead).toBe(36);
    expect(next.heard).toEqual({});
});

test('adding a bar leaves the plan it came from alone, since a re-plan may start from it', () => {
    const roles = { lead: CROTALES }, plan = planRegisterShift(0, roles, null, { lead: [84, 96] }), kept = structuredClone(plan);
    applyRegisterShift([note('lead', 90)], plan, roles);
    expect(plan).toEqual(kept);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
});

test('a chord note that folds onto another of its chord is not played twice, and other beats keep theirs', () => {
    const roles = { pad: [60, 71] }, plan = { start: 0, shifts: { pad: 0 }, heard: {} };
    const events = [note('pad', 60), note('pad', 72), note('pad', 64), note('pad', 60, 1)];
    applyRegisterShift(events, plan, roles);
    expect(events.filter((e) => e.beat === 0).map((e) => e.midi).sort()).toEqual([60, 64]);
    expect(events.filter((e) => e.beat === 1).map((e) => e.midi)).toEqual([60]);
});
