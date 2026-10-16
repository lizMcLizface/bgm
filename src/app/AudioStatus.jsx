// Header controls: master volume; the theme toggle; the Audio menu - how busy
// the audio thread is (with dropouts where the browser reports them), output
// buffer size (src/audio/context.js), quick stop and the Performance choices
// (src/audio/performance.js); and the ⚙ options menu - copy link, a phrase,
// sleep timer, save audio (Playback.jsx) and the tour.

import React, { useEffect, useRef, useState } from 'react';
import { audioContext, storedBufferSeconds, storeBufferSeconds } from '../audio/context';
import { readPerformance, writePerformance } from '../audio/performance';
import { masterBus } from '../audio/bus';
import { startLoadMeter } from '../audio/loadMeter';
import { addSilence, readSilenceLog, clearSilenceLog, formatSilenceLog, describeSilence } from '../audio/silenceLog';
import { readPref, writePref } from './prefs';
import { applyTheme, storedTheme } from './theme';
import { LinkIcon, SpeakerIcon, SunIcon, MoonIcon, AutoThemeIcon } from './icons';

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
    useEffect(() => startLoadMeter(audioContext, masterBus, setStatus, (seconds) => {
        const entry = describeSilence(generator, seconds);
        if (!entry) return;
        addSilence(entry);
        setSilences(readSilenceLog().length);
    }), [generator]);
    return { ...status, silences, resetSilences: () => setSilences(readSilenceLog().length) };
}

// Above this the load is worth noticing (HIGH_LOAD: close to missing deadlines).
const BUSY_LOAD = 0.45;
// A dropout keeps the audio button red for this long.
const DROPOUT_SECONDS = 10;

/** Audio-thread load, and dropouts where reported. */
export const AudioMeter = ({ status }) => {
    const { load, dropouts } = status;
    const percent = load === null ? null : Math.round(load * 100);
    return (
        <div className="gen-audio" title="How much of its time the audio thread spends making sound. Near 100% the sound drops out; a larger buffer (below) helps.">
            <span className="gen-audio-label">Audio load</span>
            <span className={`gen-meter${load > HIGH_LOAD ? ' is-high' : ''}`} aria-hidden="true">
                <i style={{ width: `${Math.min(100, percent || 0)}%` }} />
            </span>
            <span className="gen-audio-value" role="status">
                {percent === null ? '–' : `${percent}%`}
                {dropouts ? ` · ${dropouts} dropout${dropouts > 1 ? 's' : ''}` : ''}
            </span>
        </div>
    );
};

// Light -> dark -> follow the system, one click each, so a page that opened in
// the wrong colours is one or two clicks from the right ones.
const THEME_ORDER = ['light', 'dark', 'auto'];
const THEME_LABELS = { auto: 'Auto', light: 'Light', dark: 'Dark' };
const THEME_HINTS = { auto: 'Colours follow your system', light: 'Light colours', dark: 'Dark colours' };
const THEME_ICONS = { auto: AutoThemeIcon, light: SunIcon, dark: MoonIcon };

/** The theme button: shows the current theme, a click moves to the next. */
export const ThemeToggle = () => {
    const [theme, setTheme] = useState(storedTheme);
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    return (
        <button type="button" className="gen-theme" onClick={() => { applyTheme(next); setTheme(next); }}
            title={`${THEME_HINTS[theme]} - click for ${THEME_LABELS[next].toLowerCase()}`}
            aria-label={`Theme: ${THEME_LABELS[theme]}. Switch to ${THEME_LABELS[next]}`}>
            {React.createElement(THEME_ICONS[theme])}
        </button>
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
export const AudioMenu = ({ generator, onReload }) => {
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
    const copySilences = async () => {
        const text = formatSilenceLog();
        try {
            await navigator.clipboard.writeText(text);
            setCopiedLog('Log copied.');
        } catch (e) {
            window.prompt('Copy this log', text);
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
    const label = `Audio engine${percent === null ? '' : `: ${percent}% load${recentDropout ? ', recent dropout' : ''}`} - buffer and performance`;
    return (
        <details className="gen-settings gen-audio-menu" ref={menu}>
            <summary className={`gen-load-${level}`} title={label} aria-label={label}>
                <SpeakerIcon />
            </summary>
            <div className="gen-settings-menu">
                <section className="gen-menu-section">
                    <h3>Audio</h3>
                    <AudioMeter status={status} />
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
                    <small>For slower computers or if the sound crackles (all on by default on a phone, with a 100 ms buffer). Each uses less CPU and memory for a plainer sound; the music itself is unchanged. Changing one reloads the page (your settings are kept).</small>
                    <label className="gen-field">
                        <span>Reverb</span>
                        <select value={performance.reverb} onChange={(e) => changePerformance({ reverb: e.target.value })}>
                            <option value="full">Full (stereo, up to 3 s)</option>
                            <option value="light">Light (mono, up to 2 s)</option>
                        </select>
                    </label>
                    <label className="gen-check">
                        <input type="checkbox" checked={performance.sharedReverb} onChange={(e) => changePerformance({ sharedReverb: e.target.checked })} />
                        One reverb shared by all voices
                    </label>
                </section>
                <section className="gen-menu-section">
                    <h3>Gaps in the sound</h3>
                    <small>Listens to the output while the music plays and notes any silence over 0.1 s, with what the engine was doing. If the music keeps cutting out (say with the screen locked), play for a minute, then copy the log and send it along.</small>
                    <div className="gen-menu-row">
                        <span role="status">{status.silences ? `${status.silences} logged` : 'None logged'}</span>
                        <button type="button" disabled={!status.silences} onClick={copySilences}>Copy log</button>
                        <button type="button" disabled={!status.silences} onClick={() => { clearSilenceLog(); status.resetSilences(); }}>Clear</button>
                    </div>
                    {copiedLog && <small role="status">{copiedLog}</small>}
                </section>
            </div>
        </details>
    );
};

/** The ⚙ options menu: sharing, a phrase, the sleep timer and saving audio (children), MIDI, starting over with only the basics. */
export const SettingsMenu = ({ link, saving, phrase, onStartOver, smooth, intro, midi, children }) => {
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
                {onStartOver && (
                    <section className="gen-menu-section">
                        <h3>Help</h3>
                        <button type="button" className="gen-menu-wide" title="Hide everything but the basics again, and take the tour from the start"
                            onClick={() => { menu.current.open = false; onStartOver(); }}>Start over with the basics</button>
                    </section>
                )}
            </div>
        </details>
    );
};
