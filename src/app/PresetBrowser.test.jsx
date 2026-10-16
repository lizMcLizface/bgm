import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PresetBrowser from './PresetBrowser';
import Tour from './Tour';
import { SCENES, SCENE_CATEGORIES, buildSetup } from './scenes';
import { userScenes, saveUserScene, deleteUserScene, isUserScene } from './setupStore';
import { defaultSettings } from './settings';
import { ROLE_PRESETS } from './presets';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;
beforeEach(() => {
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    window.localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const render = (element) => act(() => root.render(element));
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const type = (el, value) => act(() => {
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
});
const cards = () => [...document.querySelectorAll('.gen-pb-card strong')].map((el) => el.textContent);
const button = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text));

const actions = () => ({
    save: vi.fn(() => 'Saved'),
    copy: vi.fn(() => 'Copied'),
    download: vi.fn(() => 'Downloaded'),
    load: vi.fn(() => ({ ok: true, message: 'Loaded' })),
    remove: vi.fn(),
});

describe('preset browser', () => {
    test('opens as a window with every preset as a card, and the current one marked', () => {
        render(<PresetBrowser current="Mildly Alarmed" onPick={() => {}} actions={actions()} />);
        expect(document.querySelector('.gen-pb')).toBeNull();
        click(document.querySelector('.gen-scene-button'));
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        expect(cards()).toHaveLength(SCENES.length);
        expect(document.querySelector('.gen-pb-card.is-active strong').textContent).toBe('Mildly Alarmed');
        // a card shows what it is: key, tempo, drums
        const red = [...document.querySelectorAll('.gen-pb-card')].find((c) => c.textContent.includes('Mildly Alarmed'));
        expect(red.textContent).toMatch(/136 BPM/);
        expect(red.textContent).toMatch(/Driving/);
    });

    test('the search box takes the focus on a computer, but not on a phone (it would raise the keyboard)', () => {
        render(<PresetBrowser current="" onPick={() => {}} actions={actions()} />);
        click(document.querySelector('.gen-scene-button'));
        expect(document.activeElement).toBe(document.querySelector('input[type="search"]'));
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        const ua = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15; Pixel 8) Mobile Safari/537.36');
        click(document.querySelector('.gen-scene-button'));
        expect(document.activeElement).not.toBe(document.querySelector('input[type="search"]'));
        ua.mockRestore();
    });

    test('categories narrow the grid, search finds by name, blurb and tag', () => {
        render(<PresetBrowser current="" onPick={() => {}} actions={actions()} />);
        click(document.querySelector('.gen-scene-button'));
        click(button('Sub-light'));
        expect(cards()).toEqual(SCENES.filter((s) => s.category === 'starship').map((s) => s.name));
        click(button('All'));
        type(document.querySelector('input[type="search"]'), 'f-zero');
        expect(cards().sort()).toEqual(SCENES.filter((s) => s.tags.includes('f-zero')).map((s) => s.name).sort());
        type(document.querySelector('input[type="search"]'), 'rain');
        expect(cards()).toContain('Thunderstorm');
        type(document.querySelector('input[type="search"]'), 'zzzz nothing');
        expect(cards()).toHaveLength(0);
        expect(document.querySelector('.gen-pb-empty')).not.toBeNull();
    });

    test('picking a card loads it and closes the window; Escape closes without loading', () => {
        const onPick = vi.fn();
        render(<PresetBrowser current="" onPick={onPick} actions={actions()} />);
        click(document.querySelector('.gen-scene-button'));
        click(button('Slightly Lost Forest'));
        expect(onPick).toHaveBeenCalledTimes(1);
        expect(onPick.mock.calls[0][0].name).toBe('Slightly Lost Forest');
        expect(document.querySelector('.gen-pb')).toBeNull();
        click(document.querySelector('.gen-scene-button'));
        act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(document.querySelector('.gen-pb')).toBeNull();
        expect(onPick).toHaveBeenCalledTimes(1);
    });

    test('a click applies as the header says; shift applies the composition only and ctrl the sounds only', () => {
        const onPick = vi.fn();
        const click2 = (el, init) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init })); });
        render(<PresetBrowser current="" onPick={onPick} actions={actions()} />);
        const open = () => click(document.querySelector('.gen-scene-button'));
        const card = () => [...document.querySelectorAll('.gen-pb-pick')].find((b) => b.textContent.includes('Mild Vacuum'));
        open();
        click2(card());
        open();
        click2(card(), { shiftKey: true });
        open();
        click2(card(), { ctrlKey: true });
        open();
        click(button('Sounds'));
        click2(card());
        open();
        // the choice is for one visit to the window
        click2(card());
        expect(onPick.mock.calls.map(([, options]) => options.parts)).toEqual(['all', 'composition', 'voices', 'voices', 'all']);
    });

    test('your own presets get a category of their own and can be deleted', async () => {
        saveUserScene(buildSetup({
            settings: defaultSettings(),
            voices: Object.fromEntries(Object.entries(ROLE_PRESETS).map(([role, name]) => [role, { name, synth: { masterVolume: 0.5 } }])),
        }, { name: 'My tune' }));
        const a = actions();
        render(<PresetBrowser current="" onPick={() => {}} actions={a} />);
        click(document.querySelector('.gen-scene-button'));
        click(button('Mine'));
        expect(cards()).toEqual(['My tune']);
        window.confirm = vi.fn(() => true);
        await act(async () => { document.querySelector('.gen-pb-remove').click(); });
        expect(a.remove).toHaveBeenCalledWith('My tune');
    });

    test('the footer saves, copies, downloads and loads pasted text', async () => {
        const a = actions();
        render(<PresetBrowser current="" onPick={() => {}} actions={a} />);
        click(document.querySelector('.gen-scene-button'));
        expect(button('Save current').disabled).toBe(true);
        type(document.querySelector('.gen-pb-save input'), '  Night shift ');
        await act(async () => { button('Save current').click(); });
        expect(a.save).toHaveBeenCalledWith('Night shift');
        await act(async () => { button('Copy setup').click(); });
        expect(a.copy).toHaveBeenCalled();
        expect(document.querySelector('[role="status"]').textContent).toBe('Copied');
        await act(async () => { button('Download').click(); });
        expect(a.download).toHaveBeenCalled();
        click(button('Paste'));
        type(document.querySelector('.gen-pb-paste textarea'), '{"name":"x","settings":{}}');
        await act(async () => { button('Load').click(); });
        expect(a.load).toHaveBeenCalledWith('{"name":"x","settings":{}}');
        // loaded: the window closes
        expect(document.querySelector('.gen-pb')).toBeNull();
    });

    test('a failed load keeps the window open and says why', async () => {
        const a = actions();
        a.load = vi.fn(() => ({ ok: false, message: 'That is not valid JSON' }));
        render(<PresetBrowser current="" onPick={() => {}} actions={a} />);
        click(document.querySelector('.gen-scene-button'));
        click(button('Paste'));
        type(document.querySelector('.gen-pb-paste textarea'), '{nope');
        await act(async () => { button('Load').click(); });
        expect(document.querySelector('.gen-pb')).not.toBeNull();
        expect(document.querySelector('[role="status"]').textContent).toBe('That is not valid JSON');
    });
});

