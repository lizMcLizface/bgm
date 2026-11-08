import React from 'react';
import {voiceColour} from './kits';

// Per-step values for one hit (the OXI's parameter locks) and the selected voice's own loop length. Opened with the Edit
// tool: click a lit step. Only the sequencer core plays these; the built-in clock ignores them (the note says so).

export const DEFAULTS = { velocity: 1, prob: 1, ratchet: 1, nudge: 0, tune: 0, decay: 0 };
export const CONDITIONS = [['', 'every loop'], ['1:2', '1st of 2'], ['2:2', '2nd of 2'], ['1:3', '1st of 3'], ['2:3', '2nd of 3'], ['3:3', '3rd of 3'], ['1:4', '1st of 4'], ['2:4', '2nd of 4'], ['3:4', '3rd of 4'], ['4:4', '4th of 4'], ['fill', 'only in a fill'], ['not-fill', 'not in a fill'], ['fixed', 'fixed (kept by generators)']];

function Range({ label, value, min, max, step, onChange, format, home }) {
    const p = (value - min) / (max - min);
    return (
        <label className="dm-field se-field">
            <span>{label} <output>{format(value)}</output></span>
            <input type="range" className="dm-slider" min={min} max={max} step={step} value={value} style={{ '--p': p }} aria-label={label}
                onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(home ?? DEFAULTS[label === 'Chance' ? 'prob' : label.toLowerCase()])} />
        </label>
    );
}

export default function StepEditor({ kit, picked, lock, trackLength, patternLength, coreOn, onLock, onTrackLength,showTrackLength=true,supportsPerHit=true,defaultVelocity=1 }) {
    const [key, short, long] = kit.tracks[Math.min(picked.t, kit.tracks.length - 1)];
    const defaults = { ...DEFAULTS, velocity: defaultVelocity };
    const value = { ...defaults, ...(lock ?? {}) };
    const set = (name) => (v) => {
        const next = { ...(lock ?? {}), [name]: v };
        if (next[name] === defaults[name] || next[name] === undefined) delete next[name];
        onLock(picked.t, picked.s, Object.keys(next).length ? next : null);
    };
    const lengths = Array.from({ length: 15 }, (_, i) => i + 1);
    return (
        <div className="step-editor" style={{'--voice':voiceColour(key,kit.id)}} role="group" aria-label="Step editor">
            <h3><strong>{short}</strong> {long}{picked.s >= 0 && <> · step {picked.s + 1}</>}</h3>
            {picked.s >= 0 ? (
                <div className="se-fields">
                    <Range label="Velocity" value={value.velocity} home={defaultVelocity} min={0.05} max={1} step={0.01} onChange={set('velocity')} format={(v) => Math.round(v * 100) + '%'} />
                    <Range label="Chance" value={value.prob} min={0} max={1} step={0.05} onChange={set('prob')} format={(v) => Math.round(v * 100) + '%'} />
                    <Range label="Ratchet" value={value.ratchet} min={1} max={4} step={1} onChange={set('ratchet')} format={(v) => '×' + v} />
                    <Range label="Nudge" value={value.nudge} min={-0.5} max={0.5} step={0.05} onChange={set('nudge')} format={(v) => (v > 0 ? '+' : '') + Math.round(v * 100) + '%'} />
                    {supportsPerHit&&<Range label="Tune" value={value.tune} min={-1} max={1} step={0.05} onChange={set('tune')} format={(v) => (v > 0 ? '+' : '') + Math.round(v * 100) + '%'} />}
                    {supportsPerHit&&<Range label="Decay" value={value.decay} min={-1} max={1} step={0.05} onChange={set('decay')} format={(v) => (v > 0 ? '+' : '') + Math.round(v * 100) + '%'} />}
                    <label className="dm-field se-field"><span>Condition</span>
                        <select aria-label="Condition" value={lock?.cond ?? ''} onChange={(e) => set('cond')(e.target.value || undefined)}>{CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    </label>
                    <button type="button" className="se-reset" disabled={!lock} onClick={() => onLock(picked.t, picked.s, null)}>Reset step</button>
                </div>
            ) : <p className="se-hint">Click a lit step to edit it, or set this voice's loop length.</p>}
            {showTrackLength&&<label className="se-length">Loop length
                <select aria-label={`${long} loop length`} value={trackLength ?? 0} onChange={(e) => onTrackLength(picked.t, Number(e.target.value) || null)}>
                    <option value="0">with the pattern ({patternLength})</option>
                    {lengths.map((n) => <option key={n} value={n}>{n} steps</option>)}
                </select>
            </label>}
            {!coreOn && <p className="se-note" role="status">These are played by the core clock; turn it on in the transport.</p>}
        </div>
    );
}
