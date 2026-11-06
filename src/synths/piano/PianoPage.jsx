import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Desk from '../ui/Desk';
import useDraggable from '../ui/useDraggable';
import StageKeys from '../ui/StageKeys';
import SetupPopover from '../ui/SetupPopover';
import { AutoPlay, ChordChips } from '../ui/PhraseDock';
import { createPhraseRunner, phraseForCode } from '../ui/phraseRunner';
import { SETUP, SETUP_KEY, CURVES, computerKeyVelocity } from '../ui/setup';
import { Fader, Ribbon, TouchPad } from '../ui/controls';
import { OledPicker, PickButtons, PresetKnob } from '../diy/DiyControls';
import Scope from '../ui/Scope';
import RackCompact from '../effects/RackCompact';
import { createRack } from '../effects/graph';
import { createOutputMonitor } from '../effects/outputMonitor';
import { RACK_PARAMS, cleanRack, splitRackEdits } from '../effects/params';
import { leanChain } from '../effects/rackParts';
import { Window } from '../diy/LabPanels';
import { defineParams } from '../params';
import { LabMidi, bindLabKeyboard, mapVelocity } from '../../labs/input';
import { recalledContext } from '../../app/auditionPhrases';
import { buildContext, DEFAULT_HARMONY } from '../../app/harmonyContext';
import { load, save } from '../storage';
import { useSaved } from '../useSaved';
import { LINES, lineSeconds } from './lines';
import PianoPlayer, { renderOptions, dynamics } from './player';
import { pianoBuffer } from '../../app/engine/piano';
import { CALIBRATED_LABELS, preloadCalibratedPiano, isCalibratedPiano } from '../../app/engine/calibratedPiano';
import { TEMPERAMENTS, TONICS, temperamentOffsets, tunedFrequency } from '../../app/engine/temperament';
import { tuningOptions } from './player';
import library from '../../library/voices.json';

// Grand & Upright: a single box of faders on the same desk as the other synths. The sounds live in the ribbon (a knob, a
// display and the grid), the model is a display and a knob of its own, the temperament is a Tuning window and the input
// monitor a gadget. MIDI, the keybed and the computer keys' strength are in Setup, like every synth; the phrases and the
// test lines play from the keybed.
const KEY = 'synths:piano';
const DEFAULTS = { pianoType: 'grand', pianoDecay: 2.5, pianoBrightness: .5, pianoHammer: .4, pianoUnison: .3, pianoResonance: .5, pianoWear: 0, pianoSeed: 11,
    pianoTemperament: 'equal', pianoTonic: 'C', pianoA4: 440, pianoStretch: 0 };
// the front page's piano-model sounds that sit among its keys (Soft Keys, Felt Keys, the Starmap pianos) are pianos here too
const PIANO_KEYS = Object.fromEntries(Object.entries(library['Keys & plucks']).filter(([, p]) => p.stringModel === 'piano'));
const PRESETS = Object.fromEntries(Object.entries({ ...library.Pianos, ...PIANO_KEYS }).map(([name, p]) => [name, Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, p[k] ?? DEFAULTS[k]]))]));
const TYPES = { grand: 'Grand', felted: 'Felted', upright: 'Upright', ambient: 'Ambient', glass: 'Glass grand', drama: 'Soft drama', soft: 'Soft piano', subdued: 'Subdued', concert: 'Concert grand', ...CALIBRATED_LABELS };
const TYPE_KEYS = Object.keys(TYPES);
// the display shows the family on its top row, so a measured model drops its prefix: Measured / The Grand
const shortModel = (type) => TYPES[type].replace(/^Measured: /, '');
// the rack has no instrument-space controls here: the piano has its own room
const RACK_SYNTH = { id: 'piano', params: { BY_KEY: {} } };
// the piano starts with a reverb and an echo in its chain (a new key, so the choice of an earlier visit does not hide them)
const RACK_KEY = 'synths:piano:rack-2';
const PIANO_RACK = { ...cleanRack(), 'effects.reverb': .2, 'effects.decay': 3.2, 'effects.size': .6, 'effects.delay': .12, 'effects.delayMs': 420, 'effects.feedback': .32, 'effects.tone': 3800, 'effects.pingPong': 1 };

