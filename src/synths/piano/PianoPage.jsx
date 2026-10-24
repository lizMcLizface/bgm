import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keys } from '../ui/controls';
import { LabMidi, bindLabKeyboard, mapVelocity } from '../../labs/input';
import { load, save } from '../storage';
import PianoPlayer, { renderOptions, dynamics } from './player';
import { pianoBuffer } from '../../app/engine/piano';
import { TEMPERAMENTS, TONICS, temperamentOffsets, tunedFrequency } from '../../app/engine/temperament';
import { tuningOptions } from './player';
import library from '../../library/voices.json';

const KEY = 'synths:piano';
const DEFAULTS = { pianoType: 'grand', pianoDecay: 2.5, pianoBrightness: .5, pianoHammer: .4, pianoUnison: .3, pianoResonance: .5, pianoWear: 0, pianoSeed: 11,
    pianoTemperament: 'equal', pianoTonic: 'C', pianoA4: 440, pianoStretch: 0 };
const PRESETS = Object.fromEntries(Object.entries(library.Pianos).map(([name, p]) => [name, Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, p[k] ?? DEFAULTS[k]]))]));
const TYPES = { grand: 'Grand', felted: 'Felted', upright: 'Upright', ambient: 'Ambient', glass: 'Glass grand', drama: 'Soft drama', soft: 'Soft piano', subdued: 'Subdued', concert: 'Concert grand' };
// label, key, min, max, step, format
const SLIDERS = [
    ['Body', [['Decay', 'pianoDecay', .5, 5, .05, (v) => v.toFixed(1) + ' s'], ['Resonance', 'pianoResonance', 0, 1, .01], ['Age', 'pianoWear', 0, 1, .01]]],
    ['Touch', [['Brightness', 'pianoBrightness', 0, 1, .01], ['Hammer', 'pianoHammer', 0, 1, .01], ['Unison', 'pianoUnison', 0, 1, .01]]],
    ['Pitch', [['A4', 'pianoA4', 400, 460, .5, (v) => v.toFixed(1) + ' Hz'], ['Stretch', 'pianoStretch', 0, 1.5, .01]]],
];
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (n) => NAMES[n % 12] + (Math.floor(n / 12) - 1);
const percent = (v) => Math.round(v * 100) + '%';

