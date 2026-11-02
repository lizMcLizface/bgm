import { rowsFor } from './table';
import { instrumentsToCheck, TO_CHECK_MARK } from './toCheck';

const store = { presets: {} };
const scene = (name, voices, layerVoices) => ({ name, category: 'cozy', voices, layerVoices, settings: {} });
const older = scene('Older', { lead: 'Measured Flute', pad: 'Soft Pad' }), layered = scene('Layered', { pad: 'Soft Pad' }, { rhythm: 'Measured Clarinet' }), full = scene('Full', { lead: { name: 'Measured Trumpet', synth: {} } });
const fresh = scene('Fresh', { lead: 'Iowa Flute', pad: 'Soft Pad' }), scenes = [older, layered, full, fresh];

test('the older Measured voices are found in any role, in layer voices and when carried whole, and the new ones are not', () => {
    expect(instrumentsToCheck(older)).toEqual(['Measured Flute']);
    expect(instrumentsToCheck(layered)).toEqual(['Measured Clarinet']);
    expect(instrumentsToCheck(full)).toEqual(['Measured Trumpet']);
    expect(instrumentsToCheck(fresh)).toEqual([]);
    expect(instrumentsToCheck(scene('Twice', { lead: 'Measured Flute', counter: 'Measured Flute' }))).toEqual(['Measured Flute']);
});

test('the presetter can show only those presets, or find them by the mark or the instrument', () => {
    expect(rowsFor(scenes, store, { toCheck: true }).map((s) => s.name)).toEqual(['Older', 'Layered', 'Full']);
    expect(rowsFor(scenes, store).map((s) => s.name)).toEqual(['Older', 'Layered', 'Full', 'Fresh']);
    expect(rowsFor(scenes, store, { query: TO_CHECK_MARK }).map((s) => s.name)).toEqual(['Older', 'Layered', 'Full']);
    expect(rowsFor(scenes, store, { query: 'measured clarinet' }).map((s) => s.name)).toEqual(['Layered']);
});
