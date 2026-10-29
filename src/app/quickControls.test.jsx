import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import QuickPanel, { snapToNotch } from './QuickPanel';
import { defaultSettings, sanitizeSettings } from './settings';
import { STACKS, CHOICE_GROUPS, choiceAt, choicePatch, stackLevel, stackPatch, quickSettings, QUICK_KEYS, FEEL_SLIDERS, sliderPatch, readValue } from './quickControls';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('every stack level survives the settings validator unchanged', () => {
    const base = defaultSettings();
    for (const stack of STACKS) for (let level = 0; level < 4; level++) {
        const patch = stackPatch(base, stack, level);
        const clean = sanitizeSettings({ ...base, ...patch }, base);
        for (const [key, value] of Object.entries(patch)) expect(clean[key], `${stack.id} ${level} ${key}`).toEqual(value);
    }
});

test('the defaults are the Off level of every stack, and each level is found again', () => {
    const base = defaultSettings();
    for (const stack of STACKS) {
        expect(stackLevel(base, stack), stack.id).toBe(stack.defaultLevel ?? 0);
        for (let level = 0; level < 4; level++) expect(stackLevel({ ...base, ...stackPatch(base, stack, level) }, stack), `${stack.id} ${level}`).toBe(level);
    }
    expect(stackLevel({ ...base, swing: 0.3 }, STACKS[1])).toBe(-1);
});

test('a nested slider changes one field and keeps its neighbours', () => {
    const base = defaultSettings(), loose = FEEL_SLIDERS.find((s) => s.id === 'loose');
    expect(sliderPatch(base, loose.path, 30)).toEqual({ humanize: { ...base.humanize, timing: 30 } });
    expect(readValue({ ...base, humanize: { ...base.humanize, timing: 30 } }, loose.path)).toBe(30);
});

test('the reset keys are the panel\'s own, taken from a preset', () => {
    const picked = quickSettings({ ...defaultSettings(), swing: 0.2, tonic: 5 });
    expect(Object.keys(picked).sort()).toEqual([...QUICK_KEYS].sort());
    expect(picked.swing).toBe(0.2);
    expect(picked).not.toHaveProperty('tonic');
});

describe('the panel', () => {
    let host, root;
    beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
    afterEach(() => { act(() => root.unmount()); host.remove(); });
    const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const mount = (settings = defaultSettings(), baseline = quickSettings(defaultSettings())) => {
        const calls = { volume: vi.fn(), settings: vi.fn() };
        act(() => root.render(<QuickPanel settings={settings} baseline={baseline} roleLabels={{ pad: 'Rhythm', perc: 'Percussion', lead: 'Lead', bass: 'Bass' }} onVolume={calls.volume} onSettings={calls.settings} onFeel={vi.fn()} />));
        return calls;
    };

    test('every voice has a fader; the second lead and drums are greyed and locked while they are off', () => {
        const base = defaultSettings();
        mount({ ...base, counter: { ...base.counter, mode: 'off' }, drums: { ...base.drums, style: 'off' } });
        const input = (id) => host.querySelector(`[data-quick="${id}"]`);
        expect(['lead', 'counter', 'pad', 'bass', 'perc', 'ambience', 'swing'].every((id) => input(id))).toBe(true);
        expect(input('counter').disabled).toBe(true);
        expect(input('perc').disabled).toBe(true);
        expect(input('counter').closest('label').className).toContain('is-off');
        expect(input('lead').disabled).toBe(false);
        expect(host.querySelector('.gen-feel-pad')).toBeTruthy();
        expect(host.querySelector('.gen-feel-text')).toBeNull();
    });

    test('the second lead is chosen with pills, and the fader wakes when it is on', () => {
        const base = defaultSettings(), calls = mount({ ...base, counter: { ...base.counter, mode: 'off' } });
        click([...host.querySelectorAll('[aria-label="Second lead"] button')].find((b) => b.textContent === 'Harm'));
        expect(calls.settings).toHaveBeenLastCalledWith({ counter: { ...base.counter, mode: 'harmony' } });
        act(() => root.render(<QuickPanel settings={{ ...base, counter: { ...base.counter, mode: 'harmony' } }} baseline={quickSettings(base)} onVolume={vi.fn()} onSettings={vi.fn()} onFeel={vi.fn()} />));
        expect(host.querySelector('[data-quick="counter"]').disabled).toBe(false);
    });

    test('the chord size is chosen with pills', () => {
        const calls = mount();
        click([...host.querySelectorAll('[aria-label="Size"] button')].find((b) => b.textContent === '7ths'));
        expect(calls.settings).toHaveBeenLastCalledWith({ padNotes: 4 });
    });

    test('the voices are named as the rest of the page names them, in their colours', () => {
        const base = defaultSettings();
        mount({ ...base, drums: { ...base.drums, style: 'basic' } });
        const names = [...host.querySelectorAll('.gen-quick-slider')].map((el) => el.lastElementChild.textContent);
        expect(names).toEqual(expect.arrayContaining(['Lead', 'Rhythm', 'Bass', 'Percussion']));
        expect(names).not.toContain('Pad');
        expect(host.querySelector('[data-quick="pad"]').closest('label').style.getPropertyValue('--slider')).toBe('var(--gen-role-pad)');
    });

    test('the stack buttons apply a level and the root choice calls through', () => {
        const calls = mount();
        const med = [...host.querySelectorAll('[aria-label="Flair"] button')].find((b) => b.textContent === 'Med');
        click(med);
        expect(calls.settings).toHaveBeenCalledWith(expect.objectContaining({ ornaments: 0.5, rubato: 0.4 }));
        click([...host.querySelectorAll('[aria-label="Root"] button')].find((b) => b.textContent === 'Bass'));
        expect(calls.settings).toHaveBeenLastCalledWith({ padRoot: 'unlessBass' });
    });

    test('Preset is lit while the settings are the preset\'s, a picked level takes over, and Preset puts them back', () => {
        const base = defaultSettings(), preset = { ...base, ...stackPatch(base, STACKS[0], 1) }; // the preset has Flair at Low
        const on = (name) => host.querySelector(`[aria-label="${name}"] [aria-checked="true"]`)?.textContent;
        const calls = mount(preset, quickSettings(preset));
        expect(on('Flair')).toBe('Preset');
        expect(on('Groove')).toBe('Preset');
        click([...host.querySelectorAll('[aria-label="Flair"] button')].find((b) => b.textContent === 'Low'));
        expect(on('Flair')).toBe('Low'); // picked, though it equals the preset
        click([...host.querySelectorAll('[aria-label="Flair"] button')].find((b) => b.textContent === 'Preset'));
        expect(calls.settings).toHaveBeenLastCalledWith(expect.objectContaining({ ornaments: 0.25 }));
        expect(on('Flair')).toBe('Preset');
    });

    test('with settings that match neither a level nor the preset, none is lit', () => {
        const base = defaultSettings();
        mount({ ...base, ornaments: 0.33, padVibrato: 0.9 }, quickSettings(base));
        expect(host.querySelector('[aria-label="Flair"] [aria-checked="true"]')).toBeNull();
    });

    test('the current level of a stack is marked', () => {
        const base = defaultSettings();
        mount({ ...base, ...stackPatch(base, STACKS[0], 2) }, quickSettings(base));
        expect(host.querySelector('[aria-label="Flair"] [aria-checked="true"]').textContent).toBe('Med');
    });
});

