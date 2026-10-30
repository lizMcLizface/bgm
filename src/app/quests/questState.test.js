import { describe, it, expect } from 'vitest';
import { QUESTS, ACHIEVEMENTS, QUEST_BY_ID } from './questDefs';
import { SCENES } from '../scenes';
import { STAGES } from '../tourSteps';
import { isUnlocked, emptyState, cleanState, applyEvent, taskStatus, addListening, seedExisting, openQuests, stageComplete, stageProgress, newAchievements, award, justDone } from './questState';

describe('quest definitions', () => {
    it('have unique ids, real stages and an event each', () => {
        expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
        for (const q of QUESTS) {
            expect(q.stage).toBeGreaterThanOrEqual(0);
            expect(q.stage).toBeLessThan(STAGES.length);
            expect(q.name && q.text && q.help).toBeTruthy();
            expect(q.tasks.length).toBeGreaterThan(0);
            q.tasks.forEach((t) => expect(t.label && typeof t.on === 'string').toBeTruthy());
        }
    });
    it('give every stage something to do, so no level is skipped', () => {
        STAGES.forEach((_, i) => expect(QUESTS.some((q) => q.stage === i)).toBe(true));
    });
    it('have unique achievement ids', () => {
        expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    });
});

describe('applyEvent', () => {
    it('finishes the quest an event matches', () => {
        const s = applyEvent(emptyState(), { type: 'play' }, 5);
        expect(s.progress['first-notes.play']).toBe(1);
        // one task of several: the quest is not done yet
        expect(s.done['first-notes']).toBeUndefined();
        expect(justDone(emptyState(), s)).toEqual([]);
    });
    it('finishes a quest when all its tasks are done, in any order', () => {
        let s = emptyState();
        for (const e of [{ type: 'step', unit: 'start', dir: -1 }, { type: 'step', unit: 'progression', dir: 1 }, { type: 'play' }, { type: 'step', unit: 'chord', dir: 1 }]) s = applyEvent(s, e, 9);
        expect(s.done['first-notes']).toBe(9);
        expect(justDone(emptyState(), s)).toEqual(['first-notes']);
    });
    it('respects where: backwards is not ahead, and a loop switched off is not looping', () => {
        const back = applyEvent(emptyState(), { type: 'step', unit: 'chord', dir: -1 });
        expect(taskStatus(back, QUEST_BY_ID.get('first-notes')).find((t) => t.task.id === 'chord').done).toBe(false);
        const loop = (mode) => taskStatus(applyEvent(emptyState(), { type: 'loop', mode }), QUEST_BY_ID.get('on-repeat')).map((t) => t.done);
        expect(loop('off')).toEqual([false, false, true]);
        expect(loop('chord')).toEqual([true, false, false]);
        expect(loop('progression')).toEqual([false, true, false]);
    });
    it('counts quests that need several', () => {
        let s = emptyState();
        s = applyEvent(s, { type: 'preset-heard' });
        s = applyEvent(s, { type: 'preset-heard' });
        const heard = () => taskStatus(s, QUEST_BY_ID.get('scenery')).find((t) => t.task.id === 'heard');
        expect(heard()).toMatchObject({ have: 2, done: false });
        s = applyEvent(s, { type: 'preset-heard' });
        expect(heard()).toMatchObject({ have: 3, need: 3, done: true });
    });
    it('tells an unusual scale from a mode of the major scale', () => {
        const rare = (value) => taskStatus(applyEvent(emptyState(), { type: 'setting', key: 'mode', value }), QUEST_BY_ID.get('key-and-scale')).map((t) => t.done);
        expect(rare('Major-2')).toEqual([false, true, false]);
        expect(rare('HarmonicMinor-1')).toEqual([false, true, true]);
    });
    it('keeps the scales and presets tried, once each', () => {
        let s = emptyState();
        for (const name of ['a', 'a', 'b']) s = applyEvent(s, { type: 'preset', name });
        expect(s.seen.presets).toEqual(['a', 'b']);
    });
    it('does not redo a skipped quest', () => {
        const s = applyEvent({ ...emptyState(), skipped: { 'first-notes': true } }, { type: 'play' });
        expect(s.progress['first-notes.play']).toBeUndefined();
    });
});

describe('level 2 quests', () => {
    const run = (events, id) => {
        let s = emptyState();
        for (const e of events) s = applyEvent(s, e);
        return taskStatus(s, QUEST_BY_ID.get(id)).map((t) => t.done);
    };
    it('tell turning a voice up from turning it down', () => {
        expect(run([{ type: 'volume', role: 'pad', dir: 1 }], 'volume-knob')).toEqual([true, false]);
        expect(run([{ type: 'volume', role: 'pad', dir: -1 }], 'volume-knob')).toEqual([false, true]);
    });
    it('count solo and un-solo, mute and unmute apart', () => {
        expect(run([{ type: 'mute', on: true }, { type: 'solo', on: true }], 'voice-controls')).toEqual([true, true, false, false]);
        expect(run([{ type: 'mute', on: false }, { type: 'solo', on: false }], 'voice-controls')).toEqual([false, false, true, true]);
    });
    it('want each of the lead, rhythm and bass played', () => {
        expect(run([{ type: 'liveplay', role: 'lead' }, { type: 'liveplay', role: 'bass' }], 'hands-on')).toEqual([true, false, true]);
        expect(run([{ type: 'liveplay', role: 'counter' }], 'hands-on')).toEqual([false, false, false]);
    });
    it('want a new sound on each of the three voices and three rolls of the dice', () => {
        const dice = (n) => Array.from({ length: n }, () => ({ type: 'dice', role: 'lead' }));
        expect(run([{ type: 'sound', role: 'pad' }, ...dice(2)], 'new-voices')).toEqual([true, false, false, false, false]);
        expect(run([...dice(3)], 'new-voices')).toEqual([false, false, false, true, false]);
        expect(run([{ type: 'voice-reset', role: 'bass' }], 'new-voices')).toEqual([false, false, false, false, true]);
    });
});

