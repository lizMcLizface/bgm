// Intensity (settings.push, composition/push.js): very calm .. overdrive by hand, or a program that moves it over
// the music's own time - effort and recovery intervals with a steady ramp between them, or one long ramp.
// Each change re-plans the bars ahead, so the sliders commit a moment after they stop.
import React, { useEffect, useRef, useState } from 'react';
import { PUSH_MODES, pushLabel } from './composition/push';

const COMMIT_MS = 250;
const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;

function Slider({ label, value, min, max, step, onChange, format = String }) {
    const [local, setLocal] = useState(value), timer = useRef(null);
    useEffect(() => { if (!timer.current) setLocal(value); }, [value]);
    useEffect(() => () => clearTimeout(timer.current), []);
    const move = (v) => {
        setLocal(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; onChange(v); }, COMMIT_MS);
    };
    return (
        <label className="gen-field"><span>{`${label} ${format(local)}`}</span>
            <input type="range" min={min} max={max} step={step} value={local} onChange={(e) => move(Number(e.target.value))} /></label>
    );
}

/** `now`: the level playing now (generator.nowPlaying().pushLevel), shown while a program moves it. */
export default function IntensityPanel({ push, now = 0, onChange }) {
    const program = push.program, mode = program.mode, programmed = mode !== 'off';
    const setProgram = (patch) => onChange({ ...push, program: { ...program, ...patch } });
    const shown = programmed ? now : push.level;
    return (
        <section className="gen-panel intensity-panel" data-tour="intensity">
            <h2 className="gen-panel-title">Intensity</h2>
            <p className="gen-hint">Much stronger than the feel pad: the tempo, drums, bass, chords and lead all move, from very calm to overdrive.
                {programmed ? ' A program is setting it.' : ' Changes take effect over the next bars.'}</p>
            <div className="gen-field"><span>{`Now: ${pushLabel(shown)} (${pct(shown)})`}</span>
                <progress max="2" value={shown + 1} aria-label="Intensity now" style={{ width: '100%' }} /></div>
            <Slider label="Level" value={push.level} min={-1} max={1} step={0.05} format={pct} onChange={(level) => onChange({ ...push, level })} />
            <label className="gen-field"><span>Program</span>
                <select value={mode} onChange={(e) => setProgram({ mode: e.target.value })}>
                    {Object.entries(PUSH_MODES).map(([id, name]) => <option key={id} value={id}>{id === 'off' ? 'Off: the level above' : name}</option>)}
                </select></label>
            {programmed && (
                <>
                    <Slider label={mode === 'ramp' ? 'Start' : 'Recovery level'} value={program.low} min={-1} max={1} step={0.05} format={pct} onChange={(low) => setProgram({ low })} />
                    <Slider label={mode === 'ramp' ? 'End' : 'Effort level'} value={program.high} min={-1} max={1} step={0.05} format={pct} onChange={(high) => setProgram({ high })} />
                    {mode === 'intervals' ? (
                        <>
                            <Slider label="Recovery" value={program.lowSeconds} min={5} max={300} step={5} format={(v) => `${v} s`} onChange={(lowSeconds) => setProgram({ lowSeconds })} />
                            <Slider label="Effort" value={program.highSeconds} min={5} max={300} step={5} format={(v) => `${v} s`} onChange={(highSeconds) => setProgram({ highSeconds })} />
                            <Slider label="Ramp between" value={program.rampSeconds} min={0} max={60} step={1} format={(v) => (v ? `${v} s` : 'none: a switch')} onChange={(rampSeconds) => setProgram({ rampSeconds })} />
                        </>
                    ) : (
                        <Slider label="Over" value={program.minutes} min={1} max={60} step={1} format={(v) => `${v} min`} onChange={(minutes) => setProgram({ minutes })} />
                    )}
                </>
            )}
        </section>
    );
}
