// The quest log: what has been done, kept as plain data so it can be stored and tested.
// Everything here is pure; useQuests.js stores the state and feeds it events.

import { QUESTS, QUEST_VERSION, ACHIEVEMENTS } from './questDefs';

/** A preset heard this long (seconds) counts as heard, for the "find three presets" quest. */
const PRESET_HEARD_SECONDS = 30;

export const emptyState = () => ({
    v: 1,
    done: {}, // quest id -> time done
    skipped: {}, // quest id -> true: not asked for (they knew it already, or the list was seeded)
    counts: {}, // event type -> times seen
    progress: {}, // quest id -> times done so far, for quests that need several
    seen: { presets: [], scales: [] },
    heard: {}, // preset name -> seconds listened
    listenMs: 0,
    days: [], // dates listened on, 'YYYY-MM-DD'
    awarded: {}, // achievement id -> time awarded
    seeded: 0, // QUEST_VERSION when the list was seeded for someone who already knew the page; 0: never
    off: false, // the card is switched off (the trophy list stays)
    presetsAll: false, // every preset is open (presetUnlocks.js), by the Unlock all button
});

/** Anything stored that isn't a state of ours comes back as an empty one. */
export function cleanState(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return base;
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 2000) : []);
    return {
        ...base,
        done: obj(raw.done), skipped: obj(raw.skipped), counts: obj(raw.counts), progress: obj(raw.progress), heard: obj(raw.heard), awarded: obj(raw.awarded),
        seen: { presets: list(raw.seen?.presets), scales: list(raw.seen?.scales) },
        listenMs: Number.isFinite(raw.listenMs) ? Math.max(0, raw.listenMs) : 0,
        days: list(raw.days).slice(-400),
        seeded: Number.isInteger(raw.seeded) ? raw.seeded : 0,
        off: raw.off === true,
        presetsAll: raw.presetsAll === true,
    };
}

const resolved = (state, id) => id in state.done || id in state.skipped;

/**
 * Someone who already has stages unlocked doesn't start at "press play": the quests of the stages they
 * have reached, as they exist now, are marked not asked for. Quests added later still come to them.
 */
export function seedExisting(state, stage) {
    // (a log that already has history was kept by the quest system itself, however far along)
    const history = ['done', 'skipped', 'counts'].some((key) => Object.keys(state[key]).length > 0);
    if (state.seeded || stage <= 0 || history) return state;
    const skipped = { ...state.skipped };
    for (const q of QUESTS) if (q.stage <= stage && !(q.id in state.done)) skipped[q.id] = true;
    return { ...state, skipped, seeded: QUEST_VERSION };
}

const addUnique = (list, value) => (list.includes(value) ? list : [...list, value]);

/** The key a task's progress is kept under. */
export const taskKey = (quest, task) => `${quest.id}.${task.id}`;

/** [{ task, have, need, done }] for a quest. */
export const taskStatus = (state, quest) => quest.tasks.map((task) => {
    const need = task.need ?? 1, have = Math.min(need, state.progress[taskKey(quest, task)] ?? 0);
    return { task, have, need, done: have >= need };
});

/** One thing the person did (questBus.js) -> the state with it recorded and any tasks and quests it finishes. */
export function applyEvent(state, event, now = Date.now()) {
    let next = { ...state, counts: { ...state.counts, [event.type]: (state.counts[event.type] ?? 0) + 1 } };
    if (event.type === 'preset' && event.name) next = { ...next, seen: { ...next.seen, presets: addUnique(next.seen.presets, event.name) } };
    if (event.type === 'setting' && event.key === 'mode' && typeof event.value === 'string') next = { ...next, seen: { ...next.seen, scales: addUnique(next.seen.scales, event.value) } };
    const done = { ...next.done };
    const progress = { ...next.progress };
    for (const q of QUESTS) {
        if (resolved(next, q.id)) continue;
        let touched = false;
        for (const t of q.tasks) {
            const key = taskKey(q, t);
            if (t.on !== event.type || (t.where && !t.where(event)) || (progress[key] ?? 0) >= (t.need ?? 1)) continue;
            progress[key] = (progress[key] ?? 0) + 1;
            touched = true;
        }
        if (touched && q.tasks.every((t) => (progress[taskKey(q, t)] ?? 0) >= (t.need ?? 1))) done[q.id] = now;
    }
    return { ...next, done, progress };
}

/**
 * Time spent listening to `scene` (a preset name, or '' for none): total, per preset and per day, and
 * a 'preset-heard' event the first time a preset reaches PRESET_HEARD_SECONDS.
 */
export function addListening(state, scene, ms, day, now = Date.now()) {
    let next = { ...state, listenMs: state.listenMs + ms, days: addUnique(state.days, day) };
    if (!scene) return next;
    const before = next.heard[scene] ?? 0, after = before + ms / 1000;
    next = { ...next, heard: { ...next.heard, [scene]: after } };
    if (before < PRESET_HEARD_SECONDS && after >= PRESET_HEARD_SECONDS) next = applyEvent(next, { type: 'preset-heard', name: scene }, now);
    return next;
}

/** Quests still to do on `stage`, in order. */
export const stageQuests = (state, stage) => QUESTS.filter((q) => q.stage === stage && !resolved(state, q.id));

/**
 * What to ask for now: the quests of every stage reached that are not resolved, earliest first (a quest
 * added later to an earlier stage comes before the current stage's own).
 */
export const openQuests = (state, stage) => QUESTS.filter((q) => q.stage <= stage && !resolved(state, q.id));

/** Whether every quest of the stage is resolved. */
export const stageComplete = (state, stage) => QUESTS.some((q) => q.stage === stage) && stageQuests(state, stage).length === 0;

/** [done, total] of a stage's quests, not counting skipped ones. */
export function stageProgress(state, stage) {
    const own = QUESTS.filter((q) => q.stage === stage && !(q.id in state.skipped));
    return [own.filter((q) => q.id in state.done).length, own.length];
}

/** Achievements newly passed: [{id, ...}] not yet awarded. */
export function newAchievements(state, stage, lastStage) {
    return ACHIEVEMENTS.filter((a) => !(a.id in state.awarded) && a.test(state, stage, lastStage));
}

export function award(state, ids, now = Date.now()) {
    if (!ids.length) return state;
    return { ...state, awarded: { ...state.awarded, ...Object.fromEntries(ids.map((id) => [id, now])) } };
}

/** Whether a feature that a quest `unlocks` is open: the quest is done or not asked for, or this is someone who knew the page before quests. */
export const isUnlocked = (state, feature) => state.seeded > 0 || QUESTS.filter((q) => q.unlocks === feature).every((q) => resolved(state, q.id));

/** Quest ids done in `next` that were not in `prev`. */
export const justDone = (prev, next) => Object.keys(next.done).filter((id) => !(id in prev.done));