describe('levels', () => {
    it('complete when every quest of the stage is resolved', () => {
        let s = emptyState();
        expect(stageComplete(s, 0)).toBe(false);
        for (const q of QUESTS.filter((q) => q.stage === 0)) s = { ...s, done: { ...s.done, [q.id]: 1 } };
        expect(stageComplete(s, 0)).toBe(true);
        expect(stageProgress(s, 0)[0]).toBe(stageProgress(s, 0)[1]);
    });
    it('seed people who already unlocked stages without asking them to redo those quests', () => {
        const s = seedExisting(emptyState(), 3);
        expect(openQuests(s, 3)).toEqual([]);
        expect(openQuests(s, 4).map((q) => q.stage)).toEqual(QUESTS.filter((q) => q.stage === 4).map((q) => q.stage));
        expect(seedExisting(s, 5)).toBe(s);
    });
    it('do not seed a log that already has progress, so a level that was set up for testing stays', () => {
        const s = { ...emptyState(), skipped: { 'first-notes': true } };
        expect(seedExisting(s, 1)).toBe(s);
        expect(seedExisting({ ...emptyState(), counts: { play: 2 } }, 3).seeded).toBe(0);
    });
    it('leave new visitors alone', () => {
        expect(seedExisting(emptyState(), 0).seeded).toBe(0);
    });
});

describe('listening', () => {
    it('adds up time, days and heard presets, and fires preset-heard once', () => {
        let s = emptyState();
        s = addListening(s, 'X', 20000, '2026-10-30');
        expect(s.counts['preset-heard']).toBeUndefined();
        s = addListening(s, 'X', 20000, '2026-10-30');
        s = addListening(s, 'X', 20000, '2026-10-31');
        expect(s.counts['preset-heard']).toBe(1);
        expect(s.listenMs).toBe(60000);
        expect(s.days).toEqual(['2026-10-30', '2026-10-31']);
    });
    it('awards the listening achievements once', () => {
        let s = addListening(emptyState(), '', 3600 * 1000, '2026-10-30');
        const ids = newAchievements(s, 0, 7).map((a) => a.id);
        expect(ids).toContain('listen-1h');
        s = award(s, ids);
        expect(newAchievements(s, 0, 7)).toEqual([]);
    });
    it('awards a category once each of its presets was heard long enough', () => {
        const cat = SCENES.find((x) => !x.hidden).category;
        const names = SCENES.filter((x) => x.category === cat && !x.hidden).map((x) => x.name);
        let s = emptyState();
        for (const n of names.slice(0, -1)) s = addListening(s, n, 300000, 'd');
        expect(newAchievements(s, 0, 7).map((a) => a.id)).not.toContain(`heard-${cat}`);
        s = addListening(s, names.at(-1), 300000, 'd');
        expect(newAchievements(s, 0, 7).map((a) => a.id)).toContain(`heard-${cat}`);
    });
});

describe('unlocking features by quest', () => {
    it('keeps fluid locked until Key & Scale is done or skipped, and open for people who knew the page', () => {
        expect(isUnlocked(emptyState(), 'fluid')).toBe(false);
        let s = emptyState();
        s = applyEvent(s, { type: 'setting', key: 'tonic', value: 3 });
        s = applyEvent(s, { type: 'setting', key: 'mode', value: 'Major-2' });
        expect(isUnlocked(s, 'fluid')).toBe(false);
        s = applyEvent(s, { type: 'setting', key: 'mode', value: 'HarmonicMinor-1' });
        expect(isUnlocked(s, 'fluid')).toBe(true);
        expect(isUnlocked({ ...emptyState(), skipped: { 'key-and-scale': true } }, 'fluid')).toBe(true);
        expect(isUnlocked(seedExisting(emptyState(), 2), 'fluid')).toBe(true);
    });
    it('finishes the landscape quest from the options that changed', () => {
        let s = emptyState();
        for (const keys of [['biome', 'hours'], ['weather'], ['time'], ['season']]) s = applyEvent(s, { type: 'scenery', keys });
        expect(s.done.landscaper).toBeDefined();
    });
});

describe('cleanState', () => {
    it('turns anything stored wrongly into an empty log', () => {
        expect(cleanState(null)).toEqual(emptyState());
        expect(cleanState({ v: 2 })).toEqual(emptyState());
        expect(cleanState({ v: 1, done: 3, listenMs: -4, days: 'x' })).toMatchObject({ done: {}, listenMs: 0, days: [] });
    });
    it('knows every quest it seeds', () => {
        expect(QUEST_BY_ID.size).toBe(QUESTS.length);
    });
});
