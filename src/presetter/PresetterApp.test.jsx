import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PresetterApp from './PresetterApp';
import { SCENES } from '../app/scenes';
import { STORE_KEY } from './store';
import { pageAfterLoading } from './testSupport';
import { findPreset } from '../app/editor/presetStore';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAME = 'Oxygene Sunrise';
const shipped = SCENES.find((s) => s.name === NAME);

describe('the preset tool', () => {
    let host, root, page, loaded, blobs;
    const row = (name) => [...host.querySelectorAll('.ps-row')].find((r) => r.querySelector('.ps-name').textContent === name);
    const press = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent === label);
    const change = (el, value) => act(() => {
        const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
        set.call(el, value);
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });

    beforeEach(async () => {
        localStorage.clear();
        blobs = [];
        globalThis.URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:x'; };
        globalThis.URL.revokeObjectURL = () => {};
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => root.render(<PresetterApp />));
        // the page in the frame, as its dev hook shows it
        loaded = null;
        page = pageAfterLoading(shipped);
        host.querySelector('iframe').contentWindow.__bgm = { applyScene: vi.fn(async (scene) => { loaded = scene; }), capture: () => page, loadedName: () => loaded?.name ?? '' };
        await act(async () => { await sleep(600); });
    });
    afterEach(() => { act(() => root.unmount()); host.remove(); });

    test('lists the presets beside the frame, and opens one in the page when it is clicked', async () => {
        expect(host.querySelector('iframe').getAttribute('src')).toBe('/');
        expect(host.querySelectorAll('.ps-row').length).toBeGreaterThan(100);
        await act(async () => { row(NAME).click(); });
        expect(loaded.name).toBe(NAME);
        expect(row(NAME).classList.contains('is-selected')).toBe(true);
        expect(host.querySelector('.ps-now strong').textContent).toBe(NAME);
        expect(JSON.parse(localStorage.getItem(STORE_KEY)).presets[NAME].heardAt).toBeGreaterThan(0);
    });

    test('keeps what was changed on the page, shows it, and opens the preset with it next time', async () => {
        await act(async () => { row(NAME).click(); });
        await act(async () => { press('Keep my changes').click(); });
        expect(host.querySelector('.ps-message').textContent).toMatch(/nothing kept/);
        page.settings.bpm += 9;
        page.voices.lead = { name: 'Soft Flute', synth: findPreset('Soft Flute') };
        await act(async () => { press('Keep my changes').click(); });
        expect(host.querySelector('.ps-message').textContent).toMatch(/Kept 2 changes/);
        expect(row(NAME).textContent).toMatch(/1 setting, 1 voice/);
        const kept = JSON.parse(localStorage.getItem(STORE_KEY)).presets[NAME];
        expect(kept.change).toEqual({ settings: { bpm: shipped.settings.bpm + 9 }, voices: { lead: 'Soft Flute' } });
        expect(row(NAME).classList.contains('has-change')).toBe(true);

        await act(async () => { row(NAME).click(); });
        expect(loaded.settings.bpm).toBe(shipped.settings.bpm + 9);
        expect(loaded.voices.lead).toBe('Soft Flute');
        await act(async () => { press('Reload original').click(); });
        expect(loaded.settings.bpm).toBe(shipped.settings.bpm);
        await act(async () => { press('Drop mine').click(); });
        expect(JSON.parse(localStorage.getItem(STORE_KEY)).presets[NAME].change).toBeNull();
    });

    test('a verdict and a note are kept per preset, and filter the list', async () => {
        change(host.querySelector(`[aria-label="Verdict for ${NAME}"]`), 'tweak');
        change(host.querySelector(`[aria-label="Note for ${NAME}"]`), 'rhythm too high');
        expect(JSON.parse(localStorage.getItem(STORE_KEY)).presets[NAME]).toMatchObject({ status: 'tweak', note: 'rhythm too high' });
        change(host.querySelector('[aria-label="Verdict"]'), 'tweak');
        expect([...host.querySelectorAll('.ps-row')].map((r) => r.querySelector('.ps-name').textContent)).toEqual([NAME]);
        change(host.querySelector('[aria-label="Verdict"]'), '');
        change(host.querySelector('[aria-label="Find"]'), 'oxygene');
        expect(host.querySelectorAll('.ps-row').length).toBe(1);
    });

    test('dumps the verdicts and changes to a file', async () => {
        await act(async () => { row(NAME).click(); });
        page.settings.layers = 'split';
        await act(async () => { press('Keep my changes').click(); });
        change(host.querySelector(`[aria-label="Verdict for ${NAME}"]`), 'ok');
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        await act(async () => { press('Dump to file').click(); });
        expect(click).toHaveBeenCalled();
        const text = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsText(blobs[0]); });
        const file = JSON.parse(text);
        expect(file.format).toBe('bgm-presetter');
        expect(Object.keys(file.presets)).toEqual([NAME]);
        expect(file.presets[NAME]).toMatchObject({ status: 'ok', change: { settings: { layers: 'split' } } });
        click.mockRestore();
    });
});
