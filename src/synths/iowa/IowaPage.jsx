import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keys } from '../ui/controls';
import { LabMidi, bindLabKeyboard, mapVelocity } from '../../labs/input';
import { load, save } from '../storage';
import { localBanks } from '../localBanks';
import IowaPlayer from '../../app/engine/iowaModel/player';
import { FAMILIES, PATCHES, LAYERS } from '../../app/engine/iowaModel/patches';
import { pitchRange } from '../../app/engine/iowaModel/model';

const KEY = 'synths:iowa';
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (n) => NAMES[n % 12] + (Math.floor(n / 12) - 1);
const STRENGTHS = [['pp', .24], ['mf', .63], ['ff', .93]];
const pct = (v) => Math.round(v * 100) + '%';

/** The recorded note nearest a strength, for comparing: local only, from the git-ignored banks/iowa/notes. */
const originalUrl = (patch, midi, velocity) => {
    const v = velocity * 127, [name] = LAYERS.reduce((best, layer) => (Math.abs(layer[1] - v) < Math.abs(best[1] - v) ? layer : best));
    return `${import.meta.env.BASE_URL}local-banks/iowa/notes/${patch}/${name}-${midi}.wav`;
};

export default function IowaPage() {
    const saved = useMemo(() => load(KEY, {}), []);
    const [patch, setPatch] = useState(PATCHES.some((p) => p.id === saved.patch) ? saved.patch : 'flute');
    const [strength, setStrength] = useState(saved.strength ?? .63);
    const [room, setRoom] = useState(saved.room ?? .25);
    const [vibrato, setVibrato] = useState(saved.vibrato ?? 1);
    const [volume, setVolume] = useState(saved.volume ?? 1);
    const [low, setLow] = useState(saved.low ?? 60);
    const [source, setSource] = useState('model');      // model | original
    const [hasOriginals, setHasOriginals] = useState(false);
    const [range, setRange] = useState(null);
    const [message, setMessage] = useState('');
    const [audio, setAudio] = useState({ state: 'off', message: '' });
    const [held, setHeld] = useState([]);
    const [midi, setMidi] = useState({ status: 'Not connected.' });
    const engine = useRef(null), midiRef = useRef(null), notes = useRef(new Map()), pedal = useRef(false), sustained = useRef(new Set()), originals = useRef(new Map());
    const live = useRef({});
    live.current = { patch, strength, source };

    useEffect(() => { save(KEY, { patch, strength, room, vibrato, volume, low }); }, [patch, strength, room, vibrato, volume, low]);
    useEffect(() => { localBanks('iowa').then((list) => setHasOriginals(list.length > 0)); }, []);
    useEffect(() => { engine.current?.setRoom(room); }, [room, audio.state]);
    useEffect(() => { engine.current?.setVibrato(vibrato); }, [vibrato, audio.state]);
    useEffect(() => { if (engine.current) engine.current.master.gain.value = volume; }, [volume, audio.state]);

    const refresh = () => setHeld([...notes.current.values()].map((n) => n.midi));
    const playOriginal = useCallback(async (midiNote, velocity) => {
        const context = engine.current.context, url = originalUrl(live.current.patch, midiNote, velocity);
        try {
            if (!originals.current.has(url)) {
                const response = await fetch(url);
                if (!response.ok) throw new Error('no recording of that note at this strength');
                originals.current.set(url, await context.decodeAudioData(await response.arrayBuffer()));
            }
            const player = context.createBufferSource(), gain = context.createGain();
            player.buffer = originals.current.get(url);
            gain.gain.value = engine.current.originalGain(live.current.patch, midiNote, velocity);
            player.connect(gain); gain.connect(engine.current.bus);
            player.start();
            setMessage('');
            return { player, gain };
        } catch (error) { setMessage(`${noteName(midiNote)}: ${error.message}`); return null; }
    }, []);
    const down = useCallback(async (key, note, velocity) => {
        const player = engine.current;
        if (!player) return;
        const entry = { midi: note, handle: null, stopped: false };
        const previous = notes.current.get(key);
        if (previous) { player.stop(previous.handle); previous.stopped = true; }
        notes.current.set(key, entry);
        refresh();
        const { patch: id, source: from } = live.current;
        if (from === 'original') {
            const played = await playOriginal(note, velocity);
            entry.original = played;
            if (entry.stopped && played) { played.gain.gain.setTargetAtTime(0, player.context.currentTime, .05); played.player.stop(player.context.currentTime + .4); }
            return;
        }
        entry.handle = player.start(id, note, velocity);
        if (!entry.handle) setMessage(`${noteName(note)} is outside this instrument's range.`); else setMessage('');
        if (entry.stopped) player.stop(entry.handle);
    }, [playOriginal]);
    const finish = (entry) => {
        const player = engine.current;
        entry.stopped = true;
        if (entry.original) { entry.original.gain.gain.setTargetAtTime(0, player.context.currentTime, .05); entry.original.player.stop(player.context.currentTime + .4); }
        else player?.stop(entry.handle);
    };
    const up = useCallback((key) => {
        const entry = notes.current.get(key);
        if (!entry) return;
        notes.current.delete(key);
        if (pedal.current) sustained.current.add(entry); else finish(entry);
        refresh();
    }, []);
    const sustain = useCallback((on) => {
        pedal.current = on;
        if (!on) { for (const entry of sustained.current) finish(entry); sustained.current.clear(); }
    }, []);
    const panic = useCallback(() => { engine.current?.panic(); notes.current.clear(); sustained.current.clear(); refresh(); }, []);

    const loadPatch = useCallback(async (id) => {
        if (!engine.current) return;
        const table = await engine.current.load(id);
        if (live.current.patch !== id) return;
        const [lowest, highest] = pitchRange(table);
        setRange([lowest, highest]);
        // the keys follow the instrument when it has moved out of view
        setLow((l) => (l + 24 < lowest || l > highest - 12 ? Math.max(24, Math.min(84, 12 * Math.round(((lowest + highest) / 2 - 18) / 12))) : l));
    }, []);
    useEffect(() => { if (audio.state === 'on') loadPatch(patch).catch((e) => setMessage(e.message)); }, [audio.state, patch, loadPatch]);
    // Prepare the keys in view at the current strength, so the first press of each sounds at once.
    useEffect(() => {
        if (audio.state !== 'on' || !range || source !== 'model') return undefined;
        const order = Array.from({ length: 25 }, (_, i) => low + i).filter((n) => n >= range[0] && n <= range[1]);
        let at = 0;
        const timer = setInterval(() => { if (at >= order.length) { clearInterval(timer); return; } engine.current?.prepare(patch, order[at++], strength); }, 25);
        return () => clearInterval(timer);
    }, [audio.state, range, patch, strength, low, vibrato, source]);

    const start = useCallback(async () => {
        if (engine.current) { await engine.current.context.resume(); return; }
        setAudio({ state: 'starting', message: '' });
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
            await context.resume();
            const player = new IowaPlayer(context).connect(context.destination);
            await player.ready;
            engine.current = player;
            const m = new LabMidi({
                on: (key, note, v) => down(key, note, mapVelocity(v, { curve: 1.1 })), off: (key) => up(key), sustain, panic, control() {},
                onStatus: (inputs) => setMidi({ status: inputs.length ? `${inputs.length} MIDI input${inputs.length > 1 ? 's' : ''} connected.` : 'MIDI ready · plug in your piano.' }),
            });
            midiRef.current = m; m.connect().catch((e) => setMidi({ status: e.message }));
            setAudio({ state: 'on', message: `${Math.round(context.sampleRate / 1000)} kHz` });
        } catch (error) { setAudio({ state: 'error', message: error.message }); }
    }, [down, up, sustain, panic]);

    useEffect(() => {
        const keyboard = bindLabKeyboard(window, {
            on: (key, note) => down(key, note, live.current.strength), off: (key) => up(key), panic,
            octave: () => Math.floor(low / 12) - 1, shift: (d) => setLow((l) => Math.min(84, Math.max(24, l + 12 * d))),
        });
        const space = (on) => (e) => { if (e.code === 'Space' && !e.target?.closest?.('input,select,textarea,button')) { e.preventDefault(); sustain(on); } };
        const spaceDown = space(true), spaceUp = space(false);
        window.addEventListener('keydown', spaceDown); window.addEventListener('keyup', spaceUp);
        return () => { keyboard(); window.removeEventListener('keydown', spaceDown); window.removeEventListener('keyup', spaceUp); };
    }, [low, down, up, sustain, panic]);
    useEffect(() => () => { midiRef.current?.dispose(); engine.current?.context.close?.(); engine.current = null; }, []);

    const current = PATCHES.find((p) => p.id === patch);
    return <div className="synth instrument iowa">
        <header className="synth-bar">
            <a className="back" href={import.meta.env.BASE_URL + 'synths/'} aria-label="All synths">◂</a>
            <h1><span className="brand">Iowa instruments</span><small>rebuilt from measurements of the University of Iowa recordings</small></h1>
            <span className="patch-name">{current?.name}</span>
            <button type="button" onClick={panic} title="Silence everything (Esc)">Panic</button>
        </header>
        <main className="panel diy-panel">
            {FAMILIES.map((family) => <section className="group wide" key={family}><h3>{family}</h3>
                <nav className="presets" aria-label={family}>
                    {PATCHES.filter((p) => p.family === family).map((p) => <button type="button" key={p.id} className={p.id === patch ? 'on' : ''} onClick={() => { if (p.id !== patch) { setPatch(p.id); setRange(null); } }}>{p.name}</button>)}
                </nav>
            </section>)}
            <section className="group wide"><h3>Playing</h3>
                <div className="row"><label>Strength (keys and computer keyboard)<input type="range" min=".05" max="1" step=".01" value={strength} onChange={(e) => setStrength(Number(e.target.value))} /><output>{pct(strength)}</output></label></div>
                <nav className="presets" aria-label="Strength">{STRENGTHS.map(([name, value]) => <button type="button" key={name} onClick={() => setStrength(value)}>{name}</button>)}</nav>
                <div className="row"><label>Vibrato<input type="range" min="0" max="2" step=".05" value={vibrato} onChange={(e) => setVibrato(Number(e.target.value))} /><output>×{vibrato.toFixed(2)}</output></label></div>
                <div className="row"><label>Room<input type="range" min="0" max="1" step=".01" value={room} onChange={(e) => setRoom(Number(e.target.value))} /><output>{pct(room)}</output></label></div>
                <div className="row"><label>Volume<input type="range" min="0" max="1.5" step=".01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} /><output>{pct(volume)}</output></label></div>
                {hasOriginals && <nav className="presets" aria-label="Sound source">
                    <button type="button" className={source === 'model' ? 'on' : ''} onClick={() => setSource('model')}>Model</button>
                    <button type="button" className={source === 'original' ? 'on' : ''} onClick={() => setSource('original')}>Original recording</button>
                </nav>}
                <p className="hint">{range ? `Plays ${noteName(range[0])} to ${noteName(range[1])}.` : audio.state === 'on' ? 'Loading…' : ''} {message}</p>
            </section>
            <section className="group wide"><h3>About</h3>
                <p className="hint">Every note here is synthesized from numbers measured off a recording: how the harmonics move through the attack and settle, the breath or bow noise, the envelope, the vibrato and the small unsteadiness of a player. Struck and plucked notes keep each partial's own level and decay. No recordings are shipped{hasOriginals ? ', and the Original button above plays them only on this machine' : ''}.</p>
                <p className="hint">Source: <a href="https://theremin.music.uiowa.edu/mis.html">University of Iowa Musical Instrument Samples</a>, Electronic Music Studios, recorded in an anechoic chamber. That dryness is why the room is on by default.</p>
                <p className="hint">Piccolo, harp and the muted brass come from <a href="https://versilian-studios.com/vsco-community/">VSCO 2 Community Edition</a> (CC0), which samples every few notes in a room rather than every note in a dead one.</p>
            </section>
            <section className="group wide"><h3>MIDI piano</h3>
                <p>{midi.status}</p>
                <div className="row"><button type="button" onClick={() => midiRef.current?.connect().catch((e) => setMidi({ status: e.message }))}>Connect MIDI</button></div>
            </section>
        </main>
        <footer className="perform">
            <div className="keys-row">
                <button type="button" className="octave" aria-label="Keys down an octave" onClick={() => setLow((l) => Math.max(24, l - 12))}>−</button>
                <Keys low={low} count={37} active={held} onDown={(key, note, velocity) => down(key, note, velocity)} onUp={up} />
                <button type="button" className="octave" aria-label="Keys up an octave" onClick={() => setLow((l) => Math.min(84, l + 12))}>+</button>
            </div>
        </footer>
        {audio.state !== 'on' && <button type="button" className={'wake ' + audio.state} onClick={start}>
            <span className="wake-title">{audio.state === 'starting' ? 'Starting…' : audio.state === 'error' ? 'Tap to try again' : 'Tap to start'}</span>
            <span className="wake-note">{audio.state === 'error' ? audio.message : 'Play your piano, the on-screen keys or the computer keyboard (A–K row).'}</span>
        </button>}
    </div>;
}
