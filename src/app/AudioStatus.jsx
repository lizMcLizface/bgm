import {usePerfMode} from '../audio/PerfModeButton';
// Header controls: master volume; the theme toggle; the Audio menu - how busy
// the audio thread is (with dropouts where the browser reports them), output
// buffer size (src/audio/context.js), quick stop and the Performance choices
// (src/audio/performance.js); and the ⚙ options menu - copy link, a phrase,
// sleep timer, save audio (Playback.jsx) and the tour.

import React, { useEffect, useRef, useState } from 'react';
import { audioContext, storedBufferSeconds, storeBufferSeconds } from '../audio/context';
import { readPerformance, writePerformance } from '../audio/performance';
import { masterBus } from '../audio/bus';
import {playbackDiagnostics,formatPlaybackSummary} from '../audio/playbackDiagnostics';
import {idleSuspender} from '../audio/idleContext';
import { startLoadMeter } from '../audio/loadMeter';
import { addSilence, readSilenceLog, clearSilenceLog, formatSilenceLog, describeSilence } from '../audio/silenceLog';
import { runBenchmark } from './benchmark';
import { readPref, writePref } from './prefs';
import { applyTheme, storedTheme } from './theme';
import { BACKDROP_DEFAULTS, PALETTES } from './Backdrop';
import FluidControls from './visuals/FluidControls';
import WasmQuality from '../audio/WasmQuality';
import { LinkIcon, SpeakerIcon, SunIcon, MoonIcon, AutoThemeIcon, PaletteIcon } from './icons';

const VOLUME_KEY = 'bgm-volume';
const QUICK_STOP_KEY = 'bgm-quick-stop';

const BUFFERS = [
    [0, 'Lowest latency'],
    [0.02, '20 ms'],
    [0.05, '50 ms'],
    [0.1, '100 ms'],
    [0.2, '200 ms'],
    [0.5, '500 ms'],
    [1, '1 second'],
];

// Above this the thread is close to missing deadlines on a busy moment.
const HIGH_LOAD = 0.7;

/** Master volume (masterBus), remembered per browser. */
export const MasterVolume = () => {
    const [volume, setVolume] = useState(() => readPref(VOLUME_KEY, 1));
    useEffect(() => {
        masterBus.gain.setTargetAtTime(volume, audioContext.currentTime, 0.02);
        writePref(VOLUME_KEY, volume);
    }, [volume]);
    return (
        <label className="gen-volume" title="Master volume">
            <span className="gen-audio-label">Vol</span>
            <input type="range" min="0" max="1" step="0.01" value={volume} aria-label="Master volume"
                onChange={(e) => setVolume(Number(e.target.value))} />
        </label>
    );
};

// How busy the audio thread is, and dropouts where reported: { load, dropouts }.
function useAudioLoad(generator) {
    const [status, setStatus] = useState({ load: null, dropouts: null });
    const [silences, setSilences] = useState(() => readSilenceLog().length);
    useEffect(() => {const stop=startLoadMeter(audioContext, masterBus, setStatus, (seconds) => {
        const entry = describeSilence(generator, seconds);
        if (!entry) return;
        addSilence(entry);
        setSilences(readSilenceLog().length);
    },idleSuspender(audioContext,()=>generator.canSleepAudio()));return stop;}, [generator]);
    return { ...status, silences, resetSilences: () => setSilences(readSilenceLog().length) };
}

// Above this the load is worth noticing (HIGH_LOAD: close to missing deadlines).
const BUSY_LOAD = 0.45;
// A dropout keeps the audio button red for this long.
const DROPOUT_SECONDS = 10;

