// The mood fader (settings.mood, composition/mood.js), under the intensity fader and built the same way: its track is also the meter.
// The cap is where the mood is going; the lit line from the middle is where it is now (the level of the bar playing, read from the
// plan) - violet to the left towards suspended, gold to the right towards lush - so after a move the chords turn over gradually.
import React, { useEffect, useRef, useState } from 'react';
import { moodLabel } from './composition/mood';

const COMMIT_MS = 250;
const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
const snap = (v) => (Math.abs(v) <= 0.04 ? 0 : v);

/** `mood`: settings.mood; `now`: the level playing now; `onChange(mood)`. */
export default function MoodFader({ mood, now = 0, onChange }) {
    const [local, setLocal] = useState(mood.level), timer = useRef(null);
    useEffect(() => { if (!timer.current) setLocal(mood.level); }, [mood.level]);
    useEffect(() => () => clearTimeout(timer.current), []);
    const move = (level) => {
        setLocal(level);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; onChange({ ...mood, level }); }, COMMIT_MS);
    };
    const shown = Math.max(-1, Math.min(1, now)), lit = Math.abs(shown);
    return (
        <label className="gen-intensity gen-mood" style={{ '--tone': local > 0 ? 'var(--gen-intensity-hot)' : local < 0 ? 'var(--gen-intensity-cool)' : 'var(--gen-muted)' }}
            title="The mood of the chords, from suspended and hazy (left: sus chords that never settle, a closed tone) to lush and bright (right: added sixths and ninths, then sevenths, ninths and thirteenths). Drag it and the chords turn over gradually. Double-click for the preset as made.">
            <output>{pct(shown)}</output>
            <span className="gen-intensity-fader">
                <span className="gen-intensity-meter" aria-hidden="true">
                    <i className="up" style={{ width: `${Math.max(0, shown) * 50}%`, opacity: shown > 0 ? 0.55 + 0.45 * lit : 0 }} />
                    <i className="down" style={{ width: `${Math.max(0, -shown) * 50}%`, opacity: shown < 0 ? 0.55 + 0.45 * lit : 0 }} />
                    <b />
                </span>
                <input type="range" aria-label="Mood" aria-valuetext={`${moodLabel(local)}, ${pct(local)}, now ${pct(shown)}`} data-quick="mood"
                    min={-1} max={1} step={0.05} value={local}
                    onChange={(e) => move(snap(Number(e.target.value)))} onDoubleClick={() => move(0)} />
            </span>
            <span className="gen-intensity-name">Mood: {moodLabel(shown)}</span>
        </label>
    );
}
