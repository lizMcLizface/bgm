// The listener's notes on the presets (/tools/presetter/): per preset a verdict, a note, and what was changed (changes.js), kept in this
// browser's local storage and dumped to a file to be baked into the library (tools/applyPresetChanges.mjs). Pure but for load / save,
// which take the storage so a test can pass its own.
import { isEmptyChange } from './changes';

export const STORE_KEY = 'bgm-presetter-v1';
export const DUMP_FORMAT = 'bgm-presetter';
export const STATUSES = { '': 'Not judged', ok: 'Fine', tweak: 'Needs a tweak', redo: 'Needs redoing' };
export const emptyStore = () => ({ version: 1, presets: {} });
const emptyEntry = () => ({ status: '', note: '', change: null, changedAt: null, heardAt: null });
const clean = (entry) => ({
    status: Object.hasOwn(STATUSES, entry?.status) ? entry.status : '',
    note: typeof entry?.note === 'string' ? entry.note.slice(0, 2000) : '',
    change: entry?.change && typeof entry.change === 'object' && !isEmptyChange(entry.change) ? entry.change : null,
    changedAt: Number.isFinite(entry?.changedAt) ? entry.changedAt : null,
    heardAt: Number.isFinite(entry?.heardAt) ? entry.heardAt : null,
});

export function loadStore(storage = globalThis.localStorage) {
    try {
        const raw = JSON.parse(storage.getItem(STORE_KEY));
        if (!raw || typeof raw.presets !== 'object') return emptyStore();
        return { version: 1, presets: Object.fromEntries(Object.entries(raw.presets).map(([name, entry]) => [name, clean(entry)])) };
    } catch { return emptyStore(); }
}

export function saveStore(store, storage = globalThis.localStorage) {
    try { storage.setItem(STORE_KEY, JSON.stringify(store)); return true; } catch { return false; }
}

export const entryOf = (store, name) => store.presets[name] ?? emptyEntry();

/** The store with `patch` laid over a preset's entry (an entry with nothing in it is dropped). */
export function update(store, name, patch) {
    const entry = clean({ ...entryOf(store, name), ...patch });
    const presets = { ...store.presets, [name]: entry };
    if (!entry.status && !entry.note && !entry.change && !entry.heardAt) delete presets[name];
    return { ...store, presets };
}

/** Records a change found on the page now: nothing in it clears the earlier one. */
export const saveChange = (store, name, change, now = Date.now()) => (isEmptyChange(change)
    ? update(store, name, { change: null, changedAt: null })
    : update(store, name, { change, changedAt: now }));

/** The file: only presets with something to say, in the order they are listed. */
export function dump(store, order = Object.keys(store.presets), now = new Date()) {
    const presets = {};
    for (const name of order) {
        const e = store.presets[name];
        if (e && (e.change || e.status || e.note)) {
            presets[name] = { status: e.status || undefined, note: e.note || undefined, changedAt: e.changedAt ? new Date(e.changedAt).toISOString() : undefined, change: e.change ?? undefined };
        }
    }
    return { format: DUMP_FORMAT, version: 1, created: now.toISOString(), presets };
}

/** A dumped file read back into a store: what is in the file wins over what is here, unless this was changed later. */
export function mergeDump(store, file) {
    if (file?.format !== DUMP_FORMAT || typeof file.presets !== 'object') throw new Error('Not a presetter file');
    let out = store;
    for (const [name, e] of Object.entries(file.presets)) {
        const incoming = clean({ ...e, changedAt: e.changedAt ? Date.parse(e.changedAt) : null }), mine = store.presets[name];
        if (mine?.changedAt && incoming.changedAt && mine.changedAt > incoming.changedAt) {
            out = update(out, name, { status: incoming.status || mine.status, note: incoming.note || mine.note });
            continue;
        }
        out = update(out, name, { ...incoming, heardAt: mine?.heardAt ?? null });
    }
    return out;
}