/** Audio-thread load, and dropouts where reported. */
export const AudioMeter = ({ status }) => {
    const { load, dropouts, state } = status;
    const percent = load === null ? null : Math.round(load * 100);
    return (
        <div className="gen-audio" title="Estimated audio load where callback bursts allow measurement. A dash means unavailable; paced callbacks are not a CPU measurement. Idle means the context is suspended.">
            <span className="gen-audio-label">Audio load</span>
            <span className={`gen-meter${load > HIGH_LOAD ? ' is-high' : ''}`} aria-hidden="true">
                <i style={{ width: `${Math.min(100, percent || 0)}%` }} />
            </span>
            <span className="gen-audio-value" role="status">
                {state==='suspended'?'Idle':percent === null ? '–' : `≈${percent}%`}
                {dropouts ? ` · ${dropouts} dropout${dropouts > 1 ? 's' : ''}` : ''}
            </span>
        </div>
    );
};

const THEME_CHOICES = [['light', 'Light', SunIcon], ['dark', 'Dark', MoonIcon], ['auto', 'Auto', AutoThemeIcon]];
const THEME_HINTS = { auto: 'Colours follow your system', light: 'Light colours', dark: 'Dark colours' };

/**
 * The visual menu: everything about how the page looks - the theme and the fluid
 * background with its options (`backdrop`: null when
 * WebGL2 is missing). Stays in the hidden-interface view.
 */
export const VisualMenu = ({ backdrop, pianos }) => {
    const menu = useRef(null);
    useDismiss(menu);
    const [theme, setTheme] = useState(storedTheme);
    const set = (key, value) => backdrop.onOptions({ ...backdrop.options, [key]: value });
    return (
        <details className="gen-settings gen-visual" ref={menu}>
            <summary title="Look: theme and background" aria-label="Look: theme and background"><PaletteIcon /></summary>
            <div className="gen-settings-menu">
                <section className="gen-menu-section">
                    <h3>Theme</h3>
                    <div className="gen-menu-choices" role="group" aria-label="Theme">
                        {THEME_CHOICES.map(([id, label, Icon]) => (
                            <button key={id} type="button" className={theme === id ? 'is-on' : ''} aria-pressed={theme === id} title={THEME_HINTS[id]}
                                onClick={() => { applyTheme(id); setTheme(id); }}><Icon /> {label}</button>
                        ))}
                    </div>
                </section>
                {pianos && (
                    <section className="gen-menu-section">
                        <h3>Timeline</h3>
                        <label className="gen-check">
                            <input type="checkbox" checked={pianos.value} onChange={(e) => pianos.onChange(e.target.checked)} />
                            Mini pianos above the chords
                        </label>
                        <small>Each chord's notes on a one-octave keyboard, the bar's scale underlined.</small>
                    </section>
                )}
                {backdrop && (
                    <section className="gen-menu-section">
                        <h3>Background</h3>
                        <label className="gen-check">
                            <input type="checkbox" checked={backdrop.value} disabled={backdrop.locked} title={backdrop.locked?"Perf mode pauses the fluid background":undefined} onChange={(e) => backdrop.onChange(e.target.checked)} />
                            Fluid background
                        </label>
                        <small>Flowing colour shaped by the notes and their sound.</small>
                        {backdrop.value && (
                            <>
                                <label className="gen-menu-slider">
                                    <span>Colours</span>
                                    <select value={backdrop.options.palette} onChange={(e) => set('palette', e.target.value)}>
                                        {Object.entries(PALETTES).map(([id, { label }]) => <option key={id} value={id}>{label}</option>)}
                                    </select>
                                </label>
                                <button type="button" className="gen-menu-wide" onClick={backdrop.onShuffle}
                                    title="Pick a new base colour and spread between the colours">Shuffle colours</button>
                            </>
                        )}
                        {backdrop.value && <FluidControls options={backdrop.options} onOptions={backdrop.onOptions} onClear={backdrop.onClear} />}
                        <button type="button" className="gen-menu-wide" onClick={() => { backdrop.onOptions(BACKDROP_DEFAULTS); backdrop.onClear?.(); }}>Reset background</button>
                    </section>
                )}
            </div>
        </details>
    );
};

/** Closes a <details> menu on a click elsewhere or Escape, like a menu. */
export function useDismiss(menu) {
    useEffect(() => {
        const close = (e) => {
            if (!menu.current || !menu.current.open) return;
            if (e.type === 'keydown' ? e.key === 'Escape' : !menu.current.contains(e.target)) menu.current.open = false;
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', close);
        };
    }, [menu]);
}

