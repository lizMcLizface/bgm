import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import HarmonyLane from './HarmonyLane';

let node, root;
beforeEach(() => { node = document.createElement('div'); document.body.append(node); root = createRoot(node); globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { act(() => root.unmount()); node.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });

const C = { name: 'Cmaj7', numeral: 'I' }, G = { name: 'G7', numeral: 'V7' };
const generator = (position) => ({
    beatsPerBar: 4, position: () => position, onPlanChange: () => () => {},
    getPlan: () => [0, 1, 2, 3].map((bar) => ({ bar, chord: bar < 3 ? C : G, chordStart: bar === 0 || bar === 3, seqPlayed: { chosen: bar % 2, fill: false } })),
});

test('shows the planned chords with their bar count and stage', async () => {
    await act(async () => root.render(<HarmonyLane generator={generator(5)} running={false} />));
    const chords = [...node.querySelectorAll('.seq-chord')];
    expect(chords.map((c) => c.textContent)).toEqual([expect.stringContaining('Cmaj7'), expect.stringContaining('G7')]);
    expect(chords[0].textContent).toContain('2/3');
    expect(chords[0].classList.contains('now')).toBe(true);
    expect(node.querySelectorAll('.seq-harmony-beats span').length).toBe(32);
});

test('renders nothing without a generator', async () => {
    await act(async () => root.render(<HarmonyLane generator={null} />));
    expect(node.querySelector('.seq-harmony')).toBeNull();
});
