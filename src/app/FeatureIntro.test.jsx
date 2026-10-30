import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import FeatureIntro, { INTROS } from './FeatureIntro';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let main, host, root;
const wait = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
// a window with the parts the picker steps frame, except the backend filter (which a voice may not have)
const rectFor = () => ({ left: 100, top: 100, width: 200, height: 40, right: 300, bottom: 140 });
beforeEach(() => {
    window.localStorage.clear();
    main = document.createElement('main'); main.className = 'gen'; document.body.append(main);
    host = document.createElement('div'); main.append(host);
    root = createRoot(host);
    Element.prototype.getBoundingClientRect = rectFor;
});
afterEach(() => { act(() => root.unmount()); main.remove(); });

const steps = ['voice-picker', 'voice-picker-kinds', 'voice-picker-filters', 'voice-picker-backend', 'voice-picker-phrases'];
const show = () => act(() => root.render(
    <div role="dialog" className="gen-vb">
        <FeatureIntro ids={steps} />
        <div className="gen-pb-head"><input type="search" /></div>
        <nav aria-label="Kinds of sound" />
        <div className="gen-pb-families" aria-label="Filter by kind of instrument" />
        <ul><li><span className="gen-pb-phrases" /></li></ul>
    </div>,
));
const card = () => main.querySelector('.gen-intro-card');

describe('FeatureIntro steps', () => {
    it('walk through the parts, skip one that is not on the page, and end on Got it', async () => {
        show(); await wait(); await wait();
        expect(card().textContent).toContain(INTROS['voice-picker'].title);
        expect(card().textContent).toContain('1 of 5');
        const next = () => act(() => [...card().querySelectorAll('button')].find((b) => /Next|Got it/.test(b.textContent)).click());
        next(); await wait(); await wait();
        expect(card().textContent).toContain(INTROS['voice-picker-kinds'].title);
        next(); await wait(); await wait();
        expect(card().textContent).toContain(INTROS['voice-picker-filters'].title);
        next(); await wait(); await wait();
        // the backend filter is missing from this window: straight on to the phrases, and the last says Got it
        expect(card().textContent).toContain(INTROS['voice-picker-phrases'].title);
        expect(card().querySelector('button').textContent).toBe('Got it');
        next(); await wait();
        expect(card()).toBeNull();
        expect(JSON.parse(window.localStorage.getItem('bgm-intros-v1'))['voice-picker-phrases']).toBe(true);
    });
});