/**
 * The Audio menu: the audio engine's own settings. onReload returns false
 * when the reload a change needs was cancelled.
 */
export const AudioMenu = ({ generator, onReload, children }) => {
    const perfOn=usePerfMode();
    const [, refresh] = useState(0);
    const [quickStop, setQuickStop] = useState(() => readPref(QUICK_STOP_KEY, true));
    const menu = useRef(null);
    useDismiss(menu);
    useEffect(() => {
        generator.quickStop = quickStop;
        writePref(QUICK_STOP_KEY, quickStop);
    }, [generator, quickStop]);
    const changeBuffer = (e) => {
        const previous = storedBufferSeconds();
        if (!storeBufferSeconds(Number(e.target.value))) return;
        if (!onReload()) {
            storeBufferSeconds(previous);
            refresh((n) => n + 1);
        }
    };
    // The Performance choices (audio/performance.js) apply from the next load.
    const performance = readPerformance();
    const changePerformance = (patch) => {
        const previous = readPerformance();
        if (!writePerformance(patch)) return;
        if (!onReload()) {
            writePerformance(previous);
            refresh((n) => n + 1);
        }
    };
    const [copiedLog, setCopiedLog] = useState('');
    const diagnosticSnapshot = () => playbackDiagnostics(generator,{...status,masterGain:masterBus.gain.value});
    const fullReport = () => formatSilenceLog()+'\nPlayback snapshot\n'+JSON.stringify(diagnosticSnapshot(),null,2);
    const copySilences = async (compact = false) => {
        const text = compact ? formatPlaybackSummary(diagnosticSnapshot(),readSilenceLog()) : fullReport();
        try {
            await navigator.clipboard.writeText(text);
            setCopiedLog(compact ? 'Summary copied. Paste this into chat.' : 'Full diagnostics copied.');
        } catch (e) {
            window.prompt('Copy this log', text);
        }
        setTimeout(() => setCopiedLog(''), 2500);
    };
    const saveDiagnostics = () => {
        const url = URL.createObjectURL(new Blob([fullReport()],{type:'text/plain;charset=utf-8'}));
        const link = document.createElement('a');
        link.href = url;link.download = 'calmbgm-diagnostics-'+new Date().toISOString().replace(/[:.]/g,'-')+'.txt';
        document.body.append(link);link.click();link.remove();
        setTimeout(() => URL.revokeObjectURL(url),1000);
        setCopiedLog('Full report saved. You can attach the file.');
        setTimeout(() => setCopiedLog(''),2500);
    };
    const [bench, setBench] = useState({ running: false, step: '', report: '' });
    const benchmark = async () => {
        setBench({ running: true, step: 'Starting', report: '' });
        let report;
        try {
            report = await runBenchmark(generator, { load: status.load, dropouts: status.dropouts }, (step) => setBench((b) => ({ ...b, step })));
        } catch (e) {
            report = `Benchmark failed: ${e && e.message ? e.message : e}`;
        }
        setBench({ running: false, step: '', report });
    };
    const copyBench = async () => {
        try {
            await navigator.clipboard.writeText(bench.report);
            setCopiedLog('Report copied.');
        } catch (e) {
            window.prompt('Copy this report', bench.report);
        }
        setTimeout(() => setCopiedLog(''), 2500);
    };
    const actualMs = Math.round((audioContext.baseLatency || 0) * 1000);
    // The button is coloured by the load: green, amber, red - red as well for a while after a dropout.
    const status = useAudioLoad(generator);
    const [recentDropout, setRecentDropout] = useState(false);
    useEffect(() => {
        if (!status.dropouts) return undefined;
        setRecentDropout(true);
        const timer = setTimeout(() => setRecentDropout(false), DROPOUT_SECONDS * 1000);
        return () => clearTimeout(timer);
    }, [status.dropouts]);
    const { load } = status;
    const level = load === null ? 'unknown' : recentDropout || load > HIGH_LOAD ? 'high' : load > BUSY_LOAD ? 'busy' : 'ok';
    const percent = load === null ? null : Math.round(load * 100);
    const label = `Audio engine${status.state==='suspended'?': idle':percent===null?': load estimate unavailable':`: approximately ${percent}% load${recentDropout?', recent dropout':''}`} - buffer and performance`;
    return (
        <details className="gen-settings gen-audio-menu" ref={menu}>
            <summary className={`gen-load-${level}`} title={label} aria-label={label}>
                <SpeakerIcon />
            </summary>
            <div className="gen-settings-menu">
                {children}
                <section className="gen-menu-section">
                    <h3>Audio</h3>
                    <AudioMeter status={status} />
                    <button type="button" className="gen-menu-wide" onClick={() => copySilences(true)}>Copy summary</button>
                    <div className="gen-menu-row">
                        <button type="button" onClick={() => copySilences(false)}>Copy full diagnostics</button>
                        <button type="button" onClick={saveDiagnostics}>Save full report</button>
                    </div>
                    {copiedLog && <small role="status">{copiedLog}</small>}
                    <label className="gen-field">
                        <span>Audio buffer (now {actualMs} ms)</span>
                        <select value={storedBufferSeconds() || 0} onChange={changeBuffer}>
                            {BUFFERS.map(([seconds, label]) => <option key={seconds} value={seconds}>{label}</option>)}
                        </select>
                        <small>A larger buffer stops crackling on slow computers, but notes you play on the keyboard or MIDI sound a little later. Changing it reloads the page (your settings are kept).</small>
                    </label>
                    <label className="gen-check">
                        <input type="checkbox" checked={quickStop} onChange={(e) => setQuickStop(e.target.checked)} />
                        Stop quickly (cut off reverb and echo tails)
                    </label>
                </section>
                <section className="gen-menu-section">
                    <h3>Performance</h3>
                    <WasmQuality />
                    <small>For slower computers or if the sound crackles (all on by default on a phone, with a 100 ms buffer). Each uses less CPU and memory for a plainer sound; the music itself is unchanged. Changing one reloads the page (your settings are kept).</small>
                    <label className="gen-field">
                        <span>Reverb</span>
                        <select value={performance.reverb} onChange={(e) => changePerformance({ reverb: e.target.value })}>
                            <option value="full">Full</option>
                            <option value="light">Light</option>
                        </select>
                    </label>
                    <small>Wasm: 16 or 8 room lines, keeping the selected decay and stereo width. Previous engine: stereo up to 3 s, or mono up to 2 s.</small>
                    <label className="gen-check">
                        <input type="checkbox" checked={perfOn||performance.sharedReverb} disabled={perfOn} title={perfOn?"Enabled temporarily by Perf mode":undefined} onChange={(e) => changePerformance({ sharedReverb: e.target.checked })} />
                        Share matching reverbs
                    </label>
                    <small>Main page and lab runner: pool matching Wasm rooms. The previous engine shares matching impulses. Instrument delays and private rooms stay independent.</small>
                </section>
                <section className="gen-menu-section">
                    <h3>Benchmark</h3>
                    <small>Checks this device and how fast it makes the current music (a minute or so; the page may stutter meanwhile, so stop the music first), then writes a report to paste into a chat.</small>
                    <div className="gen-menu-row">
                        <button type="button" disabled={bench.running} onClick={benchmark}>{bench.running ? 'Running...' : 'Run benchmark'}</button>
                        <button type="button" disabled={!bench.report} onClick={copyBench}>Copy report</button>
                    </div>
                    {bench.running && <small role="status">{bench.step}</small>}
                    {bench.report && <textarea className="gen-bench-report" readOnly rows={8} value={bench.report} onFocus={(e) => e.target.select()} />}
                </section>
                <section className="gen-menu-section">
                    <h3>Gaps in the sound</h3>
                    <small>Listens to the output while the music plays and notes any silence over 0.1 s. Copy summary includes the transport, percussion and source counters in a short report for chat, even when no gap was detected. Save full report keeps the complete history in a file you can attach.</small>
                    <div className="gen-menu-row">
                        <span role="status">{status.silences ? `${status.silences} logged` : 'None logged'}</span>
                        <button type="button" disabled={!status.silences} onClick={() => { clearSilenceLog(); status.resetSilences(); }}>Clear</button>
                    </div>
                </section>
            </div>
        </details>
    );
};

