import { percussionRows } from './percussionRows';

const hit = (midi, beat, velocity = 0.8) => ({ role: 'perc', midi, beat, length: 0.25, velocity });

test('drums become rows of sixteenth steps, in kit order', () => {
    const { rows, exact, hits } = percussionRows({ events: [hit(4, 0.5), hit(0, 0), hit(0, 2), { role: 'lead', midi: 60, beat: 0, velocity: 1 }] }, 4);
    expect(rows.map((r) => r.drum)).toEqual(['kick', 'hat']);
    expect(rows[0].cells.map((v, i) => (v ? i : null)).filter((i) => i !== null)).toEqual([0, 8]);
    expect(rows[1].cells[2]).toBeGreaterThan(0);
    expect(exact).toBe(true);
    expect(hits).toBe(3);
});

test('hits between steps are flagged and silent or unknown drums are skipped', () => {
    const { rows, exact } = percussionRows({ events: [hit(0, 0.13), hit(0, 1, 0), hit(99, 1)] }, 4);
    expect(rows).toHaveLength(1);
    expect(exact).toBe(false);
});

test('no plan means no rows', () => {
    expect(percussionRows(undefined, 4).rows).toEqual([]);
});
