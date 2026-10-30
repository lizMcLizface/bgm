import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import IntensityFader from './IntensityFader';
import { defaultPush } from './composition/push';

async function render(props) {
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    await act(async () => root.render(<IntensityFader {...props} />));
    return { node, done: () => { act(() => root.unmount()); node.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT; } };
}
const lengths = (node) => ['.up', '.down'].map((k) => node.querySelector(`.gen-intensity-meter ${k}`).style.width);

test('the lit line grows from the middle: red to the right with positive intensity, blue to the left with negative, none at 0', async () => {
    const hot = await render({ push: { ...defaultPush(), level: 1 }, now: 1, onChange: () => {} });
    expect(lengths(hot.node)).toEqual(['50%', '0%']);
    expect(hot.node.querySelector('output').textContent).toBe('+100');
    hot.done();
    // moved to -100 and ramping: now at -50 the line has crossed the middle and is blue, a quarter of the track long
    const cooling = await render({ push: { ...defaultPush(), level: -1 }, now: -0.5, onChange: () => {} });
    expect(lengths(cooling.node)).toEqual(['0%', '25%']);
    expect(cooling.node.querySelector('output').textContent).toBe('-50');
    cooling.done();
    const level = await render({ push: defaultPush(), now: 0, onChange: () => {} });
    expect(lengths(level.node)).toEqual(['0%', '0%']);
    expect(level.node.querySelector('output').textContent).toBe('0');
    level.done();
});

test('the cap commits the new level a moment after it moves, snaps to the middle, and double-click goes back to as made', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn(), push = { ...defaultPush(), level: 0.6 };
    const { node, done } = await render({ push, now: 0.6, onChange });
    const input = node.querySelector('input');
    expect(input.value).toBe('0.6');
    const set = (v) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, String(v)); input.dispatchEvent(new Event('input', { bubbles: true })); };
    await act(async () => set(-0.3));
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(onChange).toHaveBeenLastCalledWith({ ...push, level: -0.3 });
    await act(async () => set(0.03));
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(onChange).toHaveBeenLastCalledWith({ ...push, level: 0 });
    await act(async () => { input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(onChange).toHaveBeenLastCalledWith({ ...push, level: 0 });
    done();
    vi.useRealTimers();
});

test('a program sets the intensity: the fader is disabled and still shows the level playing', async () => {
    const push = { ...defaultPush(), program: { ...defaultPush().program, mode: 'intervals' } };
    const { node, done } = await render({ push, now: 0.7, onChange: () => {} });
    expect(node.querySelector('input').disabled).toBe(true);
    expect(lengths(node)[0]).toBe('35%');
    done();
});
