import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keys } from '../ui/controls';
import { LabMidi, bindLabKeyboard, mapVelocity } from '../../labs/input';
import { load, save } from '../storage';
import { localBanks, fetchLocalBank } from '../localBanks';
import SpectrogramView from './SpectrogramView';
import WaveformView from './WaveformView';
import { spectrogram, difference, bandLevels, flatten } from '../../app/engine/stringModel/spectrogram';
import StringPlayer, { PATCHES, RANGE, DEFAULT_TUNING, defaultTuning, measuredPitches } from '../../app/engine/stringModel/player';

const KEY = 'synths:strings';
// label, key, min, max, step, format
const SLIDERS = [
    ['Tone', [['Vibrato', 'vibrato', 0, 2, .05, (v) => '×' + v.toFixed(2)], ['Bow noise', 'noise', -12, 12, .5, (v) => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'], ['Brightness', 'tilt', -6, 6, .25, (v) => (v > 0 ? '+' : '') + v.toFixed(2) + ' dB/oct'], ['Even levels', 'evenness', 0, 1, .05, (v) => Math.round(v * 100) + '%'], ['Body shimmer', 'shimmer', 0, 3, .05, (v) => '×' + v.toFixed(2)], ['Line flare', 'flare', 0, 3, .05, (v) => '×' + v.toFixed(2)], ['Bow-noise bed', 'bed', -12, 12, .5, (v) => (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'], ['Starting transient', 'onset', 0, 4, .05, (v) => '×' + v.toFixed(2)], ['Wake', 'wakeDb', -40, 12, 1, (v) => (v <= -40 ? 'off' : v + ' dB')], ['Wake time', 'wakeTime', .05, 1.2, .05, (v) => v.toFixed(2) + ' s'], ['Noise share', 'noiseShare', 0, 1, .005, (v) => (v * 100).toFixed(1) + '% of a harmonic'], ['Noise in harmonics', 'smear', 0, 3, .05, (v) => '×' + v.toFixed(2)], ['Line width', 'lineRatio', .03, .5, .01, (v) => '±' + Math.round(v * 100) + '% of pitch']]],
];
// The calibration take held a note 5 s up to C3 and 4 s above it, so the recording of one lasts that long before its release.
const nativeHold = (pitch) => (pitch <= 60 ? 5 : 4);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const clampNote = (n) => Math.max(RANGE[0], Math.min(RANGE[1], n));