/** The ⚙ options menu: sharing, a phrase, the sleep timer and saving audio (children), MIDI, starting over with only the basics. */
export const SettingsMenu = ({ link, saving, phrase, onStartOver, smooth, intro, generation, onTour, midi, children }) => {
    const menu = useRef(null);
    useDismiss(menu);
    const [copied, setCopied] = useState('');
    const copy = async () => {
        const url = link();
        try {
            await navigator.clipboard.writeText(url);
            setCopied('Link copied.');
        } catch (e) {
            window.prompt('Copy this link', url);
        }
        setTimeout(() => setCopied(''), 2500);
    };
    return (
        <details className="gen-settings" ref={menu}>
            <summary title="Options: share, phrase, sleep timer, save audio, MIDI" aria-label="Options: share, phrase, sleep timer, save audio, MIDI">
                {'⚙'}{saving !== null && saving !== undefined ? ` Saving ${Math.round(saving * 100)}%` : ''}
            </summary>
            <div className="gen-settings-menu">
                <section className="gen-menu-section">
                    <h3>Share</h3>
                    <button type="button" className="gen-menu-wide" onClick={copy}><LinkIcon /> Copy link to this music</button>
                    {copied && <small role="status">{copied}</small>}
                </section>
                {phrase}
                {generation && <section className="gen-menu-section">
                    <label className="gen-menu-slider"><span>Music generation</span>
                        <select aria-label="Music generation" value={generation.value} onChange={e => generation.onChange(e.target.value)}>
                            <option value="latest">Latest</option><option value="legacy">Original</option>
                        </select>
                    </label>
                    <small>Latest develops recurring themes, coordinates the ensemble, develops sections and uses revised drum grooves. Original restores the previous algorithms. Changes start at the next chord while playing; shared links keep this choice.</small>
                </section>}
                {smooth && (
                    <section className="gen-menu-section">
                        <h3>Presets</h3>
                        <label className="gen-check">
                            <input type="checkbox" checked={smooth.value} onChange={(e) => smooth.onChange(e.target.checked)} />
                            Change presets smoothly
                        </label>
                        <small>While playing, a new preset starts at the next chord and its sounds blend in over that chord. Off: everything switches at once.</small>
                    </section>
                )}
                {intro && (
                    <section className="gen-menu-section">
                        <h3>Opening</h3>
                        <label className="gen-check">
                            <input type="checkbox" checked={intro.value} onChange={(e) => intro.onChange(e.target.checked)} />
                            Short intro
                        </label>
                        <small>Presets with sections open with a one-phrase intro instead of a long build. The address and copied links then end in intro=short; add intro=full to switch it off for a link.</small>
                    </section>
                )}
                {children}
                {midi && (
                    <section className="gen-menu-section">
                        <h3>MIDI</h3>
                        <button type="button" className="gen-menu-wide" onClick={midi.connect}>Connect MIDI keyboard</button>
                        <small role="status">{midi.status || 'Play a voice or the drums from a MIDI keyboard. Arm a voice with its keyboard button first.'}</small>
                    </section>
                )}
                {(onStartOver || onTour) && (
                    <section className="gen-menu-section">
                        <h3>Help</h3>
                        {onTour && <button type="button" className="gen-menu-wide" title="Take the tour again, of everything unlocked so far"
                            onClick={() => { menu.current.open = false; onTour(); }}>Take the tour</button>}
                        {onStartOver && <button type="button" className="gen-menu-wide" title="Hide everything but the basics again, and take the tour from the start"
                            onClick={() => { menu.current.open = false; onStartOver(); }}>Start over with the basics</button>}
                    </section>
                )}
            </div>
        </details>
    );
};
