import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Desk from '../ui/Desk';
import useDraggable from '../ui/useDraggable';
import StageKeys from '../ui/StageKeys';
import SetupPopover from '../ui/SetupPopover';
import { AutoPlay, ChordChips } from '../ui/PhraseDock';
import { createPhraseRunner, phraseForCode } from '../ui/phraseRunner';
import { SETUP, SETUP_KEY, CURVES, computerKeyVelocity } from '../ui/setup';
import { Fader, Ribbon, TouchPad } from '../ui/controls';
import { OledPicker } from '../diy/DiyControls';
import Scope from '../ui/Scope';
import RackCompact from '../effects/RackCompact';
import { createRack } from '../effects/graph';
import { createOutputMonitor } from '../effects/outputMonitor';
import { RACK_PARAMS, cleanRack, splitRackEdits } from '../effects/params';
import { leanChain } from '../effects/rackParts';
import { nativeRackBase } from '../effects/nativeRacks';
import { Window } from '../diy/LabPanels';
import { defineParams } from '../params';
import { LabMidi, bindLabKeyboard, mapVelocity } from '../../labs/input';
import { recalledContext } from '../../app/auditionPhrases';
import { buildContext, DEFAULT_HARMONY } from '../../app/harmonyContext';
import { load, save } from '../storage';
import { useSaved } from '../useSaved';
import IowaPlayer from '../../app/engine/iowaModel/player';
import { PATCHES } from '../../app/engine/iowaModel/patches';
import { pitchRange } from '../../app/engine/iowaModel/model';

// Measured instruments: a sample box in the same case as the grand and upright. The instruments are in the ribbon (a knob, a display and
// the grid, sorted by family), the voice, room and level are faders, the reverb and echo are the rack's, and MIDI, the keybed and the
// computer keys' strength are in Setup like every synth. The phrases play from the keybed.
const KEY = 'synths:iowa';
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (n) => NAMES[n % 12] + (Math.floor(n / 12) - 1);
const GADGETS = { input: 'synths:iowa:input-open', about: 'synths:iowa:about-open' };

const CATEGORIES = [
    { id: 'Flutes', label: 'Flutes', blurb: 'Flutes, piccolo and the low flutes', colour: '#7fb3d9' },
    { id: 'Reeds', label: 'Reeds', blurb: 'Oboe, clarinets and bassoon', colour: '#c8792b' },
    { id: 'Saxophones', label: 'Saxophones', blurb: 'Soprano and alto, with and without vibrato', colour: '#e0a526' },
    { id: 'Brass', label: 'Brass', blurb: 'Horn, trumpet, trombones and tuba, some muted', colour: '#d9625e' },
    { id: 'Bowed', label: 'Bowed', blurb: 'Violin, viola, cello, double bass and bowed vibraphone', colour: '#a07fd0' },
    { id: 'Plucked', label: 'Plucked', blurb: 'Pizzicato strings, guitar and harp', colour: '#5fae7a' },
    { id: 'Mallets', label: 'Mallets', blurb: 'Marimba, xylophone, vibraphone, bells and crotales', colour: '#d98fb0' },
];
const SYNTH = { id: 'iowa', name: 'Measured instruments', categories: CATEGORIES };
const SOUNDS = PATCHES.map((p) => ({ id: p.id, name: p.name, category: p.family, colour: CATEGORIES.find((c) => c.id === p.family).colour, styles: [p.family], note: p.family + (p.decay ? ' · struck or plucked' : p.roll ? ' · held key rolls' : ' · held') }));

