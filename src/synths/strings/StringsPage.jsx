import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keys } from '../ui/controls';
import { LabMidi, bindLabKeyboard, mapVelocity } from '../../labs/input';
import { load, save } from '../storage';
import Instrument from '../../app/engine/Instrument';
import PRESET_DEFAULTS from '../../app/engine/presetDefaults';
import { noiseReady } from '../../nodes/noiseGenerator';
import { bitCrusherReady } from '../../nodes/bitcrusher';
import library from '../../library/voices.json';

const KEY = 'synths:strings';
// The measured string sounds, from the library's "Measured" category (tuned against recordings).
const NAMES = ['Measured Violin', 'Measured Cello', 'Measured String Section', 'Measured Chamber Strings', 'Measured Epic Strings', 'Measured Cello Pizzicato'];
const PRESETS = Object.fromEntries(NAMES.filter((n) => library.Measured?.[n]).map((n) => [n, library.Measured[n]]));
const FIRST = Object.keys(PRESETS)[0];

// [label, preset key, min, max, step, format, scale]
const BOWED = [
    ['Bow', [['Start level', 'gainHoldLevel', 0.05, 1, .01, 'percent'], ['Swell', 'gainDecay', .05, 4, .05, 'seconds'], ['Settle level', 'gainSustain', .2, 1, .01, 'percent'], ['Release', 'gainRelease', .1, 3, .05, 'seconds']]],
    ['Tone', [['Brightness', 'filterFreq', 600, 8000, 50, 'hertz'], ['Bow noise', 'noiseMix', 0, .2, .005, 'percent']]],
    ['Life', [['Vibrato depth', 'vibratoDepth', 0, 30, .5, 'cents'], ['Vibrato rate', 'vibratoRate', 1, 8, .1, 'hertz'], ['Ensemble spread', 'detuneSpread', 0, 30, .5, 'cents']]],
];
const PLUCKED = [
    ['Pluck', [['Decay', 'stringDecay', .15, 5, .05, 'seconds'], ['Damping', 'stringDamping', 0, 1, .01, 'percent'], ['Position', 'stringPosition', .05, .45, .01, 'percent'], ['Body', 'stringBody', 0, 1, .01, 'percent']]],
    ['Release', [['Release', 'gainRelease', .05, 2, .05, 'seconds']]],
];
const FORMAT = { percent: (v) => Math.round(v * 100) + '%', seconds: (v) => v.toFixed(2) + ' s', hertz: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + ' kHz' : Math.round(v) + ' Hz'), cents: (v) => v.toFixed(1) + ' c' };
// Frequencies read better on a logarithmic slider.
const toSlider = (key, v, min, max) => (key === 'filterFreq' ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
const fromSlider = (key, t, min, max) => (key === 'filterFreq' ? min * (max / min) ** t : min + t * (max - min));

const ready = async (inst) => { const deadline = Date.now() + 7000; while (!inst.reverb.settled && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20)); };