// The faders, as parameter specs like the other synths' (the Room is not a piano setting but the page's own)
const SPECS = defineParams([
    ['pianoDecay', 0, 'Decay', .5, 5, 2.5, 's', 'lin'], ['pianoResonance', 1, 'Resonance', 0, 1, .5, '%', 'lin'], ['pianoWear', 2, 'Age', 0, 1, 0, '%', 'lin'],
    ['pianoBrightness', 3, 'Brightness', 0, 1, .5, '%', 'lin'], ['pianoHammer', 4, 'Hammer', 0, 1, .4, '%', 'lin'], ['pianoUnison', 5, 'Unison', 0, 1, .3, '%', 'lin'],
    ['room', 6, 'Room', 0, 1, .2, '%', 'lin'], ['pianoA4', 7, 'A4', 400, 460, 440, 'decimal', 'lin'], ['pianoStretch', 8, 'Stretch', 0, 1.5, 0, 'decimal', 'lin'],
]).BY_KEY;

// The sounds are sorted by what they model, each with its own colour (the ribbon's display and the sound grid use them)
const CATEGORIES = [
    { id: 'grand', label: 'Grands', blurb: 'Concert and studio grands, and the historical tunings', colour: '#e0a526' },
    { id: 'upright', label: 'Uprights', blurb: 'Old and tired uprights', colour: '#c8792b' },
    { id: 'soft', label: 'Soft & ambient', blurb: 'Felted, ambient, glass and subdued', colour: '#7fb3d9' },
    { id: 'measured', label: 'Measured', blurb: 'Rebuilt from measurements of real pianos', colour: '#5fae7a' },
];
const categoryOf = (type) => (isCalibratedPiano(type) ? 'measured' : type === 'upright' ? 'upright' : ['grand', 'concert'].includes(type) ? 'grand' : 'soft');
const SYNTH = { id: 'piano', name: 'Grand & Upright', categories: CATEGORIES };
const SOUNDS = Object.entries(PRESETS).map(([name, p]) => {
    const category = categoryOf(p.pianoType);
    return { name, category, colour: CATEGORIES.find((c) => c.id === category).colour, styles: [TYPES[p.pianoType], ...(p.pianoTemperament !== 'equal' ? [TEMPERAMENTS[p.pianoTemperament]] : [])], note: TYPES[p.pianoType] + (p.pianoTemperament !== 'equal' ? ' · ' + TEMPERAMENTS[p.pianoTemperament] : '') };
});

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (n) => NAMES[n % 12] + (Math.floor(n / 12) - 1);
const GADGETS = { tuning: 'synths:piano:tuning-open', input: 'synths:piano:input-open' };