// The faders, as parameter specs like the other synths' (all of them are the page's own, not the rack's)
const SPECS = defineParams([
    ['vibrato', 0, 'Vibrato', 0, 2, 1, 'decimal', 'lin'], ['tune', 1, 'Tune ¢', -100, 100, 0, 'decimal', 'lin'],
    ['room', 2, 'Room', 0, 1, .25, '%', 'lin'], ['volume', 3, 'Volume', 0, 1.5, 1, '%', 'lin'],
]).BY_KEY;
// the rack has no instrument-space controls here, and starts with nothing in the chain: the instrument has its own room
const RACK_SYNTH = { id: 'iowa', params: { BY_KEY: {} } };
// a new key, so the choice of an earlier visit does not hide the reverb
const RACK_KEY = 'synths:iowa:rack-2';
// the recordings are dry, so the chain starts with a reverb of its own on top of the instrument's room
const IOWA_RACK = nativeRackBase('iowa');
// the recordings of the no-vibrato instruments still carry a little wobble of the player's: choosing one turns the vibrato right off
const isStraight = (p) => /no vibrato/i.test(p.name);

/** The measured instruments' own panel (its sound picker and its boxes of controls): the page draws it on its desk, and the voices of /synths/all draw the same one in a window. */
export function IowaRig({ voice, current, about = false, onAbout = () => {}, onChoose, onVoice, children }) {
    const fader = (key, tone, label) => <Fader key={key} spec={SPECS[key]} value={voice[key]} onChange={onVoice} tone={tone} label={label ?? SPECS[key].label} />;
    const box = (title, tone, keys) => <section className="group" key={title} style={{ '--n': keys.length }}><h3>{title}</h3><div className="group-controls">{keys.map((k) => fader(k, tone))}</div></section>;

    return (
        <>
                <nav className="presets" aria-label="Sounds">
                    <span className="rig-title"><a href="#about" className="learn-more" aria-pressed={about} title="Learn more: where these sounds come from" onClick={(e) => { e.preventDefault(); onAbout(); }}>Measured</a> instruments</span>
                    <OledPicker synth={SYNTH} presets={SOUNDS} mine={[]} current={current?.name} currentCategory={current?.family} choose={onChoose} remove={() => {}} />
                </nav>
                <main className="panel complete piano-panel">
                    <div className="panel-row">
                        {box('Voice', 'amber', ['vibrato', 'tune'])}
                        {box('Room', 'blue', ['room'])}
                        {box('Level', 'red', ['volume'])}
                    </div>
                    {children}
                </main>
        </>
    );
}

