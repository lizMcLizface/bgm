import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PresetPicker from './PresetPicker';
import { PRESET_CATEGORIES } from '../presets';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host;
let root;
beforeEach(() => {
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

const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const press = (key) => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
const trigger = () => host.querySelector('.gen-voice-button');
const cards = () => [...document.querySelectorAll('.gen-pb-card strong')].map((el) => el.textContent);

// Holds the voice's sound like the page does, so keys move from where they left it.
const mount = (start = 'Soft Pad', role = 'pad') => {
    const onChange = vi.fn();
    const Holder = () => {
        const [value, setValue] = React.useState(start);
        return <PresetPicker value={value} onChange={(name) => { onChange(name); setValue(name); }} role={role} />;
    };
    act(() => root.render(<Holder />));
    return onChange;
};

test('closed it is only a button; nothing is built until it opens', () => {
    mount();
    expect(trigger().textContent).toContain('Soft Pad');
    expect(document.querySelector('.gen-pb')).toBeNull();
});

test('every sound is listed, in blocks, with the current sound marked', () => {
    mount('Soft Pad');
    click(trigger());
    expect(cards()).toEqual(expect.arrayContaining([...Object.keys(PRESET_CATEGORIES.Pads), ...Object.keys(PRESET_CATEGORIES.Bass), ...Object.keys(PRESET_CATEGORIES.Leads)]));
    expect([...document.querySelectorAll('.gen-pb-scroll h3')].map((h) => h.firstChild.textContent)).toEqual(expect.arrayContaining(['Pads', 'Bass', 'Leads']));
    expect(document.querySelector('.is-active strong').textContent).toBe('Soft Pad');
});

test('the page behind does not scroll while it is open', () => {
    mount();
    click(trigger());
    expect(document.body.style.overflow).toBe('hidden');
    press('Escape');
    expect(document.body.style.overflow).not.toBe('hidden');
});

test('clicking a card picks it and leaves the window open', () => {
    const onChange = mount();
    click(trigger());
    click([...document.querySelectorAll('.gen-pb-pick')].find((b) => b.textContent.includes('Warm Strings')));
    expect(onChange).toHaveBeenCalledWith('Warm Strings');
    expect(document.querySelector('.gen-pb')).not.toBeNull();
});

test('the arrow keys and [ ] step through the shown sounds; Escape closes', () => {
    const onChange = mount('Soft Pad');
    click(trigger());
    const pads = Object.keys(PRESET_CATEGORIES.Pads);
    press('ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith(pads[1]);
    press(']');
    expect(onChange).toHaveBeenLastCalledWith(pads[2]);
    press('ArrowLeft');
    expect(onChange).toHaveBeenLastCalledWith(pads[1]);
    press('Escape');
    expect(document.querySelector('.gen-pb')).toBeNull();
});

test('opening leaves the search box alone, so keys for an armed voice keep playing', () => {
    const onChange = mount('Soft Pad');
    click(trigger());
    expect(document.activeElement).not.toBe(document.querySelector('input[type="search"]'));
    expect(document.activeElement.getAttribute('role')).toBe('dialog');
    act(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    expect(onChange).toHaveBeenCalledTimes(1);
});

test('the arrows still step from an empty search box once it is clicked', () => {
    const onChange = mount('Soft Pad');
    click(trigger());
    const search = document.querySelector('input[type="search"]');
    act(() => search.focus());
    act(() => { search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); });
    expect(onChange).toHaveBeenCalledTimes(1);
});

test('searching narrows the cards across every block', () => {
    mount();
    click(trigger());
    const search = document.querySelector('input[type="search"]');
    act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'harp');
        search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(cards()).toContain('Harp Pluck');
    expect(cards()).not.toContain('Soft Pad');
});