export default function PianoPage() {
    const saved = useMemo(() => load(KEY, {}), []);
    const [name, setName] = useState(saved.name ?? 'Concert Grand');
    const [settings, setSettings] = useState({ ...DEFAULTS, ...PRESETS[saved.name ?? 'Concert Grand'], ...saved.settings });
    const [room, setRoom] = useState(saved.room ?? .2);
    const [audio, setAudio] = useState({ state: 'off', message: '' });
    const [held, setHeld] = useState([]);
    const [pedal, setPedal] = useState(false);
    const [last, setLast] = useState(null);
    const [out, setOut] = useState({ peak: 0, hold: 0, clips: 0 });
    const [midi, setMidi] = useState({ inputs: [], status: 'Not connected.' });
    const [showSetup, setShowSetup] = useState(false);
    // the effects chain and the scope sit on the player's output, as on every synth
    const [outboard, setOutboard] = useState(() => { const stored = load(RACK_KEY, null); const rack = RACK_PARAMS.sanitize({ ...PIANO_RACK, ...stored }); return stored ? rack : { ...rack, 'master.chain': leanChain(rack) }; });
    const rackValues = useMemo(() => RACK_PARAMS.sanitize({ ...cleanRack(), ...outboard }), [outboard]);
    const rackRef = useRef(rackValues); rackRef.current = rackValues;
    const [showEffects, setShowEffects] = useState(() => !!load('synths:piano:effects-open', true));
    const [showScope, setShowScope] = useState(() => !!load('synths:piano:scope-open', true));
    const [rackStats, setRackStats] = useState({ peak: 0, reduction: 0 });
    const engine = useRef(null);
    const toggleEffects = () => setShowEffects((v) => { save('synths:piano:effects-open', !v); return !v; });
    const toggleScope = () => setShowScope((v) => { save('synths:piano:scope-open', !v); return !v; });
    const changeRack = useCallback((changes) => { const { extra } = splitRackEdits(RACK_SYNTH, changes); if (Object.keys(extra).length) setOutboard((p) => ({ ...p, ...extra })); }, []);
    useSaved(RACK_KEY, outboard);
    useEffect(() => { engine.current?.setRack(rackValues); }, [rackValues]);
    // the setup is shared by every synth on this device (keybed, MIDI input, the computer keys' strength)
    const [setup, setSetup] = useState(() => ({ ...SETUP, ...load(SETUP_KEY, {}) }));
    const setupRef = useRef(setup); setupRef.current = setup;
    useEffect(() => { save(SETUP_KEY, { ...load(SETUP_KEY, {}), ...setup }); }, [setup]);
    const [open, setOpen] = useState(() => ({ tuning: load(GADGETS.tuning, true), input: load(GADGETS.input, true) }));
    const toggleGadget = (id) => setOpen((o) => { const next = { ...o, [id]: !o[id] }; save(GADGETS[id], next[id]); return next; });
    const player = useRef(null), midiRef = useRef(null), live = useRef({ settings, room });
    live.current = { settings, room };
    const keysDrag = useDraggable('synths:keys-pos', { x: 0, y: 10 }), rigDrag = useDraggable('synths:piano:rig-pos');

    // the key and chords the phrases play over, and the phrases themselves: the same strip as every synth's keybed
    const [audition, setAudition] = useState(() => ({ follow: true, ...DEFAULT_HARMONY, ...load('synths:audition', {}) }));
    const context = useMemo(() => (audition.follow ? recalledContext() : buildContext(audition)), [audition]);
    const contextRef = useRef(context); contextRef.current = context;
    const changeAudition = (next) => { setAudition(next); save('synths:audition', next); };
    const [chordPick, setChordPick] = useState(0);
    const [phrasePlaying, setPhrasePlaying] = useState(null);
    const performer = useMemo(() => ({
        down: (key, note, v) => player.current?.down(key, note, v), up: (key) => player.current?.up(key), sustain: (on) => player.current?.sustain(on),
        // render the notes of a phrase before it starts, a few at a time, so none is late
        prepare: (events) => new Promise((resolve) => {
            const p = player.current;
            if (!p) { resolve(); return; }
            const wanted = [...new Map(events.map((e) => [e.midi + ':' + Math.round(e.velocity * 7), e])).values()];
            let i = 0;
            const step = () => { if (i >= wanted.length) { resolve(); return; } p.buffer(wanted[i].midi, wanted[i].velocity); i++; setTimeout(step, 0); };
            step();
        }),
    }), []);
    // the test lines are phrases like the others: the same runner plays them, and the same pause button stops them
    const lineExtra = useMemo(() => Object.fromEntries(LINES.map((line, i) => ['line:' + i, () => {
        const beat = 60 / line.tempo, spread = setupRef.current.keyVariation;
        return {
            events: line.notes.map(([from, midi, length, velocity]) => ({ midi, time: from * beat, duration: length * beat, velocity: Math.min(127, Math.max(1, velocity + (Math.random() * 2 - 1) * spread)) / 127 })),
            pedals: line.pedal.map(([from, on]) => ({ time: from * beat, on })), seconds: lineSeconds(line) - 2,
        };
    }])), []);
    const phrases = useMemo(() => createPhraseRunner(performer, { context: () => contextRef.current, onState: setPhrasePlaying, extra: lineExtra }), [performer, lineExtra]);

    useEffect(() => { save(KEY, { name, settings, room }); }, [name, settings, room]);
    useEffect(() => { player.current?.set(settings, .9, room); }, [settings, room, audio.state]);

    // Render the keys in view ahead of being played, a note at a time, so the first chord is not late.
    useEffect(() => {
        const ctx = player.current?.context;
        if (!ctx) return undefined;
        let cancelled = false, next = setup.keysSize === 'fit' ? setup.keysLow : 36;
        const end = next + 37;
        const step = () => {
            if (cancelled || next >= end) return;
            pianoBuffer(ctx, tunedFrequency(next, tuningOptions(settings)), renderOptions(settings, 4 / 7)); next++;
            setTimeout(step, 8);
        };
        const id = setTimeout(step, 150);
        return () => { cancelled = true; clearTimeout(id); };
    }, [settings, setup.keysLow, setup.keysSize, audio.state]);

    // A measured piano is made ready (table unpacked, levels set) as soon as it is chosen, so its first note is not late.
    useEffect(() => { if (isCalibratedPiano(settings.pianoType)) preloadCalibratedPiano(settings.pianoType); }, [settings.pianoType]);

    const start = useCallback(async () => {
        if (player.current) { await player.current.context.resume(); return; }
        setAudio({ state: 'starting', message: '' });
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: setupRef.current.latency === 'balanced' ? 'balanced' : 'interactive' });
            await ctx.resume();
            const p = new PianoPlayer(ctx, () => { setHeld(p.held()); setPedal(p.pedal); }, (note) => setLast({ ...note, at: Date.now() }));
            p.set(live.current.settings, .9, live.current.room); player.current = p;
            const rack = await createRack(ctx, rackRef.current, { onError() {} });
            const monitor = await createOutputMonitor(ctx, (peak) => setRackStats((st) => (Math.abs(st.peak - peak) < .01 ? st : { ...st, peak })));
            p.route(rack.input); rack.connect(monitor.node); monitor.node.connect(ctx.destination);
            engine.current = { context: ctx, requestScope: monitor.requestScope, setRack: (v) => rack.patch(v), clearRack: () => rack.clear(), dispose() { rack.dispose(); monitor.dispose(); } };
            const m = new LabMidi({
                on: (key, note, v) => p.down(key, note, mapVelocity(v, CURVES[setupRef.current.velocity] ?? CURVES.normal)), off: (key) => p.up(key), sustain: (on) => p.sustain(on), control() {}, panic: () => p.panic(),
                onStatus: (inputs) => setMidi({ inputs, status: inputs.length ? `${inputs.length} MIDI input${inputs.length > 1 ? 's' : ''} connected.` : 'MIDI ready · plug in your piano.' }),
            });
            m.selected = setupRef.current.midiDevice; m.channel = setupRef.current.midiChannel;
            midiRef.current = m; m.connect().catch((e) => setMidi((s) => ({ ...s, status: e.message })));
            setAudio({ state: 'on', message: `${Math.round(ctx.sampleRate / 1000)} kHz` });
        } catch (error) { setAudio({ state: 'error', message: error.message }); }
    }, []);
    const connectMidi = async () => { try { await midiRef.current?.connect(); } catch (e) { setMidi((s) => ({ ...s, status: e.message })); } };
    const updateSetup = (key, value) => {
        setSetup((s) => ({ ...s, [key]: value }));
        if (key === 'midiDevice' && midiRef.current) { player.current?.panic(); midiRef.current.selected = value; }
        if (key === 'midiChannel' && midiRef.current) { player.current?.panic(); midiRef.current.channel = value; }
    };

    const playPhrase = (id) => { if (audio.state === 'on') phrases.play(id); };
    const stopAll = () => phrases.stop();

    useEffect(() => {
        const keyboard = bindLabKeyboard(window, {
            on: (key, note) => { if (player.current) player.current.down(key, note, computerKeyVelocity(setupRef.current)); },
            off: (key) => player.current?.up(key), panic: () => player.current?.panic(),
            octave: () => Math.floor(setupRef.current.keysLow / 12) - 1, shift: (d) => setSetup((s) => ({ ...s, keysLow: Math.min(84, Math.max(24, s.keysLow + 12 * d)) })),
        });
        const space = (on) => (e) => { if (e.code === 'Space' && !e.target?.closest?.('input,select,textarea,button')) { e.preventDefault(); player.current?.sustain(on); } };
        const down = space(true), up = space(false);
        // 1-5 play the phrases, Escape stops them
        const phraseKey = (e) => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.('input,select,textarea,[contenteditable=true]')) return;
            const id = phraseForCode(e.code);
            if (id) { if (player.current) { e.preventDefault(); phrases.play(id); } }
            else if (e.key === 'Escape') phrases.stop();
        };
        window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('keydown', phraseKey);
        return () => { keyboard(); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('keydown', phraseKey); phrases.stop(); };
    }, [phrases]);
    // Output level: the largest sample of each frame, held for a moment; a sample at full scale counts as a clip.
    useEffect(() => {
        if (audio.state !== 'on' || !open.input) return undefined;
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
    }, [audio.state, open.input]);
    useEffect(() => () => { midiRef.current?.dispose(); engine.current?.dispose(); engine.current = null; player.current?.close(); player.current = null; }, []);

    const choose = (sound) => { setName(sound.name); setSettings({ ...DEFAULTS, ...PRESETS[sound.name] }); };
    const change = (key, value) => { setName((n) => n.replace(/ \*$/, '') + ' *'); setSettings((s) => ({ ...s, [key]: value })); };
    const stepModel = (dir) => change('pianoType', TYPE_KEYS[(TYPE_KEYS.indexOf(settings.pianoType) + dir + TYPE_KEYS.length) % TYPE_KEYS.length]);
    const deviation = useMemo(() => temperamentOffsets(settings.pianoTemperament, settings.pianoTonic), [settings.pianoTemperament, settings.pianoTonic]);
    const current = name.replace(/ \*$/, '');
    const category = SOUNDS.find((s) => s.name === current)?.category ?? categoryOf(settings.pianoType);
    const modelCategory = CATEGORIES.find((c) => c.id === categoryOf(settings.pianoType));

    // a fader on the page's own state: the piano's settings or the room
    const fader = (key, tone, label) => {
        const spec = SPECS[key];
        return <Fader key={key} spec={spec} value={key === 'room' ? room : settings[key]} onChange={key === 'room' ? (_, v) => setRoom(v) : change} tone={tone} label={label ?? spec.label} />;
    };
    // the rack's reverb and delay, as faders in the box (a send and its character each)
    const rackFader = (key, tone, label) => <Fader key={key} spec={RACK_PARAMS.BY_KEY[key]} value={rackValues[key]} onChange={(k, v) => changeRack({ [k]: v })} tone={tone} label={label} />;
    const rackBox = (title, tone, entries) => <section className="group" key={title} style={{ '--n': entries.length }}><h3>{title}</h3><div className="group-controls">{entries.map(([key, label]) => rackFader(key, tone, label))}</div></section>;
    const box = (title, tone, keys) => <section className="group" key={title} style={{ '--n': keys.length || 1 }}><h3>{title}</h3><div className="group-controls">{keys.map((k) => fader(k, tone))}</div></section>;

    // the test lines sit with the keybed's phrases: a line is a short piece for judging the sound, and the pause button stops it
    const playingLine = phrasePlaying?.startsWith('line:') ? phrasePlaying : '';
    const linesMenu = <label className="dock-lines" title="Short pieces for judging the sound: calm, melancholic, energetic, the low register and the dynamics. The pause button stops them.">
        <span className="dock-label">Line</span>
        <select aria-label="Test line" value={playingLine} disabled={audio.state !== 'on'} onChange={(e) => (e.target.value ? phrases.play(e.target.value) : phrases.stop())}>
            <option value="">—</option>
            {LINES.map((line, i) => <option key={line.name} value={'line:' + i}>{line.name} · {line.tempo} bpm · {Math.round(lineSeconds(line) - 2)} s</option>)}
        </select>
    </label>;

    return <div className="synth instrument piano">
        <header className="synth-bar">
            <a className="back" href={import.meta.env.BASE_URL + 'synths/'} aria-label="All synths">◂</a>
            <h1><span className="brand">Grand &amp; Upright</span><small>modelled acoustic pianos</small></h1>
            <span className="patch-name" title={name}>{name}</span>
            <span className="meter"><b>{held.length}</b></span>
            {pedal && <span className="pill">Pedal</span>}
            <button type="button" aria-pressed={open.tuning} title="The tuning window: temperament, centre key, A4 and stretch" onClick={() => toggleGadget('tuning')}>Tuning</button>
            <button type="button" aria-pressed={open.input} title="The input monitor: what your keyboard sends and what leaves the page" onClick={() => toggleGadget('input')}>Input</button>
            <button type="button" aria-pressed={showEffects} aria-label="Effects rack" onClick={toggleEffects}>Effects</button>
            <button type="button" aria-pressed={showScope} onClick={toggleScope} title="Oscilloscope and spectrum">Scope</button>
            <button type="button" aria-pressed={showSetup} aria-label="Setup" title="Setup: MIDI, the keybed and the computer keys" onClick={() => setShowSetup((v) => !v)}>⚙</button>
            <button type="button" onClick={() => { stopAll(); player.current?.panic(); }} title="Silence everything (Esc)">Panic</button>
        </header>

        <Desk>
            {open.tuning && <Window id="piano-tuning" title="Tuning" home={() => ({ x: -662, y: -494 })} onClose={() => toggleGadget('tuning')} wide>
                <div className="lab-tuning pf-frame piano-tuning">
                    <div className="lab-row">
                        <PickButtons label="Temperament" options={Object.keys(TEMPERAMENTS).map((k) => TEMPERAMENTS[k].replace('Quarter-comma meantone', 'Meantone').replace(' III', ''))} titles={Object.values(TEMPERAMENTS)}
                            value={Object.keys(TEMPERAMENTS).indexOf(settings.pianoTemperament)} onChange={(i) => change('pianoTemperament', Object.keys(TEMPERAMENTS)[i])} columns={2} tone="teal" />
                        <PickButtons label="Centred on" options={TONICS.map((t) => t.replace('b', '♭').replace('#', '♯'))} titles={TONICS} value={TONICS.indexOf(settings.pianoTonic)} onChange={(i) => change('pianoTonic', TONICS[i])} columns={3} tone="teal" />
                        <div className="lab-row lab-faders">{fader('pianoA4', 'cream')}{fader('pianoStretch', 'cream')}</div>
                    </div>
                    <div className="tuning" role="img" aria-label="Deviation of each note from equal temperament, in cents">
                        {deviation.map((c, pc) => <span key={pc} className="tuning-note">
                            <i style={{ height: Math.max(1, Math.min(44, Math.abs(c) * 1.6)) + 'px' }} className={c < 0 ? 'flat' : 'sharp'} />
                            <b>{NAMES[pc]}</b><small>{c > 0 ? '+' : ''}{c.toFixed(0)}</small></span>)}
                    </div>
                </div>
            </Window>}

            {open.input && <Window id="piano-input" title="Input monitor" home={() => ({ x: -662, y: 200 })} onClose={() => toggleGadget('input')}>
                <div className="piano-input">
                    <div className="input-probe">
                        <div className="probe-note"><b>{last ? noteName(last.midi) : '—'}</b><small>{last ? `${last.source} · note ${last.midi}` : 'play a key'}</small></div>
                        <div className="probe-bar" title="Velocity as received"><i style={{ width: (last ? last.velocity * 100 : 0) + '%' }} /><span>velocity {last ? Math.round(last.velocity * 127) : '—'} / 127</span></div>
                        <div className="probe-bar" title="Gain applied to the note, from its velocity"><i style={{ width: (last ? dynamics(last.velocity) * 100 : 0) + '%' }} /><span>{last ? `${last.db.toFixed(1)} dB` : '—'}</span></div>
                        <div className={'probe-bar out' + (out.clips ? ' clipped' : '')} title="Output peak (the limiter holds it below full scale)"><i style={{ width: Math.min(100, out.peak * 100) + '%' }} /><b style={{ left: Math.min(100, out.hold * 100) + '%' }} /><span>{out.hold > 0 ? (20 * Math.log10(out.hold)).toFixed(1) + ' dBFS' : '−∞'}{out.clips ? ` · ${out.clips} clipped` : ''}</span></div>
                    </div>
                    <p className="hint">{midi.status} The bars show the velocity that arrived, the level it maps to, and what leaves the page. The MIDI input and the computer keys' velocity are in Setup (⚙).</p>
                </div>
            </Window>}

            {showScope && <Scope engine={engine} audio={audio.state} onClose={toggleScope} keyHz={() => (held.length ? 440 * 2 ** ((held[held.length - 1] - 69) / 12) : 0)} />}

            <div className="rig" ref={rigDrag.ref} style={rigDrag.style}>
                <div className="grip rig-grip" {...rigDrag.handle} role="presentation"><i /></div>
                <nav className="presets" aria-label="Sounds">
                    <OledPicker synth={SYNTH} presets={SOUNDS} mine={[]} current={current} currentCategory={category} choose={choose} remove={() => {}} />
                </nav>
                <main className="panel complete piano-panel">
                    <div className="panel-row">
                        <section className="group piano-instrument" key="instrument"><h3>Model</h3><div className="group-controls piano-model">
                            <div className="oled-picker">
                                <PresetKnob onStep={stepModel} label="Step through the piano models" />
                                <div className="oled" role="status" title="The piano model: turn the knob to change it" style={{ '--accent': modelCategory?.colour }}>
                                    <span className="oled-cat">{modelCategory?.label ?? 'Model'}</span><span className="oled-name" key={settings.pianoType} style={{ '--n': Math.min(shortModel(settings.pianoType).length, 22) }}>{shortModel(settings.pianoType)}</span>
                                </div>
                            </div>
                        </div></section>
                        {box('Body', 'amber', ['pianoDecay', 'pianoResonance', 'pianoWear'])}
                        {box('Touch', 'red', ['pianoBrightness', 'pianoHammer', 'pianoUnison'])}
                        {box('Room', 'blue', ['room'])}
                        {rackBox('Reverb', 'blue', [['effects.reverb', 'Send'], ['effects.decay', 'Decay']])}
                        {rackBox('Delay', 'teal', [['effects.delay', 'Send'], ['effects.delayMs', 'Time'], ['effects.feedback', 'Feedback']])}
                    </div>
                    {showEffects && <RackCompact tempo={0} values={rackValues} onChange={changeRack} instrumentSpecs={[]} peak={rackStats.peak} reduction={rackStats.reduction} onClose={toggleEffects}
                        tools={<button type="button" onClick={() => engine.current?.clearRack()}>Clear tails</button>} />}
                </main>
            </div>

            {showSetup && <SetupPopover midi={midi} setup={setup} updateSetup={updateSetup} connectMidi={connectMidi} audio={audio} start={start} onClose={() => setShowSetup(false)} />}

            <footer className="perform">
                <StageKeys drag={keysDrag} size={setup.keysSize} controls={setup.keysControls} low={setup.keysLow} onLow={(v) => updateSetup('keysLow', v)} onLayout={updateSetup}
                    // the wheel, ribbon and pad are here for the same keybed on every page; a piano has nothing for them to do
                    onMod={() => {}} left={<Ribbon vertical range={setup.ribbonRange} onBend={() => {}} />} right={<TouchPad onTouch={() => {}} />} notes={held} context={context} chord={chordPick}
                    onDown={(key, note, v) => player.current?.down(key, note, mapVelocity(v ?? .75, CURVES[setup.velocity] ?? CURVES.normal))} onUp={(key) => player.current?.up(key)}
                    head={<>
                        <AutoPlay playing={phrasePlaying} onPlay={playPhrase} onStop={stopAll} />
                        {linesMenu}
                        <ChordChips context={context} chordPick={chordPick} onChordPick={(i) => setChordPick((p) => (p === i ? 0 : i))} audition={audition} onAudition={changeAudition} />
                    </>} />
            </footer>
        </Desk>

        {audio.state !== 'on' && <button type="button" className={'wake ' + audio.state} onClick={start}>
            <span className="wake-title">{audio.state === 'starting' ? 'Starting…' : audio.state === 'error' ? 'Tap to try again' : 'Tap to start'}</span>
            <span className="wake-note">{audio.state === 'error' ? audio.message : 'Play your piano, the on-screen keys or the computer keyboard (A–K row).'}</span>
        </button>}
    </div>;
}
