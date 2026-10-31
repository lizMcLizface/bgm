import { loadStore, saveStore, update, saveChange, dump, mergeDump, entryOf, emptyStore, STORE_KEY } from './store';
import { rowsFor, ago, neighbour } from './table';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const change = { settings: { bpm: 100 }, voices: { lead: 'Soft Flute' } };

test('a store survives being saved and loaded, and anything unreadable loads as empty', () => {
    const storage = memory();
    const store = saveChange(update(emptyStore(), 'A', { status: 'tweak', note: 'rhythm too high' }), 'A', change, 1000);
    expect(saveStore(store, storage)).toBe(true);
    expect(loadStore(storage)).toEqual(store);
    storage.setItem(STORE_KEY, '{not json');
    expect(loadStore(storage)).toEqual(emptyStore());
    expect(loadStore({ getItem() { throw new Error('blocked'); } })).toEqual(emptyStore());
    expect(saveStore(store, { setItem() { throw new Error('full'); } })).toBe(false);
});

test('an entry with nothing in it is dropped, and a bad status or note is cleaned', () => {
    const s = update(emptyStore(), 'A', { status: 'nonsense', note: 5, change: {}, changedAt: 'x' });
    expect(s.presets).toEqual({});
    expect(entryOf(emptyStore(), 'A')).toEqual({ status: '', note: '', change: null, changedAt: null, heardAt: null });
    expect(update(emptyStore(), 'A', { heardAt: 5 }).presets.A.heardAt).toBe(5);
});

test('saving an empty change clears the one before', () => {
    const s = saveChange(emptyStore(), 'A', change, 10);
    expect(s.presets.A).toMatchObject({ change, changedAt: 10 });
    expect(saveChange(s, 'A', {}, 20).presets.A).toBeUndefined();
});

test('the dump holds only what has something to say, in the order given, and reads back', () => {
    let s = saveChange(emptyStore(), 'B', change, Date.parse('2026-11-01T10:00:00Z'));
    s = update(s, 'A', { status: 'ok' });
    s = update(s, 'C', { heardAt: 3 });
    const file = dump(s, ['A', 'B', 'C', 'D'], new Date('2026-11-02T00:00:00Z'));
    expect(Object.keys(file.presets)).toEqual(['A', 'B']);
    expect(file.presets.B).toEqual({ changedAt: '2026-11-01T10:00:00.000Z', change });
    expect(file.presets.A).toEqual({ status: 'ok' });
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);
    const back = mergeDump(emptyStore(), JSON.parse(JSON.stringify(file)));
    expect(back.presets.B).toMatchObject({ change, changedAt: Date.parse('2026-11-01T10:00:00Z') });
    expect(() => mergeDump(emptyStore(), { format: 'other', presets: {} })).toThrow();
});

test('importing keeps a change made here later than the file has, but takes its verdict and note if there are none here', () => {
    const mine = saveChange(emptyStore(), 'A', { settings: { bpm: 1 } }, 5000);
    const file = { format: 'bgm-presetter', presets: { A: { status: 'redo', note: 'x', changedAt: new Date(1000).toISOString(), change: { settings: { bpm: 2 } } } } };
    const merged = mergeDump(mine, file);
    expect(merged.presets.A.change).toEqual({ settings: { bpm: 1 } });
    expect(merged.presets.A).toMatchObject({ status: 'redo', note: 'x' });
});

describe('the table', () => {
    const scenes = [{ name: 'Rainy café', category: 'cozy', blurb: 'felt piano' }, { name: 'Deep night', category: 'night', blurb: '' }, { name: 'Zero Fun Zone', category: 'classics', blurb: 'arp' }];
    const store = update(saveChange(update(emptyStore(), 'Deep night', { status: 'ok' }), 'Zero Fun Zone', change, 10_000), 'Zero Fun Zone', { note: 'too high' });
    const names = (filter) => rowsFor(scenes, store, { now: 20_000, ...filter }).map((s) => s.name);

    test('filters by words in the name, blurb or note, category, verdict and change', () => {
        expect(names({})).toHaveLength(3);
        expect(names({ query: 'felt' })).toEqual(['Rainy café']);
        expect(names({ query: 'TOO HIGH' })).toEqual(['Zero Fun Zone']);
        expect(names({ category: 'night' })).toEqual(['Deep night']);
        expect(names({ status: 'ok' })).toEqual(['Deep night']);
        expect(names({ status: 'unjudged' })).toEqual(['Rainy café', 'Zero Fun Zone']);
        expect(names({ changed: 'yes' })).toEqual(['Zero Fun Zone']);
        expect(names({ changed: 'recent' })).toEqual(['Zero Fun Zone']);
        expect(rowsFor(scenes, store, { changed: 'recent', now: 10_000 + 25 * 3600 * 1000 })).toEqual([]);
    });

    test('says how long ago, and steps to the next and previous row, wrapping', () => {
        expect([ago(null), ago(1000, 1000), ago(1, 1 + 5 * 60 * 1000), ago(1, 1 + 3 * 3600 * 1000), ago(1, 1 + 30 * 3600 * 1000), ago(1, 1 + 5 * 86400 * 1000)]).toEqual(['', 'just now', '5 min ago', '3 h ago', 'yesterday', '5 d ago']);
        expect(neighbour(scenes, 'Rainy café').name).toBe('Deep night');
        expect(neighbour(scenes, 'Zero Fun Zone').name).toBe('Rainy café');
        expect(neighbour(scenes, 'Rainy café', -1).name).toBe('Zero Fun Zone');
        expect(neighbour(scenes, 'nothing').name).toBe('Rainy café');
        expect(neighbour([], 'x')).toBeNull();
    });
});
