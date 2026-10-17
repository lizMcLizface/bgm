import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import FluidControls from './FluidControls';
import { FLUID_LOOKS, fluidLook } from './fluidLooks';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const change = (el, value) => act(() => {
    Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, String(value));
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
});
function setup(patch = {}) {
    const updates = vi.fn(), clear = vi.fn();
    const original = { ...FLUID_LOOKS.balanced.options, spread: 40, fullness: 0.45, jetDirection: 'exhaust', motionBalance: 0.5, balanceDrift: 0.15, palette: 'ember', hueShift: 17, circle: true, simResolution: 1024, dyeResolution: 2048, ...patch };
    function Harness() {
        const [options, setOptions] = useState(original);
        return <FluidControls options={options} onOptions={next => { updates(next); setOptions(next); }} onClear={clear} />;
    }
    act(() => root.render(<Harness />));
    return { updates, clear, original };
}
const field = (name) => host.querySelector(`[aria-label="${name}"]`);

test('solver controls are tucked away and slider values are visible', () => {
    setup();
    expect(host.querySelector('.gen-fluid-advanced').open).toBe(false);
    expect(field('Flow look').value).toBe('balanced');
    expect(field('Emitter size').closest('label').querySelector('output').textContent).toBe('0.70×');
    expect(field('Trail lifetime').closest('label').querySelector('output').textContent).toMatch(/s$/);
});

test('choosing a look replaces all dynamics but preserves colour, quality and circle', () => {
    const t = setup({ velocityDiffusion: 0.0002, size: 3 });
    change(field('Flow look'), 'fine');
    const next = t.updates.mock.lastCall[0];
    expect(fluidLook(next)).toBe('fine');
    expect(next).toMatchObject({ palette: 'ember', hueShift: 17, circle: true, simResolution: 1024, dyeResolution: 2048, velocityDiffusion: 0, dyeDiffusion: 0 });
    expect(t.clear).toHaveBeenCalledOnce();
});

test('manual adjustment is marked Custom and lifetime maps to a half-life', () => {
    const t = setup();
    change(field('Trail lifetime'), 4);
    expect(t.updates.mock.lastCall[0].dissipation).toBeCloseTo(Math.LN2 / 4);
    expect(field('Flow look').value).toBe('custom');
    expect(field('Trail lifetime').closest('label').querySelector('output').textContent).toBe('4.0 s');
});

test('quality changes only the grids and preserves the selected look', () => {
    const t = setup();
    change(field('Fluid quality'), 'efficient');
    expect(t.updates.mock.lastCall[0]).toEqual({ ...t.original, simResolution: 256, dyeResolution: 512 });
    expect(field('Flow look').value).toBe('balanced');
    expect(t.clear).not.toHaveBeenCalled();
});

test('clearing the flow leaves all settings alone', () => {
    const t = setup();
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Clear flow').click());
    expect(t.clear).toHaveBeenCalledOnce();
    expect(t.updates).not.toHaveBeenCalled();
});

test('fullness is independent of motion and is preserved when choosing a look', () => {
    const t = setup();
    change(field('Fullness'), 0.8);
    let next = t.updates.mock.lastCall[0];
    expect(next.fullness).toBe(0.8);
    expect(next.energyCap).toBe(t.original.energyCap);
    expect(next.vorticity).toBe(t.original.vorticity);
    expect(next.velocityDissipation).toBe(t.original.velocityDissipation);
    expect(field('Fullness').closest('label').querySelector('output').textContent).toBe('80%');
    expect(field('Flow look').value).toBe('balanced');
    change(field('Flow look'), 'soft');
    expect(t.updates.mock.lastCall[0].fullness).toBe(0.8);
});

test('jet and shared motion controls update and survive flow look changes', () => {
    const t = setup();
    change(field('Jet direction'), 'forward');
    change(field('Motion to source'), 0.8);
    change(field('Balance drift'), 0.4);
    expect(t.updates.mock.lastCall[0]).toMatchObject({ jetDirection: 'forward', motionBalance: 0.8, balanceDrift: 0.4 });
    change(field('Flow look'), 'fine');
    expect(t.updates.mock.lastCall[0]).toMatchObject({ jetDirection: 'forward', motionBalance: 0.8, balanceDrift: 0.4 });
});

test('fluid dice changes dynamics within limits and preserves display choices', () => {
    const t = setup();
    act(() => field('Random fluid settings').click());
    const next = t.updates.mock.lastCall[0];
    expect(next).toMatchObject({ palette: 'ember', hueShift: 17, circle: true, simResolution: 1024, dyeResolution: 2048 });
    expect(next).not.toEqual(t.original);
    expect(t.clear).toHaveBeenCalledOnce();
});
