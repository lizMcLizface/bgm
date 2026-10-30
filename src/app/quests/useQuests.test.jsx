import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import useQuests from './useQuests';
import { emitQuest } from './questBus';
import { taskStatus, emptyState } from './questState';
import { QUEST_BY_ID } from './questDefs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root, latest;
const noop = () => {};
const Probe = (props) => { latest = useQuests({ stage: 1, lastStage: 8, setStage: noop, scene: '', ...props }); return null; };
const mount = (props) => act(() => root.render(<Probe {...props} />));
const sounds = () => taskStatus(latest.state, QUEST_BY_ID.get('new-voices')).map((t) => t.done);

// a log with some history, as one kept by the quest system itself: it is not seeded as a returning visitor's
const stored = { ...emptyState(), skipped: { 'first-notes': true } };
beforeEach(() => { window.localStorage.setItem('bgm-quests-v2', JSON.stringify(stored)); host = document.createElement('div'); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); });

describe('quests that change a voice', () => {
    it('count at once while the music plays', () => {
        mount({ playing: true });
        act(() => emitQuest('sound', { role: 'lead' }));
        expect(sounds()).toEqual([false, true, false, false, false]);
    });
    it('wait for the music when nothing plays, then count when it starts', () => {
        mount({ playing: false });
        act(() => { emitQuest('sound', { role: 'bass' }); emitQuest('dice', { role: 'pad' }); });
        expect(sounds()).toEqual([false, false, false, false, false]);
        mount({ playing: true });
        expect(sounds()).toEqual([false, false, true, false, false]);
        expect(latest.state.progress['new-voices.dice']).toBe(1);
    });
    it('do not hold back other quests', () => {
        mount({ playing: false });
        act(() => emitQuest('mute', { role: 'pad', on: true }));
        expect(taskStatus(latest.state, QUEST_BY_ID.get('voice-controls'))[0].done).toBe(true);
    });
});
