// The intensity fader (settings.push, composition/push.js), in the bottom row of the control panel between the pill groups: a
// horizontal slider with its number above and its name below, like the other controls. Its track is also the meter. The cap is where intensity is going; the lit line from the middle is where it is now - the
// level of the bar playing, read from the plan - red to the right towards +100, a gentle blue to the left towards -100, so after a
// move the line shrinks to nothing and grows back the other way as the music ramps there.
import React, { useEffect, useRef, useState } from 'react';

const COMMIT_MS = 250;
const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;
// the cap lands on the middle (the preset as made) when it is close to it
const snap = (v) => (Math.abs(v) <= 0.04 ? 0 : v);

/** `push`: settings.push; `now`: the level playing now; `onChange(push)`. */
export default function IntensityFader({ push, now = 0, onChange }) {
    const programmed = push.program.mode !== 'off';
    const [local, setLocal] = useState(push.level), timer = useRef(null);
    useEffect(() => { if (!timer.current) setLocal(push.level); }, [push.level]);
    useEffect(() => () => clearTimeout(timer.current), []);
    const move = (level) => {
        setLocal(level);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; onChange({ ...push, level }); }, COMMIT_MS);
    };
    const shown = Math.max(-1, Math.min(1, now)), lit = Math.abs(shown);
    return (
        <label className={`gen-intensity${programmed ? ' is-off' : ''}`} style={{ '--tone': local > 0 ? 'var(--gen-intensity-hot)' : local < 0 ? 'var(--gen-intensity-cool)' : 'var(--gen-muted)' }}
            title={programmed ? 'A program is setting the intensity (Intensity panel)' : 'How intense the music is, from very calm (left) to overdrive (right). Drag it and the music ramps there. Double-click for the preset as made.'}>
            <output>{pct(shown)}</output>
            <span className="gen-intensity-fader">
                <span className="gen-intensity-meter" aria-hidden="true">
                    <i className="up" style={{ width: `${Math.max(0, shown) * 50}%`, opacity: shown > 0 ? 0.55 + 0.45 * lit : 0 }} />
                    <i className="down" style={{ width: `${Math.max(0, -shown) * 50}%`, opacity: shown < 0 ? 0.5 + 0.4 * lit : 0 }} />
                    <b />
                </span>
                <input type="range" aria-label="Intensity" aria-valuetext={`${pct(local)}, now ${pct(shown)}`} data-quick="intensity"
                    min={-1} max={1} step={0.05} value={local} disabled={programmed}
                    onChange={(e) => move(snap(Number(e.target.value)))} onDoubleClick={() => move(0)} />
            </span>
            <span className="gen-intensity-name">Intensity</span>
        </label>
    );
}