export default function PianoPage() {
    const saved = useMemo(() => load(KEY, {}), []);
    const [name, setName] = useState(saved.name ?? 'Concert Grand');
    const [settings, setSettings] = useState({ ...DEFAULTS, ...PRESETS[saved.name ?? 'Concert Grand'], ...saved.settings });
    const [room, setRoom] = useState(saved.room ?? .2);
    const [audio, setAudio] = useState({ state: 'off', message: '' });
    const [held, setHeld] = useState([]);
    const [pedal, setPedal] = useState(false);
    const [low, setLow] = useState(saved.low ?? 48);
    const [last, setLast] = useState(null);
    const [out, setOut] = useState({ peak: 0, hold: 0, clips: 0 });
    const [midi, setMidi] = useState({ inputs: [], status: 'Not connected.' });
    const player = useRef(null), midiRef = useRef(null), live = useRef({ settings, room });
    live.current = { settings, room };

    useEffect(() => { save(KEY, { name, settings, room, low }); }, [name, settings, room, low]);
    useEffect(() => { player.current?.set(settings, .9, room); }, [settings, room, audio.state]);

    // Render the keys in view ahead of being played, a note at a time, so the first chord is not late.
    useEffect(() => {
        const context = player.current?.context;
        if (!context) return undefined;
        let cancelled = false, next = low;
        const step = () => {
            if (cancelled || next >= low + 37) return;
            pianoBuffer(context, tunedFrequency(next, tuningOptions(settings)), renderOptions(settings, 4 / 7)); next++;
            setTimeout(step, 8);
        };
        const id = setTimeout(step, 150);
        return () => { cancelled = true; clearTimeout(id); };
    }, [settings, low, audio.state]);

    const start = useCallback(async () => {
        if (player.current) { await player.current.context.resume(); return; }
        setAudio({ state: 'starting', message: '' });
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
            await context.resume();
            const p = new PianoPlayer(context, () => { setHeld(p.held()); setPedal(p.pedal); }, (note) => setLast({ ...note, at: Date.now() }));
            p.set(live.current.settings, .9, live.current.room); player.current = p;
            const m = new LabMidi({
                on: (key, note, v) => p.down(key, note, mapVelocity(v, { curve: 1.1 })), off: (key) => p.up(key), sustain: (on) => p.sustain(on), control() {}, panic: () => p.panic(),
                onStatus: (inputs) => setMidi({ inputs, status: inputs.length ? `${inputs.length} MIDI input${inputs.length > 1 ? 's' : ''} connected.` : 'MIDI ready · plug in your piano.' }),
            });
            midiRef.current = m; m.connect().catch((e) => setMidi((s) => ({ ...s, status: e.message })));
            setAudio({ state: 'on', message: `${Math.round(context.sampleRate / 1000)} kHz` });
        } catch (error) { setAudio({ state: 'error', message: error.message }); }
    }, []);

    useEffect(() => {
        const keyboard = bindLabKeyboard(window, {
            on: (key, note) => { if (player.current) player.current.down(key, note, .72); }, off: (key) => player.current?.up(key), panic: () => player.current?.panic(),
            octave: () => Math.floor(low / 12) - 1, shift: (d) => setLow((l) => Math.min(84, Math.max(24, l + 12 * d))),
        });
        const space = (on) => (e) => { if (e.code === 'Space' && !e.target?.closest?.('input,select,textarea,button')) { e.preventDefault(); player.current?.sustain(on); } };
        const down = space(true), up = space(false);
        window.addEventListener('keydown', down); window.addEventListener('keyup', up);
        return () => { keyboard(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    }, [low]);
    // Output level: the largest sample of each frame, held for a moment; a sample at full scale counts as a clip.
    useEffect(() => {
        if (audio.state !== 'on') return undefined;
        let frame, hold = 0, holdAt = 0, clips = 0;
        const tick = () => {
            const peak = player.current?.peak() ?? 0, now = performance.now();
            if (peak >= hold || now - holdAt > 1500) { hold = peak; holdAt = now; }
            if (peak >= .999) clips++;
            setOut((o) => (Math.abs(o.peak - peak) < .004 && o.hold === hold && o.clips === clips ? o : { peak, hold, clips }));
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [audio.state]);
    useEffect(() => () => { midiRef.current?.dispose(); player.current?.close(); player.current = null; }, []);

    const choose = (preset) => { setName(preset); setSettings({ ...DEFAULTS, ...PRESETS[preset] }); };
    const change = (key, value) => { setName((n) => n.replace(/ \*$/, '') + ' *'); setSettings((s) => ({ ...s, [key]: value })); };
    const deviation = useMemo(() => temperamentOffsets(settings.pianoTemperament, settings.pianoTonic), [settings.pianoTemperament, settings.pianoTonic]);
    const current = name.replace(/ \*$/, '');

    return <div className="synth instrument piano">
        <header className="synth-bar">
            <a className="back" href={import.meta.env.BASE_URL + 'synths/'} aria-label="All synths">◂</a>
            <h1><span className="brand">Grand &amp; Upright</span><small>modelled acoustic pianos</small></h1>
            <span className="patch-name" title={name}>{name}</span>
            <span className="meter"><b>{held.length}</b></span>
            {pedal && <span className="pill">Pedal</span>}
            <button type="button" onClick={() => player.current?.panic()} title="Silence everything (Esc)">Panic</button>
        </header>
        <nav className="presets" aria-label="Sounds">
            {Object.keys(PRESETS).map((preset) => <button type="button" key={preset} className={preset === current ? 'on' : ''} onClick={() => choose(preset)}>{preset}</button>)}
        </nav>
        <main className="panel">
            <section className="group wide"><h3>Piano</h3>
                <div className="row">
                    <label>Instrument<select value={settings.pianoType} onChange={(e) => change('pianoType', e.target.value)}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <label>Room<input type="range" min="0" max="1" step=".01" value={room} onChange={(e) => setRoom(Number(e.target.value))} /><output>{percent(room)}</output></label>
                </div>
                {SLIDERS.map(([title, rows]) => <div className="row" key={title}>
                    {rows.map(([label, key, min, max, step, fmt]) => <label key={key}>{label}
                        <input type="range" min={min} max={max} step={step} value={settings[key]} onChange={(e) => change(key, Number(e.target.value))} />
                        <output>{(fmt ?? percent)(settings[key])}</output></label>)}
                </div>)}
            </section>
            <section className="group wide"><h3>Input</h3>
                <div className="input-probe">
                    <div className="probe-note"><b>{last ? noteName(last.midi) : '—'}</b><small>{last ? `${last.source} · note ${last.midi}` : 'play a key'}</small></div>
                    <div className="probe-bar" title="Velocity as received"><i style={{ width: (last ? last.velocity * 100 : 0) + '%' }} /><span>velocity {last ? Math.round(last.velocity * 127) : '—'} / 127</span></div>
                    <div className="probe-bar" title="Gain applied to the note, from its velocity"><i style={{ width: (last ? dynamics(last.velocity) * 100 : 0) + '%' }} /><span>{last ? `${last.db.toFixed(1)} dB` : '—'}</span></div>
                    <div className={'probe-bar out' + (out.clips ? ' clipped' : '')} title="Output peak (the limiter holds it below full scale)"><i style={{ width: Math.min(100, out.peak * 100) + '%' }} /><b style={{ left: Math.min(100, out.hold * 100) + '%' }} /><span>{out.hold > 0 ? (20 * Math.log10(out.hold)).toFixed(1) + ' dBFS' : '−∞'}{out.clips ? ` · ${out.clips} clipped` : ''}</span></div>
                </div>
                <p className="hint">Velocity is the 0–127 value your keyboard sent (computer keys always send 92). The second bar is the level that velocity maps to; the third is what leaves the page.</p>
            </section>
            <section className="group wide"><h3>Temperament</h3>
                <div className="row">
                    <label>Tuning<select value={settings.pianoTemperament} onChange={(e) => change('pianoTemperament', e.target.value)}>{Object.entries(TEMPERAMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    <label>Centred on<select value={settings.pianoTonic} onChange={(e) => change('pianoTonic', e.target.value)}>{TONICS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                </div>
                <p className="hint">Cents from equal temperament for each note, around the centre key. Pure intervals sound smoother in the keys near the centre and rougher far from it; they will also drift from any equal-tempered instrument playing along.</p>
                <div className="tuning" role="img" aria-label="Deviation of each note from equal temperament">
                    {deviation.map((c, pc) => <span key={pc} className="tuning-note">
                        <i style={{ height: Math.max(1, Math.min(44, Math.abs(c) * 1.6)) + 'px' }} className={c < 0 ? 'flat' : 'sharp'} />
                        <b>{NAMES[pc]}</b><small>{c > 0 ? '+' : ''}{c.toFixed(0)}</small></span>)}
                </div>
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
                <Keys low={low} count={37} active={held} onDown={(key, note, v) => player.current?.down(key, note, mapVelocity(v, { curve: 1.1 }))} onUp={(key) => player.current?.up(key)} />
                <button type="button" className="octave" aria-label="Keys up an octave" onClick={() => setLow((l) => Math.min(84, l + 12))}>+</button>
            </div>
        </footer>
        {audio.state !== 'on' && <button type="button" className={'wake ' + audio.state} onClick={start}>
            <span className="wake-title">{audio.state === 'starting' ? 'Starting…' : audio.state === 'error' ? 'Tap to try again' : 'Tap to start'}</span>
            <span className="wake-note">{audio.state === 'error' ? audio.message : 'Play your piano, the on-screen keys or the computer keyboard (A–K row).'}</span>
        </button>}
    </div>;
}
