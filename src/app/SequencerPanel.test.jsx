import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SequencerPanel from './SequencerPanel';
import { defaultSequencer } from './sequencer';

let node, root;
beforeEach(() => { node = document.createElement('div'); document.body.append(node); root = createRoot(node); globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => root.unmount()); node.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

const show = async (seq = defaultSequencer()) => {
    const onChange = vi.fn(), onMachine = vi.fn();
    await act(async () => root.render(<SequencerPanel seq={seq} chords={['I', 'V', 'vi', 'IV']} onChange={onChange} onMachine={onMachine} />));
    return { onChange, onMachine };
};
const choose = (select, value) => act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
});

test('choosing a beat turns the sequencer on and loads the machine', async () => {
    const { onChange, onMachine } = await show();
    await choose(node.querySelector('select[aria-label="Beat"]') ?? [...node.querySelectorAll('label')].find((l) => l.textContent.startsWith('Beat')).querySelector('select'), 'warehouse-shift');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ arrangement: 'warehouse-shift', on: true, edits: {}, slots: [] }));
    expect(onMachine).toHaveBeenCalledWith('tr808', 'Room');
});

test('a step toggles into the stage edits and a chord can be given a stage', async () => {
    const { onChange } = await show({ ...defaultSequencer(), on: true, arrangement: 'techno' });
    await act(async () => node.querySelector('[aria-label="Bass drum step 2"]').click());
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ edits: { 1: expect.objectContaining({ bd: 'xx..x...x...x...' }) } }));
    const slots = [...node.querySelectorAll('.seq-slot select')];
    expect(slots).toHaveLength(4);
    await choose(slots[1], '6');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ slots: [-1, 6, -1, -1] }));
});

test('without a beat there is no grid and the toggle is disabled', async () => {
    await show();
    expect(node.querySelector('.seq-grid')).toBeNull();
    expect(node.querySelector('.seq-on input').disabled).toBe(true);
});

test('the drum sound can be changed, and effect moves are added, edited and removed per stage', async () => {
    const seq = { ...defaultSequencer(), on: true, arrangement: 'techno' };
    const { onChange, onMachine } = await show(seq);
    await choose(node.querySelector('select[aria-label="Drum sound"]'), node.querySelector('select[aria-label="Drum sound"]').options[1].value);
    expect(onMachine).toHaveBeenCalledWith('tr808', expect.any(String));
    await choose(node.querySelector('select[aria-label="Add an effect move"]'), 'inserts.phaser');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ moves: { 1: [{ key: 'inserts.phaser', from: 0, to: 1 }] } }));
});

test('stages can last whole sections, listed and added by hand', async () => {
    const { onChange } = await show({ ...defaultSequencer(), on: true, arrangement: 'techno' });
    await choose(node.querySelector('select[aria-label="Each stage lasts"]'), '8');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sectionBars: 8, slots: [] }));
    act(() => root.unmount());
    root = createRoot(node);
    const again = await show({ ...defaultSequencer(), on: true, arrangement: 'techno', sectionBars: 8, slots: [1] });
    expect(node.querySelectorAll('.seq-slot')).toHaveLength(1);
    const add = [...node.querySelectorAll('.seq-sections button')].find((b) => b.textContent === 'Add a section');
    await act(async () => add.click());
    expect(again.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ slots: [1, -1] }));
});
