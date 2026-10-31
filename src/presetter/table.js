// The presetter's table: which presets are shown, and in what order.
import { searchText } from './judgements';

export const RECENT_HOURS = 24;
export const SORTS = { '': 'Library order', loud: 'Loudest first', quiet: 'Quietest first', range: 'Most dynamic first', busy: 'Busiest first' };
const SORT_KEY = { loud: (j) => -j.lufs, quiet: (j) => j.lufs, range: (j) => -j.range, busy: (j) => -j.onsets };

/**
 * @param {object[]} scenes - { name, category, ... } in library order
 * @param {object} store - store.js
 * @param {object} [filter] - { query, category, status ('' any, 'unjudged', or a status), changed ('' any, 'yes', 'recent'), sort (SORTS),
 *   judgements (judgements.js, by preset name; searched too and what the sorts use), now }
 */
export function rowsFor(scenes, store, { query = '', category = '', status = '', changed = '', sort = '', judgements = {}, now = Date.now() } = {}) {
    const q = query.trim().toLowerCase();
    const shown = scenes.filter((scene) => {
        const e = store.presets[scene.name];
        if (category && scene.category !== category) return false;
        if (q && !`${scene.name} ${scene.blurb ?? ''} ${e?.note ?? ''} ${searchText(judgements[scene.name])}`.toLowerCase().includes(q)) return false;
        if (status === 'unjudged' ? e?.status : status && (e?.status ?? '') !== status) return false;
        if (changed === 'yes' && !e?.change) return false;
        if (changed === 'recent' && !(e?.changedAt && now - e.changedAt <= RECENT_HOURS * 3600 * 1000)) return false;
        return true;
    });
    const key = SORT_KEY[sort];
    if (!key) return shown;
    // presets without a judgement go last; the sort is stable so ties keep the library order
    const by = (scene) => (judgements[scene.name] ? key(judgements[scene.name]) : Infinity);
    return [...shown].sort((a, b) => by(a) - by(b));
}

/** "3 min ago", "2 h ago", "yesterday", "5 d ago": how long since `at`; '' without one. */
export function ago(at, now = Date.now()) {
    if (!at) return '';
    const s = Math.max(0, (now - at) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    const d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : `${d} d ago`;
}

/** The scene after `name` in `rows` (wrapping), or before it with `dir` -1; the first when none is current. */
export function neighbour(rows, name, dir = 1) {
    if (!rows.length) return null;
    const i = rows.findIndex((s) => s.name === name);
    return rows[i < 0 ? 0 : (i + dir + rows.length) % rows.length];
}