export default function StringsPage() {
    const saved = useMemo(() => load(KEY, {}), []);
    const [name, setName] = useState(PRESETS[saved.name] ? saved.name : FIRST);
    const [edits, setEdits] = useState(saved.edits ?? {});
    const [audio, setAudio] = useState({ state: 'off', message: '' });
    const [held, setHeld] = useState([]);
    const [low, setLow] = useState(saved.low ?? 48);
    const [midi, setMidi] = useState({ inputs: [], status: 'Not connected.' });
    const engine = useRef(null), midiRef = useRef(null), notes = useRef(new Map()), pedal = useRef(false), sustained = useRef(new Set());

    const preset = useMemo(() => ({ ...PRESETS[name], ...edits }), [name, edits]);
    const plucked = preset.stringModel === 'plucked';
    useEffect(() => { save(KEY, { name, edits, low }); }, [name, edits, low]);
    useEffect(() => { engine.current?.applyPreset(preset); }, [preset, audio.state]);

    const refresh = () => setHeld([...notes.current.values()].map((n) => n.midi));
    const release = (note) => { engine.current?.stopNote(note.id); };
    const down = useCallback((key, midiNote, velocity = .7) => {
        const inst = engine.current;
        if (!inst) return;
        const previous = notes.current.get(key);
        if (previous) release(previous);
        notes.current.set(key, { id: inst.startNote(midiNote, Math.min(1, Math.max(.05, velocity))), midi: midiNote });
        refresh();
    }, []);
    const up = useCallback((key) => {
        const note = notes.current.get(key);
        if (!note) return;
        notes.current.delete(key);
        if (pedal.current) sustained.current.add(note); else release(note);
        refresh();
    }, []);
    const sustain = useCallback((on) => {
        pedal.current = on;
        if (!on) { for (const n of sustained.current) release(n); sustained.current.clear(); }
    }, []);
    const panic = useCallback(() => {
        for (const n of [...notes.current.values(), ...sustained.current]) release(n);
        notes.current.clear(); sustained.current.clear(); engine.current?.silence(); refresh();
    }, []);

    const start = useCallback(async () => {
        if (engine.current) { await engine.current.AC.resume(); return; }
        setAudio({ state: 'starting', message: '' });
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
            await context.resume();
            // Build the instrument bare, wait for the noise worklets, bit crusher and room to be ready, then apply
            // the sound to the running graph, the way a preset change does. (Applying it inside the constructor,
            // before any of that is ready, left some startups with notes that blipped until a sound was switched.)
            const inst = new Instrument({ polyphony: 10, preset: {}, context });
            inst.connect(context.destination);
            await Promise.all([noiseReady(context), bitCrusherReady(context), ready(inst)]);
            inst.applyPreset({ ...PRESETS[name], ...edits });
            await ready(inst);
            engine.current = inst;
            const m = new LabMidi({
                on: (key, note, v) => down(key, note, mapVelocity(v, { curve: 1.1 })), off: (key) => up(key), sustain, control() {}, panic,
                onStatus: (inputs) => setMidi({ inputs, status: inputs.length ? `${inputs.length} MIDI input${inputs.length > 1 ? 's' : ''} connected.` : 'MIDI ready · plug in your piano.' }),
            });
            midiRef.current = m; m.connect().catch((e) => setMidi((s) => ({ ...s, status: e.message })));
            setAudio({ state: 'on', message: `${Math.round(context.sampleRate / 1000)} kHz` });
        } catch (error) { setAudio({ state: 'error', message: error.message }); }
    }, [name, edits, down, up, sustain, panic]);

    useEffect(() => {
        const keyboard = bindLabKeyboard(window, {
            on: (key, note) => down(key, note, .72), off: (key) => up(key), panic,
            octave: () => Math.floor(low / 12) - 1, shift: (d) => setLow((l) => Math.min(84, Math.max(24, l + 12 * d))),
        });
        const space = (on) => (e) => { if (e.code === 'Space' && !e.target?.closest?.('input,select,textarea,button')) { e.preventDefault(); sustain(on); } };
        const spaceDown = space(true), spaceUp = space(false);
        window.addEventListener('keydown', spaceDown); window.addEventListener('keyup', spaceUp);
        return () => { keyboard(); window.removeEventListener('keydown', spaceDown); window.removeEventListener('keyup', spaceUp); };
    }, [low, down, up, sustain, panic]);
    useEffect(() => () => { midiRef.current?.dispose(); engine.current?.dispose?.(); engine.current = null; }, []);

    const choose = (preset) => { setName(preset); setEdits({}); };
    const change = (key, value) => setEdits((e) => ({ ...e, [key]: value }));
    const groups = plucked ? PLUCKED : BOWED;
    const value = (key) => preset[key] ?? PRESET_DEFAULTS[key];
    const edited = Object.keys(edits).length > 0;

    return <div className="synth instrument strings">
        <header className="synth-bar">
            <a className="back" href={import.meta.env.BASE_URL + 'synths/'} aria-label="All synths">◂</a>
            <h1><span className="brand">Strings</span><small>measured bowed and plucked strings</small></h1>
            <span className="patch-name" title={name}>{name.replace('Measured ', '')}{edited ? ' *' : ''}</span>
            <span className="meter"><b>{held.length}</b></span>
            <button type="button" onClick={panic} title="Silence everything (Esc)">Panic</button>
        </header>
        <nav className="presets" aria-label="Sounds">
            {Object.keys(PRESETS).map((n) => <button type="button" key={n} className={n === name ? 'on' : ''} onClick={() => choose(n)}>{n.replace('Measured ', '')}</button>)}
        </nav>
        <main className="panel">
            <section className="group wide"><h3>{plucked ? 'Plucked string' : 'Bowed string'}</h3>
                {groups.map(([title, rows]) => <div className="row" key={title}>
                    {rows.map(([label, key, min, max, step, kind]) => <label key={key}>{label}
                        <input type="range" min="0" max="1" step=".001" value={toSlider(key, value(key), min, max)}
                            onChange={(e) => change(key, Math.round(fromSlider(key, Number(e.target.value), min, max) / step) * step)} />
                        <output>{FORMAT[kind](value(key))}</output></label>)}
                </div>)}
                {edited && <div className="row"><button type="button" onClick={() => setEdits({})}>Reset to measured</button></div>}
                <p className="hint">{plucked
                    ? 'A plucked string through a bass body. Measured against a sampled cello pizzicato: one dark layer, decaying faster the higher the note.'
                    : 'A sawtooth string through a low-pass, with a slow bow swell after a quick first sound, vibrato and, for sections, detuned players. Measured against sampled violin, cello and ensembles.'}</p>
            </section>
            <section className="group wide"><h3>MIDI piano</h3>
                <p>{midi.status}</p>
                <div className="row"><button type="button" onClick={() => midiRef.current?.connect().catch((e) => setMidi((s) => ({ ...s, status: e.message })))}>Connect MIDI</button></div>
                <p className="hint">Computer keys A–K play the keys, Z/X shift the octave, Space is the sustain pedal (so is a MIDI pedal).</p>
            </section>
        </main>
        <footer className="perform">
            <div className="keys-row">
                <button type="button" className="octave" aria-label="Keys down an octave" onClick={() => setLow((l) => Math.max(24, l - 12))}>−</button>
                <Keys low={low} count={37} active={held} onDown={(key, note, v) => down(key, note, mapVelocity(v, { curve: 1.1 }))} onUp={up} />
                <button type="button" className="octave" aria-label="Keys up an octave" onClick={() => setLow((l) => Math.min(84, l + 12))}>+</button>
            </div>
        </footer>
        {audio.state !== 'on' && <button type="button" className={'wake ' + audio.state} onClick={start}>
            <span className="wake-title">{audio.state === 'starting' ? 'Starting…' : audio.state === 'error' ? 'Tap to try again' : 'Tap to start'}</span>
            <span className="wake-note">{audio.state === 'error' ? audio.message : 'Play your piano, the on-screen keys or the computer keyboard (A–K row).'}</span>
        </button>}
    </div>;
}
