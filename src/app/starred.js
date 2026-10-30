// Starred presets: the ones kept at the top of the preset list. Stored in this browser (prefs.js), by name.

import { useCallback, useState } from 'react';
import { readPref, writePref } from './prefs';

export const STARRED_KEY = 'bgm-starred-presets';

const clean = (value) => (Array.isArray(value) ? [...new Set(value.filter((name) => typeof name === 'string'))].slice(0, 500) : []);

/** [starred names (in the order they were starred), toggle(name)] */
export function useStarred() {
    const [starred, setStarred] = useState(() => clean(readPref(STARRED_KEY, [])));
    const toggle = useCallback((name) => {
        setStarred((list) => {
            const next = list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
            writePref(STARRED_KEY, next);
            return next;
        });
    }, []);
    return [starred, toggle];
}