export default function StringsPage() {
    const saved = useMemo(() => load(KEY, {}), []);
    const [patch, setPatch] = useState(PATCHES[saved.patch] ? saved.patch : 'long');
    const [dynamic, setDynamic] = useState(saved.dynamic ?? 80);
    // each patch keeps its own settings (a pluck wants different noise and wake from a bow); an older save held one set for all, which belonged to the bowed patches
    const [tunings, setTunings] = useState(saved.tunings ?? (saved.tuning ? { long: saved.tuning, live: saved.tuning } : {}));
    const tuning = useMemo(() => ({ ...defaultTuning(patch), ...tunings[patch] }), [tunings, patch]);
    const [volume, setVolume] = useState(saved.volume ?? 1);
    const [audio, setAudio] = useState({ state: 'off', message: '' });
    const [held, setHeld] = useState([]);
    const [low, setLow] = useState(saved.low ?? 48);
    const [midi, setMidi] = useState({ inputs: [], status: 'Not connected.' });
    const [stats, setStats] = useState(null);
    const [warm, setWarm] = useState(null);
    const [ab, setAb] = useState({ pitch: saved.abPitch ?? 60, velocity: saved.abVelocity ?? 80, maxHz: saved.abMaxHz ?? 4000, waveMs: saved.abWaveMs ?? 200, waveStart: saved.abWaveStart ?? 0, leaveOut: saved.abLeaveOut ?? true });
    const [clips, setClips] = useState(null), [abNow, setAbNow] = useState('');
    const clipCache = useRef(new Map()), abTimers = useRef([]), abHandles = useRef([]);
    const engine = useRef(null), midiRef = useRef(null), notes = useRef(new Map()), pedal = useRef(false), sustained = useRef(new Set());
    const live = useRef({ patch, dynamic });
    live.current = { patch, dynamic };

    useEffect(() => { save(KEY, { patch, dynamic, tunings, volume, low, abPitch: ab.pitch, abVelocity: ab.velocity, abMaxHz: ab.maxHz, abWaveMs: ab.waveMs, abWaveStart: ab.waveStart, abLeaveOut: ab.leaveOut }); }, [patch, dynamic, tunings, volume, low, ab]);
    useEffect(() => { localBanks('cello-reference').then((list) => setClips(new Map(list.map((e) => [e.name, e])))); }, []);
    useEffect(() => { engine.current?.setTuning(tuning); }, [tuning, audio.state]);
    useEffect(() => { if (engine.current) engine.current.master.gain.value = volume; }, [volume, audio.state]);

    const refresh = () => setHeld([...notes.current.values()].map((n) => n.midi));
    const release = (note) => engine.current?.stop(note.handle);
    const down = useCallback((key, midiNote, velocity, fromMidi = false) => {
        const player = engine.current;
        if (!player) return;
        const previous = notes.current.get(key);
        if (previous) release(previous);
        const { patch: p, dynamic: d } = live.current, strength = fromMidi ? Math.round(Math.max(1, Math.min(127, velocity * 127))) : d;
        const note = clampNote(midiNote), handle = player.start(p, note, strength / 127);
        notes.current.set(key, { handle, midi: midiNote });
        const shown = player.note(p, note, strength);
        setStats({ ...player.stats, loop: shown.made.loop ?? null, harmonics: shown.model.tonal.length });
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
        notes.current.clear(); sustained.current.clear(); refresh();
    }, []);

    const start = useCallback(async () => {
        if (engine.current) { await engine.current.context.resume(); return; }
        setAudio({ state: 'starting', message: '' });
        try {
            const context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
            await context.resume();
            const player = new StringPlayer(context).connect(context.destination);
            player.setTuning(tuning); player.master.gain.value = volume;
            engine.current = player;
            const m = new LabMidi({
                on: (key, note, v) => down(key, note, mapVelocity(v, { curve: 1.1 }), true), off: (key) => up(key), sustain, control() {}, panic,
                onStatus: (inputs) => setMidi({ inputs, status: inputs.length ? `${inputs.length} MIDI input${inputs.length > 1 ? 's' : ''} connected.` : 'MIDI ready · plug in your piano.' }),
            });
            midiRef.current = m; m.connect().catch((e) => setMidi((s) => ({ ...s, status: e.message })));
            setAudio({ state: 'on', message: `${Math.round(context.sampleRate / 1000)} kHz` });
        } catch (error) { setAudio({ state: 'error', message: error.message }); }
    }, [tuning, volume, down, up, sustain, panic]);

    // Render every key of the current patch at the current dynamic in the background, the keys around the played octave first,
    // so a key press finds its note ready (a note first asked for during play is rendered on the spot, which is a noticeable delay).
    useEffect(() => {
        const player = engine.current;
        if (audio.state !== 'on' || !player) return undefined;
        const order = Array.from({ length: RANGE[1] - RANGE[0] + 1 }, (_, i) => RANGE[0] + i).sort((x, y) => Math.abs(x - (low + 12)) - Math.abs(y - (low + 12)));
        let done = 0, cancelled = false;
        const timer = setTimeout(() => {                  // after a slider has stopped moving
            for (const midi of order) player.prepare(patch, midi, dynamic).then(() => { if (!cancelled) setWarm(++done >= order.length ? null : Math.round(100 * done / order.length)); });
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); player.cancelQueued(); };
    }, [audio.state, patch, dynamic, tuning, low]);

    useEffect(() => {
        const keyboard = bindLabKeyboard(window, {
            on: (key, note) => down(key, note, .72), off: (key) => up(key), panic,
            octave: () => Math.floor(low / 12) - 1, shift: (d) => setLow((l) => Math.min(72, Math.max(24, l + 12 * d))),
        });
        const space = (on) => (e) => { if (e.code === 'Space' && !e.target?.closest?.('input,select,textarea,button')) { e.preventDefault(); sustain(on); } };
        const spaceDown = space(true), spaceUp = space(false);
        window.addEventListener('keydown', spaceDown); window.addEventListener('keyup', spaceUp);
        return () => { keyboard(); window.removeEventListener('keydown', spaceDown); window.removeEventListener('keyup', spaceUp); };
    }, [low, down, up, sustain, panic]);
    useEffect(() => () => { midiRef.current?.dispose(); engine.current?.context.close?.(); engine.current = null; }, []);

    // A/B: the sampler's own recording of a measured note against the model's, level-matched (both scaled by the patch's gain).
    const clipOf = useCallback(async (p, pitch, velocity) => {
        const key = `cello-${p}-${pitch}-${velocity}.wav`, entry = clips?.get(key);
        if (!entry) return null;
        if (!clipCache.current.has(key)) {
            const bytes = await fetchLocalBank(entry), context = engine.current.context;
            clipCache.current.set(key, await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
        }
        return clipCache.current.get(key);
    }, [clips]);
    const stopAb = useCallback(() => {
        abTimers.current.forEach(clearTimeout); abTimers.current = [];
        for (const h of abHandles.current) { try { h.source.stop(); } catch { /* already ended */ } }
        abHandles.current = []; setAbNow('');
    }, []);
    const playAb = useCallback(async (order) => {
        const player = engine.current;
        if (!player) return;
        stopAb();
        await player.context.resume();
        const spec = PATCHES[patch], original = await clipOf(patch, ab.pitch, ab.velocity);
        if (!original && order.includes('original')) { setAbNow('No recording for this note (run tools/extractStringClips.mjs).'); return; }
        const options = { without: ab.leaveOut ? ab.pitch : null, exact: true };
        const rendered = (await player.prepare(patch, ab.pitch, ab.velocity, options)) ?? player.note(patch, ab.pitch, ab.velocity, options);        // rendered before the clock starts
        let at = player.context.currentTime + .15;
        for (const which of order) {
            const label = which === 'original' ? 'Original' : ab.leaveOut ? 'Model (this pitch left out)' : 'Model';
            const hold = nativeHold(ab.pitch), length = which === 'original' ? original.duration : spec.bowed ? hold + rendered.release.seconds : rendered.buffer.duration;
            const when = at;
            abTimers.current.push(setTimeout(() => setAbNow(label), Math.max(0, (when - player.context.currentTime) * 1000)));
            if (which === 'original') {
                const source = player.context.createBufferSource(), gain = player.context.createGain();
                source.buffer = original; gain.gain.value = player.level(patch);
                source.connect(gain); gain.connect(player.master); source.start(when);
                abHandles.current.push({ source });
            } else {
                const handle = player.start(patch, ab.pitch, ab.velocity / 127, when, options);
                if (spec.bowed) player.stop(handle, when + hold);
                abHandles.current.push(handle);
            }
            at = when + length + .45;
        }
        abTimers.current.push(setTimeout(() => setAbNow(''), Math.max(0, (at - player.context.currentTime) * 1000)));
    }, [patch, ab, clipOf, stopAb]);
    // Spectrograms of the recording and of the model, and the model minus the recording, for the note being compared.
    const [views, setViews] = useState(null);
    useEffect(() => {
        const player = engine.current;
        if (audio.state !== 'on' || !player || !clips || !clips.has(`cello-${patch}-${ab.pitch}-${ab.velocity}.wav`)) { setViews(null); return undefined; }
        let cancelled = false;
        const timer = setTimeout(async () => {
            const original = await clipOf(patch, ab.pitch, ab.velocity);
            if (cancelled || !original) return;
            const rate = player.context.sampleRate, made = await player.prepare(patch, ab.pitch, ab.velocity, { without: ab.leaveOut ? ab.pitch : null, exact: true });
            if (cancelled || !made) return;
            const model = flatten(made.made, made.release, nativeHold(ab.pitch), rate), level = player.level(patch);
            const heard = Float32Array.from(original.getChannelData(0), (x) => x * level);
            const seconds = Math.min(heard.length, model.length) / rate, options = { maxHz: ab.maxHz, seconds };
            const a = spectrogram(heard, rate, options), b = spectrogram(model, rate, options);
            const bands = [100, 300, 600, 1000, 2000, 4000].filter((f) => f < ab.maxHz).concat(ab.maxHz), top = Math.max(...a.data);
            setViews({ a, b, d: difference(a, b), top, bands, levels: [bandLevels(a, bands), bandLevels(b, bands)], wave: { original: heard.slice(0, 3 * rate), model: model.slice(0, 3 * rate), rate } });
        }, 200);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [audio.state, clips, patch, ab, tuning, clipOf]);

    const measured = measuredPitches(patch);
    const hasClip = clips?.has(`cello-${patch}-${ab.pitch}-${ab.velocity}.wav`);

    const spec = PATCHES[patch];
    const change = (key, value) => setTunings((all) => ({ ...all, [patch]: { ...defaultTuning(patch), ...all[patch], [key]: value } }));
    const edited = Object.keys(DEFAULT_TUNING).some((k) => tuning[k] !== defaultTuning(patch)[k]);

    return <div className="synth instrument strings">
        <header className="synth-bar">
            <a className="back" href={import.meta.env.BASE_URL + 'synths/'} aria-label="All synths">◂</a>
            <h1><span className="brand">Strings</span><small>cello, rebuilt from measurements of a sampled cello</small></h1>
            <span className="patch-name">{spec.label}{edited ? ' *' : ''}</span>
            <span className="meter"><b>{held.length}</b></span>
            <button type="button" onClick={panic} title="Silence everything (Esc)">Panic</button>
        </header>
        <nav className="presets" aria-label="Articulation">
            {Object.entries(PATCHES).map(([id, p]) => <button type="button" key={id} className={id === patch ? 'on' : ''} onClick={() => setPatch(id)}>{p.label}</button>)}
        </nav>
        <main className="panel diy-panel">
            <section className="group wide"><h3>{spec.bowed ? 'Bowed note' : 'Fixed-length note'}</h3>
                <div className="row">
                    <label>Dynamics<input type="range" min="1" max="127" step="1" value={dynamic} onChange={(e) => setDynamic(Number(e.target.value))} /><output>{dynamic}</output></label>
                    <label>Phases<select value={tuning.phase} onChange={(e) => change('phase', e.target.value)}><option value="random">random</option><option value="pulse">pulse (all in phase)</option><option value="minimum">pulse + body ringing</option></select></label>
                    <label>Volume<input type="range" min="0" max="2" step=".05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} /><output>{Math.round(volume * 100)}%</output></label>
                </div>
                {SLIDERS.map(([title, rows]) => <div className="row" key={title}>
                    {rows.map(([label, key, min, max, step, format]) => <label key={key}>{label}
                        <input type="range" min={min} max={max} step={step} value={tuning[key]} onChange={(e) => change(key, Number(e.target.value))} />
                        <output>{format(tuning[key])}</output></label>)}
                </div>)}
                <div className="row">
                    {edited && <button type="button" onClick={() => setTunings((all) => { const { [patch]: _gone, ...rest } = all; return rest; })}>Reset to measured</button>}
                    {warm != null && <span className="hint">Preparing the keys… {warm}%</span>}
                </div>
                <p className="hint">{spec.bowed
                    ? 'Harmonics at the levels measured from the sampled cello (and carried between notes in frequency, so its body resonances stay put), vibrato as measured, the bow\'s attack, and a seamless loop for the steady part. Hold a key to sustain; the release follows the sample\'s.'
                    : 'One buffer per note from the measured spectrum and the way each band dies away. It ignores the key, as the sample does.'}</p>
                {stats && <p className="hint">Last note: {stats.lastMs} ms to render ({stats.renders} so far), {stats.harmonics} harmonics{stats.loop ? `, loop ${stats.loop.L.toFixed(2)} s (${stats.loop.k} vibrato cycles at ${stats.loop.rate.toFixed(2)} Hz)` : ''}.</p>}
            </section>
            <section className="group wide" style={{ gridColumn: '1 / -1' }}><h3>A/B against the recording</h3>
                {!clips || clips.size === 0 ? <p className="hint">No recordings here. Run <code>node tools/extractStringClips.mjs</code> (it cuts the sampler's notes into banks/cello-reference/, which stays on this machine) and reload.</p> : <>
                    <div className="row">
                        <label>Note<select value={ab.pitch} onChange={(e) => setAb((a) => ({ ...a, pitch: Number(e.target.value) }))}>{measured.map((m) => <option key={m} value={m}>{NAMES[m % 12]}{Math.floor(m / 12) - 1} ({m})</option>)}</select></label>
                        <label>Strength<select value={ab.velocity} onChange={(e) => setAb((a) => ({ ...a, velocity: Number(e.target.value) }))}>{[40, 80, 127].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
                        <label>Waveform of the first<select value={ab.waveMs} onChange={(e) => setAb((a) => ({ ...a, waveMs: Number(e.target.value) }))}>{[30, 60, 120, 250, 500, 1000].map((v) => <option key={v} value={v}>{v} ms</option>)}</select></label>
                        <label>starting at<select value={ab.waveStart} onChange={(e) => setAb((a) => ({ ...a, waveStart: Number(e.target.value) }))}>{[0, 500, 1000, 2000].map((v) => <option key={v} value={v}>{v} ms</option>)}</select></label>
                        <label>Spectrogram to<select value={ab.maxHz} onChange={(e) => setAb((a) => ({ ...a, maxHz: Number(e.target.value) }))}>{[2000, 4000, 8000, 16000].map((f) => <option key={f} value={f}>{f / 1000} kHz</option>)}</select></label>
                        <label className="check"><input type="checkbox" checked={ab.leaveOut} onChange={(e) => setAb((a) => ({ ...a, leaveOut: e.target.checked }))} /> Leave this pitch out of the model</label>
                    </div>
                    <div className="row">
                        <button type="button" disabled={audio.state !== 'on' || !hasClip} onClick={() => playAb(['original'])}>Original</button>
                        <button type="button" disabled={audio.state !== 'on'} onClick={() => playAb(['model'])}>Model</button>
                        <button type="button" disabled={audio.state !== 'on' || !hasClip} onClick={() => playAb(['original', 'model'])}>Original → Model</button>
                        <button type="button" disabled={audio.state !== 'on' || !hasClip} onClick={() => playAb(['model', 'original'])}>Model → Original</button>
                        <button type="button" onClick={stopAb}>Stop</button>
                        <strong>{abNow}</strong>
                    </div>
                    <p className="hint">The recordings are the sampler's own audio, cut from the calibration take and served only from this machine. With "leave out" on, the model is built from the other pitches only, so it is a fair test of what it would do for a note it was never shown. Both are set to the same level, and the model is held as long as the recording was.</p>
                    {views && <>
                        <WaveformView original={views.wave.original} model={views.wave.model} rate={views.wave.rate} ms={ab.waveMs} startMs={ab.waveStart} />
                        <SpectrogramView spec={views.a} top={views.top} title="Original" />
                        <SpectrogramView spec={views.b} top={views.top} title={ab.leaveOut ? 'Model (this pitch left out)' : 'Model'} />
                        <SpectrogramView spec={views.d} kind="delta" range={24} title="Model minus original: red = the model is louder, blue = quieter (24 dB to full colour)" />
                        <table className="levels"><thead><tr><th>Mean level</th>{views.bands.slice(0, -1).map((lo, i) => <th key={lo}>{lo}–{views.bands[i + 1]} Hz</th>)}</tr></thead><tbody>
                            <tr><th>Original</th>{views.levels[0].map((v, i) => <td key={i}>{v?.toFixed(1)}</td>)}</tr>
                            <tr><th>Model</th>{views.levels[1].map((v, i) => <td key={i}>{v?.toFixed(1)}</td>)}</tr>
                            <tr><th>Difference</th>{views.levels[1].map((v, i) => <td key={i}>{(v - views.levels[0][i]).toFixed(1)}</td>)}</tr>
                        </tbody></table></>}
                </>}
            </section>
            <section className="group wide"><h3>MIDI piano</h3>
                <p>{midi.status}</p>
                <div className="row"><button type="button" onClick={() => midiRef.current?.connect().catch((e) => setMidi((s) => ({ ...s, status: e.message })))}>Connect MIDI</button></div>
                <p className="hint">The cello sounds from C2 to C6 (MIDI 36–84); notes outside that play the nearest. Computer keys A–K play the keys, Z/X shift the octave, Space is the sustain pedal. A MIDI piano's velocity sets the dynamic; the screen and computer keys use the slider.</p>
            </section>
        </main>
        <footer className="perform">
            <div className="keys-row">
                <button type="button" className="octave" aria-label="Keys down an octave" onClick={() => setLow((l) => Math.max(24, l - 12))}>−</button>
                <Keys low={low} count={37} active={held} onDown={(key, note) => down(key, note, 0)} onUp={up} />
                <button type="button" className="octave" aria-label="Keys up an octave" onClick={() => setLow((l) => Math.min(72, l + 12))}>+</button>
            </div>
        </footer>
        {audio.state !== 'on' && <button type="button" className={'wake ' + audio.state} onClick={start}>
            <span className="wake-title">{audio.state === 'starting' ? 'Starting…' : audio.state === 'error' ? 'Tap to try again' : 'Tap to start'}</span>
            <span className="wake-note">{audio.state === 'error' ? audio.message : 'Play your piano, the on-screen keys or the computer keyboard (A–K row).'}</span>
        </button>}
    </div>;
}
