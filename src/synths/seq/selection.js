// A selection of steps on the grid: a set of "track:step" keys. A pad is one step, a row is every step of a track, a column is every
// track at one step. Edits apply to the whole selection; a property shows its value when the selection agrees, "mixed" when it does not.

export const stepKey = (t, s) => t + ':' + s;
export const parseKey = (key) => key.split(':').map(Number);
export const rowKeys = (t, steps = 16) => Array.from({ length: steps }, (_, s) => stepKey(t, s));
export const columnKeys = (s, tracks) => Array.from({ length: tracks }, (_, t) => stepKey(t, s));

/** A selection after a tap: replaced by `keys`, or with `additive` (Shift) the keys toggled in or out as a group. */
export function chooseKeys(selection, keys, additive = false) {
    if (!additive) return new Set(keys);
    const next = new Set(selection);
    if (keys.every((k) => next.has(k))) keys.forEach((k) => next.delete(k));
    else keys.forEach((k) => next.add(k));
    return next;
}

/** What a selection is, for the display: { kind: 'none' | 'step' | 'row' | 'column' | 'columns' | 'rows' | 'many', t?, s?, count }. */
export function describeSelection(selection, tracks, steps = 16) {
    const list = [...selection].map(parseKey), count = list.length;
    if (!count) return { kind: 'none', count };
    if (count === 1) return { kind: 'step', t: list[0][0], s: list[0][1], count };
    if (count === steps && list.every(([t]) => t === list[0][0])) return { kind: 'row', t: list[0][0], count };
    if (count === tracks && list.every(([, s]) => s === list[0][1])) return { kind: 'column', s: list[0][1], count };
    // several whole columns, or several whole rows
    const perColumn = new Map(), perRow = new Map();
    for (const [t, c] of list) { perColumn.set(c, (perColumn.get(c) ?? 0) + 1); perRow.set(t, (perRow.get(t) ?? 0) + 1); }
    if ([...perColumn.values()].every((k) => k === tracks)) return { kind: 'columns', count: perColumn.size };
    if ([...perRow.values()].every((k) => k === steps)) return { kind: 'rows', count: perRow.size };
    return { kind: 'many', count };
}

/** The value all `values` share, or { value: first, mixed: true } when they differ; an empty list gives the fallback. */
export function commonValue(values, fallback) {
    if (!values.length) return { value: fallback, mixed: false };
    const first = values[0];
    return { value: first, mixed: values.some((v) => v !== first) };
}
