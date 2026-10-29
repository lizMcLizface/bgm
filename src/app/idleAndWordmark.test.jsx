import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import Wordmark from './Wordmark';
import { useIdle } from './useIdle';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });

const Probe = ({ enabled = true }) => <p data-idle={String(useIdle(1000, enabled))} />;
const state = () => host.querySelector('p').dataset.idle;
const fire = (type, init = {}) => act(() => { window.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init })); });

describe('useIdle', () => {
    test('goes idle after the time, wakes on movement, taps and keys, and counts again', () => {
        act(() => root.render(<Probe />));
        expect(state()).toBe('false');
        act(() => { vi.advanceTimersByTime(1001); });
        expect(state()).toBe('true');
        fire('pointermove', { clientX: 5, clientY: 5 });
        expect(state()).toBe('false');
        act(() => { vi.advanceTimersByTime(600); });
        fire('pointerdown');
        act(() => { vi.advanceTimersByTime(600); });
        expect(state()).toBe('false'); // the tap started the count over
        act(() => { vi.advanceTimersByTime(500); });
        expect(state()).toBe('true');
        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); });
        expect(state()).toBe('false');
    });

    test('a pointer that reports the place it already was does not wake it', () => {
        act(() => root.render(<Probe />));
        fire('pointermove', { clientX: 9, clientY: 9 });
        act(() => { vi.advanceTimersByTime(1001); });
        expect(state()).toBe('true');
        fire('pointermove', { clientX: 9, clientY: 9 });
        expect(state()).toBe('true');
        fire('pointermove', { clientX: 10, clientY: 9 });
        expect(state()).toBe('false');
    });

    test('never idle while disabled', () => {
        act(() => root.render(<Probe enabled={false} />));
        act(() => { vi.advanceTimersByTime(5000); });
        expect(state()).toBe('false');
    });
});

describe('Wordmark', () => {
    test('draws calmbgm in pixels, named for screen readers, and rains only while playing', () => {
        act(() => root.render(<Wordmark playing={false} />));
        const svg = host.querySelector('svg');
        expect(svg.getAttribute('aria-label')).toBe('calmbgm');
        expect(svg.querySelectorAll('.gen-wordmark-calm rect').length).toBeGreaterThan(30);
        expect(svg.querySelectorAll('.gen-wordmark-bgm rect').length).toBeGreaterThan(30);
        expect(svg.classList.contains('is-playing')).toBe(false);
        act(() => root.render(<Wordmark playing />));
        expect(host.querySelector('svg').classList.contains('is-playing')).toBe(true);
    });
});