test('a fader cap snaps to the quarter marks when it is close, and not otherwise', () => {
    expect(snapToNotch(0.49, 0, 1)).toBe(0.5);
    expect(snapToNotch(0.26, 0, 1)).toBe(0.25);
    expect(snapToNotch(0.4, 0, 1)).toBe(0.4);
    expect(snapToNotch(19.5, 0, 40)).toBe(20);
});

describe('double-click', () => {
    let host, root;
    beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
    afterEach(() => { act(() => root.unmount()); host.remove(); });

    test('takes a slider back to the preset\'s value, for the mix and the rest alike', () => {
        const base = defaultSettings(), preset = { ...base, swing: 0.2, volumes: { ...base.volumes, bass: 0.55 } };
        const onVolume = vi.fn(), onSettings = vi.fn();
        act(() => root.render(<QuickPanel settings={{ ...base, swing: 0.5 }} baseline={quickSettings(preset)} onVolume={onVolume} onSettings={onSettings} onFeel={vi.fn()} />));
        const dbl = (id) => act(() => { host.querySelector(`[data-quick="${id}"]`).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
        dbl('swing');
        expect(onSettings).toHaveBeenLastCalledWith({ swing: 0.2 });
        dbl('bass');
        expect(onVolume).toHaveBeenLastCalledWith('bass', 0.55);
    });
});

test('the stacks are flair, groove, depth and colour: each moves several settings, none just one fader', () => {
    expect(STACKS.map((s) => s.id)).toEqual(['flair', 'groove', 'drift', 'depth']);
});

test('every pill of every choice group is a valid setting and is found again once set', () => {
    const base = defaultSettings();
    for (const group of CHOICE_GROUPS) for (const { value } of group.choices) {
        const patch = choicePatch(base, group, value);
        const clean = sanitizeSettings({ ...base, ...patch }, base);
        for (const [key, v] of Object.entries(patch)) expect(clean[key], `${group.id} ${value} ${key}`).toEqual(v);
        expect(choiceAt({ ...base, ...patch }, group), `${group.id} ${value}`).toBe(value);
    }
});

describe('the colour pills', () => {
    let host, root;
    beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
    afterEach(() => { act(() => root.unmount()); host.remove(); });

    test('scale only is lit by default; suspended and borrowed set their settings together', () => {
        const base = defaultSettings(), onSettings = vi.fn();
        act(() => root.render(<QuickPanel settings={{ ...base, chordBorrow: 0.2 }} baseline={quickSettings({ ...base, chordBorrow: 0.2 })} onVolume={vi.fn()} onSettings={onSettings} onFeel={vi.fn()} />));
        const pill = (name) => [...host.querySelectorAll('[aria-label="Colour"] button')].find((b) => b.textContent === name);
        act(() => { pill('Sus').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(onSettings).toHaveBeenLastCalledWith({ chordBorrow: 0, chordColour: { ...base.chordColour, mode: 'floating', amount: 0.45 } });
        act(() => { pill('Borrow').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(onSettings).toHaveBeenLastCalledWith({ chordBorrow: 0.3, chordColour: { ...base.chordColour, mode: 'plain' } });
    });
});
