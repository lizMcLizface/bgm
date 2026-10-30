// A tiny event bus between the page and the quest log. Anything in the app reports what the person did
// with `emitQuest('mute', { role, on })`; the quest log (useQuests.js) listens. Reporting costs nothing
// when nothing listens, so components need no props or context for it.

const listeners = new Set();

/** Report something the person did. `type` is one of the quests' `on` values (questDefs.js). */
export function emitQuest(type, detail = {}) {
    for (const fn of [...listeners]) fn({ ...detail, type });
}

/** Listen for events; returns the function that stops listening. */
export function onQuestEvent(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
