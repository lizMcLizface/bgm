import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QuestWidget from './QuestWidget';
import { QUEST_BY_ID } from './questDefs';
import { emptyState } from './questState';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const quests = (extra = {}) => ({
    state: emptyState(), current: QUEST_BY_ID.get('first-notes'), progress: [0, 6], messages: [],
    dismiss: vi.fn(), skip: vi.fn(), setOff: vi.fn(), reset: vi.fn(), ...extra,
});

let host, root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const show = (props) => act(() => root.render(<QuestWidget stage={0} onShowLevel={() => {}} {...props} />));
const button = (text, within = host) => [...within.querySelectorAll('button')].find((b) => b.textContent === text);

describe('QuestWidget', () => {
    it('asks for the current quest, with no way to skip it', () => {
        show({ quests: quests() });
        expect(host.textContent).toContain('First Notes');
        expect(host.textContent).toContain('Press play');
        expect(host.textContent).toContain('0/1');
        expect(button('Skip')).toBeUndefined();
    });
    it('lights up the part of the page a task is about while its row is hovered', () => {
        const target = document.createElement('div');
        target.className = 'gen-play';
        document.body.append(target);
        show({ quests: quests() });
        const row = [...host.querySelectorAll('.gen-quest-tasks li')].find((li) => li.textContent.includes('Press play'));
        act(() => row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
        act(() => { row.dispatchEvent(new Event('mouseover', { bubbles: true })); });
        // React listens for mouseover to run onMouseEnter
        expect(target.classList.contains('gen-quest-glow')).toBe(true);
        act(() => row.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
        expect(target.classList.contains('gen-quest-glow')).toBe(false);
        target.remove();
    });
    it('offers the unlocked level when a level is passed', () => {
        const onShowLevel = vi.fn();
        show({ quests: quests({ messages: [{ id: 1, kind: 'level', stage: 1 }] }), stage: 1, onShowLevel });
        act(() => button('Show me', host.querySelector('.is-level')).click());
        expect(onShowLevel).toHaveBeenCalledWith(1);
    });
    it('hides while a tour is open', () => {
        show({ quests: quests(), hidden: true });
        expect(host.querySelector('.gen-quest').hidden).toBe(true);
    });
    it('opens the trophy window', () => {
        show({ quests: quests() });
        act(() => host.querySelector('[aria-label="Quests and achievements"]').click());
        expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    });
});
