// The quest log in React: stores it in this browser, feeds it what the person does (questBus.js) and
// how long they listen, and turns the results into messages and level-ups.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readPref, writePref } from '../prefs';
import { onQuestEvent } from './questBus';
import { QUESTS, QUEST_BY_ID, ACHIEVEMENTS } from './questDefs';
import {
    cleanState, emptyState, applyEvent, addListening, seedExisting, openQuests, stageComplete, stageProgress,
    newAchievements, award, justDone,
} from './questState';

export const QUESTS_KEY = 'bgm-quests-v2';
const LISTEN_STEP_MS = 5000;

// A change of sound only counts once the music is playing, during the change or after it: the quest is about
// hearing the new sound, and a sound picked while nothing plays is not heard until Play.
const WHEN_PLAYING = new Set(['sound', 'dice', 'newsound', 'voice-reset']);

const today = () => {
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * @param {object} props
 * @param {number} props.stage - the stage unlocked now (tourSteps.js)
 * @param {number} props.lastStage
 * @param {function} props.setStage - called with the next stage when a level is finished
 * @param {string} props.scene - the preset playing ('' for none), for the time spent on each
 * @param {boolean} props.playing - whether anything plays
 * @returns the quest log and what to show: `current` (the quest being asked for), `messages` (what just
 *   happened, oldest first), `dismiss(id)`, `skip(id)`, and the controls for the card
 */
export default function useQuests({ stage, lastStage, setStage, scene, playing, enabled = true }) {
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;
    const playingRef = useRef(playing);
    playingRef.current = playing;
    const waiting = useRef([]);
    const [state, setStateRaw] = useState(() => seedExisting(cleanState(readPref(QUESTS_KEY, null)), stage));
    const ref = useRef(state);
    const [messages, setMessages] = useState([]);
    const messageId = useRef(0);

    const say = useCallback((message) => {
        setMessages((list) => [...list, { ...message, id: ++messageId.current }].slice(-6));
    }, []);
    const setState = useCallback((next) => {
        ref.current = next;
        setStateRaw(next);
        writePref(QUESTS_KEY, next);
    }, []);
    const change = useCallback((fn) => {
        const prev = ref.current, next = fn(prev);
        if (next === prev) return;
        setState(next);
        for (const id of justDone(prev, next)) {
            const quest = QUEST_BY_ID.get(id);
            if (quest) say({ kind: 'quest', title: quest.name });
        }
    }, [say, setState]);

    // What the person does.
    useEffect(() => onQuestEvent((event) => {
        if (!enabledRef.current) return;
        if (WHEN_PLAYING.has(event.type) && !playingRef.current) { waiting.current.push(event); return; }
        change((s) => applyEvent(s, event));
    }), [change]);
    // ... and the ones that waited count when the music starts
    useEffect(() => {
        if (!playing || !enabled || !waiting.current.length) return;
        const events = waiting.current;
        waiting.current = [];
        change((s) => events.reduce((state, event) => applyEvent(state, event), s));
    }, [playing, enabled, change]);

    // Time spent listening, to the preset playing.
    const sceneRef = useRef(scene);
    sceneRef.current = scene;
    useEffect(() => {
        if (!playing || !enabled) return undefined;
        const timer = setInterval(() => change((s) => addListening(s, sceneRef.current, LISTEN_STEP_MS, today())), LISTEN_STEP_MS);
        return () => clearInterval(timer);
    }, [playing, enabled, change]);

    // A level is done when its quests are: the next stage unlocks.
    useEffect(() => {
        if (enabled && stage < lastStage && stageComplete(state, stage)) {
            setStage(stage + 1);
            say({ kind: 'level', stage: stage + 1 });
        }
    }, [state, stage, lastStage, enabled, setStage, say]);

    // Milestones.
    useEffect(() => {
        const fresh = newAchievements(state, stage, lastStage);
        if (!enabled || !fresh.length) return;
        change((s) => award(s, fresh.map((a) => a.id)));
        for (const a of fresh) say({ kind: 'achievement', title: a.title, text: a.text });
    }, [state, stage, lastStage, enabled, change, say]);

    const open = useMemo(() => openQuests(state, stage), [state, stage]);
    const current = open[0] ?? null;

    return {
        state,
        current,
        open,
        progress: stageProgress(state, stage),
        messages,
        dismiss: useCallback((id) => setMessages((list) => list.filter((m) => m.id !== id)), []),
        /** "I know this one": the quest is not asked for. */
        skip: useCallback((id) => change((s) => ({ ...s, skipped: { ...s.skipped, [id]: true } })), [change]),
        /** The quests of these stages and before are not asked for (the next stage was unlocked by hand). */
        skipThrough: useCallback((through) => change((s) => ({
            ...s, skipped: { ...s.skipped, ...Object.fromEntries(QUESTS.filter((q) => q.stage <= through && !(q.id in s.done)).map((q) => [q.id, true])) },
        })), [change]),
        /** Show the level-up message for a stage (its Show me opens that level's tour). */
        announceLevel: useCallback((level) => say({ kind: 'level', stage: level }), [say]),
        unlockAllPresets: useCallback(() => change((s) => ({ ...s, presetsAll: true })), [change]),
        setOff: useCallback((off) => change((s) => ({ ...s, off })), [change]),
        reset: useCallback(() => { waiting.current = []; setState({ ...emptyState() }); setMessages([]); }, [setState]),
        achievements: ACHIEVEMENTS,
    };
}
