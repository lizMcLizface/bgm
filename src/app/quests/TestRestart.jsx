// TEMPORARY, for testing: back to a first visit, or to the start of any level (earlier levels' quests are marked
// not asked for, the later ones start fresh), then reloads the page. Remove before shipping.

import React, { useState } from 'react';
import { STAGES, STAGE_KEY, TOUR_KEY, MINIMAL_TOUR_KEY, QUESTS_INTRO_KEY } from '../tourSteps';
import { QUESTS } from './questDefs';
import { emptyState } from './questState';
import { QUESTS_KEY } from './useQuests';
import './quests.css';

const set = (key, value) => { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* not stored */ } };
const clear = (key) => { try { window.localStorage.removeItem(key); } catch (e) { /* not stored */ } };

export const ANNOUNCE_KEY = 'bgm-test-announce-level';

export function restartAt(level) {
    ['bgm-quest-collapsed', 'bgm-intros-v1', ANNOUNCE_KEY, 'bgm-hide-ui', 'bgm-backdrop-mode', TOUR_KEY, MINIMAL_TOUR_KEY, QUESTS_INTRO_KEY, QUESTS_KEY, STAGE_KEY].forEach(clear);
    if (level > 0) {
        set(QUESTS_KEY, { ...emptyState(), skipped: Object.fromEntries(QUESTS.filter((q) => q.stage < level).map((q) => [q.id, true])) });
        set(STAGE_KEY, level);
        set(TOUR_KEY, true);
        set(MINIMAL_TOUR_KEY, true);
        set(QUESTS_INTRO_KEY, true);
        set(ANNOUNCE_KEY, level); // the page shows that level's "Level up! Show me" on load
        set('bgm-hide-ui', false);
        set('bgm-backdrop-mode', 'scenery');
    }
    window.location.assign(window.location.pathname);
}

export default function TestRestart() {
    const [level, setLevel] = useState(0);
    return (
        <div className="gen-test-restart" title="Testing: forget progress and reload at the start of a level">
            <select value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Level to restart at">
                {STAGES.map((s, i) => <option key={s.id} value={i}>Level {i + 1}: {s.name}</option>)}
            </select>
            <button type="button" onClick={() => restartAt(level)}>↺ Restart</button>
        </div>
    );
}
