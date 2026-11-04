import { DRUMS } from './percussion';

/**
 * One planned bar's drums as rows of steps, for display (docs/SEQUENCER_DEVICE_PLAN.md): every
 * percussion event in the bar, placed on a grid of `steps` per bar (16 = sixteenths in 4/4). Hits
 * between steps (swing, rubato, flams, ornaments) land on the nearest step; `exact` says whether
 * all of them did. Rows come out in kit order and only for drums that sound.
 * @returns {{ rows: { drum: string, cells: number[] }[], exact: boolean, hits: number }}
 */
export function percussionRows(planned, beatsPerBar, steps = 16) {
    const rows = new Map();
    let exact = true, hits = 0;
    (planned?.events ?? []).forEach((e) => {
        if (e.role !== 'perc' || !(e.velocity > 0)) return;
        const drum = DRUMS[e.midi];
        if (!drum) return;
        const at = (e.beat / beatsPerBar) * steps, step = Math.min(steps - 1, Math.max(0, Math.round(at)));
        if (Math.abs(at - step) > 0.2) exact = false;
        if (!rows.has(drum)) rows.set(drum, Array(steps).fill(0));
        const cells = rows.get(drum);
        cells[step] = Math.max(cells[step], e.velocity);
        hits++;
    });
    return { rows: DRUMS.filter((d) => rows.has(d)).map((drum) => ({ drum, cells: rows.get(drum) })), exact, hits };
}