export default function IowaPage() {
    const saved = useMemo(() => load(KEY, {}), []);
    const [patch, setPatch] = useState(PATCHES.some((p) => p.id === saved.patch) ? saved.patch : 'flute');
    const [voice, setVoice] = useState({ vibrato: saved.vibrato ?? 1, tune: saved.tune ?? 0, room: saved.room ?? .25, volume: saved.volume ?? 1 });
    const [range, setRange] = useState(null);
    const [message, setMessage] = useState('');
    const [audio, setAudio] = useState({ state: 'off', message: '' });
    const [held, setHeld] = useState([]);
    const [pedal, setPedal] = useState(false);
    const [last, setLast] = useState(null);
    const [midi, setMidi] = useState({ inputs: [], status: 'Not connected.' });
    const [showSetup, setShowSetup] = useState(false);
    // the effects chain and the scope sit on the player's output, as on every synth
    const [outboard, setOutboard] = useState(() => { const stored = load(RACK_KEY, null); const rack = RACK_PARAMS.sanitize({ ...IOWA_RACK, ...stored }); return stored ? rack : { ...rack, 'master.chain': leanChain(rack) }; });
    const rackValues = useMemo(() => RACK_PARAMS.sanitize({ ...cleanRack(), ...outboard }), [outboard]);
    const rackRef = useRef(rackValues); rackRef.current = rackValues;
    const [showEffects, setShowEffects] = useState(() => !!load('synths:iowa:effects-open', true));
    const [showScope, setShowScope] = useState(() => !!load('synths:iowa:scope-open', true));
    const [rackStats, setRackStats] = useState({ peak: 0, reduction: 0 });
    const engine = useRef(null);
    const toggleEffects = () => setShowEffects((v) => { save('synths:iowa:effects-open', !v); return !v; });
    const toggleScope = () => setShowScope((v) => { save('synths:iowa:scope-open', !v); return !v; });
    const changeRack = useCallback((changes) => { const { extra } = splitRackEdits(RACK_SYNTH, changes); if (Object.keys(extra).length) setOutboard((p) => ({ ...p, ...extra })); }, []);
    useSaved(RACK_KEY, outboard);
    useEffect(() => { engine.current?.setRack(rackValues); }, [rackValues]);
    // the setup is shared by every synth on this device (keybed, MIDI input, the computer keys' strength)
    const [setup, setSetup] = useState(() => ({ ...SETUP, ...load(SETUP_KEY, {}) }));
    const setupRef = useRef(setup); setupRef.current = setup;
    useEffect(() => { save(SETUP_KEY, { ...load(SETUP_KEY, {}), ...setup }); }, [setup]);
    const [open, setOpen] = useState(() => ({ input: load(GADGETS.input, true), about: load(GADGETS.about, false) }));
    const toggleGadget = (id) => setOpen((o) => { const next = { ...o, [id]: !o[id] }; save(GADGETS[id], next[id]); return next; });
    const iowa = useRef(null), midiRef = useRef(null), notes = useRef(new Map()), pedalOn = useRef(false), sustained = useRef(new Set());
    const live = useRef({});
    live.current = { patch, tune: voice.tune };
    const keysDrag = useDraggable('synths:keys-pos', { x: 0, y: 10 }), rigDrag = useDraggable('synths:iowa:rig-pos');

    // the key and chords the phrases play over: the same strip as every synth's keybed
    const [audition, setAudition] = useState(() => ({ follow: true, ...DEFAULT_HARMONY, ...load('synths:audition', {}) }));
    const context = useMemo(() => (audition.follow ? recalledContext() : buildContext(audition)), [audition]);
    const contextRef = useRef(context); contextRef.current = context;
    const changeAudition = (next) => { setAudition(next); save('synths:audition', next); };
    const [chordPick, setChordPick] = useState(0);
    const [phrasePlaying, setPhrasePlaying] = useState(null);

    useEffect(() => { save(KEY, { patch, ...voice }); }, [patch, voice]);
    useEffect(() => { iowa.current?.setRoom(voice.room); }, [voice.room, audio.state]);
    useEffect(() => { iowa.current?.setVibrato(voice.vibrato); }, [voice.vibrato, audio.state]);
    useEffect(() => { if (iowa.current) iowa.current.master.gain.value = voice.volume; }, [voice.volume, audio.state]);

    const refresh = () => setHeld([...notes.current.values()].map((n) => n.midi));
    const down = useCallback(async (key, note, velocity) => {
        const player = iowa.current;
        if (!player) return;
        const entry = { midi: note, handle: null, stopped: false };
        const previous = notes.current.get(key);
        if (previous) { player.stop(previous.handle); previous.stopped = true; }
        notes.current.set(key, entry);
        refresh();
        setLast({ midi: note, velocity, source: key.startsWith('midi:') ? 'MIDI' : key.startsWith('touch:') ? 'Screen' : key.startsWith('phrase') ? 'Phrase' : 'Computer keys' });
        const { patch: id, tune } = live.current;
        entry.handle = player.start(id, note, velocity, { tune: 2 ** (tune / 1200) });
        if (!entry.handle) setMessage(`${noteName(note)} is outside this instrument's range.`); else setMessage('');
        if (entry.stopped) player.stop(entry.handle);
    }, []);
    const finish = (entry) => {
        const player = iowa.current;
        entry.stopped = true;
        player?.stop(entry.handle);
    };
    const up = useCallback((key) => {
        const entry = notes.current.get(key);
        if (!entry) return;
        notes.current.delete(key);
        if (pedalOn.current) sustained.current.add(entry); else finish(entry);
        refresh();
    }, []);
    const sustain = useCallback((on) => {
        pedalOn.current = on; setPedal(on);
        if (!on) { for (const entry of sustained.current) finish(entry); sustained.current.clear(); }
    }, []);
    const panic = useCallback(() => { iowa.current?.panic(); notes.current.clear(); sustained.current.clear(); refresh(); }, []);

    const performer = useMemo(() => ({
        down: (key, note, v) => down(key, note, v), up: (key) => up(key), sustain: (on) => sustain(on),
        // hand the notes of a phrase to the worklet before it starts, so none is late
        prepare: (events) => new Promise((resolve) => {
            const p = iowa.current;
            if (!p) { resolve(); return; }
            const wanted = [...new Map(events.map((e) => [e.midi + ':' + Math.round(e.velocity * 12), e])).values()];
            let i = 0;
            const step = () => { if (i >= wanted.length) { resolve(); return; } p.prepare(live.current.patch, wanted[i].midi, wanted[i].velocity); i++; setTimeout(step, 0); };
            step();
        }),
    }), [down, up, sustain]);
    const phrases = useMemo(() => createPhraseRunner(performer, { context: () => contextRef.current, onState: setPhrasePlaying }), [performer]);

    const loadPatch = useCallback(async (id) => {
        if (!iowa.current) return;
        const table = await iowa.current.load(id);
        if (live.current.patch !== id) return;
        const [lowest, highest] = pitchRange(table);
        setRange([lowest, highest]);
        // the keys follow the instrument when it has moved out of view
        setSetup((s) => (s.keysLow + 24 < lowest || s.keysLow > highest - 12 ? { ...s, keysLow: Math.max(24, Math.min(84, 12 * Math.round(((lowest + highest) / 2 - 18) / 12))) } : s));
    }, []);
    useEffect(() => { if (audio.state === 'on') loadPatch(patch).catch((e) => setMessage(e.message)); }, [audio.state, patch, loadPatch]);
    // Prepare the keys in view at the computer keys' strength, so the first press of each sounds at once.
    const strength = (setup.keyVelocity ?? 95) / 127;
    useEffect(() => {
        if (audio.state !== 'on' || !range) return undefined;
        const from = setup.keysSize === 'fit' ? setup.keysLow : 36;
        const order = Array.from({ length: 37 }, (_, i) => from + i).filter((n) => n >= range[0] && n <= range[1]);
        let at = 0;
        const timer = setInterval(() => { if (at >= order.length) { clearInterval(timer); return; } iowa.current?.prepare(patch, order[at++], strength); }, 25);
        return () => clearInterval(timer);
    }, [audio.state, range, patch, strength, setup.keysLow, setup.keysSize, voice.vibrato]);

    const start = useCallback(async () => {
        if (iowa.current) { await iowa.current.context.resume(); return; }
        setAudio({ state: 'starting', message: '' });
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: setupRef.current.latency === 'balanced' ? 'balanced' : 'interactive' });
            await ctx.resume();
            const player = new IowaPlayer(ctx);
            await player.ready;
            iowa.current = player;
            const rack = await createRack(ctx, rackRef.current, { onError() {} });
            const monitor = await createOutputMonitor(ctx, (peak) => setRackStats((st) => (Math.abs(st.peak - peak) < .01 ? st : { ...st, peak })));
            player.connect(rack.input); rack.connect(monitor.node); monitor.node.connect(ctx.destination);
            engine.current = { context: ctx, requestScope: monitor.requestScope, setRack: (v) => rack.patch(v), clearRack: () => rack.clear(), dispose() { rack.dispose(); monitor.dispose(); } };
            const m = new LabMidi({
                on: (key, note, v) => down(key, note, mapVelocity(v, CURVES[setupRef.current.velocity] ?? CURVES.normal)), off: (key) => up(key), sustain, panic, control() {},
                onStatus: (inputs) => setMidi({ inputs, status: inputs.length ? `${inputs.length} MIDI input${inputs.length > 1 ? 's' : ''} connected.` : 'MIDI ready · plug in your piano.' }),
            });
            m.selected = setupRef.current.midiDevice; m.channel = setupRef.current.midiChannel;
            midiRef.current = m; m.connect().catch((e) => setMidi((s) => ({ ...s, status: e.message })));
            setAudio({ state: 'on', message: `${Math.round(ctx.sampleRate / 1000)} kHz` });
        } catch (error) { setAudio({ state: 'error', message: error.message }); }
    }, [down, up, sustain, panic]);
    const connectMidi = async () => { try { await midiRef.current?.connect(); } catch (e) { setMidi((s) => ({ ...s, status: e.message })); } };
    const updateSetup = (key, value) => {
        setSetup((s) => ({ ...s, [key]: value }));
        if (key === 'midiDevice' && midiRef.current) { panic(); midiRef.current.selected = value; }
        if (key === 'midiChannel' && midiRef.current) { panic(); midiRef.current.channel = value; }
    };

    const playPhrase = (id) => { if (audio.state === 'on') phrases.play(id); };
    const stopAll = () => phrases.stop();

    useEffect(() => {
        const keyboard = bindLabKeyboard(window, {
            on: (key, note) => down(key, note, computerKeyVelocity(setupRef.current)), off: (key) => up(key), panic,
            octave: () => Math.floor(setupRef.current.keysLow / 12) - 1, shift: (d) => setSetup((s) => ({ ...s, keysLow: Math.min(84, Math.max(24, s.keysLow + 12 * d)) })),
        });
        const space = (on) => (e) => { if (e.code === 'Space' && !e.target?.closest?.('input,select,textarea,button')) { e.preventDefault(); sustain(on); } };
        const spaceDown = space(true), spaceUp = space(false);
        // 1-5 play the phrases, Escape stops them
        const phraseKey = (e) => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.('input,select,textarea,[contenteditable=true]')) return;
            const id = phraseForCode(e.code);
            if (id) { if (iowa.current) { e.preventDefault(); phrases.play(id); } }
            else if (e.key === 'Escape') phrases.stop();
        };
        window.addEventListener('keydown', spaceDown); window.addEventListener('keyup', spaceUp); window.addEventListener('keydown', phraseKey);
        return () => { keyboard(); window.removeEventListener('keydown', spaceDown); window.removeEventListener('keyup', spaceUp); window.removeEventListener('keydown', phraseKey); phrases.stop(); };
    }, [down, up, sustain, panic, phrases]);
    useEffect(() => () => { midiRef.current?.dispose(); engine.current?.dispose(); engine.current = null; iowa.current?.dispose(); iowa.current?.context.close?.(); iowa.current = null; }, []);

    const choose = (sound) => { if (sound.id === patch) return;
        setPatch(sound.id); setRange(null);
        setVoice((v) => ({ ...v, vibrato: isStraight(sound) ? 0 : isStraight(PATCHES.find((p) => p.id === patch)) ? 1 : v.vibrato })); };
    const setVoiceValue = (key, value) => setVoice((v) => ({ ...v, [key]: value }));
    const current = PATCHES.find((p) => p.id === patch);

    return <div className="synth instrument piano iowa">
        <header className="synth-bar">
            <a className="back" href={import.meta.env.BASE_URL + 'synths/'} aria-label="All synths">◂</a>
            <h1><span className="brand">Measured instruments</span><small>rebuilt from measurements of real recordings</small></h1>
            <span className="patch-name" title={current?.name}>{current?.name}</span>
            <span className="meter"><b>{held.length}</b></span>
            {pedal && <span className="pill">Pedal</span>}
            <button type="button" aria-pressed={open.input} title="The input monitor: what your keyboard sends and what leaves the page" onClick={() => toggleGadget('input')}>Input</button>
            <button type="button" aria-pressed={showEffects} aria-label="Effects rack" onClick={toggleEffects}>Effects</button>
            <button type="button" aria-pressed={showScope} onClick={toggleScope} title="Oscilloscope and spectrum">Scope</button>
            <button type="button" aria-pressed={showSetup} aria-label="Setup" title="Setup: MIDI, the keybed and the computer keys" onClick={() => setShowSetup((v) => !v)}>⚙</button>
            <button type="button" onClick={() => { stopAll(); panic(); }} title="Silence everything (Esc)">Panic</button>
        </header>

        <Desk>
            {open.input && <Window id="iowa-input" title="Input monitor" home={(s) => ({ x: Math.round((s.w - 830) / 2) - 444, y: 90 })} onClose={() => toggleGadget('input')}>
                <div className="piano-input">
                    <div className="input-probe">
                        <div className="probe-note"><b>{last ? noteName(last.midi) : '—'}</b><small>{last ? `${last.source} · note ${last.midi}` : 'play a key'}</small></div>
                        <div className="probe-bar" title="Strength as received"><i style={{ width: (last ? last.velocity * 100 : 0) + '%' }} /><span>strength {last ? Math.round(last.velocity * 127) : '—'} / 127</span></div>
                        <div className="probe-bar out" title="Output peak"><i style={{ width: Math.min(100, rackStats.peak * 100) + '%' }} /><span>{rackStats.peak > 0 ? (20 * Math.log10(rackStats.peak)).toFixed(1) + ' dBFS' : '−∞'}</span></div>
                    </div>
                    <p className="hint">{midi.status} {range ? `Plays ${noteName(range[0])} to ${noteName(range[1])}.` : audio.state === 'on' ? 'Loading…' : ''} {message}</p>
                </div>
            </Window>}

            {open.about && <Window id="iowa-about" title="About" home={(s) => ({ x: Math.round((s.w - 830) / 2) - 444, y: -494 })} onClose={() => toggleGadget('about')}>
                <div className="piano-input">
                    <p className="hint">Every note here is synthesized from numbers measured off a recording: how the harmonics move through the attack and settle, the breath or bow noise, the envelope, the vibrato and the small unsteadiness of a player. Struck and plucked notes keep each partial's own level and decay. No recordings are shipped.</p>
                    <p className="hint">Source: <a href="https://theremin.music.uiowa.edu/mis.html">University of Iowa Musical Instrument Samples</a>, Electronic Music Studios, recorded in an anechoic chamber. That dryness is why the room is on by default.</p>
                    <p className="hint">Piccolo, harp and the muted brass come from <a href="https://versilian-studios.com/vsco-community/">VSCO 2 Community Edition</a> (CC0), which samples every few notes in a room rather than every note in a dead one.</p>
                </div>
            </Window>}

            {showScope && <Scope engine={engine} audio={audio.state} onClose={toggleScope} keyHz={() => (held.length ? 440 * 2 ** ((held[held.length - 1] - 69) / 12) : 0)} />}

            <div className="rig" ref={rigDrag.ref} style={rigDrag.style}>
                <div className="grip rig-grip" {...rigDrag.handle} role="presentation"><i /></div>
                <IowaRig voice={voice} current={current} about={open.about} onAbout={() => toggleGadget('about')} onChoose={choose} onVoice={setVoiceValue}>
                    {showEffects && <RackCompact tempo={0} values={rackValues} onChange={changeRack} instrumentSpecs={[]} peak={rackStats.peak} reduction={rackStats.reduction} onClose={toggleEffects}
                        tools={<button type="button" onClick={() => engine.current?.clearRack()}>Clear tails</button>} />}
                </IowaRig>
            </div>

            {showSetup && <SetupPopover midi={midi} setup={setup} updateSetup={updateSetup} connectMidi={connectMidi} audio={audio} start={start} onClose={() => setShowSetup(false)} />}

            <footer className="perform">
                <StageKeys drag={keysDrag} size={setup.keysSize} controls={setup.keysControls} low={setup.keysLow} onLow={(v) => updateSetup('keysLow', v)} onLayout={updateSetup}
                    // the wheel, ribbon and pad are here for the same keybed on every page; a sample box has nothing for them to do
                    onMod={() => {}} left={<Ribbon vertical range={setup.ribbonRange} onBend={() => {}} />} right={<TouchPad onTouch={() => {}} />} notes={held} context={context} chord={chordPick}
                    onDown={(key, note, v) => down(key, note, mapVelocity(v ?? .75, CURVES[setup.velocity] ?? CURVES.normal))} onUp={(key) => up(key)}
                    head={<>
                        <AutoPlay playing={phrasePlaying} onPlay={playPhrase} onStop={stopAll} />
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