describe('your presets in storage', () => {
    const setup = (name, bpm = 80) => buildSetup({
        settings: { ...defaultSettings(), bpm },
        voices: Object.fromEntries(Object.entries(ROLE_PRESETS).map(([role, preset]) => [role, { name: preset, synth: { masterVolume: 0.4 } }])),
    }, { name });

    test('save, replace by name, list newest first, delete', () => {
        expect(userScenes()).toEqual([]);
        expect(saveUserScene(setup('One'))).toBe(true);
        expect(saveUserScene(setup('Two'))).toBe(true);
        expect(saveUserScene(setup('One', 100))).toBe(true);
        expect(userScenes().map((s) => s.name)).toEqual(['One', 'Two']);
        expect(userScenes()[0].settings.bpm).toBe(100);
        expect(userScenes()[0].category).toBe('mine');
        expect(isUserScene('Two')).toBe(true);
        deleteUserScene('Two');
        expect(userScenes().map((s) => s.name)).toEqual(['One']);
    });

    test('storage that is blocked or holds rubbish is survived', () => {
        window.localStorage.setItem('bgm-user-setups', '{not json');
        expect(userScenes()).toEqual([]);
        window.localStorage.setItem('bgm-user-setups', JSON.stringify([{ name: 5 }, null, 'x', { name: 'ok', settings: {} }]));
        expect(userScenes().map((s) => s.name)).toEqual(['ok']);
        const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        expect(saveUserScene(setup('Three'))).toBe(false);
        set.mockRestore();
    });
});

describe('tour start prompt', () => {
    test('dims the page behind a card until answered; starting goes past the welcome step', () => {
        const onClose = vi.fn();
        render(<Tour prompt onClose={onClose} />);
        const overlay = document.querySelector('.gen-tour-intro');
        expect(overlay).not.toBeNull();
        expect(document.querySelector('.gen-tour')).toBeNull();
        click(button('Take the tour'));
        expect(document.querySelector('.gen-tour-intro')).toBeNull();
        expect(document.querySelector('.gen-tour-count').textContent).toMatch(/^Step 2 of/);
        expect(onClose).not.toHaveBeenCalled();
    });

    test('"No thanks", Escape and a click on the dark all dismiss it and remember', () => {
        [
            () => click(button('No thanks')),
            () => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }),
            () => click(document.querySelector('.gen-tour-intro')),
        ].forEach((dismiss) => {
            window.localStorage.clear();
            const onClose = vi.fn();
            render(<Tour prompt onClose={onClose} />);
            dismiss();
            expect(onClose).toHaveBeenCalledTimes(1);
            expect(window.localStorage.getItem('bgm-tour-done')).toBe('true');
        });
    });

    test('a click on the card itself does not dismiss it, and without the prompt the tour starts at the welcome step', () => {
        const onClose = vi.fn();
        render(<Tour prompt onClose={onClose} />);
        click(document.querySelector('.gen-tour-intro-card'));
        expect(onClose).not.toHaveBeenCalled();
        render(<Tour key="no-prompt" onClose={onClose} />);
        expect(document.querySelector('.gen-tour-intro')).toBeNull();
        expect(document.querySelector('.gen-tour-count').textContent).toMatch(/^Step 1 of/);
    });
});

test('categories are labelled for the grid', () => {
    SCENE_CATEGORIES.forEach((c) => expect(c.label && c.blurb).toBeTruthy());
});
