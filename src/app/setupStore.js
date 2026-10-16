// Setups of your own (scenes.js): saved from the page into localStorage,
// listed with the built-in presets under "Mine". The durable route is
// still the JSON text - "Copy setup" - which can be kept anywhere or pasted
// into src/library/scenes.json to become a built-in. localStorage can be
// unavailable (private mode, blocked storage); every access is guarded and
// the page works without it.

import { normalizeScene, MINE } from './scenes';

const KEY = 'bgm-user-setups';
const MAX_SETUPS = 100;

const read = () => {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
};

/** Your saved setups as scenes, newest first. */
export function userScenes() {
    return read().map((raw) => normalizeScene({ ...raw, category: MINE.id }, MINE.id)).filter(Boolean);
}

export const isUserScene = (name) => read().some((raw) => raw && raw.name === name);

/**
 * Stores a setup under its name, replacing one with the same name.
 * @returns {boolean} whether it was stored
 */
export function saveUserScene(setup) {
    const scene = normalizeScene({ ...setup, category: MINE.id }, MINE.id);
    if (!scene) return false;
    try {
        const kept = read().filter((raw) => raw && raw.name !== scene.name);
        window.localStorage.setItem(KEY, JSON.stringify([scene, ...kept].slice(0, MAX_SETUPS)));
        return true;
    } catch (e) {
        return false;
    }
}

export function deleteUserScene(name) {
    try {
        window.localStorage.setItem(KEY, JSON.stringify(read().filter((raw) => raw && raw.name !== name)));
    } catch (e) {
        // nothing stored, nothing to delete
    }
}
